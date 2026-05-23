"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  GitBranch,
  Receipt,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
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

const blue = "#2563eb";
const blueSoft = "#60a5fa";
const success = "#16a34a";
const amber = "#f59e0b";
const red = "#ef4444";
const muted = "#64748b";

const invoicePalette: Record<string, string> = {
  Paid: success,
  "Deposit Due": amber,
  "Final Balance Due": blue,
  Overdue: red,
  Unpaid: muted,
};

const funnelPalette = ["#2563eb", "#315ee4", "#3f46c5", "#5335a2", "#3f247b"];
const workflowPalette = ["#1d4ed8", "#4f46e5", "#d97706", "#16a34a", "#64748b"];

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
    <section className={`group relative min-w-0 overflow-hidden rounded-[1.65rem] border border-slate-900/10 bg-white p-4 shadow-[0_22px_70px_rgba(15,23,42,0.12)] ring-1 ring-white/70 md:p-5 ${className}`}>
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="relative mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_10px_22px_rgba(15,23,42,0.08)]">
            {icon}
          </span>
          <h2 className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em] text-slate-950 md:text-base">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push(href)}
          className="flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-3 text-xs font-semibold text-slate-500 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
        >
          {actionLabel} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

function EmptyState({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex min-h-[180px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center text-sm font-medium text-slate-500 ${className}`}>
      {label}
    </div>
  );
}

function RevenueProgressCard({ metric }: { metric: RevenueProgressMetric }) {
  const deltaPositive = metric.delta >= 0;
  const canShowTrend = metric.paymentDays >= 2 && metric.trend.some((point) => point.collected > 0);

  return (
    <Card
      title="Monthly Revenue"
      href="/finances"
      icon={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
      actionLabel="Finances"
      className="border-slate-800/70 bg-[radial-gradient(circle_at_75%_20%,rgba(37,99,235,0.28),transparent_34%),linear-gradient(145deg,#08111f,#0f172a_52%,#111827)] text-white sm:col-span-2 xl:col-span-1"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/70">Collected this month</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-4xl font-bold tracking-[-0.05em] text-white md:text-5xl">{formatCurrency(metric.collected)}</p>
              <p className="pb-1 text-sm font-medium text-slate-300">of {formatCurrency(metric.goal)} goal</p>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.08] px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <p className="text-2xl font-bold tracking-[-0.04em] text-white">{metric.percent}%</p>
            <p className="text-xs font-medium text-slate-400">of goal</p>
          </div>
        </div>

        <div className={`inline-flex max-w-full items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${deltaPositive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
          {deltaPositive ? "+" : "-"}{formatCurrency(Math.abs(metric.delta))} vs last month
        </div>

        {canShowTrend ? (
          <div className="h-52 rounded-3xl border border-white/10 bg-slate-950/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metric.trend} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={blueSoft} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={blueSoft} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.14)" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={22} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${Number(value) / 1000}k`} tick={{ fontSize: 11, fill: "#94a3b8" }} width={42} />
                <Tooltip
                  cursor={{ stroke: "rgba(96,165,250,0.45)" }}
                  contentStyle={{ borderRadius: 16, border: "1px solid rgba(148,163,184,0.24)", background: "#020617", color: "#fff" }}
                  formatter={(value) => [formatCurrency(Number(value)), "Collected"]}
                  labelFormatter={(label) => String(label)}
                />
                <Area type="monotone" dataKey="collected" stroke={blueSoft} strokeWidth={3} fill="url(#revenueGradient)" dot={false} activeDot={{ r: 5, fill: "#dbeafe", stroke: blue }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex min-h-[208px] flex-col justify-center rounded-3xl border border-white/10 bg-slate-950/25 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <p className="text-sm font-semibold text-white">Revenue trend needs more payment history.</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
              The card is showing the real collected total, but there are not enough distinct paid dates this month to draw a trustworthy trend chart yet.
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/70">{formatCurrency(Math.max(metric.goal - metric.collected, 0))} remaining</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function PipelineOverviewCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const pipelineValue = data.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const maxAmount = Math.max(1, ...data.map((item) => item.amount ?? 0));

  return (
    <Card title="Pipeline Overview" href="/crm" icon={<GitBranch className="h-4 w-4" aria-hidden="true" />} actionLabel="CRM" className="bg-[linear-gradient(180deg,#ffffff,#f8fafc)]">
      {total === 0 ? <EmptyState label="No open pipeline data yet." /> : (
        <div className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Estimated pipeline value</p>
              <p className="mt-1 text-3xl font-bold tracking-[-0.05em] text-slate-950">{formatCurrency(pipelineValue)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm">
              <p className="text-lg font-bold text-slate-950">{total}</p>
              <p className="text-[11px] font-medium text-slate-500">open leads</p>
            </div>
          </div>

          <div className="space-y-2.5">
            {data.map((item, index) => {
              const width = Math.max(48, 100 - index * 10);
              const amountWidth = Math.max(10, ((item.amount ?? 0) / maxAmount) * 100);
              return (
                <div key={item.name} className="grid grid-cols-[minmax(78px,0.8fr)_minmax(130px,1.5fr)_auto] items-center gap-3 text-xs">
                  <span className="min-w-0 truncate font-semibold text-slate-600">{item.name}</span>
                  <div className="relative min-w-0">
                    <div
                      className="h-11 rounded-lg shadow-[0_12px_26px_rgba(37,99,235,0.18)]"
                      style={{
                        width: `${width}%`,
                        background: `linear-gradient(90deg, ${funnelPalette[index % funnelPalette.length]}, ${funnelPalette[Math.min(index + 1, funnelPalette.length - 1)]})`,
                        clipPath: "polygon(6% 0, 100% 0, 94% 100%, 0 100%)",
                      }}
                    />
                    <div className="absolute bottom-1.5 left-3 right-6 h-1 rounded-full bg-white/[0.18]">
                      <div className="h-full rounded-full bg-white/[0.55]" style={{ width: `${amountWidth}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-950">{item.value}</p>
                    {(item.amount ?? 0) > 0 && <p className="text-[10px] font-medium text-slate-400">{formatCurrency(item.amount ?? 0)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function InvoiceHealthCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const overdue = data.find((item) => item.name === "Overdue")?.value ?? 0;
  return (
    <Card title="Invoice Health" href="/finances" icon={<Receipt className="h-4 w-4" aria-hidden="true" />} actionLabel="Finances" className="bg-[radial-gradient(circle_at_30%_0%,rgba(22,163,74,0.12),transparent_30%),#ffffff]">
      {total === 0 ? <EmptyState label="No invoice records yet." /> : (
        <div className="grid gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
          <div className="relative h-44 rounded-3xl border border-slate-100 bg-slate-50/80 p-2 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="86%" paddingAngle={5}>
                  {data.map((item) => <Cell key={item.name} fill={invoicePalette[item.name] ?? muted} />)}
                </Pie>
                <Tooltip formatter={(value) => [value, "Invoices"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tracking-[-0.05em] text-slate-950">{total}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total</span>
            </div>
          </div>
          <div className="space-y-2">
            {data.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-sm">
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: invoicePalette[item.name] ?? muted }} />
                  <span className="truncate">{item.name}</span>
                </span>
                <span className="font-bold text-slate-950">{item.value}</span>
              </div>
            ))}
            <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${overdue > 0 ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
              {overdue > 0 ? `${overdue} overdue` : "No overdue invoices"}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function OrdersPipelineCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card title="Production Pipeline" href="/orders" icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />} actionLabel="Orders" className="sm:col-span-2 xl:col-span-1">
      {total === 0 ? <EmptyState label="No orders yet." /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {data.map((item, index) => (
              <div key={item.name} className="relative min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: workflowPalette[index % workflowPalette.length] }} />
                <p className="truncate text-sm font-semibold text-slate-800">{item.name}</p>
                <p className="mt-3 text-3xl font-bold tracking-[-0.05em] text-slate-950">{item.value}</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">orders</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-slate-100 bg-slate-50 p-3">
            {data.map((item, index) => (
              <div key={item.name} className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 min-w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm" style={{ backgroundColor: workflowPalette[index % workflowPalette.length] }}>{item.value}</span>
                <span className="max-w-[92px] truncate text-xs font-semibold text-slate-600">{item.name}</span>
                {index < data.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />}
              </div>
            ))}
          </div>
          <p className="text-xs font-medium text-slate-500">{total} total orders across active workflow stages.</p>
        </div>
      )}
    </Card>
  );
}

function FollowUpLoadCard({ data }: { data: FollowUpLoadDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <Card title="Follow-Up Load" href="/crm?view=followups" icon={<Users className="h-4 w-4" aria-hidden="true" />} actionLabel="CRM" className="bg-[linear-gradient(180deg,#ffffff,#f8fafc)]">
      {total === 0 ? <EmptyState label="No follow-ups due in the next 7 days." /> : (
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-[-0.05em] text-slate-950">{total}</p>
              <p className="text-xs font-medium text-slate-500">scheduled over the next 7 days</p>
            </div>
          </div>
          <div className="h-52 rounded-3xl border border-slate-100 bg-white p-3 shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 6, left: -26, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} formatter={(value) => [value, "Follow-ups"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} />
                <Bar dataKey="count" fill={blue} radius={[12, 12, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
    <Card title="Task Load by Founder" href="/tasks" icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />} actionLabel="Tasks" className="bg-[radial-gradient(circle_at_100%_0%,rgba(124,58,237,0.12),transparent_28%),#ffffff]">
      {total === 0 ? <EmptyState label="No open tasks." /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-3xl font-bold tracking-[-0.05em] text-slate-950">{total}</p>
              <p className="text-xs font-medium text-slate-500">Total open</p>
            </div>
            <div className={`rounded-3xl border px-4 py-3 ${overdue > 0 ? "border-red-100 bg-red-50" : "border-emerald-100 bg-emerald-50"}`}>
              <p className={`text-3xl font-bold tracking-[-0.05em] ${overdue > 0 ? "text-red-600" : "text-emerald-700"}`}>{overdue}</p>
              <p className={`text-xs font-medium ${overdue > 0 ? "text-red-500" : "text-emerald-700"}`}>Overdue</p>
            </div>
          </div>
          <div className="space-y-4">
            {data.map((item) => (
              <div key={item.name} className="rounded-3xl border border-slate-100 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.overdue > 0 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                    {item.open} open{item.overdue > 0 ? ` / ${item.overdue} overdue` : ""}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-700 via-blue-500 to-blue-300 shadow-[0_0_18px_rgba(37,99,235,0.24)]" style={{ width: `${(item.open / max) * 100}%` }} />
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
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(item.href)}
              className="group/row grid w-full min-w-0 gap-2 border-b border-slate-100 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 md:grid-cols-[1.3fr_auto_auto] md:items-center md:gap-4"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">{item.label}</span>
                <span className="block truncate text-xs text-slate-500">{item.detail}</span>
              </span>
              <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${toneClass[item.tone]}`}>
                {toneLabel[item.tone]}
              </span>
              <span className="hidden items-center justify-end gap-1 text-right text-xs font-semibold text-slate-400 transition-colors group-hover/row:text-blue-600 md:flex">
                Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
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
