"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Sun, Moon, ShieldCheck, CheckCircle2,
  ChevronDown, ChevronUp, ArrowRight, Loader2,
} from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { businessTodayISO, businessTodayLabel, addDaysToISODate } from "@/lib/businessDate";
import {
  INACTIVE_FINANCE_STATUSES,
  INACTIVE_ORDER_STATUSES,
  TASK_DONE_STATUSES,
} from "@/lib/constants";
import { readField, statusText, stringField } from "@/lib/recordUtils";
import { hasActiveFollowUpTask, hasFollowUpDate } from "@/lib/followUps";
import { normalizeCRMStage } from "@/lib/dashboardMetrics";
import { parseAmount } from "@/lib/invoiceCalc";
import { calcDepositTax } from "@/lib/salesTax";

type Row = Record<string, unknown> & { id: string };

type BriefingItem = {
  id: string;
  name: string;
  detail?: string;
  href: string;
};

type BriefingSection = {
  key: string;
  label: string;
  count: number;
  items: BriefingItem[];
  allHref: string;
  tone: "red" | "amber" | "blue";
};

type Briefing = {
  sections: BriefingSection[];
  taxDue: number;
  totalCount: number;
};

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
  // Overdue tasks: not done, ISO date, before today
  const overdueTasks = tasks.filter((task) => {
    if (task.completed === true || TASK_DONE_STATUSES.has(statusText(task))) return false;
    const due = readField(task, "dueDate", "due_date");
    return Boolean(due && due !== "TBD" && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < todayISO);
  });

  // Unpaid invoices: not draft/cancelled and not fully paid
  const unpaidInvoices = invoices.filter((inv) => {
    if (INACTIVE_FINANCE_STATUSES.has(statusText(inv))) return false;
    return inv.final_paid !== true;
  });

  // Orders due within 7 days: active, delivery date in [today, +7]
  const ordersDueSoon = orders.filter((order) => {
    if (INACTIVE_ORDER_STATUSES.has(statusText(order))) return false;
    const dueDate =
      stringField(order, "estimatedDeliveryDate") ||
      stringField(order, "dueDate") ||
      stringField(order, "final_due_date");
    return Boolean(dueDate && dueDate >= todayISO && dueDate <= sevenDaysAheadISO);
  });

  // Stale leads: follow-up date has passed and an active follow-up task still exists
  const staleLeads = leads.filter((lead) => {
    if (normalizeCRMStage(stringField(lead, "stage")) === "Deposit Paid") return false;
    const followUp = readField(lead, "followUpDate", "follow_up_date");
    return hasFollowUpDate(followUp) && followUp < todayISO && hasActiveFollowUpTask(lead, tasks);
  });

  // Sales tax owed YTD: tax collected via payments minus tax remitted
  const taxCollectedYTD = invoices.reduce((sum, inv) => {
    const taxAmt = parseAmount(inv.sales_tax_amount);
    if (taxAmt <= 0) return sum;
    const grandTotalAmt = parseAmount(inv.grand_total ?? inv.total_amount);
    const depositAmt = parseAmount(inv.deposit_amount);
    const finalDate = String(inv.final_paid_date ?? "");
    const depositDate = String(inv.deposit_paid_date ?? "");
    if (inv.final_paid === true && finalDate.startsWith(currentYear)) return sum + taxAmt;
    if (inv.deposit_paid === true && depositDate.startsWith(currentYear) && inv.final_paid !== true) {
      return sum + calcDepositTax(taxAmt, depositAmt, grandTotalAmt);
    }
    if (inv.final_paid === true && !finalDate.startsWith(currentYear) && inv.deposit_paid === true && depositDate.startsWith(currentYear)) {
      return sum + calcDepositTax(taxAmt, depositAmt, grandTotalAmt);
    }
    return sum;
  }, 0);

  const taxPaidYTD = taxPayments
    .filter((p) => String(p.payment_date ?? p.date ?? "").startsWith(currentYear))
    .reduce((sum, p) => {
      const cents = p.amount_cents;
      return sum + (typeof cents === "number" ? cents / 100 : parseAmount(p.amount ?? 0));
    }, 0);

  const taxDue = Math.max(taxCollectedYTD - taxPaidYTD, 0);

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
        const detail = st === "overdue"
          ? "Overdue"
          : st.includes("deposit")
          ? "Deposit pending"
          : "Balance due";
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

const toneStyles = {
  red: {
    badge: "bg-rose-100 text-rose-700",
    heading: "text-rose-700",
    dot: "bg-rose-400",
    itemBorder: "border-rose-100 bg-rose-50 hover:bg-rose-100",
  },
  amber: {
    badge: "bg-amber-100 text-amber-700",
    heading: "text-amber-700",
    dot: "bg-amber-400",
    itemBorder: "border-amber-100 bg-amber-50 hover:bg-amber-100",
  },
  blue: {
    badge: "bg-blue-100 text-blue-700",
    heading: "text-blue-700",
    dot: "bg-blue-400",
    itemBorder: "border-blue-100 bg-blue-50 hover:bg-blue-100",
  },
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

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
      {briefing.sections.map((section) => {
        const styles = toneStyles[section.tone];
        return (
          <div key={section.key} className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${styles.heading}`}>{section.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${styles.badge}`}>
                  {section.count}
                </span>
              </div>
              <Link
                href={section.allHref}
                className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                See all <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs transition ${styles.itemBorder}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} aria-hidden="true" />
                      <span className="truncate font-medium text-slate-900">{item.name}</span>
                    </div>
                    {item.detail && (
                      <span className="shrink-0 text-slate-500">{item.detail}</span>
                    )}
                  </Link>
                </li>
              ))}
              {section.count > 5 && (
                <li>
                  <Link
                    href={section.allHref}
                    className="block px-4 py-2 text-xs text-slate-500 hover:text-slate-900"
                  >
                    +{section.count - 5} more
                  </Link>
                </li>
              )}
            </ul>
          </div>
        );
      })}

      {briefing.taxDue > 0 && (
        <div className="rounded-[2rem] border border-slate-200 bg-white p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-rose-700">Sales Tax Owed</span>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">YTD</span>
            </div>
            <Link
              href="/finances?tab=sales-tax"
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
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
            <span className="shrink-0 font-semibold text-rose-700">{currency.format(briefing.taxDue)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const todayISO = businessTodayISO();
  const sevenDaysAheadISO = addDaysToISODate(todayISO, 7);
  const currentYear = todayISO.slice(0, 4);

  const { data: tasks,       loading: loadingTasks    } = useSupabaseTable<Row>("tasks",              []);
  const { data: invoices,    loading: loadingInvoices } = useSupabaseTable<Row>("finances",           []);
  const { data: orders,      loading: loadingOrders   } = useSupabaseTable<Row>("orders",             []);
  const { data: leads,       loading: loadingLeads    } = useSupabaseTable<Row>("crm_leads",          []);
  const { data: taxPayments, loading: loadingTax      } = useSupabaseTable<Row>("sales_tax_payments", []);

  const loading = loadingTasks || loadingInvoices || loadingOrders || loadingLeads || loadingTax;

  const [briefingOpen, setBriefingOpen] = useState(true);

  const briefing = useMemo(
    () => computeBriefing(tasks, invoices, orders, leads, taxPayments, todayISO, sevenDaysAheadISO, currentYear),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, invoices, orders, leads, taxPayments],
  );

  const allClear = !loading && briefing.sections.length === 0 && briefing.taxDue === 0;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <div>
        <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Reporting</p>
        <h1 className="mt-3 text-base md:text-3xl font-semibold text-slate-950">Reports</h1>
        <p className="mt-2 text-xs text-slate-500 md:text-sm">
          Operational reports for reviewing daily activity, system health, and founder briefings.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {/* Morning Briefing — active */}
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
            ) : allClear ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-700">
                All clear
              </span>
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
            {briefingOpen ? (
              <>Close <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></>
            ) : (
              <>Open <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></>
            )}
          </div>
        </button>

        {/* End-of-Day Report — coming soon */}
        <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <Moon className="h-6 w-6 text-indigo-500" aria-hidden="true" />
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              Coming soon
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-950">End-of-Day Report</h2>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">What changed today</p>
          </div>
        </div>

        {/* HQ Auditor — coming soon */}
        <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <ShieldCheck className="h-6 w-6 text-teal-500" aria-hidden="true" />
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              Coming soon
            </span>
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-950">HQ Auditor</h2>
            <p className="mt-1 text-xs text-slate-500 md:text-sm">
              Functional issues, missing required data, and workflow health
            </p>
          </div>
        </div>
      </div>

      {briefingOpen && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 md:text-base">Morning Briefing</h2>
            <p className="text-xs text-slate-500">{businessTodayLabel()}</p>
          </div>
          <BriefingPanel briefing={briefing} loading={loading} />
        </div>
      )}
    </div>
  );
}
