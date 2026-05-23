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

const palette = ["#2563eb", "#0f766e", "#7c3aed", "#ea580c", "#0891b2", "#64748b", "#16a34a", "#dc2626"];
const invoicePalette: Record<string, string> = {
  Paid: "#16a34a",
  Overdue: "#dc2626",
  "Deposit Due": "#d97706",
  "Final Balance Due": "#2563eb",
  Unpaid: "#64748b",
};

function Card({
  title,
  href,
  icon,
  children,
}: {
  title: string;
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            {icon}
          </span>
          <h2 className="min-w-0 truncate text-sm font-semibold text-slate-950 md:text-base">{title}</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push(href)}
          className="flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-blue-600"
        >
          View <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm font-medium text-slate-500">
      {label}
    </div>
  );
}

function RevenueProgressCard({ metric }: { metric: RevenueProgressMetric }) {
  const circumference = 2 * Math.PI * 48;
  const offset = circumference - (metric.percent / 100) * circumference;

  return (
    <Card title="Monthly Revenue" href="/finances" icon={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative mx-auto h-36 w-36 shrink-0 sm:mx-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="48" fill="none" stroke="#e2e8f0" strokeWidth="12" />
            <circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="#2563eb"
              strokeLinecap="round"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-slate-950">{metric.percent}%</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Complete</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Collected this month</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{formatCurrency(metric.collected)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">Goal</p>
            <p className="text-sm font-semibold text-slate-700">{formatCurrency(metric.goal)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LegendList({ data, colors }: { data: ChartDatum[]; colors?: Record<string, string> }) {
  return (
    <div className="mt-3 grid gap-2">
      {data.map((item, index) => (
        <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-2 text-slate-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors?.[item.name] ?? palette[index % palette.length] }} />
            <span className="truncate">{item.name}</span>
          </span>
          <span className="font-semibold text-slate-950">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function PipelineOverviewCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card title="Pipeline Overview" href="/crm" icon={<GitBranch className="h-4 w-4" aria-hidden="true" />}>
      {total === 0 ? <EmptyState label="No open pipeline data yet." /> : (
        <>
          <div className="flex h-5 overflow-hidden rounded-full bg-slate-100">
            {data.map((item, index) => (
              <div
                key={item.name}
                className="min-w-[6px]"
                style={{ width: `${(item.value / total) * 100}%`, backgroundColor: palette[index % palette.length] }}
                title={`${item.name}: ${item.value}`}
              />
            ))}
          </div>
          <div className="mt-4 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip cursor={{ fill: "#f8fafc" }} formatter={(value) => [value, "Leads"]} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {data.map((item, index) => <Cell key={item.name} fill={palette[index % palette.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function DonutCard({
  title,
  href,
  icon,
  data,
  emptyLabel,
  colors,
}: {
  title: string;
  href: string;
  icon: React.ReactNode;
  data: ChartDatum[];
  emptyLabel: string;
  colors?: Record<string, string>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card title={title} href={href} icon={icon}>
      {total === 0 ? <EmptyState label={emptyLabel} /> : (
        <>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>
                  {data.map((item, index) => <Cell key={item.name} fill={colors?.[item.name] ?? palette[index % palette.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => [value, "Records"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <LegendList data={data} colors={colors} />
        </>
      )}
    </Card>
  );
}

function FollowUpLoadCard({ data }: { data: FollowUpLoadDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  return (
    <Card title="Follow-Up Load" href="/crm?view=followups" icon={<Users className="h-4 w-4" aria-hidden="true" />}>
      {total === 0 ? <EmptyState label="No follow-ups due in the next 7 days." /> : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#64748b" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip formatter={(value) => [value, "Follow-ups"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} />
              <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} />
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
  return (
    <Card title="Task Load" href="/tasks" icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}>
      {total === 0 ? <EmptyState label="No open tasks." /> : (
        <div className="space-y-4">
          {data.map((item) => (
            <div key={item.name}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                <span className="text-xs text-slate-500">
                  {item.open} open{item.overdue > 0 ? ` · ${item.overdue} overdue` : ""}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${(item.open / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function NeedsAttentionCard({ items }: { items: AttentionItem[] }) {
  const router = useRouter();
  const toneClass: Record<AttentionItem["tone"], string> = {
    red: "border-red-100 bg-red-50 text-red-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-slate-100 bg-slate-50 text-slate-600",
  };
  return (
    <Card title="Needs Attention" href="/tasks" icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}>
      {items.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
          <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-600" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-500">No urgent items right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => router.push(item.href)}
              className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-slate-200 hover:bg-white"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">{item.label}</span>
                <span className="block truncate text-xs text-slate-500">{item.detail}</span>
              </span>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${toneClass[item.tone]}`}>
                {item.tone === "red" ? "Urgent" : item.tone === "amber" ? "Due" : "Watch"}
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
      <DonutCard
        title="Invoice Health"
        href="/finances"
        icon={<Receipt className="h-4 w-4" aria-hidden="true" />}
        data={metrics.invoices}
        emptyLabel="No invoice records yet."
        colors={invoicePalette}
      />
      <DonutCard
        title="Orders by Status"
        href="/orders"
        icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
        data={metrics.orderStatuses}
        emptyLabel="No orders yet."
      />
      <FollowUpLoadCard data={metrics.followUps} />
      <TaskLoadCard data={metrics.taskLoad} />
      <div className="sm:col-span-2 xl:col-span-3">
        <NeedsAttentionCard items={metrics.attention} />
      </div>
    </div>
  );
}
