import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import { INACTIVE_ORDER_STATUSES, INACTIVE_FINANCE_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";
import { attentionSummary, monthlyRevenueProgress, type DashboardRecord } from "@/lib/dashboardMetrics";
import { calcDeposit, calcTotal, parseAmount } from "@/lib/invoiceCalc";
import { calcDepositTax } from "@/lib/salesTax";
import { statusText } from "@/lib/recordUtils";

export const dynamic = "force-dynamic";

type SupabaseRow = { id: string; data: DashboardRecord | null };

async function fetchTable(tableName: string): Promise<DashboardRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from(tableName)
    .select("id,data")
    .order("id", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/summary] read ${tableName}: ${error.message}`);
  }
  return ((rows ?? []) as SupabaseRow[])
    .map((row) => row.data ?? { id: row.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const todayISO = businessTodayISO();
    const sevenDaysAheadISO = addDaysToISODate(todayISO, 7);
    const currentYear = todayISO.slice(0, 4);

    const [tasks, invoices, orders, leads, taxPayments] = await Promise.all([
      fetchTable("tasks"),
      fetchTable("finances"),
      fetchTable("orders"),
      fetchTable("crm_leads"),
      fetchTable("sales_tax_payments"),
    ]);

    // Tasks
    const openTaskCount = tasks.filter(
      (t) => t.completed !== true && !TASK_DONE_STATUSES.has(statusText(t)),
    ).length;

    // Attention summary (overdueTasks, unpaidInvoices count, ordersDueSoon)
    const attention = attentionSummary(orders, invoices, tasks, leads, todayISO, sevenDaysAheadISO);

    // Orders
    const activeOrderCount = orders.filter(
      (o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)),
    ).length;

    // Outstanding balance across all unpaid live invoices
    const liveInvoices = invoices.filter(
      (inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)),
    );
    const unpaidInvoices = liveInvoices.filter((inv) => inv.final_paid !== true);
    const outstandingBalance = unpaidInvoices.reduce((sum, inv) => {
      const alreadyPaid = inv.deposit_paid === true ? calcDeposit(inv) : 0;
      return sum + Math.max(calcTotal(inv) - alreadyPaid, 0);
    }, 0);

    // Revenue collected this month
    const { collected: revenueCollectedThisMonth } = monthlyRevenueProgress(invoices, todayISO);

    // Sales tax owed YTD (collected minus payments already remitted)
    const taxCollectedYTD = invoices.reduce((sum, inv) => {
      const taxAmt = parseAmount(inv.sales_tax_amount);
      if (taxAmt <= 0) return sum;
      const grandTotal = parseAmount(inv.grand_total ?? inv.total_amount);
      const depositAmt = parseAmount(inv.deposit_amount);
      const finalDate = String(inv.final_paid_date ?? "");
      const depositDate = String(inv.deposit_paid_date ?? "");
      if (inv.final_paid === true && finalDate.startsWith(currentYear)) return sum + taxAmt;
      if (
        inv.deposit_paid === true &&
        depositDate.startsWith(currentYear) &&
        inv.final_paid !== true
      )
        return sum + calcDepositTax(taxAmt, depositAmt, grandTotal);
      if (
        inv.final_paid === true &&
        !finalDate.startsWith(currentYear) &&
        inv.deposit_paid === true &&
        depositDate.startsWith(currentYear)
      )
        return sum + calcDepositTax(taxAmt, depositAmt, grandTotal);
      return sum;
    }, 0);
    const taxPaidYTD = taxPayments
      .filter((p) => String(p.payment_date ?? p.date ?? "").startsWith(currentYear))
      .reduce((sum, p) => {
        const cents = p.amount_cents;
        return sum + (typeof cents === "number" ? cents / 100 : parseAmount(p.amount ?? 0));
      }, 0);
    const salesTaxOwed = Math.max(taxCollectedYTD - taxPaidYTD, 0);

    // CRM — open pipeline (exclude won deals)
    const openLeads = leads.filter((lead) => statusText(lead) !== "won");
    const pipelineValue = openLeads.reduce((sum, lead) => sum + parseAmount(lead.value), 0);

    // Response — aggregate counts and totals only, no individual records or PII
    return okResponse({
      tasks: { open: openTaskCount, overdue: attention.overdueTasks },
      orders: { active: activeOrderCount, dueSoon: attention.ordersDueSoon },
      invoices: {
        unpaid: attention.unpaidInvoices,
        outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      },
      finances: {
        revenueCollectedThisMonth: Math.round(revenueCollectedThisMonth * 100) / 100,
        salesTaxOwed: Math.round(salesTaxOwed * 100) / 100,
      },
      crm: {
        activeLeads: openLeads.length,
        pipelineValue: Math.round(pipelineValue * 100) / 100,
      },
    });
  } catch (err) {
    console.error("[ai/summary]", err);
    return errResponse("Internal server error", 500);
  }
}
