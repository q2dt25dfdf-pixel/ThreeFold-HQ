import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import { INACTIVE_FINANCE_STATUSES } from "@/lib/constants";
import { stringField, statusText } from "@/lib/recordUtils";
import { parseAmount, calcDeposit, calcBalance, calcTotal } from "@/lib/invoiceCalc";
import {
  monthlyRevenueProgress,
  monthlyRevenueGoal,
  type DashboardRecord,
} from "@/lib/dashboardMetrics";

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
    throw new Error(`[ai/financial-watchlist] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => ({ ...(r.data ?? {}), id: r.id } as DashboardRecord))
    .filter((item): item is DashboardRecord => Boolean(item?.id));
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function invoiceDueDate(inv: DashboardRecord): string {
  return stringField(inv, "final_due_date") || stringField(inv, "dueDate");
}

function invoiceDisplayName(inv: DashboardRecord): string {
  return (
    stringField(inv, "orderName") ||
    stringField(inv, "order_name") ||
    "Invoice"
  );
}

function daysPastDue(inv: DashboardRecord, todayISO: string): number {
  const dueDate = invoiceDueDate(inv);
  if (!dueDate || dueDate >= todayISO) return 0;
  const due = new Date(dueDate + "T12:00:00").getTime();
  const today = new Date(todayISO + "T12:00:00").getTime();
  return Math.max(0, Math.floor((today - due) / (24 * 60 * 60 * 1000)));
}

// Revenue collected in [fromISO, toISO] — mirrors end-of-day-summary logic.
// Deposits and final payments are counted on their respective paid dates.
// If an invoice had no deposit, the full calcTotal is counted on final_paid_date.
function revenueInRange(
  finances: DashboardRecord[],
  fromISO: string,
  toISO: string,
): number {
  return finances
    .filter((inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)))
    .reduce((sum, inv) => {
      const depositDate = stringField(inv, "deposit_paid_date");
      const finalDate   = stringField(inv, "final_paid_date");
      if (
        inv.deposit_paid === true &&
        depositDate &&
        depositDate >= fromISO &&
        depositDate <= toISO
      ) {
        sum += calcDeposit(inv);
      }
      if (
        inv.final_paid === true &&
        finalDate &&
        finalDate >= fromISO &&
        finalDate <= toISO
      ) {
        sum += inv.deposit_paid === true ? calcBalance(inv) : calcTotal(inv);
      }
      return sum;
    }, 0);
}

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const todayISO     = businessTodayISO();
    const weekStartISO = addDaysToISODate(todayISO, -6); // rolling 7 days

    const [finances, depositRequests, quotes, leads] = await Promise.all([
      fetchTable(db, "finances"),
      fetchTable(db, "deposit_requests"),
      fetchTable(db, "quotes"),
      fetchTable(db, "crm_leads"),
    ]);

    // company lookup — resolve lead_id → company; never use deposit_requests.client_name
    const leadCompanyMap = new Map<string, string>(
      leads.map((l) => [l.id, stringField(l, "company") || "Unknown Company"]),
    );

    // Lead IDs that already have a paid deposit request
    const paidDepositLeadIds = new Set<string>(
      depositRequests
        .filter((dr) => statusText(dr) === "paid")
        .map((dr) => stringField(dr, "lead_id"))
        .filter(Boolean),
    );

    // ── Revenue ────────────────────────────────────────────────────────────────

    const revenueToday     = revenueInRange(finances, todayISO, todayISO);
    const revenueThisWeek  = revenueInRange(finances, weekStartISO, todayISO);
    const revenueThisMonth = monthlyRevenueProgress(finances, todayISO).collected;
    const monthlyGoal      = monthlyRevenueGoal();

    // ── Unpaid deposit requests ────────────────────────────────────────────────

    const unpaidDepositItems = depositRequests
      .filter((dr) => statusText(dr) !== "paid")
      .map((dr) => {
        const leadId  = stringField(dr, "lead_id");
        const status  = statusText(dr);
        const sentDate = stringField(dr, "sent_date");
        const daysOld = sentDate
          ? Math.max(
              0,
              Math.floor(
                (new Date(todayISO + "T12:00:00").getTime() -
                  new Date(sentDate + "T12:00:00").getTime()) /
                  (24 * 60 * 60 * 1000),
              ),
            )
          : null;
        return {
          leadId:          leadId || null,
          company:         leadId ? (leadCompanyMap.get(leadId) ?? "Unknown Company") : null,
          depositNumber:   stringField(dr, "deposit_request_number") || null,
          status,
          sentDate:        sentDate || null,
          daysOld,
          amount:          parseAmount(dr.deposit_amount),
        };
      })
      .sort((a, b) => {
        // Failed payments first, then oldest pending first
        if (a.status === "payment_failed" && b.status !== "payment_failed") return -1;
        if (b.status === "payment_failed" && a.status !== "payment_failed") return 1;
        return (b.daysOld ?? 0) - (a.daysOld ?? 0);
      });

    const unpaidDepositsTotal = unpaidDepositItems.reduce((s, d) => s + d.amount, 0);

    // ── Outstanding invoices (final not paid, not draft/cancelled) ─────────────

    const activeUnpaid = finances.filter(
      (inv) =>
        !INACTIVE_FINANCE_STATUSES.has(statusText(inv)) && inv.final_paid !== true,
    );

    const outstandingItems = activeUnpaid
      .map((inv) => {
        const dueDate  = invoiceDueDate(inv);
        const dpd      = daysPastDue(inv, todayISO);
        const leadId   = stringField(inv, "lead_id");
        return {
          invoiceId:    inv.id,
          orderName:    invoiceDisplayName(inv),
          company:      leadId ? (leadCompanyMap.get(leadId) ?? null) : null,
          depositPaid:  inv.deposit_paid === true,
          dueDate:      dueDate || null,
          daysOverdue:  dpd,
          balanceDue:   calcBalance(inv),
          totalAmount:  calcTotal(inv),
        };
      })
      .sort((a, b) => {
        if (a.daysOverdue > 0 && b.daysOverdue <= 0) return -1;
        if (b.daysOverdue > 0 && a.daysOverdue <= 0) return 1;
        if (a.daysOverdue > 0 && b.daysOverdue > 0) return b.daysOverdue - a.daysOverdue;
        if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        return 0;
      });

    const outstandingTotal = outstandingItems.reduce((s, i) => s + i.balanceDue, 0);

    // ── Overdue invoices (subset of outstanding) ───────────────────────────────

    const overdueItems = outstandingItems.filter((i) => i.daysOverdue > 0);
    const overdueTotal = overdueItems.reduce((s, i) => s + i.balanceDue, 0);

    // ── Final balances due (deposit paid, final not yet paid) ──────────────────

    const finalBalanceItems = activeUnpaid
      .filter((inv) => inv.deposit_paid === true)
      .map((inv) => {
        const dueDate = invoiceDueDate(inv);
        const dpd     = daysPastDue(inv, todayISO);
        const leadId  = stringField(inv, "lead_id");
        const daysUntilDue =
          dueDate && dueDate > todayISO
            ? Math.floor(
                (new Date(dueDate + "T12:00:00").getTime() -
                  new Date(todayISO + "T12:00:00").getTime()) /
                  (24 * 60 * 60 * 1000),
              )
            : null;
        return {
          invoiceId:    inv.id,
          orderName:    invoiceDisplayName(inv),
          company:      leadId ? (leadCompanyMap.get(leadId) ?? null) : null,
          dueDate:      dueDate || null,
          daysOverdue:  dpd,
          daysUntilDue: dpd > 0 ? null : daysUntilDue,
          balanceDue:   calcBalance(inv),
        };
      })
      .sort((a, b) => {
        if (a.daysOverdue > 0 && b.daysOverdue <= 0) return -1;
        if (b.daysOverdue > 0 && a.daysOverdue <= 0) return 1;
        if (a.daysOverdue > 0 && b.daysOverdue > 0) return b.daysOverdue - a.daysOverdue;
        if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
        return 0;
      });

    const finalBalancesTotal = finalBalanceItems.reduce((s, i) => s + i.balanceDue, 0);

    // ── Approved quotes awaiting deposit ───────────────────────────────────────

    const approvedQuoteItems = quotes
      .filter((q) => {
        const acceptedAt = stringField(q, "acknowledgementAcceptedAt");
        if (!acceptedAt) return false;
        const leadId = stringField(q, "lead_id");
        if (!leadId) return false;
        return !paidDepositLeadIds.has(leadId);
      })
      .map((q) => {
        const leadId = stringField(q, "lead_id");
        return {
          quoteId:     q.id,
          quoteNumber: stringField(q, "quote_number") || null,
          company:     leadId ? (leadCompanyMap.get(leadId) ?? null) : null,
          approvedAt:  stringField(q, "acknowledgementAcceptedAt") || null,
          grandTotal:  parseAmount(q.grand_total ?? q.total_amount),
        };
      })
      .sort((a, b) => {
        // Oldest approval first — most urgent
        if (a.approvedAt && b.approvedAt) return a.approvedAt < b.approvedAt ? -1 : 1;
        return 0;
      });

    const approvedQuotesTotal = approvedQuoteItems.reduce((s, q) => s + q.grandTotal, 0);

    // ── High-priority financial actions ────────────────────────────────────────

    const actions: string[] = [];

    const failedDeposits = unpaidDepositItems.filter((d) => d.status === "payment_failed");
    if (failedDeposits.length > 0) {
      actions.push(
        `${failedDeposits.length} deposit request${failedDeposits.length > 1 ? "s" : ""} with failed payments — follow up immediately.`,
      );
    }

    const oldPending = unpaidDepositItems.filter(
      (d) => d.status !== "payment_failed" && (d.daysOld ?? 0) > 14,
    );
    if (oldPending.length > 0) {
      actions.push(
        `${oldPending.length} unpaid deposit request${oldPending.length > 1 ? "s" : ""} over 14 days old — consider following up.`,
      );
    }

    if (overdueItems.length > 0) {
      actions.push(
        `${overdueItems.length} overdue invoice${overdueItems.length > 1 ? "s" : ""} totaling ${fmtCurrency(overdueTotal)} need attention.`,
      );
    }

    if (approvedQuoteItems.length > 0) {
      actions.push(
        `${approvedQuoteItems.length} quote${approvedQuoteItems.length > 1 ? "s" : ""} approved by client (${fmtCurrency(approvedQuotesTotal)} total) with no deposit received yet.`,
      );
    }

    const dueSoon = finalBalanceItems.filter(
      (i) => i.daysOverdue <= 0 && i.daysUntilDue != null && i.daysUntilDue <= 7,
    );
    if (dueSoon.length > 0) {
      const dueSoonTotal = dueSoon.reduce((s, i) => s + i.balanceDue, 0);
      actions.push(
        `${dueSoon.length} final balance${dueSoon.length > 1 ? "s" : ""} (${fmtCurrency(dueSoonTotal)}) due within 7 days — confirm delivery timeline.`,
      );
    }

    if (actions.length === 0) {
      actions.push("No urgent financial items — revenue and collections are on track.");
    }

    return okResponse({
      date:              todayISO,
      revenueToday,
      revenueThisWeek,
      revenueThisMonth,
      monthlyGoal,
      unpaidDeposits: {
        count:       unpaidDepositItems.length,
        totalAmount: unpaidDepositsTotal,
        items:       unpaidDepositItems.slice(0, 10),
      },
      outstandingInvoices: {
        count:        outstandingItems.length,
        totalBalance: outstandingTotal,
        items:        outstandingItems.slice(0, 10),
      },
      overdueInvoices: {
        count:        overdueItems.length,
        totalBalance: overdueTotal,
        items:        overdueItems.slice(0, 10),
      },
      finalBalancesDue: {
        count:        finalBalanceItems.length,
        totalBalance: finalBalancesTotal,
        items:        finalBalanceItems.slice(0, 10),
      },
      approvedQuotesAwaitingDeposit: {
        count:       approvedQuoteItems.length,
        totalAmount: approvedQuotesTotal,
        items:       approvedQuoteItems.slice(0, 10),
      },
      highPriorityFinancialActions: actions,
    });
  } catch (err) {
    console.error("[ai/financial-watchlist GET]", err);
    return errResponse("Internal server error", 500);
  }
}
