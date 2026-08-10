import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import {
  INACTIVE_FINANCE_STATUSES,
  INACTIVE_ORDER_STATUSES,
  TASK_DONE_STATUSES,
} from "@/lib/constants";
import { readField, statusText, stringField } from "@/lib/recordUtils";
import { orderEstDeliveryDate } from "@/lib/estDelivery";
import {
  hasActiveFollowUpTask,
  hasFollowUpDate,
  isCrmTask,
  leadFollowUpDate,
} from "@/lib/followUps";
import {
  normalizeCRMStage,
  isInactiveLeadStage,
  monthlyRevenueProgress,
  monthlyRevenueGoal,
  parseDashboardDate,
  type DashboardRecord,
} from "@/lib/dashboardMetrics";
import {
  parseAmount,
  calcDeposit,
  calcBalance,
  calcTotal,
} from "@/lib/invoiceCalc";

export const dynamic = "force-dynamic";

// ── GET /api/ai/command-center ─────────────────────────────────────────────────
//
// Single read-only call that answers "What needs my attention right now?"
//
// One fetch of 6 tables → derives 8 sections:
//   urgentItems          — cross-category priority list (red→amber→blue)
//   todayFocus           — tasks + follow-ups due specifically today
//   financialPriorities  — revenue, failed deposits, overdue invoices
//   followUpPriorities   — stale leads, expired/expiring quotes, old deposits
//   taskPriorities       — overdue tasks + due-today summary
//   orderPriorities      — stalled + due-soon orders
//   recommendedActions   — plain-language action items
//   executiveSummary     — one-paragraph business-state narrative
//
// PII rules: no email, phone, address, notes, contact names, summary content,
// payment links, public tokens, stripe URLs, or payment_instructions.

type Row = DashboardRecord;
type TableRow = { id: string; data: Row | null };
type Priority = "red" | "amber" | "blue";
type Category = "finance" | "followup" | "task" | "order";

async function fetchTable(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: string,
): Promise<Row[]> {
  const { data: rows, error } = await db
    .from(table)
    .select("id,data")
    .order("id", { ascending: false });
  if (error) {
    if ((error as { code?: string }).code === "42P01") return [];
    throw new Error(`[ai/command-center] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => ({ ...(r.data ?? {}), id: r.id } as Row))
    .filter((item): item is Row => Boolean(item?.id));
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(toISO + "T12:00:00").getTime() - new Date(fromISO + "T12:00:00").getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

function isValidISO(d: string): boolean {
  return Boolean(d && d !== "TBD" && /^\d{4}-\d{2}-\d{2}$/.test(d));
}

function isTaskDone(task: Row): boolean {
  return task.completed === true || TASK_DONE_STATUSES.has(statusText(task));
}

function taskDueDate(task: Row): string {
  return readField(task, "dueDate", "due_date");
}

function taskOwner(task: Row): string {
  return stringField(task, "owner") || stringField(task, "assignedTo");
}

function orderDueDate(order: Row): string {
  return (
    orderEstDeliveryDate(order) ||
    stringField(order, "dueDate") ||
    stringField(order, "final_due_date")
  );
}

function invoiceDueDate(inv: Row): string {
  return stringField(inv, "final_due_date") || stringField(inv, "dueDate");
}

function invoiceDisplayName(inv: Row): string {
  return stringField(inv, "orderName") || stringField(inv, "order_name") || "Invoice";
}

// Revenue collected in [fromISO, toISO]. Mirrors financial-watchlist logic.
function revenueInRange(finances: Row[], fromISO: string, toISO: string): number {
  return finances
    .filter((inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)))
    .reduce((sum, inv) => {
      const depositDate = stringField(inv, "deposit_paid_date");
      const finalDate   = stringField(inv, "final_paid_date");
      if (inv.deposit_paid === true && depositDate && depositDate >= fromISO && depositDate <= toISO) {
        sum += calcDeposit(inv);
      }
      if (inv.final_paid === true && finalDate && finalDate >= fromISO && finalDate <= toISO) {
        sum += inv.deposit_paid === true ? calcBalance(inv) : calcTotal(inv);
      }
      return sum;
    }, 0);
}

// Most recent contact date from communicationHistory — date field only, no summary.
function leadLastContacted(lead: Row): string | null {
  const history = lead.communicationHistory;
  if (!Array.isArray(history) || history.length === 0) return null;
  const dates = (history as Record<string, unknown>[])
    .map((e) => stringField(e, "date"))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  return dates[0] || null;
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const supabase     = getSupabaseAdmin();
    const todayISO     = businessTodayISO();
    const sevenDaysISO = addDaysToISODate(todayISO, 7);
    const weekAgoISO   = addDaysToISODate(todayISO, -6);
    const threeDaysISO = addDaysToISODate(todayISO, 3);

    const [leads, tasks, quotes, deposits, finances, orders] = await Promise.all([
      fetchTable(supabase, "crm_leads"),
      fetchTable(supabase, "tasks"),
      fetchTable(supabase, "quotes"),
      fetchTable(supabase, "deposit_requests"),
      fetchTable(supabase, "finances"),
      fetchTable(supabase, "orders"),
    ]);

    // ── Lookup maps ────────────────────────────────────────────────────────────

    const leadCompanyMap = new Map<string, string>(
      leads.map((l) => [l.id, stringField(l, "company") || stringField(l, "name") || "Unknown Company"]),
    );

    const quotesByLead = new Map<string, Row[]>();
    for (const q of quotes) {
      const lid = stringField(q, "lead_id");
      if (!lid) continue;
      const arr = quotesByLead.get(lid) ?? [];
      arr.push(q);
      quotesByLead.set(lid, arr);
    }

    // Lead IDs that already have at least one paid deposit
    const paidDepositLeadIds = new Set<string>(
      deposits
        .filter((d) => statusText(d) === "paid")
        .map((d) => stringField(d, "lead_id"))
        .filter(Boolean),
    );

    const openLeads = leads.filter((l) => statusText(l) !== "won");

    // ── Revenue ────────────────────────────────────────────────────────────────

    const revenueToday     = revenueInRange(finances, todayISO, todayISO);
    const revenueThisWeek  = revenueInRange(finances, weekAgoISO, todayISO);
    const { collected: revenueThisMonth } = monthlyRevenueProgress(finances, todayISO);
    const monthlyGoal = monthlyRevenueGoal();

    const today          = parseDashboardDate(todayISO) ?? new Date();
    const dayOfMonth     = today.getDate();
    const totalDays      = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const dailyRate      = dayOfMonth > 0 ? revenueThisMonth / dayOfMonth : 0;
    const projected      = Math.round(dailyRate * totalDays * 100) / 100;
    const paceRatio      = monthlyGoal > 0 ? projected / monthlyGoal : 1;
    const paceStatus     = paceRatio >= 1.0 ? "ahead" : paceRatio >= 0.90 ? "on-track" : "behind";
    const monthlyPct     = monthlyGoal > 0 ? Math.round((revenueThisMonth / monthlyGoal) * 100) : 0;

    // ── Tasks ──────────────────────────────────────────────────────────────────

    // Exclude CRM follow-up tasks — the Tasks board hides them; they surface via the
    // lead follow-up path, not as phantom overdue board tasks (shared isCrmTask).
    const openTasks = tasks.filter((t) => !isTaskDone(t) && !isCrmTask(t));

    const overdueTasks = openTasks
      .filter((t) => { const d = taskDueDate(t); return isValidISO(d) && d < todayISO; })
      .map((t) => ({ ...t, _daysPastDue: daysBetween(taskDueDate(t), todayISO) }))
      .sort((a, b) => b._daysPastDue - a._daysPastDue);

    const tasksDueToday = openTasks.filter((t) => {
      const d = taskDueDate(t);
      return isValidISO(d) && d === todayISO;
    });

    // ── Stale leads ────────────────────────────────────────────────────────────

    const staleLeads = openLeads
      .filter((lead) => {
        if (isInactiveLeadStage(normalizeCRMStage(stringField(lead, "stage")))) return false;
        const fu = leadFollowUpDate(lead);
        return hasFollowUpDate(fu) && fu < todayISO && hasActiveFollowUpTask(lead, tasks);
      })
      .map((lead) => {
        const fu = leadFollowUpDate(lead);
        return { ...lead, _daysPast: daysBetween(fu, todayISO), _fu: fu };
      })
      .sort((a, b) => b._daysPast - a._daysPast);

    // ── Client follow-ups due today ────────────────────────────────────────────

    const followUpsDueToday = openLeads.filter((lead) => {
      const fu = leadFollowUpDate(lead);
      return hasFollowUpDate(fu) && fu === todayISO && hasActiveFollowUpTask(lead, tasks);
    });

    // Follow-ups due within the next 3 days (not stale, not today)
    const followUpsSoon = openLeads.filter((lead) => {
      const fu = leadFollowUpDate(lead);
      return (
        hasFollowUpDate(fu) &&
        fu > todayISO &&
        fu <= threeDaysISO &&
        hasActiveFollowUpTask(lead, tasks)
      );
    });

    // ── Quotes awaiting response (Quote Sent stage) ────────────────────────────

    const quoteSentLeads = openLeads.filter(
      (l) => normalizeCRMStage(stringField(l, "stage")) === "Quote Sent",
    );

    type QuoteItem = {
      leadId: string;
      company: string;
      quoteId: string | null;
      quoteNumber: string | null;
      sentDate: string | null;
      daysSinceSent: number | null;
      expirationDate: string | null;
      daysUntilExpiry: number | null;
      grandTotal: number | null;
    };

    const quotesAwaitingResponse: QuoteItem[] = quoteSentLeads.map((lead) => {
      const leadQuotes = quotesByLead.get(lead.id) ?? [];
      const sentQ = leadQuotes
        .filter((q) => stringField(q, "status") === "sent")
        .sort((a, b) => {
          const ta = stringField(a, "sent_date");
          const tb = stringField(b, "sent_date");
          if (tb && ta) return tb.localeCompare(ta);
          return b.id.localeCompare(a.id);
        })[0] ?? leadQuotes.sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;

      const sentDate       = sentQ ? (stringField(sentQ, "sent_date") || null) : null;
      const expirationDate = sentQ ? (stringField(sentQ, "expiration_date") || null) : null;
      return {
        leadId:         lead.id,
        company:        stringField(lead, "company") || stringField(lead, "name") || "Unknown",
        quoteId:        sentQ?.id ?? null,
        quoteNumber:    sentQ ? (stringField(sentQ, "quote_number") || null) : null,
        sentDate,
        daysSinceSent:   sentDate ? daysBetween(sentDate, todayISO) : null,
        expirationDate,
        daysUntilExpiry: expirationDate ? daysBetween(todayISO, expirationDate) : null,
        grandTotal:      sentQ ? (parseAmount(sentQ.grand_total ?? sentQ.total_amount ?? 0) || null) : null,
      };
    });

    const expiredQuotes  = quotesAwaitingResponse.filter((q) => q.daysUntilExpiry !== null && q.daysUntilExpiry < 0);
    const expiringQuotes = quotesAwaitingResponse.filter((q) => q.daysUntilExpiry !== null && q.daysUntilExpiry >= 0 && q.daysUntilExpiry <= 7);

    // ── Deposits ───────────────────────────────────────────────────────────────

    const unpaidDeposits = deposits
      .filter((d) => statusText(d) !== "paid")
      .map((d) => {
        const sentDate = stringField(d, "sent_date") || null;
        return {
          ...d,
          _leadId:    stringField(d, "lead_id"),
          _status:    statusText(d),
          _sentDate:  sentDate,
          _daysOld:   sentDate ? Math.max(0, daysBetween(sentDate, todayISO)) : 0,
          _amount:    parseAmount(d.deposit_amount),
        };
      });

    const failedDeposits = unpaidDeposits.filter((d) => d._status === "payment_failed");
    const oldDeposits    = unpaidDeposits.filter((d) => d._status !== "payment_failed" && d._daysOld > 14);

    // ── Finances ───────────────────────────────────────────────────────────────

    const activeUnpaidFinances = finances.filter(
      (inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)) && inv.final_paid !== true,
    );

    const overdueInvoices = activeUnpaidFinances
      .filter((inv) => {
        const due = invoiceDueDate(inv);
        return isValidISO(due) && due < todayISO;
      })
      .map((inv) => ({
        ...inv,
        _daysPast: daysBetween(invoiceDueDate(inv), todayISO),
        _balance:  calcBalance(inv),
      }))
      .sort((a, b) => b._daysPast - a._daysPast);

    const overdueInvoiceTotal = overdueInvoices.reduce((s, i) => s + i._balance, 0);

    // Approved quotes with no deposit yet
    const approvedQuotesNoDeposit = quotes.filter((q) => {
      const accepted = stringField(q, "acknowledgementAcceptedAt");
      if (!accepted) return false;
      const lid = stringField(q, "lead_id");
      return lid && !paidDepositLeadIds.has(lid);
    });

    // ── Orders ─────────────────────────────────────────────────────────────────

    const activeOrders = orders.filter((o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)));

    const stalledOrders = activeOrders
      .filter((o) => { const d = orderDueDate(o); return isValidISO(d) && d < todayISO; })
      .map((o) => ({ ...o, _daysPast: daysBetween(orderDueDate(o), todayISO) }))
      .sort((a, b) => b._daysPast - a._daysPast);

    const ordersDueSoon = activeOrders.filter((o) => {
      const d = orderDueDate(o);
      return isValidISO(d) && d >= todayISO && d <= sevenDaysISO;
    });

    // ── urgentItems ────────────────────────────────────────────────────────────
    // Cross-category priority list. red → amber → blue. Capped at 15.

    type UrgentItem = {
      priority: Priority;
      category: Category;
      label: string;
      detail: string;
      reason: string;
    };

    const urgentItems: UrgentItem[] = [];

    // RED: failed deposits
    for (const d of failedDeposits.slice(0, 3)) {
      const company = d._leadId ? (leadCompanyMap.get(d._leadId) ?? "Unknown") : "Unknown";
      urgentItems.push({
        priority: "red", category: "finance",
        label:  company,
        detail: "Deposit payment failed",
        reason: "Payment failed — follow up immediately",
      });
    }

    // RED: overdue invoices
    for (const inv of overdueInvoices.slice(0, 3)) {
      urgentItems.push({
        priority: "red", category: "finance",
        label:  invoiceDisplayName(inv),
        detail: `Invoice ${plural(inv._daysPast, "day")} overdue`,
        reason: `Final invoice overdue — ${fmtCurrency(inv._balance)} outstanding`,
      });
    }

    // RED: tasks overdue 7+ days
    for (const t of overdueTasks.filter((t) => t._daysPastDue >= 7).slice(0, 3)) {
      urgentItems.push({
        priority: "red", category: "task",
        label:  stringField(t, "title") || "Untitled task",
        detail: `Overdue by ${plural(t._daysPastDue, "day")}`,
        reason: `Task ${t._daysPastDue}+ days overdue`,
      });
    }

    // AMBER: stale leads 7+ days
    for (const lead of staleLeads.filter((l) => l._daysPast >= 7).slice(0, 3)) {
      urgentItems.push({
        priority: "amber", category: "followup",
        label:  stringField(lead, "company") || stringField(lead, "name") || "Unknown",
        detail: `Follow-up ${plural(lead._daysPast, "day")} overdue`,
        reason: "Lead needs outreach — follow-up significantly overdue",
      });
    }

    // AMBER: expired quotes
    for (const q of expiredQuotes.slice(0, 2)) {
      const n = -(q.daysUntilExpiry ?? 0);
      urgentItems.push({
        priority: "amber", category: "followup",
        label:  q.company,
        detail: `Quote expired ${plural(n, "day")} ago`,
        reason: "Expired quote — revise and resend to keep deal alive",
      });
    }

    // AMBER: deposits >14 days unpaid
    for (const d of oldDeposits.slice(0, 2)) {
      const company = d._leadId ? (leadCompanyMap.get(d._leadId) ?? "Unknown") : "Unknown";
      urgentItems.push({
        priority: "amber", category: "finance",
        label:  company,
        detail: `Deposit unpaid for ${plural(d._daysOld, "day")}`,
        reason: "Deposit request ignored — follow up needed",
      });
    }

    // AMBER: approved quotes awaiting deposit
    for (const q of approvedQuotesNoDeposit.slice(0, 2)) {
      const lid     = stringField(q, "lead_id");
      const company = lid ? (leadCompanyMap.get(lid) ?? "Unknown") : "Unknown";
      urgentItems.push({
        priority: "amber", category: "finance",
        label:  company,
        detail: "Quote approved — deposit not received",
        reason: "Client approved quote — send deposit request to start production",
      });
    }

    // AMBER: stalled orders
    for (const o of stalledOrders.slice(0, 2)) {
      urgentItems.push({
        priority: "amber", category: "order",
        label:  stringField(o, "orderName") || stringField(o, "order_name") || "Order",
        detail: `Delivery ${plural(o._daysPast, "day")} late`,
        reason: "Order past delivery date — follow up with vendor or notify client",
      });
    }

    // BLUE: stale leads < 7 days
    for (const lead of staleLeads.filter((l) => l._daysPast < 7).slice(0, 2)) {
      urgentItems.push({
        priority: "blue", category: "followup",
        label:  stringField(lead, "company") || stringField(lead, "name") || "Unknown",
        detail: `Follow-up ${plural(lead._daysPast, "day")} overdue`,
        reason: "Lead follow-up past due",
      });
    }

    // BLUE: expiring quotes within 7 days
    for (const q of expiringQuotes.slice(0, 2)) {
      const n = q.daysUntilExpiry ?? 0;
      urgentItems.push({
        priority: "blue", category: "followup",
        label:  q.company,
        detail: n === 0 ? "Quote expires today" : `Quote expires in ${plural(n, "day")}`,
        reason: "Quote expiring soon — follow up to push for approval",
      });
    }

    // BLUE: tasks due today
    for (const t of tasksDueToday.slice(0, 2)) {
      urgentItems.push({
        priority: "blue", category: "task",
        label:  stringField(t, "title") || "Untitled task",
        detail: "Due today",
        reason: "Task due today — confirm or reassign",
      });
    }

    // BLUE: client follow-ups due today
    for (const lead of followUpsDueToday.slice(0, 2)) {
      urgentItems.push({
        priority: "blue", category: "followup",
        label:  stringField(lead, "company") || stringField(lead, "name") || "Unknown",
        detail: "Follow-up due today",
        reason: "Scheduled follow-up is due today",
      });
    }

    // BLUE: orders due within 7 days
    for (const o of ordersDueSoon.slice(0, 2)) {
      const due = orderDueDate(o);
      const n   = daysBetween(todayISO, due);
      urgentItems.push({
        priority: "blue", category: "order",
        label:  stringField(o, "orderName") || stringField(o, "order_name") || "Order",
        detail: n === 0 ? "Due today" : `Due in ${plural(n, "day")}`,
        reason: "Order deadline approaching — confirm delivery timeline",
      });
    }

    // Sort: red → amber → blue, then stable within tier
    const PRIORITY_ORDER: Record<Priority, number> = { red: 0, amber: 1, blue: 2 };
    const CATEGORY_ORDER: Record<Category, number> = { finance: 0, followup: 1, task: 2, order: 3 };
    urgentItems.sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category],
    );

    const cappedUrgentItems = urgentItems.slice(0, 15);

    // ── todayFocus ─────────────────────────────────────────────────────────────

    type TodayItem =
      | { type: "task";    id: string;     title: string; owner: string | null; reason: string }
      | { type: "followup"; leadId: string; company: string; stage: string; reason: string };

    const todayItems: TodayItem[] = [
      ...tasksDueToday.slice(0, 5).map((t): TodayItem => ({
        type:   "task",
        id:     t.id,
        title:  stringField(t, "title") || "Untitled task",
        owner:  taskOwner(t) || null,
        reason: "Task due today",
      })),
      ...followUpsDueToday.slice(0, 5).map((lead): TodayItem => ({
        type:    "followup",
        leadId:  lead.id,
        company: stringField(lead, "company") || stringField(lead, "name") || "Unknown",
        stage:   normalizeCRMStage(stringField(lead, "stage")),
        reason:  "Follow-up due today",
      })),
    ];

    // ── financialPriorities ────────────────────────────────────────────────────

    type FinancialItem = { type: string; label: string; amount: number; reason: string };

    const financialItems: FinancialItem[] = [
      ...failedDeposits.slice(0, 3).map((d): FinancialItem => ({
        type:   "failed-deposit",
        label:  d._leadId ? (leadCompanyMap.get(d._leadId) ?? "Unknown") : "Unknown",
        amount: d._amount,
        reason: "Payment failed — follow up immediately",
      })),
      ...overdueInvoices.slice(0, 3).map((inv): FinancialItem => ({
        type:   "overdue-invoice",
        label:  invoiceDisplayName(inv),
        amount: inv._balance,
        reason: `Invoice ${plural(inv._daysPast, "day")} overdue`,
      })),
      ...approvedQuotesNoDeposit.slice(0, 2).map((q): FinancialItem => {
        const lid = stringField(q, "lead_id");
        return {
          type:   "approved-quote-no-deposit",
          label:  lid ? (leadCompanyMap.get(lid) ?? "Unknown") : "Unknown",
          amount: parseAmount(q.grand_total ?? q.total_amount ?? 0),
          reason: "Client approved — send deposit request to start production",
        };
      }),
      ...oldDeposits.slice(0, 2).map((d): FinancialItem => ({
        type:   "old-unpaid-deposit",
        label:  d._leadId ? (leadCompanyMap.get(d._leadId) ?? "Unknown") : "Unknown",
        amount: d._amount,
        reason: `Deposit request unpaid for ${plural(d._daysOld, "day")}`,
      })),
    ].slice(0, 5);

    // ── followUpPriorities ─────────────────────────────────────────────────────

    type FollowUpItem = { type: string; leadId: string | null; company: string; daysPastFollowUp?: number; daysUntilExpiry?: number; reason: string };

    const followUpItems: FollowUpItem[] = [
      ...staleLeads.slice(0, 3).map((lead): FollowUpItem => ({
        type:             "stale-lead",
        leadId:           lead.id,
        company:          stringField(lead, "company") || stringField(lead, "name") || "Unknown",
        daysPastFollowUp: lead._daysPast,
        reason:           `Follow-up ${plural(lead._daysPast, "day")} overdue${leadLastContacted(lead) ? ` — last contacted ${leadLastContacted(lead)}` : " — no contact logged"}`,
      })),
      ...expiredQuotes.slice(0, 2).map((q): FollowUpItem => ({
        type:           "expired-quote",
        leadId:         q.leadId,
        company:        q.company,
        daysUntilExpiry: q.daysUntilExpiry ?? undefined,
        reason:         `Quote expired ${plural(-(q.daysUntilExpiry ?? 0), "day")} ago — revise and resend`,
      })),
      ...expiringQuotes.slice(0, 2).map((q): FollowUpItem => ({
        type:           "expiring-quote",
        leadId:         q.leadId,
        company:        q.company,
        daysUntilExpiry: q.daysUntilExpiry ?? undefined,
        reason:         `Quote expires in ${plural(q.daysUntilExpiry ?? 0, "day")} — follow up now`,
      })),
    ].slice(0, 5);

    // ── taskPriorities ─────────────────────────────────────────────────────────

    const taskTopItems = overdueTasks.slice(0, 5).map((t) => ({
      id:          t.id,
      title:       stringField(t, "title") || "Untitled task",
      owner:       taskOwner(t) || null,
      dueDate:     taskDueDate(t),
      daysPastDue: t._daysPastDue,
      reason:      `Task overdue by ${plural(t._daysPastDue, "day")}`,
    }));

    // ── orderPriorities ────────────────────────────────────────────────────────

    const orderTopItems = [
      ...stalledOrders.slice(0, 3).map((o) => ({
        id:          o.id,
        orderName:   stringField(o, "orderName") || stringField(o, "order_name") || "Order",
        status:      stringField(o, "status") || "active",
        dueDate:     orderDueDate(o),
        daysPastDue: o._daysPast,
        isStalled:   true,
        reason:      `Delivery ${plural(o._daysPast, "day")} past expected date`,
      })),
      ...ordersDueSoon.slice(0, 3).map((o) => {
        const due = orderDueDate(o);
        return {
          id:          o.id,
          orderName:   stringField(o, "orderName") || stringField(o, "order_name") || "Order",
          status:      stringField(o, "status") || "active",
          dueDate:     due,
          daysPastDue: 0,
          isStalled:   false,
          reason:      `Delivery due in ${plural(daysBetween(todayISO, due), "day")}`,
        };
      }),
    ].slice(0, 5);

    // ── recommendedActions ─────────────────────────────────────────────────────

    const actions: string[] = [];

    if (failedDeposits.length > 0) {
      actions.push(`${plural(failedDeposits.length, "deposit")} with failed payments — contact client${failedDeposits.length === 1 ? "" : "s"} immediately`);
    }
    if (overdueInvoices.length > 0) {
      actions.push(`${plural(overdueInvoices.length, "invoice")} overdue (${fmtCurrency(overdueInvoiceTotal)}) — follow up on payment`);
    }
    const urgentStale = staleLeads.filter((l) => l._daysPast >= 7);
    if (urgentStale.length > 0) {
      actions.push(`${plural(urgentStale.length, "lead")} with follow-ups 7+ days overdue — prioritize outreach today`);
    } else if (staleLeads.length > 0) {
      actions.push(`${plural(staleLeads.length, "lead")} with overdue follow-ups — schedule outreach`);
    }
    if (expiredQuotes.length > 0) {
      actions.push(`${plural(expiredQuotes.length, "quote")} expired — revise and resend to keep deals alive`);
    }
    if (expiringQuotes.length > 0) {
      actions.push(`${plural(expiringQuotes.length, "quote")} expiring within 7 days — follow up for approval`);
    }
    if (oldDeposits.length > 0) {
      actions.push(`${plural(oldDeposits.length, "deposit")} unpaid over 14 days — send a reminder`);
    }
    if (approvedQuotesNoDeposit.length > 0) {
      actions.push(`${plural(approvedQuotesNoDeposit.length, "quote")} approved by client with no deposit — send deposit request`);
    }
    if (overdueTasks.length > 0) {
      actions.push(`${plural(overdueTasks.length, "task")} overdue — review and reassign if needed`);
    }
    if (tasksDueToday.length > 0) {
      actions.push(`${plural(tasksDueToday.length, "task")} due today — confirm completion`);
    }
    if (stalledOrders.length > 0) {
      actions.push(`${plural(stalledOrders.length, "order")} past delivery date — check vendor status and notify client`);
    }
    if (ordersDueSoon.length > 0) {
      actions.push(`${plural(ordersDueSoon.length, "order")} due within 7 days — confirm delivery timeline`);
    }
    if (followUpsDueToday.length > 0) {
      actions.push(`${plural(followUpsDueToday.length, "client follow-up")} due today — reach out before end of day`);
    } else if (followUpsSoon.length > 0) {
      actions.push(`${plural(followUpsSoon.length, "follow-up")} due in the next 3 days — schedule time to reach out`);
    }
    if (paceStatus === "behind") {
      actions.push(`Revenue pace behind — ${fmtCurrency(revenueThisMonth)} of ${fmtCurrency(monthlyGoal)} goal (${monthlyPct}%)`);
    }

    if (actions.length === 0) {
      actions.push("No urgent items — operations are running smoothly. Great work.");
    }

    // ── executiveSummary ───────────────────────────────────────────────────────

    const summaryParts: string[] = [];

    summaryParts.push(
      `Revenue this month: ${fmtCurrency(revenueThisMonth)} of ${fmtCurrency(monthlyGoal)} goal (${monthlyPct}%, ${paceStatus} pace).`,
    );

    const pipelineParts: string[] = [];
    if (staleLeads.length > 0) pipelineParts.push(`${plural(staleLeads.length, "stale lead")} need outreach`);
    if (expiredQuotes.length > 0) pipelineParts.push(`${plural(expiredQuotes.length, "expired quote")} need revision`);
    if (expiringQuotes.length > 0) pipelineParts.push(`${plural(expiringQuotes.length, "quote")} expiring within 7 days`);
    if (approvedQuotesNoDeposit.length > 0) pipelineParts.push(`${plural(approvedQuotesNoDeposit.length, "approved quote")} awaiting deposit`);
    if (pipelineParts.length > 0) summaryParts.push(pipelineParts.join(", ") + ".");

    const financeParts: string[] = [];
    if (failedDeposits.length > 0) financeParts.push(`${plural(failedDeposits.length, "deposit payment")} failed`);
    if (overdueInvoices.length > 0) financeParts.push(`${plural(overdueInvoices.length, "invoice")} overdue (${fmtCurrency(overdueInvoiceTotal)})`);
    if (oldDeposits.length > 0) financeParts.push(`${plural(oldDeposits.length, "deposit")} unpaid over 14 days`);
    if (financeParts.length > 0) summaryParts.push(financeParts.join(", ") + ".");

    const taskParts: string[] = [];
    if (overdueTasks.length > 0) taskParts.push(`${plural(overdueTasks.length, "task")} overdue`);
    if (tasksDueToday.length > 0) taskParts.push(`${plural(tasksDueToday.length, "task")} due today`);
    if (taskParts.length > 0) summaryParts.push(taskParts.join(", ") + ".");

    if (stalledOrders.length > 0) {
      summaryParts.push(`${plural(stalledOrders.length, "order")} past delivery date.`);
    }

    if (summaryParts.length === 1) {
      summaryParts.push("No critical items — operations are running smoothly.");
    }

    const executiveSummary = summaryParts.join(" ");

    // ── Response ───────────────────────────────────────────────────────────────

    return okResponse({
      date: todayISO,

      urgentItems: cappedUrgentItems,

      todayFocus: {
        tasksDueToday:     tasksDueToday.length,
        followUpsDueToday: followUpsDueToday.length,
        allClear:          tasksDueToday.length === 0 && followUpsDueToday.length === 0,
        items:             todayItems,
      },

      financialPriorities: {
        revenueToday:                   Math.round(revenueToday * 100) / 100,
        revenueThisWeek:                Math.round(revenueThisWeek * 100) / 100,
        revenueThisMonth:               Math.round(revenueThisMonth * 100) / 100,
        monthlyGoal,
        monthlyPercent:                 monthlyPct,
        paceStatus,
        failedDepositCount:             failedDeposits.length,
        overdueInvoiceCount:            overdueInvoices.length,
        overdueInvoiceTotal:            Math.round(overdueInvoiceTotal * 100) / 100,
        approvedQuotesAwaitingDeposit:  approvedQuotesNoDeposit.length,
        unpaidDepositCount:             unpaidDeposits.length,
        topItems:                       financialItems,
      },

      followUpPriorities: {
        staleLeadCount:    staleLeads.length,
        expiredQuoteCount: expiredQuotes.length,
        expiringQuoteCount: expiringQuotes.length,
        oldDepositCount:   oldDeposits.length,
        followUpsDueToday: followUpsDueToday.length,
        followUpsDueSoon:  followUpsSoon.length,
        topItems:          followUpItems,
      },

      taskPriorities: {
        overdueCount:  overdueTasks.length,
        dueTodayCount: tasksDueToday.length,
        topItems:      taskTopItems,
      },

      orderPriorities: {
        stalledCount:  stalledOrders.length,
        dueSoonCount:  ordersDueSoon.length,
        topItems:      orderTopItems,
      },

      recommendedActions: actions,
      executiveSummary,
    });

  } catch (err) {
    console.error("[ai/command-center GET]", err);
    return errResponse("Internal server error", 500);
  }
}
