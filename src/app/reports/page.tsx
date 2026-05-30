"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sun, Moon, ShieldCheck, CheckCircle2,
  ChevronDown, ChevronUp, ArrowRight, Loader2,
} from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { businessTodayISO, businessTodayLabel, dateToBusinessISO, addDaysToISODate } from "@/lib/businessDate";
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

// ── Shared types ──────────────────────────────────────────────────────────────

type Row = Record<string, unknown> & { id: string };

type ReportItem = {
  id: string;
  name: string;
  detail?: string;
  href: string;
};

// ── Briefing types ────────────────────────────────────────────────────────────

type BriefingSection = {
  key: string;
  label: string;
  count: number;
  items: ReportItem[];
  allHref: string;
  tone: "red" | "amber" | "blue";
};

type Briefing = {
  sections: BriefingSection[];
  taxDue: number;
  totalCount: number;
};

// ── Auditor types ─────────────────────────────────────────────────────────────

type AuditSection = {
  key: string;
  label: string;
  count: number;
  items: ReportItem[];
  allHref: string;
};

type AuditReport = {
  critical: AuditSection[];
  warnings: AuditSection[];
  taxDue: number;
  totalCritical: number;
  totalWarnings: number;
};

// ── End-of-Day types ──────────────────────────────────────────────────────────

type DayPayment = {
  id: string;
  name: string;
  amount: number;
  type: "deposit" | "final";
};

type DayTask = {
  id: string;
  name: string;
  assignedTo: string;
};

type DayContact = {
  leadId: string;
  leadName: string;
  contactType: string;
};

type DayExpense = {
  id: string;
  name: string;
  amount: number;
};

type EndOfDayReport = {
  revenueToday: number;
  payments: DayPayment[];
  completedTasks: DayTask[];
  contactsLogged: DayContact[];
  expensesToday: DayExpense[];
  expenseTotalToday: number;
  hasActivity: boolean;
};

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
): Briefing {
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
  const sections: BriefingSection[] = [];

  if (overdueTasks.length > 0) {
    sections.push({
      key: "tasks",
      label: "Overdue Tasks",
      count: overdueTasks.length,
      items: overdueTasks.slice(0, 5).map((task) => ({
        id: task.id,
        name: stringField(task, "title", "Untitled task"),
        detail: `Due ${readField(task, "dueDate", "due_date")}`,
        href: "/tasks",
      })),
      allHref: "/tasks",
      tone: "red",
    });
  }

  if (unpaidInvoices.length > 0) {
    sections.push({
      key: "invoices",
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
            stringField(inv, "client", "Invoice"),
          detail,
          href: `/finances?tab=invoices&invoice=${inv.id}`,
        };
      }),
      allHref: "/finances?tab=invoices",
      tone: "amber",
    });
  }

  if (ordersDueSoon.length > 0) {
    sections.push({
      key: "orders",
      label: "Orders Due Soon",
      count: ordersDueSoon.length,
      items: ordersDueSoon.slice(0, 5).map((order) => {
        const dueDate =
          stringField(order, "estimatedDeliveryDate") ||
          stringField(order, "dueDate") ||
          stringField(order, "final_due_date");
        return {
          id: order.id,
          name: stringField(order, "orderName", "Order"),
          detail: dueDate ? `Due ${dueDate}` : undefined,
          href: `/orders/${order.id}`,
        };
      }),
      allHref: "/orders",
      tone: "blue",
    });
  }

  if (staleLeads.length > 0) {
    sections.push({
      key: "leads",
      label: "Stale Leads",
      count: staleLeads.length,
      items: staleLeads.slice(0, 5).map((lead) => ({
        id: lead.id,
        name: stringField(lead, "company", stringField(lead, "name", "Lead")),
        detail: "Follow-up overdue",
        href: "/crm?view=followups",
      })),
      allHref: "/crm?view=followups",
      tone: "amber",
    });
  }

  const totalCount = sections.reduce((sum, s) => sum + s.count, 0) + (taxDue > 0 ? 1 : 0);
  return { sections, taxDue, totalCount };
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
): AuditReport {
  const critical: AuditSection[] = [];
  const warnings: AuditSection[] = [];

  const orderIdSet = new Set(orders.map((o) => o.id));
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
        name: stringField(o, "orderName", `Order ${o.id.slice(0, 8)}`),
        detail: "No client assigned",
        href: `/orders/${o.id}`,
      })),
      allHref: "/orders",
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
        name: stringField(o, "orderName", `Order ${o.id.slice(0, 8)}`),
        detail: "No delivery date set",
        href: `/orders/${o.id}`,
      })),
      allHref: "/orders",
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
        name: stringField(o, "orderName", `Order ${o.id.slice(0, 8)}`),
        detail: "No vendor assigned",
        href: `/orders/${o.id}`,
      })),
      allHref: "/orders",
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
          stringField(inv, "client", "Invoice"),
        detail: "$0.00 total",
        href: `/finances?tab=invoices&invoice=${inv.id}`,
      })),
      allHref: "/finances?tab=invoices",
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
        href: `/finances?tab=invoices&invoice=${inv.id}`,
      })),
      allHref: "/finances?tab=invoices",
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
          stringField(inv, "client", "Invoice"),
        detail: "Linked order not found",
        href: `/finances?tab=invoices&invoice=${inv.id}`,
      })),
      allHref: "/finances?tab=invoices",
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
        href: "/tasks",
      })),
      allHref: "/tasks",
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
        name: stringField(task, "title", "Untitled task"),
        detail: `Due ${readField(task, "dueDate", "due_date")}`,
        href: "/tasks",
      })),
      allHref: "/tasks",
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
            stringField(inv, "client", "Invoice"),
          detail,
          href: `/finances?tab=invoices&invoice=${inv.id}`,
        };
      }),
      allHref: "/finances?tab=invoices",
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
        name: stringField(lead, "company", stringField(lead, "name", "Lead")),
        detail: "Follow-up overdue",
        href: "/crm?view=followups",
      })),
      allHref: "/crm?view=followups",
    });
  }

  const taxDue = calcTaxDue(invoices, taxPayments, currentYear);
  const totalCritical = critical.reduce((sum, s) => sum + s.count, 0);
  const totalWarnings = warnings.reduce((sum, s) => sum + s.count, 0) + (taxDue > 0 ? 1 : 0);

  return { critical, warnings, taxDue, totalCritical, totalWarnings };
}

// ── End-of-Day computation ────────────────────────────────────────────────────

function computeEndOfDay(
  tasks: Row[],
  invoices: Row[],
  leads: Row[],
  expenses: Row[],
  todayISO: string,
): EndOfDayReport {
  // Tasks completed today — completedAt is a full ISO timestamp; convert to business date
  const completedTasks: DayTask[] = tasks
    .filter((task) => {
      const raw = stringField(task, "completedAt") || stringField(task, "completed_at");
      if (!raw) return false;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && dateToBusinessISO(d) === todayISO;
    })
    .map((task) => ({
      id: task.id,
      name: stringField(task, "title", "Untitled task"),
      assignedTo: stringField(task, "assignedTo") || stringField(task, "owner", ""),
    }));

  // Invoice payments received today (deposit_paid_date / final_paid_date are ISO date strings)
  const payments: DayPayment[] = invoices
    .filter((inv) => !INACTIVE_FINANCE_STATUSES.has(statusText(inv)))
    .flatMap((inv) => {
      const events: DayPayment[] = [];
      const depositDate = stringField(inv, "deposit_paid_date");
      const finalDate   = stringField(inv, "final_paid_date");
      const name =
        stringField(inv, "orderName") ||
        stringField(inv, "order_name") ||
        stringField(inv, "client", "Invoice");

      if (inv.deposit_paid === true && depositDate === todayISO) {
        events.push({ id: `${inv.id}-dep`, name, amount: calcDeposit(inv), type: "deposit" });
      }
      if (inv.final_paid === true && finalDate === todayISO) {
        const amount = inv.deposit_paid === true ? calcBalance(inv) : calcTotal(inv);
        events.push({ id: `${inv.id}-fin`, name, amount, type: "final" });
      }
      return events;
    });

  const revenueToday = payments.reduce((sum, p) => sum + p.amount, 0);

  // CRM contacts logged today — each entry in communicationHistory has a date field
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
          leadName: stringField(lead, "company", stringField(lead, "name", "Lead")),
          contactType: stringField(e, "type", "Contact"),
        });
      }
    }
  }

  // Expenses recorded today — expense_date is an ISO date string
  const expensesToday: DayExpense[] = expenses
    .filter((exp) => stringField(exp, "expense_date") === todayISO)
    .map((exp) => {
      const cents = exp.amount_cents;
      return {
        id: exp.id,
        name: stringField(exp, "vendor_name") || stringField(exp, "category", "Expense"),
        amount: typeof cents === "number" ? cents / 100 : parseAmount(exp.amount ?? 0),
      };
    });

  const expenseTotalToday = expensesToday.reduce((sum, e) => sum + e.amount, 0);

  return {
    revenueToday,
    payments,
    completedTasks,
    contactsLogged,
    expensesToday,
    expenseTotalToday,
    hasActivity:
      payments.length > 0 ||
      completedTasks.length > 0 ||
      contactsLogged.length > 0 ||
      expensesToday.length > 0,
  };
}

// ── Shared sales-tax helper ───────────────────────────────────────────────────

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

  return Math.max(collected - paid, 0);
}

// ── Shared UI components ──────────────────────────────────────────────────────

const toneStyles = {
  red: {
    badge:      "bg-rose-100 text-rose-700",
    heading:    "text-rose-700",
    dot:        "bg-rose-400",
    itemBorder: "border-rose-100 bg-rose-50 hover:bg-rose-100",
  },
  amber: {
    badge:      "bg-amber-100 text-amber-700",
    heading:    "text-amber-700",
    dot:        "bg-amber-400",
    itemBorder: "border-amber-100 bg-amber-50 hover:bg-amber-100",
  },
  blue: {
    badge:      "bg-blue-100 text-blue-700",
    heading:    "text-blue-700",
    dot:        "bg-blue-400",
    itemBorder: "border-blue-100 bg-blue-50 hover:bg-blue-100",
  },
  slate: {
    badge:      "bg-slate-100 text-slate-600",
    heading:    "text-slate-700",
    dot:        "bg-slate-400",
    itemBorder: "border-slate-100 bg-slate-50 hover:bg-slate-100",
  },
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function SectionCard({
  label,
  count,
  items,
  allHref,
  toneKey,
}: {
  label: string;
  count: number;
  items: ReportItem[];
  allHref: string;
  toneKey: keyof typeof toneStyles;
}) {
  const styles = toneStyles[toneKey];
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${styles.heading}`}>{label}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles.badge}`}>{count}</span>
        </div>
        <Link href={allHref} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900">
          See all <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs transition ${styles.itemBorder}`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
                <span className="truncate font-medium text-slate-900">{item.name}</span>
              </div>
              {item.detail && <span className="shrink-0 text-slate-500">{item.detail}</span>}
            </Link>
          </li>
        ))}
        {count > 5 && (
          <li>
            <Link href={allHref} className="block px-4 py-2 text-xs text-slate-500 hover:text-slate-900">
              +{count - 5} more
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}

function TaxDueCard({ taxDue }: { taxDue: number }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-rose-700">Sales Tax Owed</span>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">YTD</span>
        </div>
        <Link href="/finances?tab=sales-tax" className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900">
          See all <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <Link
        href="/finances?tab=sales-tax"
        className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs transition hover:bg-rose-100"
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" aria-hidden="true" />
          <span className="font-medium text-slate-900">Tax collected, not yet remitted</span>
        </div>
        <span className="shrink-0 font-semibold text-rose-700">{currency.format(taxDue)}</span>
      </Link>
    </div>
  );
}

function StatTile({
  label,
  value,
  href,
  accent = false,
}: {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 rounded-[2rem] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:p-5 ${
        accent ? "border-emerald-200" : "border-slate-200"
      }`}
    >
      <p className={`text-2xl font-bold tracking-tight md:text-3xl ${accent ? "text-emerald-700" : "text-slate-950"}`}>
        {value}
      </p>
      <p className="text-xs text-slate-500 md:text-sm">{label}</p>
    </Link>
  );
}

// ── Morning Briefing panel ────────────────────────────────────────────────────

function BriefingPanel({ briefing, loading }: { briefing: Briefing; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-[2rem] border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
        Loading briefing…
      </div>
    );
  }

  if (briefing.sections.length === 0 && briefing.taxDue === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-emerald-800">Everything is on track today.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {briefing.sections.map((section) => (
        <SectionCard
          key={section.key}
          label={section.label}
          count={section.count}
          items={section.items}
          allHref={section.allHref}
          toneKey={section.tone}
        />
      ))}
      {briefing.taxDue > 0 && <TaxDueCard taxDue={briefing.taxDue} />}
    </div>
  );
}

// ── HQ Auditor panel ──────────────────────────────────────────────────────────

function AuditorPanel({ audit, loading }: { audit: AuditReport; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-[2rem] border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
        Running audit…
      </div>
    );
  }

  const allClear = audit.critical.length === 0 && audit.warnings.length === 0 && audit.taxDue === 0;

  if (allClear) {
    return (
      <div className="flex items-center gap-4 rounded-[2rem] border border-teal-200 bg-teal-50 p-6">
        <ShieldCheck className="h-6 w-6 shrink-0 text-teal-600" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-teal-800">System Healthy</p>
          <p className="mt-0.5 text-xs text-teal-700">No critical issues detected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {audit.critical.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-rose-700">Critical Issues</span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">{audit.totalCritical}</span>
          </div>
          {audit.critical.map((section) => (
            <SectionCard key={section.key} label={section.label} count={section.count} items={section.items} allHref={section.allHref} toneKey="red" />
          ))}
        </div>
      )}

      {(audit.warnings.length > 0 || audit.taxDue > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-700">Warnings</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{audit.totalWarnings}</span>
          </div>
          {audit.warnings.map((section) => (
            <SectionCard key={section.key} label={section.label} count={section.count} items={section.items} allHref={section.allHref} toneKey="amber" />
          ))}
          {audit.taxDue > 0 && <TaxDueCard taxDue={audit.taxDue} />}
        </div>
      )}
    </div>
  );
}

// ── End-of-Day panel ──────────────────────────────────────────────────────────

function EndOfDayPanel({ report, loading }: { report: EndOfDayReport; loading: boolean }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-[2rem] border border-slate-200 bg-white p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
        Loading report…
      </div>
    );
  }

  if (!report.hasActivity) {
    return (
      <div className="flex items-center gap-4 rounded-[2rem] border border-slate-200 bg-white p-6">
        <Moon className="h-5 w-5 shrink-0 text-indigo-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-700">No significant activity recorded today.</p>
      </div>
    );
  }

  const statTiles = [
    report.revenueToday > 0 && { label: "Revenue Collected", value: currency.format(report.revenueToday), href: "/finances?tab=invoices", accent: true  },
    report.payments.length > 0 && { label: `Payment${report.payments.length !== 1 ? "s" : ""} Received`,  value: String(report.payments.length),        href: "/finances?tab=invoices", accent: false },
    report.completedTasks.length > 0 && { label: `Task${report.completedTasks.length !== 1 ? "s" : ""} Completed`, value: String(report.completedTasks.length), href: "/tasks",                 accent: false },
    report.contactsLogged.length > 0 && { label: `Contact${report.contactsLogged.length !== 1 ? "s" : ""} Logged`,  value: String(report.contactsLogged.length), href: "/crm",                  accent: false },
  ].filter(Boolean) as { label: string; value: string; href: string; accent: boolean }[];

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className={`grid gap-3 ${statTiles.length >= 4 ? "grid-cols-2 md:grid-cols-4" : statTiles.length === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
        {statTiles.map((tile) => (
          <StatTile key={tile.label} label={tile.label} value={tile.value} href={tile.href} accent={tile.accent} />
        ))}
      </div>

      {/* Payments detail */}
      {report.payments.length > 0 && (
        <SectionCard
          label="Payments Received"
          count={report.payments.length}
          items={report.payments.slice(0, 5).map((p) => ({
            id: p.id,
            name: p.name,
            detail: `${p.type === "deposit" ? "Deposit" : "Final payment"} — ${currency.format(p.amount)}`,
            href: "/finances?tab=invoices",
          }))}
          allHref="/finances?tab=invoices"
          toneKey="slate"
        />
      )}

      {/* Tasks completed detail */}
      {report.completedTasks.length > 0 && (
        <SectionCard
          label="Tasks Completed"
          count={report.completedTasks.length}
          items={report.completedTasks.slice(0, 5).map((task) => ({
            id: task.id,
            name: task.name,
            detail: task.assignedTo || undefined,
            href: "/tasks",
          }))}
          allHref="/tasks"
          toneKey="slate"
        />
      )}

      {/* Contacts logged detail */}
      {report.contactsLogged.length > 0 && (
        <SectionCard
          label="Contacts Logged"
          count={report.contactsLogged.length}
          items={report.contactsLogged.slice(0, 5).map((c, i) => ({
            id: `${c.leadId}-${i}`,
            name: c.leadName,
            detail: c.contactType,
            href: "/crm",
          }))}
          allHref="/crm"
          toneKey="slate"
        />
      )}

      {/* Expenses detail */}
      {report.expensesToday.length > 0 && (
        <SectionCard
          label="Expenses Recorded"
          count={report.expensesToday.length}
          items={report.expensesToday.slice(0, 5).map((exp) => ({
            id: exp.id,
            name: exp.name,
            detail: currency.format(exp.amount),
            href: "/finances?tab=expenses",
          }))}
          allHref="/finances?tab=expenses"
          toneKey="slate"
        />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const todayISO          = businessTodayISO();
  const sevenDaysAheadISO = addDaysToISODate(todayISO, 7);
  const currentYear       = todayISO.slice(0, 4);
  const todayLabel        = businessTodayLabel();

  const { data: tasks,       loading: loadingTasks    } = useSupabaseTable<Row>("tasks",              []);
  const { data: invoices,    loading: loadingInvoices } = useSupabaseTable<Row>("finances",           []);
  const { data: orders,      loading: loadingOrders   } = useSupabaseTable<Row>("orders",             []);
  const { data: leads,       loading: loadingLeads    } = useSupabaseTable<Row>("crm_leads",          []);
  const { data: taxPayments, loading: loadingTax      } = useSupabaseTable<Row>("sales_tax_payments", []);
  const { data: expenses,    loading: loadingExpenses } = useSupabaseTable<Row>("expenses",           []);

  const loading = loadingTasks || loadingInvoices || loadingOrders || loadingLeads || loadingTax || loadingExpenses;

  const [briefingOpen, setBriefingOpen] = useState(true);
  const [auditorOpen,  setAuditorOpen]  = useState(false);
  const [eodOpen,      setEodOpen]      = useState(false);

  const briefing = useMemo(
    () => computeBriefing(tasks, invoices, orders, leads, taxPayments, todayISO, sevenDaysAheadISO, currentYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, invoices, orders, leads, taxPayments],
  );

  const audit = useMemo(
    () => computeAudit(tasks, invoices, orders, leads, taxPayments, todayISO, currentYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, invoices, orders, leads, taxPayments],
  );

  const endOfDay = useMemo(
    () => computeEndOfDay(tasks, invoices, leads, expenses, todayISO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, invoices, leads, expenses],
  );

  const briefingAllClear = !loading && briefing.sections.length === 0 && briefing.taxDue === 0;
  const auditorAllClear  = !loading && audit.critical.length === 0 && audit.warnings.length === 0 && audit.taxDue === 0;
  const eodQuiet         = !loading && !endOfDay.hasActivity;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      {/* Header */}
      <div>
        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Reporting</p>
        <h1 className="mt-3 text-base md:text-3xl font-semibold text-slate-950">Reports</h1>
        <p className="mt-2 text-xs text-slate-500 md:text-sm">
          Operational reports for reviewing daily activity, system health, and founder briefings.
        </p>
      </div>

      {/* Report cards */}
      <div className="grid gap-5 md:grid-cols-3">

        {/* Morning Briefing */}
        <button
          type="button"
          onClick={() => setBriefingOpen((prev) => !prev)}
          className={`flex flex-col gap-4 rounded-[2rem] border bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:p-7 ${
            briefingOpen ? "border-2 border-slate-950" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <Sun className="h-6 w-6 text-amber-500" aria-hidden="true" />
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
            ) : briefingAllClear ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-700">All clear</span>
            ) : (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-rose-700">
                {briefing.totalCount} item{briefing.totalCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-950">Morning Briefing</h2>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">What needs attention today</p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
            {briefingOpen
              ? <><span>Close</span><ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></>
              : <><span>Open</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></>
            }
          </div>
        </button>

        {/* End-of-Day Report */}
        <button
          type="button"
          onClick={() => setEodOpen((prev) => !prev)}
          className={`flex flex-col gap-4 rounded-[2rem] border bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:p-7 ${
            eodOpen ? "border-2 border-slate-950" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <Moon className="h-6 w-6 text-indigo-500" aria-hidden="true" />
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
            ) : eodQuiet ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Quiet</span>
            ) : endOfDay.revenueToday > 0 ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-700">
                {currency.format(endOfDay.revenueToday)}
              </span>
            ) : (
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-indigo-700">Active</span>
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-950">End-of-Day Report</h2>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">What happened today</p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
            {eodOpen
              ? <><span>Close</span><ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></>
              : <><span>Open</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></>
            }
          </div>
        </button>

        {/* HQ Auditor */}
        <button
          type="button"
          onClick={() => setAuditorOpen((prev) => !prev)}
          className={`flex flex-col gap-4 rounded-[2rem] border bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:p-7 ${
            auditorOpen ? "border-2 border-slate-950" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <ShieldCheck className="h-6 w-6 text-teal-500" aria-hidden="true" />
            </div>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
            ) : auditorAllClear ? (
              <span className="rounded-full bg-teal-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-teal-700">Healthy</span>
            ) : audit.totalCritical > 0 ? (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-rose-700">
                {audit.totalCritical} critical
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700">
                {audit.totalWarnings} warning{audit.totalWarnings !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-950">HQ Auditor</h2>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">
              Functional issues, missing required data, and workflow health
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-500">
            {auditorOpen
              ? <><span>Close</span><ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></>
              : <><span>Open</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></>
            }
          </div>
        </button>
      </div>

      {/* Morning Briefing panel */}
      {briefingOpen && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 md:text-base">Morning Briefing</h2>
            <p className="text-xs text-slate-500">{todayLabel}</p>
          </div>
          <BriefingPanel briefing={briefing} loading={loading} />
        </div>
      )}

      {/* End-of-Day panel */}
      {eodOpen && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 md:text-base">End-of-Day Report</h2>
            <p className="text-xs text-slate-500">{todayLabel}</p>
          </div>
          <EndOfDayPanel report={endOfDay} loading={loading} />
        </div>
      )}

      {/* HQ Auditor panel */}
      {auditorOpen && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 md:text-base">HQ Auditor</h2>
            <p className="text-xs text-slate-500">{todayLabel}</p>
          </div>
          <AuditorPanel audit={audit} loading={loading} />
        </div>
      )}
    </div>
  );
}
