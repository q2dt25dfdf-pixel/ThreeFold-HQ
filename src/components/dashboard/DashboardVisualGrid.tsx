"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  GitBranch,
  Receipt,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type {
  AttentionItem,
  ChartDatum,
  DashboardRecord,
  FollowUpLoadDatum,
  RevenueProgressMetric,
  TaskLoadDatum,
} from "@/lib/dashboardMetrics";
import {
  followUpLoad,
  invoiceHealth,
  monthlyRevenueProgress,
  needsAttention,
  ordersByStatus,
  pipelineOverview,
  taskLoadByFounder,
} from "@/lib/dashboardMetrics";

type Props = {
  orders: DashboardRecord[];
  finances: DashboardRecord[];
  tasks: DashboardRecord[];
  crmLeads: DashboardRecord[];
  todayISO: string;
  sevenDaysAheadISO: string;
};

const navy = "#0f172a";
const blue = "#2563eb";
const success = "#16a34a";
const amber = "#d97706";
const red = "#dc2626";
const purple = "#7c3aed";
const muted = "#64748b";

const invoicePalette: Record<string, string> = {
  Paid: success,
  "Deposit Due": amber,
  "Final Balance Due": blue,
  Overdue: red,
  Unpaid: muted,
};

const stageAccent = [blue, "#3b82f6", "#4f46e5", purple, "#6d28d9", navy, success];
const statusAccent = [blue, purple, amber, success, muted];

function Card({
  title,
  href,
  icon,
  children,
  className = "",
  actionLabel = "View",
}: {
  title: string;
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actionLabel?: string;
}) {
  const router = useRouter();
  return (
    <section className={`relative min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:p-5 ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-inner">
            {icon}
          </span>
          <h2 className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em] text-slate-950 md:text-base">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push(href)}
          className="flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-slate-500 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          {actionLabel} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center text-sm font-medium text-slate-500">
      {label}
    </div>
  );
}

function RevenueProgressCard({ metric }: { metric: RevenueProgressMetric }) {
  const deltaPositive = metric.delta >= 0;
  const cappedPercent = Math.min(metric.percent, 100);

  return (
    <Card
      title="Monthly Revenue"
      href="/finances"
      icon={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
      actionLabel="Finances"
      className="bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.14),transparent_34%),linear-gradient(180deg,#ffffff,#f8fafc)] sm:col-span-2 xl:col-span-1"
    >
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Collected this month</p>
          <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
            <p className="text-4xl font-bold tracking-[-0.04em] text-slate-950 md:text-5xl">{formatCurrency(metric.collected)}</p>
            <p className="pb-1 text-sm font-medium text-slate-500">of {formatCurrency(metric.goal)} goal</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{cappedPercent}% complete</span>
            <span>{formatCurrency(Math.max(metric.goal - metric.collected, 0))} remaining</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-200/70 shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_22px_rgba(37,99,235,0.35)]"
              style={{ width: `${cappedPercent}%` }}
            />
          </div>
        </div>

        <div className={`inline-flex max-w-full items-center rounded-2xl border px-3 py-2 text-xs font-semibold ${deltaPositive ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
          {deltaPositive ? "+" : "-"}{formatCurrency(Math.abs(metric.delta))} vs last month
        </div>
      </div>
    </Card>
  );
}

function PipelineOverviewCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const pipelineValue = data.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const max = Math.max(1, ...data.map((item) => item.value));

  return (
    <Card title="Pipeline Overview" href="/crm" icon={<GitBranch className="h-4 w-4" aria-hidden="true" />} actionLabel="CRM">
      {total === 0 ? <EmptyState label="No open pipeline data yet." /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-slate-950 px-4 py-3 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)]">
              <p className="text-xs text-slate-400">Open Leads</p>
              <p className="mt-1 text-3xl font-bold tracking-[-0.04em]">{total}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Pipeline Value</p>
              <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-slate-950">{formatCurrency(pipelineValue)}</p>
            </div>
          </div>

          <div className="space-y-3">
            {data.map((item, index) => (
              <div key={item.name} className="grid grid-cols-[minmax(84px,1fr)_minmax(90px,1.4fr)_auto] items-center gap-3 text-xs">
                <span className="min-w-0 truncate font-medium text-slate-600">{item.name}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full shadow-[0_0_14px_rgba(37,99,235,0.22)]"
                    style={{ width: `${Math.max(8, (item.value / max) * 100)}%`, backgroundColor: stageAccent[index % stageAccent.length] }}
                  />
                </div>
                <span className="text-right font-bold text-slate-950">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function InvoiceHealthCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card title="Invoice Health" href="/finances" icon={<Receipt className="h-4 w-4" aria-hidden="true" />} actionLabel="Finances">
      {total === 0 ? <EmptyState label="No invoice records yet." /> : (
        <div className="grid gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
          <div className="relative h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="84%" paddingAngle={4}>
                  {data.map((item) => <Cell key={item.name} fill={invoicePalette[item.name] ?? muted} />)}
                </Pie>
                <Tooltip formatter={(value) => [value, "Invoices"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-slate-950">{total}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total</span>
            </div>
          </div>
          <div className="space-y-2">
            {data.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: invoicePalette[item.name] ?? muted }} />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="font-bold text-slate-950">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function OrdersPipelineCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <Card title="Production Pipeline" href="/orders" icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />} actionLabel="Orders">
      {total === 0 ? <EmptyState label="No orders yet." /> : (
        <div className="space-y-4">
          {data.map((item, index) => (
            <div key={item.name} className="rounded-3xl border border-slate-100 bg-slate-50/80 px-3 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-slate-800">{item.name}</span>
                <span className="text-sm font-bold text-slate-950">{item.value}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white shadow-inner">
                <div className="h-full rounded-full" style={{ width: `${Math.max(8, (item.value / max) * 100)}%`, backgroundColor: statusAccent[index % statusAccent.length] }} />
              </div>
            </div>
          ))}
          <p className="text-xs font-medium text-slate-500">{total} total orders</p>
        </div>
      )}
    </Card>
  );
}

function FollowUpLoadCard({ data }: { data: FollowUpLoadDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <Card title="Follow-Up Load" href="/crm?view=followups" icon={<Users className="h-4 w-4" aria-hidden="true" />} actionLabel="CRM">
      {total === 0 ? <EmptyState label="No follow-ups due in the next 7 days." /> : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 6, left: -26, bottom: 0 }}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} formatter={(value) => [value, "Follow-ups"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} />
              <Bar dataKey="count" fill={blue} radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function TaskLoadCard({ data }: { data: TaskLoadDatum[] }) {
  const max = Math.max(1, ...data.map((item) => item.open));
  const total = data.reduce((sum, item) => sum + item.open, 0);
  const overdue = data.reduce((sum, item) => sum + item.overdue, 0);
  return (
    <Card title="Task Load by Founder" href="/tasks" icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />} actionLabel="Tasks">
      {total === 0 ? <EmptyState label="No open tasks." /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xl font-bold tracking-[-0.04em] text-slate-950">{total}</p>
              <p className="text-xs font-medium text-slate-500">Total open</p>
            </div>
            <div>
              <p className={`text-2xl font-bold tracking-[-0.04em] ${overdue > 0 ? "text-red-600" : "text-slate-950"}`}>{overdue}</p>
              <p className="text-xs font-medium text-slate-500">Overdue</p>
            </div>
          </div>
          <div className="space-y-4">
            {data.map((item) => (
              <div key={item.name}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                  <span className="text-xs text-slate-500">
                    {item.open} open{item.overdue > 0 ? ` / ${item.overdue} overdue` : ""}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-blue-400" style={{ width: `${(item.open / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const toneClass: Record<AttentionItem["tone"], string> = {
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  const toneLabel: Record<AttentionItem["tone"], string> = {
    red: "Urgent",
    amber: "Due soon",
    blue: "Watch",
    slate: "Info",
  };
  return (
    <Card title="Needs Attention" href="/tasks" icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} actionLabel="View All" className="xl:col-span-3">
      {items.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
          <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-600" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-500">No urgent items right now.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-100 bg-slate-50/60">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(item.href)}
              className="grid w-full min-w-0 gap-2 px-3 py-3 text-left transition-colors hover:bg-white md:grid-cols-[1.3fr_auto_auto] md:items-center md:gap-4"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">{item.label}</span>
                <span className="block truncate text-xs text-slate-500">{item.detail}</span>
              </span>
              <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${toneClass[item.tone]}`}>
                {toneLabel[item.tone]}
              </span>
              <span className="hidden text-right text-xs font-medium text-slate-400 md:block">Open</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function DashboardVisualGrid({ orders, finances, tasks, crmLeads, todayISO, sevenDaysAheadISO }: Props) {
  const metrics = useMemo(() => ({
    revenue: monthlyRevenueProgress(finances, todayISO),
    pipeline: pipelineOverview(crmLeads),
    invoices: invoiceHealth(finances, todayISO),
    orderStatuses: ordersByStatus(orders),
    followUps: followUpLoad(crmLeads, tasks, todayISO),
    taskLoad: taskLoadByFounder(tasks, todayISO),
    attention: needsAttention(orders, finances, tasks, crmLeads, todayISO, sevenDaysAheadISO),
  }), [crmLeads, finances, orders, sevenDaysAheadISO, tasks, todayISO]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <RevenueProgressCard metric={metrics.revenue} />
      <PipelineOverviewCard data={metrics.pipeline} />
      <InvoiceHealthCard data={metrics.invoices} />
      <OrdersPipelineCard data={metrics.orderStatuses} />
      <FollowUpLoadCard data={metrics.followUps} />
      <TaskLoadCard data={metrics.taskLoad} />
      <NeedsAttentionCard items={metrics.attention} />
    </div>
  );
}
