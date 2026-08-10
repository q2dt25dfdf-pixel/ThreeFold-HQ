import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO } from "@/lib/businessDate";
import { INACTIVE_FINANCE_STATUSES, INACTIVE_ORDER_STATUSES } from "@/lib/constants";
import { stringField, statusText } from "@/lib/recordUtils";
import { parseAmount, calcBalance, calcCollected, calcTotal } from "@/lib/invoiceCalc";
import { calcDepositTax } from "@/lib/salesTax";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type TableRow = { id: string; data: DashboardRecord | null };

async function fetchTable(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<DashboardRecord[]> {
  const { data: rows, error } = await db
    .from(table)
    .select("id,data")
    .order("id", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/finances] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

// Invoice due-date — mirrors the logic in the orders and reports routes.
function invoiceDueDate(inv: DashboardRecord): string {
  return (
    stringField(inv, "final_due_date") ||
    stringField(inv, "dueDate")
  );
}

// Safe invoice display name — order project name only, no client PII.
function invoiceDisplayName(inv: DashboardRecord): string {
  return (
    stringField(inv, "orderName") ||
    stringField(inv, "order_name") ||
    "Invoice"
  );
}

// YTD sales tax collected from invoices, using the same proportional logic as the UI.
function calcTaxCollectedYTD(invoices: DashboardRecord[], currentYear: string): number {
  return invoices.reduce((sum, inv) => {
    const taxAmt = parseAmount(inv.sales_tax_amount);
    if (taxAmt <= 0) return sum;
    const grandTotal  = parseAmount(inv.grand_total ?? inv.total_amount);
    const deposit     = parseAmount(inv.deposit_amount);
    const finalDate   = String(inv.final_paid_date ?? "");
    const depositDate = String(inv.deposit_paid_date ?? "");
    if (inv.final_paid === true && finalDate.startsWith(currentYear)) return sum + taxAmt;
    if (inv.deposit_paid === true && depositDate.startsWith(currentYear) && inv.final_paid !== true) {
      return sum + calcDepositTax(taxAmt, deposit, grandTotal);
    }
    if (inv.final_paid === true && !finalDate.startsWith(currentYear) && inv.deposit_paid === true && depositDate.startsWith(currentYear)) {
      return sum + calcDepositTax(taxAmt, deposit, grandTotal);
    }
    return sum;
  }, 0);
}

/**
 * GET /api/ai/finances
 *
 * Returns safe operational finance aggregates for AI consumption.
 * Excludes all PII: email, phone, address, notes, Stripe/payment links,
 * client names, confirmation numbers, and receipt URLs.
 * Safe fields only: invoice/expense counts, dollar totals, status
 * breakdowns, tax position, and a capped list of items needing attention.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const [invoices, expenses, taxPayments, orders] = await Promise.all([
      fetchTable(db, "finances"),
      fetchTable(db, "expenses"),
      fetchTable(db, "sales_tax_payments"),
      fetchTable(db, "orders"),
    ]);

    const todayISO    = businessTodayISO();
    const currentYear = todayISO.slice(0, 4);

    // ── Invoice aggregates ────────────────────────────────────────────────────

    const nonCancelledInvoices = invoices.filter(
      (inv) => statusText(inv) !== "cancelled",
    );
    const liveInvoices = invoices.filter(
      (inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)),
    );

    const paidInvoices = invoices.filter((inv) => inv.final_paid === true);
    const unpaidInvoices = liveInvoices.filter((inv) => inv.final_paid !== true);
    const overdueInvoices = liveInvoices.filter((inv) => statusText(inv) === "overdue");
    const draftInvoices   = invoices.filter((inv) => statusText(inv) === "draft");
    const cancelledInvs   = invoices.filter((inv) => statusText(inv) === "cancelled");

    const totalInvoiceValue    = nonCancelledInvoices.reduce((s, i) => s + calcTotal(i), 0);
    const revenueCollected     = invoices.reduce((s, i) => s + calcCollected(i), 0);
    const outstandingBalance   = unpaidInvoices.reduce((s, i) => s + calcBalance(i), 0);

    // By status — all invoices
    const invoiceStatusCounts = new Map<string, { count: number; totalValue: number }>();
    for (const inv of invoices) {
      const st = stringField(inv, "status").trim() || "Unknown";
      const entry = invoiceStatusCounts.get(st) ?? { count: 0, totalValue: 0 };
      entry.count++;
      entry.totalValue += calcTotal(inv);
      invoiceStatusCounts.set(st, entry);
    }
    const byInvoiceStatus = Array.from(invoiceStatusCounts, ([status, v]) => ({
      status,
      count: v.count,
      totalValue: Math.round(v.totalValue * 100) / 100,
    })).sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

    // Overdue invoices needing attention — safe fields only, no client PII.
    const invoicesNeedingAttention = [
      ...overdueInvoices,
      ...unpaidInvoices.filter((inv) => statusText(inv) !== "overdue"),
    ]
      .slice(0, 10)
      .map((inv) => ({
        id: inv.id,
        orderName: invoiceDisplayName(inv),
        status: stringField(inv, "status") || "Unknown",
        dueDate: invoiceDueDate(inv) || "TBD",
        balance: Math.round(calcBalance(inv) * 100) / 100,
      }));

    // ── Sales tax aggregates ──────────────────────────────────────────────────

    const taxCollectedYTD = calcTaxCollectedYTD(liveInvoices, currentYear);
    const taxPaidYTD = taxPayments
      .filter((p) => String(p.payment_date ?? p.date ?? "").startsWith(currentYear))
      .reduce((sum, p) => {
        const cents = p.amount_cents;
        return sum + (typeof cents === "number" ? cents / 100 : parseAmount(p.amount ?? 0));
      }, 0);
    const taxDue = Math.max(taxCollectedYTD - taxPaidYTD, 0);

    // ── Expense aggregates ────────────────────────────────────────────────────

    const paidExpenses   = expenses.filter((e) => stringField(e, "payment_status") === "paid");
    const unpaidExpenses = expenses.filter((e) => stringField(e, "payment_status") !== "paid");

    function expenseAmount(e: DashboardRecord): number {
      const cents = e.amount_cents;
      return typeof cents === "number" ? cents / 100 : parseAmount(e.amount ?? 0);
    }

    // General-business portion only. A split expense's order-allocated portion is
    // a vendor cost (reported under order costs), so the expenses ledger counts
    // only the "general" allocations. Unsplit → the full amount.
    function generalExpenseAmount(e: DashboardRecord): number {
      const allocs = Array.isArray((e as { allocations?: unknown }).allocations)
        ? ((e as { allocations?: Array<{ amount_cents?: number; destination?: { type?: string } }> }).allocations ?? [])
        : [];
      if (!allocs.length) return expenseAmount(e);
      return allocs
        .filter((a) => a?.destination?.type === "general")
        .reduce((s, a) => s + (Number(a.amount_cents) || 0), 0) / 100;
    }

    const paidExpenseTotal   = paidExpenses.reduce((s, e) => s + generalExpenseAmount(e), 0);
    const unpaidExpenseTotal = unpaidExpenses.reduce((s, e) => s + generalExpenseAmount(e), 0);
    const totalExpenseTotal  = paidExpenseTotal + unpaidExpenseTotal;

    // By category — safe display label, no PII. General portion only (see above).
    const expenseCategoryCounts = new Map<string, { count: number; total: number }>();
    for (const e of expenses) {
      const cat = stringField(e, "category").trim() || "Other";
      const entry = expenseCategoryCounts.get(cat) ?? { count: 0, total: 0 };
      entry.count++;
      entry.total += generalExpenseAmount(e);
      expenseCategoryCounts.set(cat, entry);
    }
    const byExpenseCategory = Array.from(expenseCategoryCounts, ([category, v]) => ({
      category,
      count: v.count,
      total: Math.round(v.total * 100) / 100,
    })).sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

    // Unpaid expenses needing attention — safe: vendor name + category only, no notes/receipt.
    const expensesNeedingAttention = unpaidExpenses
      .sort((a, b) => expenseAmount(b) - expenseAmount(a))
      .slice(0, 10)
      .map((e) => ({
        id: e.id,
        name: stringField(e, "vendor_name") || stringField(e, "category") || "Expense",
        category: stringField(e, "category") || "Other",
        amount: Math.round(expenseAmount(e) * 100) / 100,
        expenseDate: stringField(e, "expense_date") || "TBD",
        paidBy: stringField(e, "paid_by") || "",
      }));

    // ── Vendor cost / profit summary (from orders) ────────────────────────────

    const activeOrders = orders.filter(
      (o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)),
    );
    const paidVendorCosts = activeOrders
      .filter((o) => stringField(o, "vendor_payment_status") === "paid")
      .reduce((s, o) => {
        const cents = o.vendor_cost_cents;
        return s + (typeof cents === "number" ? cents / 100 : 0);
      }, 0);

    const grossProfit  = revenueCollected - paidVendorCosts;
    const netPosition  = revenueCollected - paidVendorCosts - paidExpenseTotal;

    return okResponse({
      invoices: {
        counts: {
          total: invoices.length,
          outstanding: unpaidInvoices.length,
          paid: paidInvoices.length,
          overdue: overdueInvoices.length,
          draft: draftInvoices.length,
          cancelled: cancelledInvs.length,
        },
        totals: {
          totalValue:        Math.round(totalInvoiceValue  * 100) / 100,
          revenueCollected:  Math.round(revenueCollected   * 100) / 100,
          outstandingBalance: Math.round(outstandingBalance * 100) / 100,
        },
        salesTax: {
          collectedYTD: Math.round(taxCollectedYTD * 100) / 100,
          paidYTD:      Math.round(taxPaidYTD      * 100) / 100,
          dueYTD:       Math.round(taxDue           * 100) / 100,
        },
        byStatus: byInvoiceStatus,
        invoicesNeedingAttention,
      },
      expenses: {
        counts: {
          total:  expenses.length,
          paid:   paidExpenses.length,
          unpaid: unpaidExpenses.length,
        },
        totals: {
          total:  Math.round(totalExpenseTotal  * 100) / 100,
          paid:   Math.round(paidExpenseTotal   * 100) / 100,
          unpaid: Math.round(unpaidExpenseTotal * 100) / 100,
        },
        byCategory: byExpenseCategory,
        expensesNeedingAttention,
      },
      summary: {
        revenueCollected:  Math.round(revenueCollected  * 100) / 100,
        grossProfit:       Math.round(grossProfit        * 100) / 100,
        netPosition:       Math.round(netPosition        * 100) / 100,
        taxDue:            Math.round(taxDue             * 100) / 100,
      },
    });
  } catch (err) {
    console.error("[ai/finances]", err);
    return errResponse("Internal server error", 500);
  }
}
