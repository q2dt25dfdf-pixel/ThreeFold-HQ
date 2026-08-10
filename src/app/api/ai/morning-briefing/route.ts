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
import { hasActiveFollowUpTask, hasFollowUpDate, isCrmTask, leadFollowUpDate } from "@/lib/followUps";
import {
  normalizeCRMStage,
  isInactiveLeadStage,
  monthlyRevenueProgress,
  monthlyRevenueGoal,
  parseDashboardDate,
} from "@/lib/dashboardMetrics";
import { parseAmount, calcBalance } from "@/lib/invoiceCalc";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

// ── GET /api/ai/morning-briefing ───────────────────────────────────────────────
//
// Single read-only call summarising what needs attention right now:
//   - Overdue tasks and tasks due today
//   - Stale CRM leads (follow-up date passed)
//   - Quote follow-ups awaiting client response
//   - Outstanding (unpaid) deposit requests
//   - Unpaid final invoices
//   - Active orders due within 7 days
//   - Month-to-date revenue pace
//   - Recommended plain-language actions Jarvis can quote directly
//
// PII rules: no email, phone, contact person names, notes, or payment details.
// Company names and order names are safe to return.

type Row = DashboardRecord;
type TableRow = { id: string; data: Row | null };

// ── Table fetcher (identical pattern to reports/route.ts) ──────────────────────

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
    throw new Error(`[ai/morning-briefing] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => ({ ...(r.data ?? {}), id: r.id } as Row))
    .filter((item): item is Row => Boolean(item?.id));
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Task helpers ───────────────────────────────────────────────────────────────

function isTaskDone(task: Row): boolean {
  return task.completed === true || TASK_DONE_STATUSES.has(statusText(task));
}

function taskDueDate(task: Row): string {
  return readField(task, "dueDate", "due_date");
}

function taskOwner(task: Row): string {
  return stringField(task, "owner") || stringField(task, "assignedTo");
}

function isValidDateField(d: string): boolean {
  return Boolean(d && d !== "TBD" && /^\d{4}-\d{2}-\d{2}$/.test(d));
}

// ── Quote recency sort (mirrors reports/route.ts quoteEffectiveTs) ─────────────

function quoteTs(q: Row): string {
  return (
    (q.acknowledgementAcceptedAt as string) ||
    (q.sent_date as string) ||
    (q.created_at as string) ||
    ""
  );
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const todayISO = businessTodayISO();
    const sevenDaysISO = addDaysToISODate(todayISO, 7);

    // Fetch all 6 tables in parallel
    const [tasks, finances, orders, leads, quotes, deposits] = await Promise.all([
      fetchTable(db, "tasks"),
      fetchTable(db, "finances"),
      fetchTable(db, "orders"),
      fetchTable(db, "crm_leads"),
      fetchTable(db, "quotes"),
      fetchTable(db, "deposit_requests"),
    ]);

    // ── Tasks ────────────────────────────────────────────────────────────────

    // Exclude CRM follow-up tasks — the Tasks board hides them; they surface via the
    // lead follow-up path, not as phantom overdue board tasks (shared isCrmTask).
    const openTasks = tasks.filter((t) => !isTaskDone(t) && !isCrmTask(t));

    const overdueTasks = openTasks.filter((t) => {
      const due = taskDueDate(t);
      return isValidDateField(due) && due < todayISO;
    });

    const tasksDueToday = openTasks.filter((t) => {
      const due = taskDueDate(t);
      return isValidDateField(due) && due === todayISO;
    });

    // ── Stale leads ──────────────────────────────────────────────────────────

    const staleLeads = leads.filter((lead) => {
      if (isInactiveLeadStage(normalizeCRMStage(stringField(lead, "stage")))) return false;
      const followUp = leadFollowUpDate(lead);
      return hasFollowUpDate(followUp) && followUp < todayISO && hasActiveFollowUpTask(lead, tasks);
    });

    const openLeadCount = leads.filter(
      (l) => statusText(l) !== "won",
    ).length;

    // ── Quote follow-ups (leads in "Quote Sent" stage) ────────────────────────

    const quotesByLead = new Map<string, Row[]>();
    for (const q of quotes) {
      const lid = stringField(q, "lead_id");
      if (!lid) continue;
      const arr = quotesByLead.get(lid) ?? [];
      arr.push(q);
      quotesByLead.set(lid, arr);
    }

    const quoteSentLeads = leads.filter(
      (l) => normalizeCRMStage(stringField(l, "stage")) === "Quote Sent",
    );

    const quoteFollowUps = quoteSentLeads
      .map((lead) => {
        const raw = quotesByLead.get(lead.id) ?? [];
        const sorted = [...raw].sort((a, b) => {
          const ta = quoteTs(a), tb = quoteTs(b);
          if (tb > ta) return 1;
          if (tb < ta) return -1;
          return (b.id as string) > (a.id as string) ? 1 : -1;
        });
        const q = sorted[0];
        const expirationDate = q ? (stringField(q, "expiration_date") || null) : null;
        const daysUntilExpiry = expirationDate
          ? Math.round(
              (new Date(expirationDate + "T12:00:00").getTime() -
               new Date(todayISO + "T12:00:00").getTime()) /
              (1000 * 60 * 60 * 24),
            )
          : null;
        return {
          leadId: lead.id,
          company: stringField(lead, "company") || stringField(lead, "name") || "Unknown",
          quoteNumber: q ? (stringField(q, "quote_number") || null) : null,
          grandTotal: q ? (parseAmount(q.grand_total ?? q.total_amount ?? 0) || null) : null,
          expirationDate,
          daysUntilExpiry,
        };
      })
      .sort((a, b) => {
        if (a.daysUntilExpiry === null && b.daysUntilExpiry === null) return 0;
        if (a.daysUntilExpiry === null) return 1;
        if (b.daysUntilExpiry === null) return -1;
        return a.daysUntilExpiry - b.daysUntilExpiry;
      })
      .slice(0, 10);

    // ── Outstanding deposits ──────────────────────────────────────────────────

    const leadCompanyMap = new Map<string, string>();
    for (const l of leads) {
      const co = stringField(l, "company") || stringField(l, "name");
      if (l.id && co) leadCompanyMap.set(l.id, co);
    }

    const outstandingDeposits = deposits
      .filter((d) => stringField(d, "status") !== "paid")
      .map((d) => {
        const leadId = stringField(d, "lead_id");
        return {
          id: d.id,
          depositRequestNumber: stringField(d, "deposit_request_number") || null,
          company: leadId ? (leadCompanyMap.get(leadId) ?? "Unknown") : "Unknown",
          depositAmount: parseAmount(d.deposit_amount ?? 0) || null,
          status: stringField(d, "status") || "unknown",
          sentDate: stringField(d, "sent_date") || null,
        };
      })
      .sort((a, b) => {
        if (!a.sentDate && !b.sentDate) return 0;
        if (!a.sentDate) return 1;
        if (!b.sentDate) return -1;
        return a.sentDate.localeCompare(b.sentDate);
      })
      .slice(0, 10);

    // ── Unpaid invoices ───────────────────────────────────────────────────────

    const unpaidInvoices = finances
      .filter((inv) => {
        if (INACTIVE_FINANCE_STATUSES.has(statusText(inv))) return false;
        return inv.final_paid !== true;
      })
      .map((inv) => ({
        id: inv.id,
        orderName:
          stringField(inv, "orderName") ||
          stringField(inv, "order_name") ||
          "Invoice",
        status: statusText(inv) || "unpaid",
        balance: Math.round(calcBalance(inv) * 100) / 100,
      }))
      .slice(0, 10);

    // ── Active orders and due-soon ────────────────────────────────────────────

    const activeOrders = orders.filter(
      (o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)),
    );

    const ordersDueSoon = activeOrders
      .filter((o) => {
        const due =
          orderEstDeliveryDate(o) ||
          stringField(o, "dueDate") ||
          stringField(o, "final_due_date");
        return Boolean(due && due >= todayISO && due <= sevenDaysISO);
      })
      .map((o) => {
        const due =
          orderEstDeliveryDate(o) ||
          stringField(o, "dueDate") ||
          stringField(o, "final_due_date");
        return {
          id: o.id,
          orderName:
            stringField(o, "orderName") ||
            stringField(o, "order_name") ||
            "Order",
          dueDate: due || null,
          status: stringField(o, "status") || "active",
        };
      })
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
      .slice(0, 10);

    // ── Revenue pace ──────────────────────────────────────────────────────────

    const today = parseDashboardDate(todayISO) ?? new Date();
    const totalDaysInMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    ).getDate();
    const dayOfMonth      = today.getDate();
    const daysLeftInMonth = totalDaysInMonth - dayOfMonth;

    const { collected, goal } = monthlyRevenueProgress(finances, todayISO);
    const monthToDate = Math.round(collected * 100) / 100;
    const dailyRate   = dayOfMonth > 0 ? collected / dayOfMonth : 0;
    const projected   = Math.round(dailyRate * totalDaysInMonth * 100) / 100;
    const paceRatio   = goal > 0 ? projected / goal : 1;
    const paceStatus: "ahead" | "on-track" | "behind" =
      paceRatio >= 1.0  ? "ahead" :
      paceRatio >= 0.90 ? "on-track" :
      "behind";

    // ── Recommended actions ───────────────────────────────────────────────────

    const actions: string[] = [];

    if (overdueTasks.length > 0) {
      actions.push(
        `${overdueTasks.length} task${overdueTasks.length > 1 ? "s" : ""} overdue — review and reassign if needed`,
      );
    }
    if (tasksDueToday.length > 0) {
      actions.push(
        `${tasksDueToday.length} task${tasksDueToday.length > 1 ? "s" : ""} due today — confirm completion`,
      );
    }
    if (staleLeads.length > 0) {
      actions.push(
        `${staleLeads.length} lead follow-up${staleLeads.length > 1 ? "s" : ""} past due — open CRM to contact`,
      );
    }

    // Quotes expiring within 7 days get individual action items
    for (const qf of quoteFollowUps) {
      if (qf.daysUntilExpiry !== null && qf.daysUntilExpiry <= 7) {
        const daysLabel =
          qf.daysUntilExpiry < 0
            ? `expired ${Math.abs(qf.daysUntilExpiry)} day${Math.abs(qf.daysUntilExpiry) !== 1 ? "s" : ""} ago`
            : qf.daysUntilExpiry === 0
            ? "expires today"
            : `expires in ${qf.daysUntilExpiry} day${qf.daysUntilExpiry !== 1 ? "s" : ""}`;
        const label = qf.quoteNumber
          ? `Quote ${qf.quoteNumber} for ${qf.company} ${daysLabel} — follow up or extend`
          : `Quote for ${qf.company} ${daysLabel} — follow up or extend`;
        actions.push(label);
      }
    }
    if (quoteFollowUps.length > 0 && !actions.some((a) => a.includes("Quote"))) {
      actions.push(
        `${quoteFollowUps.length} quote${quoteFollowUps.length > 1 ? "s" : ""} awaiting client response`,
      );
    }

    if (outstandingDeposits.length > 0) {
      actions.push(
        `${outstandingDeposits.length} deposit request${outstandingDeposits.length > 1 ? "s" : ""} sent and awaiting payment`,
      );
    }
    if (unpaidInvoices.length > 0) {
      actions.push(
        `${unpaidInvoices.length} invoice${unpaidInvoices.length > 1 ? "s" : ""} unpaid — check payment status`,
      );
    }
    if (ordersDueSoon.length > 0) {
      actions.push(
        `${ordersDueSoon.length} order${ordersDueSoon.length > 1 ? "s" : ""} due within 7 days — confirm delivery timeline`,
      );
    }
    if (paceStatus === "behind") {
      actions.push(
        `Revenue pace is behind — ${fmtCurrency(monthToDate)} collected of ${fmtCurrency(goal)} monthly goal`,
      );
    }

    const allClear =
      overdueTasks.length === 0 &&
      staleLeads.length === 0 &&
      outstandingDeposits.length === 0 &&
      unpaidInvoices.length === 0 &&
      ordersDueSoon.length === 0 &&
      quoteFollowUps.length === 0;

    if (allClear) {
      actions.push("No items need immediate attention — all clear for today.");
    }

    // ── Response ──────────────────────────────────────────────────────────────

    return okResponse({
      date: todayISO,
      allClear,

      pipeline: {
        openLeadCount,
        staleLeadCount: staleLeads.length,
        staleLeads: staleLeads.slice(0, 5).map((l) => ({
          leadId:     l.id,
          company:    stringField(l, "company") || stringField(l, "name") || "Unknown",
          stage:      stringField(l, "stage") || null,
          followUpDate: leadFollowUpDate(l) || null,
        })),
        quoteFollowUpCount: quoteFollowUps.length,
        quoteFollowUps,
      },

      tasks: {
        overdueCount:  overdueTasks.length,
        dueTodayCount: tasksDueToday.length,
        overdue: overdueTasks.slice(0, 5).map((t) => ({
          id:      t.id,
          title:   stringField(t, "title") || "Untitled task",
          dueDate: taskDueDate(t),
          owner:   taskOwner(t) || null,
        })),
        dueToday: tasksDueToday.slice(0, 5).map((t) => ({
          id:    t.id,
          title: stringField(t, "title") || "Untitled task",
          owner: taskOwner(t) || null,
        })),
      },

      orders: {
        activeCount:  activeOrders.length,
        dueSoonCount: ordersDueSoon.length,
        dueSoon:      ordersDueSoon,
      },

      deposits: {
        outstandingCount: outstandingDeposits.length,
        outstanding:      outstandingDeposits,
      },

      invoices: {
        unpaidCount: unpaidInvoices.length,
        unpaid:      unpaidInvoices,
      },

      revenue: {
        monthlyGoal:      goal,
        monthToDate,
        paceStatus,
        projected,
        daysLeftInMonth,
      },

      recommendedActions: actions,
    });

  } catch (err) {
    console.error("[ai/morning-briefing GET]", err);
    return errResponse("Internal server error", 500);
  }
}
