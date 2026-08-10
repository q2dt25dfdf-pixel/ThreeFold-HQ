import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate, dateToBusinessISO } from "@/lib/businessDate";
import {
  INACTIVE_FINANCE_STATUSES,
  INACTIVE_ORDER_STATUSES,
  TASK_DONE_STATUSES,
} from "@/lib/constants";
import { readField, statusText, stringField } from "@/lib/recordUtils";
import { hasActiveFollowUpTask, hasFollowUpDate, isCrmTask, leadFollowUpDate } from "@/lib/followUps";
import { normalizeCRMStage, isInactiveLeadStage } from "@/lib/dashboardMetrics";
import { parseAmount, calcDeposit, calcBalance, calcTotal } from "@/lib/invoiceCalc";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── GET /api/ai/end-of-day-summary ────────────────────────────────────────────
//
// Single read-only call that answers "what happened today?" and "what needs
// attention tomorrow?":
//   - Tasks completed today and CRM contacts logged today
//   - Quotes sent today and deposit requests sent today
//   - Revenue collected today and expenses logged today
//   - Active orders due today
//   - All overdue items (tasks, invoices, stalled orders, deposits)
//   - Tomorrow's focus: tasks/orders/follow-ups due tomorrow
//   - Plain-language recommended wrap-up actions
//
// PII rules: no email, phone, contact person names, notes, payment details.
// Company names, order names, and task titles are safe to return.

type Row = DashboardRecord;
type TableRow = { id: string; data: Row | null };

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
    throw new Error(`[ai/end-of-day-summary] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => ({ ...(r.data ?? {}), id: r.id } as Row))
    .filter((item): item is Row => Boolean(item?.id));
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

function isValidDate(d: string): boolean {
  return Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (new Date(toISO + "T12:00:00").getTime() - new Date(fromISO + "T12:00:00").getTime()) /
    (1000 * 60 * 60 * 24),
  );
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const todayISO    = businessTodayISO();
    const tomorrowISO = addDaysToISODate(todayISO, 1);

    const [tasks, finances, orders, leads, quotes, deposits, clientActivity, expenses] =
      await Promise.all([
        fetchTable(db, "tasks"),
        fetchTable(db, "finances"),
        fetchTable(db, "orders"),
        fetchTable(db, "crm_leads"),
        fetchTable(db, "quotes"),
        fetchTable(db, "deposit_requests"),
        fetchTable(db, "client_activity"),
        fetchTable(db, "expenses"),
      ]);

    // ── Lead company map (shared across sections) ──────────────────────────────

    const leadCompanyMap = new Map<string, string>();
    const leadStageMap   = new Map<string, string>();
    for (const l of leads) {
      const co = stringField(l, "company") || stringField(l, "name");
      if (l.id && co) leadCompanyMap.set(l.id, co);
      leadStageMap.set(l.id, stringField(l, "stage") || "");
    }

    // ── completedToday ─────────────────────────────────────────────────────────

    const completedTasks = tasks
      .filter((t) => {
        const raw = stringField(t, "completedAt") || stringField(t, "completed_at");
        if (!raw) return false;
        const d = new Date(raw);
        return !Number.isNaN(d.getTime()) && dateToBusinessISO(d) === todayISO;
      })
      .map((t) => ({
        id:    t.id,
        title: stringField(t, "title") || "Untitled task",
        owner: stringField(t, "assignedTo") || stringField(t, "owner") || null,
      }))
      .slice(0, 10);

    // CRM communications logged today — safe fields only, no summary content
    type CRMContact = {
      leadId:      string;
      company:     string;
      stage:       string | null;
      contactType: string;
    };
    const crmContactsToday: CRMContact[] = [];
    const leadsContactedIds = new Set<string>();

    for (const lead of leads) {
      const history = lead.communicationHistory;
      if (!Array.isArray(history)) continue;
      for (const entry of history) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as Record<string, unknown>;
        if (stringField(e, "date") !== todayISO) continue;
        crmContactsToday.push({
          leadId:      lead.id,
          company:     stringField(lead, "company") || stringField(lead, "name") || "Unknown",
          stage:       stringField(lead, "stage") || null,
          contactType: stringField(e, "type") || "Contact",
        });
        leadsContactedIds.add(lead.id);
      }
    }

    // client_activity table — count only (no PII fields exposed)
    const clientActivityTodayCount = clientActivity.filter(
      (e) => stringField(e, "date") === todayISO,
    ).length;

    // ── activityToday ──────────────────────────────────────────────────────────

    const activityToday = {
      clientActivityCount: clientActivityTodayCount,
      crmContactCount:     crmContactsToday.length,
      totalCount:          clientActivityTodayCount + crmContactsToday.length,
    };

    // ── pipelineChanges ────────────────────────────────────────────────────────
    // Best available signal: CRM leads that had a communication logged today.
    // Stage change history is not tracked as an auditable field.

    // Deduplicate by leadId — keep first contact type per lead
    const leadsContactedTodayMap = new Map<string, CRMContact>();
    for (const c of crmContactsToday) {
      if (!leadsContactedTodayMap.has(c.leadId)) {
        leadsContactedTodayMap.set(c.leadId, c);
      }
    }
    const leadsContactedToday = Array.from(leadsContactedTodayMap.values()).slice(0, 10);

    const pipelineChanges = {
      leadsContactedTodayCount: leadsContactedIds.size,
      leadsContactedToday,
    };

    // ── quoteActivity ──────────────────────────────────────────────────────────

    const quotesSentToday = quotes
      .filter((q) => stringField(q, "sent_date") === todayISO)
      .map((q) => {
        const leadId = stringField(q, "lead_id");
        return {
          leadId:      leadId || null,
          company:     leadId ? (leadCompanyMap.get(leadId) ?? "Unknown") : "Unknown",
          quoteNumber: stringField(q, "quote_number") || null,
          grandTotal:  parseAmount(q.grand_total ?? q.total_amount ?? 0) || null,
        };
      })
      .slice(0, 10);

    const quoteActivity = {
      sentTodayCount: quotesSentToday.length,
      sentToday:      quotesSentToday,
    };

    // ── depositActivity ────────────────────────────────────────────────────────

    const depositsSentToday = deposits
      .filter((d) => stringField(d, "sent_date") === todayISO)
      .map((d) => {
        const leadId = stringField(d, "lead_id");
        return {
          id:                   d.id,
          depositRequestNumber: stringField(d, "deposit_request_number") || null,
          company:              leadId ? (leadCompanyMap.get(leadId) ?? "Unknown") : "Unknown",
          depositAmount:        parseAmount(d.deposit_amount ?? 0) || null,
        };
      })
      .slice(0, 10);

    type DayPayment = { id: string; orderName: string; amount: number; type: "deposit" | "final" };

    const paymentsToday: DayPayment[] = finances
      .filter((inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)))
      .flatMap((inv) => {
        const events: DayPayment[] = [];
        const depositDate = stringField(inv, "deposit_paid_date");
        const finalDate   = stringField(inv, "final_paid_date");
        const name        =
          stringField(inv, "orderName") || stringField(inv, "order_name") || "Invoice";

        if (inv.deposit_paid === true && depositDate === todayISO) {
          events.push({
            id:        `${inv.id}-dep`,
            orderName: name,
            amount:    Math.round(calcDeposit(inv) * 100) / 100,
            type:      "deposit",
          });
        }
        if (inv.final_paid === true && finalDate === todayISO) {
          const amount = inv.deposit_paid === true ? calcBalance(inv) : calcTotal(inv);
          events.push({
            id:        `${inv.id}-fin`,
            orderName: name,
            amount:    Math.round(amount * 100) / 100,
            type:      "final",
          });
        }
        return events;
      });

    const depositsPaidToday = paymentsToday.filter((p) => p.type === "deposit");
    const finalsPaidToday   = paymentsToday.filter((p) => p.type === "final");

    const depositActivity = {
      sentTodayCount:  depositsSentToday.length,
      sentToday:       depositsSentToday,
      paidTodayCount:  depositsPaidToday.length,
      paidToday:       depositsPaidToday,
      finalsPaidCount: finalsPaidToday.length,
    };

    // ── orderActivity ──────────────────────────────────────────────────────────
    // Order change history is not auditable; report orders due today as a proxy.

    const activeOrders = orders.filter((o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)));

    const ordersDueToday = activeOrders
      .filter((o) => {
        const due =
          stringField(o, "estimatedDeliveryDate") ||
          stringField(o, "dueDate") ||
          stringField(o, "final_due_date");
        return due === todayISO;
      })
      .map((o) => ({
        id:        o.id,
        orderName: stringField(o, "orderName") || stringField(o, "order_name") || "Order",
        status:    stringField(o, "status") || "active",
      }))
      .slice(0, 10);

    const orderActivity = {
      activeCount:    activeOrders.length,
      dueTodayCount:  ordersDueToday.length,
      dueToday:       ordersDueToday,
    };

    // ── financeActivity ────────────────────────────────────────────────────────

    const revenueToday = Math.round(
      paymentsToday.reduce((sum, p) => sum + p.amount, 0) * 100,
    ) / 100;

    const expensesToday = expenses
      .filter((e) => stringField(e, "expense_date") === todayISO)
      .map((e) => {
        const cents = e.amount_cents;
        const full = typeof cents === "number" ? cents / 100 : parseAmount(e.amount ?? 0);
        // Split expenses: general-business portion only (order portions are
        // vendor costs). Unsplit → full amount.
        const allocs = Array.isArray((e as { allocations?: unknown }).allocations)
          ? ((e as { allocations?: Array<{ amount_cents?: number; destination?: { type?: string } }> }).allocations ?? [])
          : [];
        const amount = allocs.length
          ? allocs.filter((a) => a?.destination?.type === "general").reduce((s, a) => s + (Number(a.amount_cents) || 0), 0) / 100
          : full;
        return {
          id:     e.id,
          name:   stringField(e, "vendor_name") || stringField(e, "category") || "Expense",
          amount,
        };
      })
      .slice(0, 10);

    const expenseTotalToday = Math.round(
      expensesToday.reduce((sum, e) => sum + e.amount, 0) * 100,
    ) / 100;

    const financeActivity = {
      revenueToday,
      expenseTotalToday,
      payments: paymentsToday,
      expenses: expensesToday,
    };

    // ── overdueItems ───────────────────────────────────────────────────────────

    // Exclude CRM follow-up tasks — the Tasks board hides them; they surface via the
    // lead follow-up path, not as phantom overdue board tasks (shared isCrmTask).
    // NB: only the OPEN/overdue scan is guarded — the "completed today" list is separate.
    const openTasks = tasks.filter(
      (t) => t.completed !== true && !TASK_DONE_STATUSES.has(statusText(t)) && !isCrmTask(t),
    );

    const overdueTasks = openTasks
      .filter((t) => {
        const due = readField(t, "dueDate", "due_date");
        return isValidDate(due) && due !== "TBD" && due < todayISO;
      })
      .map((t) => ({
        id:      t.id,
        title:   stringField(t, "title") || "Untitled task",
        dueDate: readField(t, "dueDate", "due_date"),
        owner:   stringField(t, "assignedTo") || stringField(t, "owner") || null,
      }))
      .slice(0, 10);

    const overdueInvoices = finances
      .filter((inv) => {
        if (INACTIVE_FINANCE_STATUSES.has(statusText(inv))) return false;
        if (inv.final_paid === true) return false;
        const due = stringField(inv, "final_due_date") || stringField(inv, "dueDate");
        return Boolean(due && due < todayISO);
      })
      .map((inv) => {
        const orderName = stringField(inv, "orderName") || stringField(inv, "order_name") || "Invoice";
        const due       = stringField(inv, "final_due_date") || stringField(inv, "dueDate") || null;
        const balance   = Math.round(
          (inv.deposit_paid === true ? calcBalance(inv) : calcTotal(inv)) * 100,
        ) / 100;
        const daysPastDue = due ? daysBetween(due, todayISO) : 0;
        return { id: inv.id, orderName, status: statusText(inv), balance, daysPastDue };
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue)
      .slice(0, 10);

    const stalledOrders = activeOrders
      .filter((o) => {
        const due =
          stringField(o, "estimatedDeliveryDate") ||
          stringField(o, "dueDate") ||
          stringField(o, "final_due_date");
        return Boolean(due && due < todayISO);
      })
      .map((o) => {
        const due =
          stringField(o, "estimatedDeliveryDate") ||
          stringField(o, "dueDate") ||
          stringField(o, "final_due_date");
        const daysPastDue = due ? daysBetween(due, todayISO) : 0;
        return {
          id:          o.id,
          orderName:   stringField(o, "orderName") || stringField(o, "order_name") || "Order",
          status:      statusText(o) || "active",
          dueDate:     due || null,
          daysPastDue,
        };
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue)
      .slice(0, 10);

    const outstandingDeposits = deposits
      .filter((d) => stringField(d, "status") !== "paid")
      .map((d) => {
        const leadId    = stringField(d, "lead_id");
        const sentDate  = stringField(d, "sent_date") || null;
        const daysSince = sentDate ? daysBetween(sentDate, todayISO) : null;
        return {
          id:                   d.id,
          depositRequestNumber: stringField(d, "deposit_request_number") || null,
          company:              leadId ? (leadCompanyMap.get(leadId) ?? "Unknown") : "Unknown",
          depositAmount:        parseAmount(d.deposit_amount ?? 0) || null,
          status:               stringField(d, "status") || "unknown",
          sentDate,
          daysSinceSent: daysSince,
        };
      })
      .sort((a, b) => {
        if (!a.sentDate && !b.sentDate) return 0;
        if (!a.sentDate) return 1;
        if (!b.sentDate) return -1;
        return a.sentDate.localeCompare(b.sentDate);
      })
      .slice(0, 10);

    const overdueItems = {
      overdueTaskCount:        overdueTasks.length,
      overdueTasks,
      overdueInvoiceCount:     overdueInvoices.length,
      overdueInvoices,
      stalledOrderCount:       stalledOrders.length,
      stalledOrders,
      outstandingDepositCount: outstandingDeposits.length,
      outstandingDeposits,
    };

    // ── tomorrowFocus ──────────────────────────────────────────────────────────

    const tasksDueTomorrow = openTasks
      .filter((t) => {
        const due = readField(t, "dueDate", "due_date");
        return due === tomorrowISO;
      })
      .map((t) => ({
        id:    t.id,
        title: stringField(t, "title") || "Untitled task",
        owner: stringField(t, "assignedTo") || stringField(t, "owner") || null,
      }))
      .slice(0, 10);

    const ordersDueTomorrow = activeOrders
      .filter((o) => {
        const due =
          stringField(o, "estimatedDeliveryDate") ||
          stringField(o, "dueDate") ||
          stringField(o, "final_due_date");
        return due === tomorrowISO;
      })
      .map((o) => ({
        id:        o.id,
        orderName: stringField(o, "orderName") || stringField(o, "order_name") || "Order",
        status:    stringField(o, "status") || "active",
      }))
      .slice(0, 10);

    const followUpsDueTomorrow = leads
      .filter((lead) => {
        if (isInactiveLeadStage(normalizeCRMStage(stringField(lead, "stage")))) return false;
        const followUp = leadFollowUpDate(lead);
        return hasFollowUpDate(followUp) && followUp === tomorrowISO && hasActiveFollowUpTask(lead, tasks);
      })
      .map((lead) => ({
        leadId:  lead.id,
        company: stringField(lead, "company") || stringField(lead, "name") || "Unknown",
        owner:   stringField(lead, "owner") || null,
      }))
      .slice(0, 10);

    const tomorrowFocus = {
      tasksDueTomorrow,
      ordersDueTomorrow,
      followUpsDueTomorrow,
    };

    // ── recommendedWrapUpActions ───────────────────────────────────────────────

    const actions: string[] = [];

    if (completedTasks.length > 0) {
      actions.push(
        `${plural(completedTasks.length, "task")} marked complete today — good progress`,
      );
    }
    if (quotesSentToday.length > 0) {
      const names = quotesSentToday
        .slice(0, 2)
        .map((q) => q.quoteNumber ?? q.company)
        .join(", ");
      actions.push(
        `${plural(quotesSentToday.length, "quote")} sent today (${names}) — watch for client responses`,
      );
    }
    if (depositsSentToday.length > 0) {
      actions.push(
        `${plural(depositsSentToday.length, "deposit request")} sent today — confirm receipt in HQ`,
      );
    }
    if (revenueToday > 0) {
      actions.push(
        `${fmtCurrency(revenueToday)} collected today — verify it appears in HQ finances`,
      );
    }
    if (overdueTasks.length > 0) {
      actions.push(
        `${plural(overdueTasks.length, "task")} still overdue — reassign or reschedule tomorrow`,
      );
    }
    if (stalledOrders.length > 0) {
      actions.push(
        `${plural(stalledOrders.length, "order")} past delivery date — check vendor status`,
      );
    }
    if (overdueInvoices.length > 0) {
      actions.push(
        `${plural(overdueInvoices.length, "invoice")} past due — follow up on payment`,
      );
    }
    if (outstandingDeposits.length > 0) {
      actions.push(
        `${plural(outstandingDeposits.length, "deposit request")} outstanding — follow up if needed`,
      );
    }
    if (tasksDueTomorrow.length > 0) {
      actions.push(
        `${plural(tasksDueTomorrow.length, "task")} due tomorrow — confirm they're on track`,
      );
    }
    if (ordersDueTomorrow.length > 0) {
      actions.push(
        `${plural(ordersDueTomorrow.length, "order")} delivery due tomorrow — confirm with vendor`,
      );
    }
    if (followUpsDueTomorrow.length > 0) {
      actions.push(
        `${plural(followUpsDueTomorrow.length, "CRM follow-up")} due tomorrow — schedule outreach now`,
      );
    }

    if (actions.length === 0) {
      actions.push("Clean end of day — no outstanding items. Great work today.");
    }

    // ── Response ───────────────────────────────────────────────────────────────

    return okResponse({
      date: todayISO,
      completedToday: {
        taskCount:           completedTasks.length,
        tasks:               completedTasks,
        crmContactCount:     crmContactsToday.length,
        crmContacts:         crmContactsToday.slice(0, 10).map((c) => ({
          leadId:      c.leadId,
          company:     c.company,
          contactType: c.contactType,
        })),
        clientActivityCount: clientActivityTodayCount,
      },
      activityToday,
      pipelineChanges,
      quoteActivity,
      depositActivity,
      orderActivity,
      financeActivity,
      overdueItems,
      tomorrowFocus,
      recommendedWrapUpActions: actions,
    });

  } catch (err) {
    console.error("[ai/end-of-day-summary GET]", err);
    return errResponse("Internal server error", 500);
  }
}
