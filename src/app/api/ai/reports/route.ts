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
import { hasActiveFollowUpTask, hasFollowUpDate } from "@/lib/followUps";
import { normalizeCRMStage } from "@/lib/dashboardMetrics";
import { parseAmount, calcDeposit, calcBalance, calcTotal } from "@/lib/invoiceCalc";
import { calcDepositTax } from "@/lib/salesTax";
import type { DashboardRecord } from "@/lib/dashboardMetrics";

export const dynamic = "force-dynamic";

type Row = DashboardRecord;
type TableRow = { id: string; data: DashboardRecord | null };

// ── Safe AI-facing types (no hrefs, no PII) ───────────────────────────────────

type AIReportItem = { id: string; name: string; detail?: string };

type AIBriefingSection = {
  key: string;
  label: string;
  count: number;
  tone: "red" | "amber" | "blue";
  items: AIReportItem[];
};

type AIAuditSection = {
  key: string;
  label: string;
  count: number;
  items: AIReportItem[];
};

type DayPayment = { id: string; name: string; amount: number; type: "deposit" | "final" };
type DayTask    = { id: string; name: string; assignedTo: string };
type DayContact = { leadId: string; leadName: string; contactType: string };
type DayExpense = { id: string; name: string; amount: number };

// ── Table fetcher ─────────────────────────────────────────────────────────────

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
    throw new Error(`[ai/reports] read ${table}: ${error.message}`);
  }
  return ((rows ?? []) as TableRow[])
    .map((r) => r.data ?? { id: r.id })
    .filter((item): item is Row => Boolean(item?.id));
}

// ── Sales-tax helper ──────────────────────────────────────────────────────────

function calcTaxDue(invoices: Row[], taxPayments: Row[], currentYear: string): number {
  const collected = invoices.reduce((sum, inv) => {
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

  const paid = taxPayments
    .filter((p) => String(p.payment_date ?? p.date ?? "").startsWith(currentYear))
    .reduce((sum, p) => {
      const cents = p.amount_cents;
      return sum + (typeof cents === "number" ? cents / 100 : parseAmount(p.amount ?? 0));
    }, 0);

  return Math.round(Math.max(collected - paid, 0) * 100) / 100;
}

// ── Morning Briefing computation ──────────────────────────────────────────────

function computeBriefing(
  tasks: Row[],
  invoices: Row[],
  orders: Row[],
  leads: Row[],
  taxPayments: Row[],
  todayISO: string,
  sevenDaysAheadISO: string,
  currentYear: string,
) {
  const overdueTasks = tasks.filter((task) => {
    if (task.completed === true || TASK_DONE_STATUSES.has(statusText(task))) return false;
    const due = readField(task, "dueDate", "due_date");
    return Boolean(due && due !== "TBD" && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < todayISO);
  });

  const unpaidInvoices = invoices.filter((inv) => {
    if (INACTIVE_FINANCE_STATUSES.has(statusText(inv))) return false;
    return inv.final_paid !== true;
  });

  const ordersDueSoon = orders.filter((order) => {
    if (INACTIVE_ORDER_STATUSES.has(statusText(order))) return false;
    const dueDate =
      stringField(order, "estimatedDeliveryDate") ||
      stringField(order, "dueDate") ||
      stringField(order, "final_due_date");
    return Boolean(dueDate && dueDate >= todayISO && dueDate <= sevenDaysAheadISO);
  });

  const staleLeads = leads.filter((lead) => {
    if (normalizeCRMStage(stringField(lead, "stage")) === "Deposit Paid") return false;
    const followUp = readField(lead, "followUpDate", "follow_up_date");
    return hasFollowUpDate(followUp) && followUp < todayISO && hasActiveFollowUpTask(lead, tasks);
  });

  const taxDue = calcTaxDue(invoices, taxPayments, currentYear);
  const sections: AIBriefingSection[] = [];

  if (overdueTasks.length > 0) {
    sections.push({
      key: "tasks",
      label: "Overdue Tasks",
      count: overdueTasks.length,
      tone: "red",
      items: overdueTasks.slice(0, 5).map((task) => ({
        id: task.id,
        name: stringField(task, "title") || "Untitled task",
        detail: `Due ${readField(task, "dueDate", "due_date")}`,
      })),
    });
  }

  if (unpaidInvoices.length > 0) {
    sections.push({
      key: "invoices",
      label: "Unpaid Invoices",
      count: unpaidInvoices.length,
      tone: "amber",
      items: unpaidInvoices.slice(0, 5).map((inv) => {
        const st = statusText(inv);
        const detail =
          st === "overdue" ? "Overdue" :
          st.includes("deposit") ? "Deposit pending" :
          "Balance due";
        return {
          id: inv.id,
          name:
            stringField(inv, "orderName") ||
            stringField(inv, "order_name") ||
            "Invoice",
          detail,
        };
      }),
    });
  }

  if (ordersDueSoon.length > 0) {
    sections.push({
      key: "orders",
      label: "Orders Due Soon",
      count: ordersDueSoon.length,
      tone: "blue",
      items: ordersDueSoon.slice(0, 5).map((order) => {
        const dueDate =
          stringField(order, "estimatedDeliveryDate") ||
          stringField(order, "dueDate") ||
          stringField(order, "final_due_date");
        return {
          id: order.id,
          name: stringField(order, "orderName") || "Order",
          detail: dueDate ? `Due ${dueDate}` : undefined,
        };
      }),
    });
  }

  if (staleLeads.length > 0) {
    sections.push({
      key: "leads",
      label: "Stale Leads",
      count: staleLeads.length,
      tone: "amber",
      items: staleLeads.slice(0, 5).map((lead) => ({
        id: lead.id,
        name: stringField(lead, "company") || stringField(lead, "name") || "Lead",
        detail: "Follow-up overdue",
      })),
    });
  }

  const totalItems = sections.reduce((sum, s) => sum + s.count, 0) + (taxDue > 0 ? 1 : 0);

  return {
    allClear: sections.length === 0 && taxDue === 0,
    totalItems,
    taxDue,
    sections,
  };
}

// ── HQ Auditor computation ────────────────────────────────────────────────────

function computeAudit(
  tasks: Row[],
  invoices: Row[],
  orders: Row[],
  leads: Row[],
  taxPayments: Row[],
  todayISO: string,
  currentYear: string,
) {
  const critical: AIAuditSection[] = [];
  const warnings: AIAuditSection[] = [];

  const orderIdSet   = new Set(orders.map((o) => o.id));
  const activeOrders = orders.filter((o) => !INACTIVE_ORDER_STATUSES.has(statusText(o)));
  const liveInvoices = invoices.filter((inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)));

  const ordersNoClient = activeOrders.filter(
    (o) => !stringField(o, "client") && !stringField(o, "client_id"),
  );
  if (ordersNoClient.length > 0) {
    critical.push({
      key: "orders-no-client",
      label: "Orders Missing Client",
      count: ordersNoClient.length,
      items: ordersNoClient.slice(0, 5).map((o) => ({
        id: o.id,
        name: stringField(o, "orderName") || `Order ${o.id.slice(0, 8)}`,
        detail: "No client assigned",
      })),
    });
  }

  const ordersNoDueDate = activeOrders.filter((o) => {
    const date = stringField(o, "estimatedDeliveryDate") || stringField(o, "dueDate");
    return !date || date === "TBD";
  });
  if (ordersNoDueDate.length > 0) {
    critical.push({
      key: "orders-no-date",
      label: "Orders Missing Due Date",
      count: ordersNoDueDate.length,
      items: ordersNoDueDate.slice(0, 5).map((o) => ({
        id: o.id,
        name: stringField(o, "orderName") || `Order ${o.id.slice(0, 8)}`,
        detail: "No delivery date set",
      })),
    });
  }

  const ordersNoVendor = activeOrders.filter(
    (o) => !stringField(o, "vendor") && !stringField(o, "vendor_id"),
  );
  if (ordersNoVendor.length > 0) {
    critical.push({
      key: "orders-no-vendor",
      label: "Orders Missing Vendor",
      count: ordersNoVendor.length,
      items: ordersNoVendor.slice(0, 5).map((o) => ({
        id: o.id,
        name: stringField(o, "orderName") || `Order ${o.id.slice(0, 8)}`,
        detail: "No vendor assigned",
      })),
    });
  }

  const invoicesNoAmount = liveInvoices.filter(
    (inv) => parseAmount(inv.total_amount) <= 0 && parseAmount(inv.amount) <= 0,
  );
  if (invoicesNoAmount.length > 0) {
    critical.push({
      key: "invoices-no-amount",
      label: "Invoices With No Amount",
      count: invoicesNoAmount.length,
      items: invoicesNoAmount.slice(0, 5).map((inv) => ({
        id: inv.id,
        name:
          stringField(inv, "orderName") ||
          stringField(inv, "order_name") ||
          "Invoice",
        detail: "$0.00 total",
      })),
    });
  }

  const invoicesNoClient = liveInvoices.filter(
    (inv) =>
      !stringField(inv, "client") &&
      !stringField(inv, "client_id") &&
      !stringField(inv, "client_name") &&
      !stringField(inv, "client_company"),
  );
  if (invoicesNoClient.length > 0) {
    critical.push({
      key: "invoices-no-client",
      label: "Invoices Missing Client",
      count: invoicesNoClient.length,
      items: invoicesNoClient.slice(0, 5).map((inv) => ({
        id: inv.id,
        name:
          stringField(inv, "orderName") ||
          stringField(inv, "order_name") ||
          "Unnamed invoice",
        detail: "No client assigned",
      })),
    });
  }

  const orphanedInvoices = liveInvoices.filter((inv) => {
    const orderId = stringField(inv, "order_id");
    return orderId !== "" && !orderIdSet.has(orderId);
  });
  if (orphanedInvoices.length > 0) {
    critical.push({
      key: "invoices-orphan",
      label: "Invoices With Missing Order Reference",
      count: orphanedInvoices.length,
      items: orphanedInvoices.slice(0, 5).map((inv) => ({
        id: inv.id,
        name:
          stringField(inv, "orderName") ||
          stringField(inv, "order_name") ||
          "Invoice",
        detail: "Linked order not found",
      })),
    });
  }

  const tasksNoTitle = tasks.filter((task) => {
    if (task.completed === true || TASK_DONE_STATUSES.has(statusText(task))) return false;
    return !stringField(task, "title").trim();
  });
  if (tasksNoTitle.length > 0) {
    critical.push({
      key: "tasks-no-title",
      label: "Tasks Missing Title",
      count: tasksNoTitle.length,
      items: tasksNoTitle.slice(0, 5).map((task) => ({
        id: task.id,
        name: "Untitled task",
        detail: `ID: ${task.id.slice(0, 8)}`,
      })),
    });
  }

  const overdueTasks = tasks.filter((task) => {
    if (task.completed === true || TASK_DONE_STATUSES.has(statusText(task))) return false;
    const due = readField(task, "dueDate", "due_date");
    return Boolean(due && due !== "TBD" && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < todayISO);
  });
  if (overdueTasks.length > 0) {
    warnings.push({
      key: "warn-tasks",
      label: "Overdue Tasks",
      count: overdueTasks.length,
      items: overdueTasks.slice(0, 5).map((task) => ({
        id: task.id,
        name: stringField(task, "title") || "Untitled task",
        detail: `Due ${readField(task, "dueDate", "due_date")}`,
      })),
    });
  }

  const unpaidInvoices = invoices.filter((inv) => {
    if (INACTIVE_FINANCE_STATUSES.has(statusText(inv))) return false;
    return inv.final_paid !== true;
  });
  if (unpaidInvoices.length > 0) {
    warnings.push({
      key: "warn-invoices",
      label: "Unpaid Invoices",
      count: unpaidInvoices.length,
      items: unpaidInvoices.slice(0, 5).map((inv) => {
        const st = statusText(inv);
        const detail =
          st === "overdue" ? "Overdue" :
          st.includes("deposit") ? "Deposit pending" :
          "Balance due";
        return {
          id: inv.id,
          name:
            stringField(inv, "orderName") ||
            stringField(inv, "order_name") ||
            "Invoice",
          detail,
        };
      }),
    });
  }

  const staleLeads = leads.filter((lead) => {
    if (normalizeCRMStage(stringField(lead, "stage")) === "Deposit Paid") return false;
    const followUp = readField(lead, "followUpDate", "follow_up_date");
    return hasFollowUpDate(followUp) && followUp < todayISO && hasActiveFollowUpTask(lead, tasks);
  });
  if (staleLeads.length > 0) {
    warnings.push({
      key: "warn-leads",
      label: "Stale Leads",
      count: staleLeads.length,
      items: staleLeads.slice(0, 5).map((lead) => ({
        id: lead.id,
        name: stringField(lead, "company") || stringField(lead, "name") || "Lead",
        detail: "Follow-up overdue",
      })),
    });
  }

  const taxDue = calcTaxDue(invoices, taxPayments, currentYear);
  const totalCritical = critical.reduce((sum, s) => sum + s.count, 0);
  const totalWarnings = warnings.reduce((sum, s) => sum + s.count, 0) + (taxDue > 0 ? 1 : 0);

  return {
    systemHealthy: critical.length === 0 && warnings.length === 0 && taxDue === 0,
    totalCritical,
    totalWarnings,
    taxDue,
    critical,
    warnings,
  };
}

// ── End-of-Day computation ────────────────────────────────────────────────────

function computeEndOfDay(
  tasks: Row[],
  invoices: Row[],
  leads: Row[],
  expenses: Row[],
  todayISO: string,
) {
  const completedTasks: DayTask[] = tasks
    .filter((task) => {
      const raw = stringField(task, "completedAt") || stringField(task, "completed_at");
      if (!raw) return false;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && dateToBusinessISO(d) === todayISO;
    })
    .map((task) => ({
      id: task.id,
      name: stringField(task, "title") || "Untitled task",
      assignedTo: stringField(task, "assignedTo") || stringField(task, "owner") || "",
    }));

  const payments: DayPayment[] = invoices
    .filter((inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)))
    .flatMap((inv) => {
      const events: DayPayment[] = [];
      const depositDate = stringField(inv, "deposit_paid_date");
      const finalDate   = stringField(inv, "final_paid_date");
      const name =
        stringField(inv, "orderName") ||
        stringField(inv, "order_name") ||
        "Invoice";

      if (inv.deposit_paid === true && depositDate === todayISO) {
        events.push({ id: `${inv.id}-dep`, name, amount: calcDeposit(inv), type: "deposit" });
      }
      if (inv.final_paid === true && finalDate === todayISO) {
        const amount = inv.deposit_paid === true ? calcBalance(inv) : calcTotal(inv);
        events.push({ id: `${inv.id}-fin`, name, amount, type: "final" });
      }
      return events;
    });

  const revenueToday = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;

  // Safe: only contactType (call/email type) and company name, never summary content
  const contactsLogged: DayContact[] = [];
  for (const lead of leads) {
    const rawHistory = lead.communicationHistory;
    if (!Array.isArray(rawHistory)) continue;
    for (const entry of rawHistory) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      if (stringField(e, "date") === todayISO) {
        contactsLogged.push({
          leadId: lead.id,
          leadName: stringField(lead, "company") || stringField(lead, "name") || "Lead",
          contactType: stringField(e, "type") || "Contact",
        });
      }
    }
  }

  const expensesToday: DayExpense[] = expenses
    .filter((exp) => stringField(exp, "expense_date") === todayISO)
    .map((exp) => {
      const cents = exp.amount_cents;
      return {
        id: exp.id,
        name: stringField(exp, "vendor_name") || stringField(exp, "category") || "Expense",
        amount: typeof cents === "number" ? cents / 100 : parseAmount(exp.amount ?? 0),
      };
    });

  const expenseTotalToday = Math.round(
    expensesToday.reduce((sum, e) => sum + e.amount, 0) * 100,
  ) / 100;

  return {
    hasActivity:
      payments.length > 0 ||
      completedTasks.length > 0 ||
      contactsLogged.length > 0 ||
      expensesToday.length > 0,
    revenueToday,
    expenseTotalToday,
    payments,
    completedTasks,
    contactsLogged,
    expensesToday,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/ai/reports
 *
 * Returns safe operational report sections for AI consumption.
 * Excludes all PII: email, phone, address, notes, contact names,
 * communication summary content, Stripe/payment links.
 * Safe fields only: order names, task titles, business (company) names,
 * dates, statuses, amounts, contact type labels.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  try {
    const db = getSupabaseAdmin();
    const [tasks, invoices, orders, leads, taxPayments, expenses] = await Promise.all([
      fetchTable(db, "tasks"),
      fetchTable(db, "finances"),
      fetchTable(db, "orders"),
      fetchTable(db, "crm_leads"),
      fetchTable(db, "sales_tax_payments"),
      fetchTable(db, "expenses"),
    ]);

    const todayISO          = businessTodayISO();
    const sevenDaysAheadISO = addDaysToISODate(todayISO, 7);
    const currentYear       = todayISO.slice(0, 4);

    const morningBriefing = computeBriefing(
      tasks, invoices, orders, leads, taxPayments,
      todayISO, sevenDaysAheadISO, currentYear,
    );

    const hqAuditor = computeAudit(
      tasks, invoices, orders, leads, taxPayments,
      todayISO, currentYear,
    );

    const endOfDayReport = computeEndOfDay(tasks, invoices, leads, expenses, todayISO);

    return okResponse({
      date: todayISO,
      morningBriefing,
      hqAuditor,
      endOfDayReport,
    });
  } catch (err) {
    console.error("[ai/reports]", err);
    return errResponse("Internal server error", 500);
  }
}
