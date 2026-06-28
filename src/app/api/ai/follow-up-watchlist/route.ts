import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO, addDaysToISODate } from "@/lib/businessDate";
import { INACTIVE_ORDER_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";
import { readField, statusText, stringField } from "@/lib/recordUtils";
import {
  hasActiveFollowUpTask,
  hasFollowUpDate,
  leadFollowUpDate,
} from "@/lib/followUps";
import { normalizeCRMStage, isInactiveLeadStage, type DashboardRecord } from "@/lib/dashboardMetrics";
import { parseAmount } from "@/lib/invoiceCalc";

export const dynamic = "force-dynamic";

// ── GET /api/ai/follow-up-watchlist ───────────────────────────────────────────
//
// Read-only follow-up watchlist for Jarvis. Six sections:
//   1. staleLeads         — open leads with past-due follow-up dates
//   2. quotesAwaitingResponse — leads in "Quote Sent" stage (awaiting approval)
//   3. depositsAwaitingPayment — deposit requests not yet paid
//   4. overdueTasks       — incomplete tasks past their due date
//   5. stalledOrders      — active orders past their estimated delivery date
//   6. clientFollowUps    — leads with follow-up due in the next 3 days (upcoming)
//
// Each item includes a human-readable `reason` and urgency indicators.
//
// PII rules: no email, phone, address, notes, contact person name, payment
// details, or communicationHistory summary content.

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
    throw new Error(`[ai/follow-up-watchlist] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => ({ ...(r.data ?? {}), id: r.id } as Row))
    .filter((item): item is Row => Boolean(item?.id));
}

// Days from `fromISO` to `toISO` (positive when toISO is later).
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + "T12:00:00").getTime();
  const to   = new Date(toISO   + "T12:00:00").getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
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
    stringField(order, "estimatedDeliveryDate") ||
    stringField(order, "dueDate") ||
    stringField(order, "final_due_date")
  );
}

// Most recent contact date from communicationHistory.
// Only the date field is read — never the summary or notes content.
function leadLastContacted(lead: Row): string | null {
  const history = lead.communicationHistory;
  if (!Array.isArray(history) || history.length === 0) return null;
  const dates = (history as Record<string, unknown>[])
    .map((e) => stringField(e, "date"))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  return dates[0] || null;
}

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const supabase     = getSupabaseAdmin();
    const todayISO     = businessTodayISO();
    const threeDaysISO = addDaysToISODate(todayISO, 3);

    const [leads, tasks, quotes, deposits, orders] = await Promise.all([
      fetchTable(supabase, "crm_leads"),
      fetchTable(supabase, "tasks"),
      fetchTable(supabase, "quotes"),
      fetchTable(supabase, "deposit_requests"),
      fetchTable(supabase, "orders"),
    ]);

    // company lookup — never use deposit_requests.client_name
    const leadCompanyMap = new Map<string, string>(
      leads.map((l) => [
        l.id,
        stringField(l, "company") || stringField(l, "name") || "Unknown Company",
      ]),
    );

    // quotes grouped by lead_id
    const quotesByLead = new Map<string, Row[]>();
    for (const q of quotes) {
      const lid = stringField(q, "lead_id");
      if (!lid) continue;
      const arr = quotesByLead.get(lid) ?? [];
      arr.push(q);
      quotesByLead.set(lid, arr);
    }

    const openLeads = leads.filter((l) => statusText(l) !== "won");

    // ── Section 1: Stale leads ─────────────────────────────────────────────────
    // Open leads (not "won", not "Deposit Paid", not "Closed Lost") where
    // followUpDate < today and an active follow-up task still exists.

    const staleLeadItems = openLeads
      .filter((lead) => {
        if (isInactiveLeadStage(normalizeCRMStage(stringField(lead, "stage")))) return false;
        const followUp = leadFollowUpDate(lead);
        return hasFollowUpDate(followUp) && followUp < todayISO && hasActiveFollowUpTask(lead, tasks);
      })
      .map((lead) => {
        const followUpDate         = leadFollowUpDate(lead);
        const daysPastFollowUp     = daysBetween(followUpDate, todayISO);
        const lastContacted        = leadLastContacted(lead);
        const daysSinceLastContact = lastContacted ? daysBetween(lastContacted, todayISO) : null;
        const owner = stringField(lead, "owner") || stringField(lead, "assignedTo") || null;

        const contactNote = lastContacted
          ? ` — last contacted ${lastContacted}`
          : " — no contact logged";
        const reason = `Follow-up was due ${daysPastFollowUp} day${daysPastFollowUp !== 1 ? "s" : ""} ago${contactNote}`;

        return {
          leadId:             lead.id,
          company:            stringField(lead, "company") || stringField(lead, "name") || "Unknown",
          stage:              normalizeCRMStage(stringField(lead, "stage")),
          owner,
          followUpDate,
          daysPastFollowUp,
          lastContacted,
          daysSinceLastContact,
          reason,
        };
      })
      .sort((a, b) => b.daysPastFollowUp - a.daysPastFollowUp);

    // ── Section 2: Quotes awaiting response ────────────────────────────────────
    // Leads in "Quote Sent" stage with their most recent sent quote.

    const quoteSentLeads = openLeads.filter(
      (l) => normalizeCRMStage(stringField(l, "stage")) === "Quote Sent",
    );

    const quoteAwaitingItems = quoteSentLeads
      .map((lead) => {
        const leadQuotes  = quotesByLead.get(lead.id) ?? [];
        const sentQuotes  = leadQuotes
          .filter((q) => stringField(q, "status") === "sent")
          .sort((a, b) => {
            const ta = stringField(a, "sent_date");
            const tb = stringField(b, "sent_date");
            if (tb && ta) return tb.localeCompare(ta);
            if (tb) return 1;
            if (ta) return -1;
            return b.id.localeCompare(a.id);
          });
        const q = sentQuotes[0] ?? leadQuotes.sort((a, b) => b.id.localeCompare(a.id))[0] ?? null;

        const sentDate        = q ? (stringField(q, "sent_date")       || null) : null;
        const daysSinceSent   = sentDate ? daysBetween(sentDate, todayISO) : null;
        const expirationDate  = q ? (stringField(q, "expiration_date") || null) : null;
        const daysUntilExpiry = expirationDate ? daysBetween(todayISO, expirationDate) : null;
        const grandTotal      = q ? (parseAmount(q.grand_total ?? q.total_amount ?? 0) || null) : null;

        let reason: string;
        if (daysUntilExpiry !== null) {
          if (daysUntilExpiry < 0) {
            const n = -daysUntilExpiry;
            reason = `Quote expired ${n} day${n !== 1 ? "s" : ""} ago — revise or follow up`;
          } else if (daysUntilExpiry === 0) {
            reason = "Quote expires today — follow up now";
          } else if (daysUntilExpiry <= 3) {
            reason = `Quote expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? "s" : ""} — follow up now`;
          } else if (daysSinceSent !== null && daysSinceSent > 7) {
            reason = `Quote sent ${daysSinceSent} days ago with no response`;
          } else {
            reason = `Quote expires in ${daysUntilExpiry} days — awaiting client approval`;
          }
        } else if (daysSinceSent !== null) {
          if (daysSinceSent > 7) {
            reason = `Quote sent ${daysSinceSent} days ago with no response`;
          } else {
            reason = `Quote sent ${daysSinceSent} day${daysSinceSent !== 1 ? "s" : ""} ago — awaiting client approval`;
          }
        } else {
          reason = "Quote sent — awaiting client approval";
        }

        return {
          leadId:        lead.id,
          company:       stringField(lead, "company") || stringField(lead, "name") || "Unknown",
          quoteId:       q?.id ?? null,
          quoteNumber:   q ? (stringField(q, "quote_number") || null) : null,
          sentDate,
          daysSinceSent,
          expirationDate,
          daysUntilExpiry,
          grandTotal,
          reason,
        };
      })
      .sort((a, b) => {
        // Expired/expiring soonest first (most negative daysUntilExpiry = most urgent);
        // leads with no expiry date sorted last, then by oldest sent first.
        if (a.daysUntilExpiry !== null && b.daysUntilExpiry !== null) {
          return a.daysUntilExpiry - b.daysUntilExpiry;
        }
        if (a.daysUntilExpiry !== null) return -1;
        if (b.daysUntilExpiry !== null) return 1;
        return (b.daysSinceSent ?? 0) - (a.daysSinceSent ?? 0);
      });

    // ── Section 3: Deposits awaiting payment ───────────────────────────────────

    const depositAwaitingItems = deposits
      .filter((d) => statusText(d) !== "paid")
      .map((d) => {
        const leadId   = stringField(d, "lead_id");
        const depStatus = statusText(d);
        const sentDate  = stringField(d, "sent_date") || null;
        const daysOld   = sentDate ? Math.max(0, daysBetween(sentDate, todayISO)) : null;
        const amount    = parseAmount(d.deposit_amount);

        let reason: string;
        if (depStatus === "payment_failed") {
          reason = "Payment failed — follow up immediately";
        } else if (daysOld !== null && daysOld > 14) {
          reason = `Deposit request unpaid for ${daysOld} days — follow up needed`;
        } else if (daysOld !== null) {
          reason = `Deposit request sent ${daysOld} day${daysOld !== 1 ? "s" : ""} ago — awaiting payment`;
        } else {
          reason = "Deposit request sent — awaiting payment";
        }

        return {
          leadId:        leadId || null,
          company:       leadId ? (leadCompanyMap.get(leadId) ?? "Unknown Company") : null,
          depositNumber: stringField(d, "deposit_request_number") || null,
          status:        depStatus,
          sentDate,
          daysOld,
          amount,
          reason,
        };
      })
      .sort((a, b) => {
        // Failed payments first, then oldest (highest daysOld) first
        if (a.status === "payment_failed" && b.status !== "payment_failed") return -1;
        if (b.status === "payment_failed" && a.status !== "payment_failed") return 1;
        return (b.daysOld ?? 0) - (a.daysOld ?? 0);
      });

    // ── Section 4: Overdue tasks ───────────────────────────────────────────────

    const overdueTaskItems = tasks
      .filter((t) => {
        if (isTaskDone(t)) return false;
        const due = taskDueDate(t);
        return isValidISO(due) && due < todayISO;
      })
      .map((t) => {
        const due        = taskDueDate(t);
        const daysPastDue = daysBetween(due, todayISO);
        return {
          id:          t.id,
          title:       stringField(t, "title") || "Untitled task",
          owner:       taskOwner(t) || null,
          dueDate:     due,
          daysPastDue,
          reason:      `Task overdue by ${daysPastDue} day${daysPastDue !== 1 ? "s" : ""}`,
        };
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue);

    // ── Section 5: Stalled orders ──────────────────────────────────────────────
    // Active orders past their estimated delivery date.

    const stalledOrderItems = orders
      .filter((o) => {
        if (INACTIVE_ORDER_STATUSES.has(statusText(o))) return false;
        const due = orderDueDate(o);
        return isValidISO(due) && due < todayISO;
      })
      .map((o) => {
        const due        = orderDueDate(o);
        const daysPastDue = daysBetween(due, todayISO);
        return {
          id:        o.id,
          orderName: stringField(o, "orderName") || stringField(o, "order_name") || "Order",
          status:    stringField(o, "status") || "active",
          dueDate:   due,
          daysPastDue,
          reason:    `Delivery was expected ${daysPastDue} day${daysPastDue !== 1 ? "s" : ""} ago — follow up with vendor or client`,
        };
      })
      .sort((a, b) => b.daysPastDue - a.daysPastDue);

    // ── Section 6: Client follow-ups (upcoming, within 3 days) ────────────────

    const clientFollowUpItems = openLeads
      .filter((lead) => {
        const followUp = leadFollowUpDate(lead);
        return (
          hasFollowUpDate(followUp) &&
          followUp >= todayISO &&
          followUp <= threeDaysISO &&
          hasActiveFollowUpTask(lead, tasks)
        );
      })
      .map((lead) => {
        const followUpDate     = leadFollowUpDate(lead);
        const daysUntilFollowUp = daysBetween(todayISO, followUpDate);
        const reason =
          daysUntilFollowUp === 0 ? "Follow-up due today" :
          daysUntilFollowUp === 1 ? "Follow-up due tomorrow" :
          `Follow-up due in ${daysUntilFollowUp} days`;
        return {
          leadId:           lead.id,
          company:          stringField(lead, "company") || stringField(lead, "name") || "Unknown",
          stage:            normalizeCRMStage(stringField(lead, "stage")),
          owner:            stringField(lead, "owner") || stringField(lead, "assignedTo") || null,
          followUpDate,
          daysUntilFollowUp,
          reason,
        };
      })
      .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));

    // ── Recommended follow-up actions ──────────────────────────────────────────

    const actions: string[] = [];

    const urgentStale = staleLeadItems.filter((l) => l.daysPastFollowUp >= 7);
    if (urgentStale.length > 0) {
      actions.push(
        `${urgentStale.length} lead${urgentStale.length > 1 ? "s" : ""} with follow-ups 7+ days overdue — prioritize outreach today`,
      );
    } else if (staleLeadItems.length > 0) {
      actions.push(
        `${staleLeadItems.length} lead${staleLeadItems.length > 1 ? "s" : ""} with overdue follow-up${staleLeadItems.length > 1 ? "s" : ""} — schedule time to reach out`,
      );
    }

    const expiredQuotes  = quoteAwaitingItems.filter((q) => q.daysUntilExpiry !== null && q.daysUntilExpiry < 0);
    const expiringQuotes = quoteAwaitingItems.filter((q) => q.daysUntilExpiry !== null && q.daysUntilExpiry >= 0 && q.daysUntilExpiry <= 7);
    if (expiredQuotes.length > 0) {
      actions.push(
        `${expiredQuotes.length} quote${expiredQuotes.length > 1 ? "s" : ""} have expired — revise and resend to keep deals alive`,
      );
    }
    if (expiringQuotes.length > 0) {
      actions.push(
        `${expiringQuotes.length} quote${expiringQuotes.length > 1 ? "s" : ""} expiring within 7 days — follow up to push for approval`,
      );
    }
    if (quoteAwaitingItems.length > 0 && expiredQuotes.length === 0 && expiringQuotes.length === 0) {
      actions.push(
        `${quoteAwaitingItems.length} quote${quoteAwaitingItems.length > 1 ? "s" : ""} awaiting client response — follow up on the older ones`,
      );
    }

    const failedDeposits = depositAwaitingItems.filter((d) => d.status === "payment_failed");
    if (failedDeposits.length > 0) {
      actions.push(
        `${failedDeposits.length} deposit payment${failedDeposits.length > 1 ? "s" : ""} failed — contact client immediately`,
      );
    }
    const oldDeposits = depositAwaitingItems.filter((d) => d.status !== "payment_failed" && (d.daysOld ?? 0) > 14);
    if (oldDeposits.length > 0) {
      actions.push(
        `${oldDeposits.length} deposit request${oldDeposits.length > 1 ? "s" : ""} unpaid for over 14 days — send a reminder`,
      );
    }

    if (overdueTaskItems.length > 0) {
      actions.push(
        `${overdueTaskItems.length} task${overdueTaskItems.length > 1 ? "s" : ""} overdue — review and reassign if needed`,
      );
    }

    if (stalledOrderItems.length > 0) {
      actions.push(
        `${stalledOrderItems.length} order${stalledOrderItems.length > 1 ? "s" : ""} past delivery date — check vendor status and notify client`,
      );
    }

    const todayFollowUps = clientFollowUpItems.filter((c) => c.daysUntilFollowUp === 0);
    if (todayFollowUps.length > 0) {
      actions.push(
        `${todayFollowUps.length} client follow-up${todayFollowUps.length > 1 ? "s" : ""} due today — reach out before end of day`,
      );
    } else if (clientFollowUpItems.length > 0) {
      actions.push(
        `${clientFollowUpItems.length} follow-up${clientFollowUpItems.length > 1 ? "s" : ""} due in the next 3 days — schedule time to reach out`,
      );
    }

    if (actions.length === 0) {
      actions.push("No follow-up items need immediate attention — all caught up.");
    }

    return okResponse({
      date: todayISO,
      staleLeads: {
        count: staleLeadItems.length,
        items: staleLeadItems.slice(0, 10),
      },
      quotesAwaitingResponse: {
        count: quoteAwaitingItems.length,
        items: quoteAwaitingItems.slice(0, 10),
      },
      depositsAwaitingPayment: {
        count:       depositAwaitingItems.length,
        totalAmount: depositAwaitingItems.reduce((s, d) => s + d.amount, 0),
        items:       depositAwaitingItems.slice(0, 10),
      },
      overdueTasks: {
        count: overdueTaskItems.length,
        items: overdueTaskItems.slice(0, 10),
      },
      stalledOrders: {
        count: stalledOrderItems.length,
        items: stalledOrderItems.slice(0, 10),
      },
      clientFollowUps: {
        count: clientFollowUpItems.length,
        items: clientFollowUpItems.slice(0, 10),
      },
      recommendedFollowUpActions: actions,
    });

  } catch (err) {
    console.error("[ai/follow-up-watchlist GET]", err);
    return errResponse("Internal server error", 500);
  }
}
