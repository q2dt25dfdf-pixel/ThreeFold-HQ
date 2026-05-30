import { pipelineStages, type PipelineStage } from "@/components/crm/types";
import { FOUNDERS, INACTIVE_FINANCE_STATUSES, INACTIVE_ORDER_STATUSES, TASK_DONE_STATUSES } from "@/lib/constants";
import { addDaysToISODate, dateOnlyToDate } from "@/lib/businessDate";
import { calcBalance, calcDeposit, calcTotal, parseAmount } from "@/lib/invoiceCalc";
import { hasActiveFollowUpTask, hasFollowUpDate, isLeadFollowUpDueWithin, leadFollowUpDate } from "@/lib/followUps";
import { readField, statusText, stringField } from "@/lib/recordUtils";

export type DashboardRecord = Record<string, unknown> & { id: string };

export type RevenueProgressMetric = {
  collected: number;
  previousCollected: number;
  delta: number;
  goal: number;
  percent: number;
  trend: RevenueTrendDatum[];
  paymentDays: number;
};

export type ChartDatum = {
  name: string;
  value: number;
  amount?: number;
};

export type RevenueTrendDatum = {
  date: string;
  label: string;
  collected: number;
};

export type FollowUpLoadDatum = {
  date: string;
  day: string;
  count: number;
};

export type TaskLoadDatum = {
  name: string;
  open: number;
  overdue: number;
};

export type AttentionItem = {
  id: string;
  label: string;
  detail: string;
  href: string;
  tone: "red" | "amber" | "blue" | "slate";
};

const DEFAULT_MONTHLY_REVENUE_GOAL = 15_000;

const LEGACY_CRM_STAGES: Record<string, PipelineStage> = { Approved: "Deposit Paid" };
const ORDER_STATUS_MAP: Record<string, string> = {
  draft: "Production",
  "in production": "Production",
  "quality control": "Quality Check",
  fulfilled: "Delivered",
  "design phase": "Production",
  "client review": "Production",
  "design approved": "Production",
};
const ORDER_STATUS_ORDER = [
  "Design",
  "Approved",
  "Deposit Paid",
  "Production",
  "Quality Check",
  "Ready",
  "Delivered",
  "Completed",
];

function numberField(record: DashboardRecord, key: string): number {
  return parseAmount(record[key]);
}

function isSameMonth(value: string, monthStart: Date): boolean {
  const date = parseDashboardDate(value);
  return Boolean(date && date.getFullYear() === monthStart.getFullYear() && date.getMonth() === monthStart.getMonth());
}

function paymentEventsForMonth(finances: DashboardRecord[], targetMonth: Date) {
  return finances
    .filter((invoice) => !INACTIVE_FINANCE_STATUSES.has(statusText(invoice)))
    .flatMap((invoice) => {
      const total = calcTotal(invoice);
      const deposit = calcDeposit(invoice);
      const balance = calcBalance(invoice);
      const events: { date: string; amount: number }[] = [];
      const depositPaidDate = stringField(invoice, "deposit_paid_date");
      const finalPaidDate = stringField(invoice, "final_paid_date");

      if (invoice.deposit_paid === true && depositPaidDate && isSameMonth(depositPaidDate, targetMonth)) {
        events.push({ date: depositPaidDate, amount: deposit });
      }

      if (invoice.final_paid === true && finalPaidDate && isSameMonth(finalPaidDate, targetMonth)) {
        events.push({ date: finalPaidDate, amount: invoice.deposit_paid === true ? balance : total });
      }

      return events;
    });
}

function revenueTrendForMonth(finances: DashboardRecord[], monthStart: Date, today: Date): { trend: RevenueTrendDatum[]; paymentDays: number } {
  const events = paymentEventsForMonth(finances, monthStart);
  const byDate = new Map<string, number>();
  for (const event of events) {
    byDate.set(event.date, (byDate.get(event.date) ?? 0) + event.amount);
  }

  const finalDay = today.getFullYear() === monthStart.getFullYear() && today.getMonth() === monthStart.getMonth()
    ? today.getDate()
    : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  let runningTotal = 0;
  const trend = Array.from({ length: finalDay }, (_, index) => {
    const day = index + 1;
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12);
    const dateKey = date.toISOString().slice(0, 10);
    runningTotal += byDate.get(dateKey) ?? 0;
    return {
      date: dateKey,
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      collected: runningTotal,
    };
  });

  return { trend, paymentDays: byDate.size };
}

export function parseDashboardDate(rawDate: string): Date | null {
  if (!rawDate || rawDate === "TBD") return null;
  const dateOnly = dateOnlyToDate(rawDate);
  if (dateOnly) return dateOnly;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function monthlyRevenueGoal(): number {
  const configured = Number(process.env.NEXT_PUBLIC_MONTHLY_REVENUE_GOAL);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MONTHLY_REVENUE_GOAL;
}

export function monthlyRevenueProgress(finances: DashboardRecord[], todayISO: string): RevenueProgressMetric {
  const today = parseDashboardDate(todayISO) ?? new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
  const collectedForMonth = (targetMonth: Date) => paymentEventsForMonth(finances, targetMonth)
    .reduce((sum, event) => sum + event.amount, 0);

  const collected = collectedForMonth(monthStart);
  const previousCollected = collectedForMonth(previousMonthStart);
  const goal = monthlyRevenueGoal();
  const percent = goal > 0 ? Math.min(100, Math.round((collected / goal) * 100)) : 0;
  const { trend, paymentDays } = revenueTrendForMonth(finances, monthStart, today);
  return { collected, previousCollected, delta: collected - previousCollected, goal, percent, trend, paymentDays };
}

export function normalizeCRMStage(stage: string): PipelineStage {
  if (LEGACY_CRM_STAGES[stage]) return LEGACY_CRM_STAGES[stage];
  if ((pipelineStages as readonly string[]).includes(stage)) return stage as PipelineStage;
  return "New Lead";
}

export function pipelineOverview(leads: DashboardRecord[]): ChartDatum[] {
  const openLeads = leads.filter((lead) => statusText(lead) !== "won");
  return pipelineStages.map((stage) => {
    const matchingLeads = openLeads.filter((lead) => normalizeCRMStage(stringField(lead, "stage")) === stage);
    return {
      name: stage,
      value: matchingLeads.length,
      amount: matchingLeads.reduce((sum, lead) => sum + numberField(lead, "value"), 0),
    };
  }).filter((stage) => stage.value > 0 || (stage.amount ?? 0) > 0);
}

export function invoiceHealth(finances: DashboardRecord[], todayISO: string): ChartDatum[] {
  const buckets = new Map<string, number>([
    ["Paid", 0],
    ["Overdue", 0],
    ["Deposit Due", 0],
    ["Final Balance Due", 0],
    ["Unpaid", 0],
  ]);

  finances
    .filter((invoice) => !INACTIVE_FINANCE_STATUSES.has(statusText(invoice)))
    .forEach((invoice) => {
      const status = statusText(invoice);
      const dueDate = readField(invoice, "final_due_date", "dueDate");
      const overdue = status === "overdue" || (invoice.final_paid !== true && dueDate && dueDate < todayISO);
      if (invoice.final_paid === true || status === "paid in full") buckets.set("Paid", (buckets.get("Paid") ?? 0) + 1);
      else if (overdue) buckets.set("Overdue", (buckets.get("Overdue") ?? 0) + 1);
      else if (invoice.deposit_paid !== true && calcDeposit(invoice) > 0) buckets.set("Deposit Due", (buckets.get("Deposit Due") ?? 0) + 1);
      else if (invoice.deposit_paid === true && invoice.final_paid !== true && calcBalance(invoice) > 0) buckets.set("Final Balance Due", (buckets.get("Final Balance Due") ?? 0) + 1);
      else buckets.set("Unpaid", (buckets.get("Unpaid") ?? 0) + 1);
    });

  return Array.from(buckets, ([name, value]) => ({ name, value })).filter((item) => item.value > 0);
}

export function normalizeOrderStatus(order: DashboardRecord): string {
  const raw = stringField(order, "status", "Production").trim();
  return ORDER_STATUS_MAP[raw.toLowerCase()] ?? raw;
}

export function ordersByStatus(orders: DashboardRecord[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const status = normalizeOrderStatus(order);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts, ([name, value]) => ({ name, value }))
    .sort((a, b) => {
      const indexA = ORDER_STATUS_ORDER.indexOf(a.name);
      const indexB = ORDER_STATUS_ORDER.indexOf(b.name);
      if (indexA !== -1 || indexB !== -1) {
        return (indexA === -1 ? ORDER_STATUS_ORDER.length : indexA) - (indexB === -1 ? ORDER_STATUS_ORDER.length : indexB);
      }
      return b.value - a.value || a.name.localeCompare(b.name);
    });
}

export function followUpLoad(leads: DashboardRecord[], tasks: DashboardRecord[], todayISO: string): FollowUpLoadDatum[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToISODate(todayISO, index);
    const parsed = parseDashboardDate(date);
    return {
      date,
      day: parsed ? parsed.toLocaleDateString("en-US", { weekday: "short" }) : date,
      count: leads.filter((lead) => leadFollowUpDate(lead) === date && isLeadFollowUpDueWithin(lead, tasks, date)).length,
    };
  });
}

function isTaskDone(task: DashboardRecord): boolean {
  return task.completed === true || TASK_DONE_STATUSES.has(statusText(task));
}

function taskOwner(task: DashboardRecord): string {
  return stringField(task, "owner").trim() || stringField(task, "assignedTo").trim();
}

export function taskLoadByFounder(tasks: DashboardRecord[], todayISO: string): TaskLoadDatum[] {
  const openTasks = tasks.filter((task) => !isTaskDone(task));
  return FOUNDERS.map((name) => {
    const owned = openTasks.filter((task) => taskOwner(task).toLowerCase().includes(name.toLowerCase()));
    return {
      name,
      open: owned.length,
      overdue: owned.filter((task) => {
        const due = readField(task, "dueDate", "due_date");
        return Boolean(due && due !== "TBD" && due < todayISO);
      }).length,
    };
  });
}

export function needsAttention(
  orders: DashboardRecord[],
  finances: DashboardRecord[],
  tasks: DashboardRecord[],
  leads: DashboardRecord[],
  todayISO: string,
  sevenDaysAheadISO: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const invoice of finances) {
    if (INACTIVE_FINANCE_STATUSES.has(statusText(invoice)) || invoice.final_paid === true) continue;
    const label = stringField(invoice, "order_name") || stringField(invoice, "orderName") || stringField(invoice, "client_name") || stringField(invoice, "client", "Invoice");
    const finalDue = readField(invoice, "final_due_date", "dueDate");
    if (statusText(invoice) === "overdue" || (finalDue && finalDue < todayISO)) {
      items.push({ id: `invoice-overdue-${invoice.id}`, label, detail: "Final invoice overdue", href: `/finances?invoice=${invoice.id}`, tone: "red" });
    } else if (invoice.deposit_paid !== true) {
      items.push({ id: `deposit-due-${invoice.id}`, label, detail: `Deposit due ${calcDeposit(invoice) > 0 ? "" : ""}`.trim() || "Deposit due", href: `/finances?invoice=${invoice.id}`, tone: "amber" });
    }
  }

  for (const lead of leads) {
    const followUpDate = leadFollowUpDate(lead);
    if (followUpDate === todayISO && isLeadFollowUpDueWithin(lead, tasks, todayISO)) {
      items.push({
        id: `followup-${lead.id}`,
        label: stringField(lead, "company", stringField(lead, "name", "Lead")),
        detail: "Follow-up due today",
        href: "/crm?view=followups",
        tone: "blue",
      });
    }
  }

  for (const order of orders) {
    if (INACTIVE_ORDER_STATUSES.has(statusText(order))) continue;
    const status = statusText(order);
    const dueDate = stringField(order, "dueDate") || stringField(order, "estimatedDeliveryDate") || stringField(order, "final_due_date");
    const orderName = stringField(order, "orderName", stringField(order, "order_name", "Order"));
    if (status.includes("review") || status.includes("approval")) {
      items.push({ id: `approval-${order.id}`, label: orderName, detail: "Client approval pending", href: `/orders/${order.id}`, tone: "amber" });
    } else if (dueDate && dueDate >= todayISO && dueDate <= sevenDaysAheadISO) {
      items.push({ id: `order-due-${order.id}`, label: orderName, detail: `Deadline ${formatShortDate(parseDashboardDate(dueDate) ?? new Date())}`, href: `/orders/${order.id}`, tone: "blue" });
    }
  }

  for (const task of tasks) {
    const dueDate = readField(task, "dueDate", "due_date");
    if (!isTaskDone(task) && dueDate && dueDate !== "TBD" && dueDate < todayISO) {
      items.push({
        id: `task-overdue-${task.id}`,
        label: stringField(task, "title", "Task"),
        detail: "Task overdue",
        href: "/tasks",
        tone: "red",
      });
    }
  }

  const toneOrder = { red: 0, amber: 1, blue: 2, slate: 3 };
  return items.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]).slice(0, 8);
}

// ── Attention summary (counts only) ──────────────────────────────────────────

export type AttentionSummary = {
  overdueTasks: number;
  unpaidInvoices: number;
  staleLeads: number;
  ordersDueSoon: number;
};

export function attentionSummary(
  orders: DashboardRecord[],
  finances: DashboardRecord[],
  tasks: DashboardRecord[],
  leads: DashboardRecord[],
  todayISO: string,
  sevenDaysAheadISO: string,
): AttentionSummary {
  const overdueTasks = tasks.filter((task) => {
    if (isTaskDone(task)) return false;
    const due = readField(task, "dueDate", "due_date");
    return Boolean(due && due !== "TBD" && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < todayISO);
  }).length;

  const unpaidInvoices = finances.filter((invoice) => {
    if (INACTIVE_FINANCE_STATUSES.has(statusText(invoice))) return false;
    return invoice.final_paid !== true;
  }).length;

  // Stale: open lead with a follow-up date that has passed and still has an active follow-up task
  const staleLeads = leads.filter((lead) => {
    if (normalizeCRMStage(stringField(lead, "stage")) === "Deposit Paid") return false;
    const followUp = readField(lead, "followUpDate", "follow_up_date");
    return hasFollowUpDate(followUp) && followUp < todayISO && hasActiveFollowUpTask(lead, tasks);
  }).length;

  const ordersDueSoon = orders.filter((order) => {
    if (INACTIVE_ORDER_STATUSES.has(statusText(order))) return false;
    const dueDate =
      stringField(order, "estimatedDeliveryDate") ||
      stringField(order, "dueDate") ||
      stringField(order, "final_due_date");
    return Boolean(dueDate && dueDate >= todayISO && dueDate <= sevenDaysAheadISO);
  }).length;

  return { overdueTasks, unpaidInvoices, staleLeads, ordersDueSoon };
}
