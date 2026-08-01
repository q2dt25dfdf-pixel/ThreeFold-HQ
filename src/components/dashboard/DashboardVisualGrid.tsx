"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  TaskLoadDatum,
} from "@/lib/dashboardMetrics";
import {
  followUpLoad,
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
const workflowPalette = ["#2563eb", "#4f46e5", "#f59e0b", "#16a34a", "#64748b"];
// Match the revamped top section's flat, dense card style (bg-white, shadow-sm, ring-slate-100).
const cardShell = "group relative min-w-0 cursor-pointer overflow-hidden rounded-[1.65rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:ring-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50";
const chartFrameClass = "rounded-2xl border border-slate-200/70 bg-white/80 p-3";
const metricPanelClass = "rounded-2xl border border-slate-200/70 bg-slate-50 px-4 py-2.5";
const labelClass = "text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400";
const metricClass = "text-2xl font-bold tracking-[-0.04em] text-slate-950";
const rowClass = "rounded-2xl border border-slate-200/70 bg-slate-50 p-3";

const toneStyles: Record<AttentionItem["tone"], string> = {
  red: "border-red-200 bg-red-50 text-red-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
};
const toneLabels: Record<AttentionItem["tone"], string> = {
  red: "Urgent",
  amber: "Due soon",
  blue: "Watch",
  slate: "Info",
};

function Card({
  title,
  href,
  children,
  className = "",
  actionLabel = "View",
}: {
  title: string;
  href: string;
  icon?: React.ReactNode; // accepted for call-site compatibility; header is icon-free now
  children: React.ReactNode;
  className?: string;
  actionLabel?: string;
}) {
  const router = useRouter();
  const openCard = () => router.push(href);
  return (
    <section
      role="link"
      tabIndex={0}
      aria-label={`Open ${title}`}
      onClick={openCard}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard();
        }
      }}
      className={`${cardShell} ${className}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <h2 className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.13em] text-slate-400">{title}</h2>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openCard();
          }}
          className="ml-auto flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
        >
          {actionLabel} <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      <div>{children}</div>
    </section>
  );
}

function ChartFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`${chartFrameClass} ${className}`}>{children}</div>;
}

function StatusChip({ tone, children }: { tone: AttentionItem["tone"]; children: React.ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${toneStyles[tone]}`}>
      {children}
    </span>
  );
}

function EmptyState({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-center text-[13px] font-medium text-slate-500 ${className}`}>
      {label}
    </div>
  );
}

const funnelColors = [
  "#1e3a8a",
  "#1e40af",
  "#1d4ed8",
  "#2563eb",
  "#4f46e5",
  "#6d28d9",
  "#7c3aed",
];

function PipelineOverviewCard({ data }: { data: ChartDatum[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const router = useRouter();

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const pipelineValue = data.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const n = data.length;

  const hovered = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <Card title="Pipeline Overview" href="/crm" icon={<GitBranch className="h-4 w-4" aria-hidden="true" />} actionLabel="CRM">
      {total === 0 ? <EmptyState label="No open pipeline data yet." /> : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className={labelClass}>Estimated pipeline value</p>
              <p className={`mt-1 ${metricClass}`}>{formatCurrency(pipelineValue)}</p>
            </div>
            <div className={`${metricPanelClass} py-2 text-right`}>
              <p className="text-lg font-bold text-slate-950">{total}</p>
              <p className="text-[11px] font-medium text-slate-500">open leads</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-[3px]">
            {data.map((item, idx) => {
              const widthPct = n > 1 ? 100 - (idx / (n - 1)) * 72 : 100;
              const color = funnelColors[idx % funnelColors.length];
              const isHovered = hoveredIdx === idx;
              const isDimmed = hoveredIdx !== null && !isHovered;
              return (
                <button
                  key={item.name}
                  onClick={() => router.push("/crm")}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    width: `${widthPct}%`,
                    background: color,
                    opacity: isDimmed ? 0.35 : 1,
                    boxShadow: isHovered
                      ? `0 0 0 2px white, 0 0 0 3.5px ${color}, 0 8px 24px ${color}55`
                      : `0 2px 8px ${color}40`,
                    transform: isHovered ? "scaleX(1.02)" : "scaleX(1)",
                    transition: "opacity 0.15s, box-shadow 0.15s, transform 0.12s",
                  }}
                  className="flex h-10 cursor-pointer items-center justify-between rounded-2xl border-0 px-3 text-white"
                >
                  <span className="truncate text-[10px] font-bold tracking-[0.12em] uppercase opacity-90">{item.name}</span>
                  <span className="ml-2 shrink-0 text-[11px] font-bold">{item.value}</span>
                </button>
              );
            })}
          </div>

          <div className="min-h-[52px] rounded-lg bg-slate-50 px-3 py-2.5">
            {hovered ? (
              <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Stage</p>
                  <p className="mt-0.5 text-[11px] font-bold leading-tight text-slate-800">{hovered.name}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Leads</p>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-800">{hovered.value}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Value</p>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-800">{(hovered.amount ?? 0) > 0 ? formatCurrency(hovered.amount ?? 0) : "—"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Share</p>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-800">{total > 0 ? `${Math.round((hovered.value / total) * 100)}%` : "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-[10px] font-medium text-slate-400">Hover a stage to see details</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function OrdersPipelineCard({ data }: { data: ChartDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card title="Production Pipeline" href="/orders" icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />} actionLabel="Orders">
      {total === 0 ? <EmptyState label="No orders yet." /> : (
        <div className="space-y-3">
          <ChartFrame className="grid grid-cols-2 gap-2">
            {data.map((item, index) => (
              <div key={item.name} className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white/80 p-3">
                <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: workflowPalette[index % workflowPalette.length] }} />
                <p className="truncate text-xs font-semibold text-slate-700">{item.name}</p>
                <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-slate-950">{item.value}</p>
              </div>
            ))}
          </ChartFrame>
          <p className="text-[11px] font-medium text-slate-500">{total} total orders across active workflow stages.</p>
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
        <div className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className={metricClass}>{total}</p>
              <p className="text-xs font-medium text-slate-500">scheduled over the next 7 days</p>
            </div>
          </div>
          <ChartFrame className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 6, left: -26, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.16)" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <Tooltip cursor={{ fill: "rgba(37,99,235,0.06)" }} formatter={(value) => [value, "Follow-ups"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} />
                <Bar dataKey="count" fill={blue} radius={[12, 12, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
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
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className={metricPanelClass}>
              <p className={metricClass}>{total}</p>
              <p className="text-[11px] font-medium text-slate-500">Total open</p>
            </div>
            <div className={`${metricPanelClass} ${overdue > 0 ? "border-red-100 bg-red-50/80" : ""}`}>
              <p className={`text-2xl font-bold tracking-[-0.04em] ${overdue > 0 ? "text-red-600" : "text-emerald-700"}`}>{overdue}</p>
              <p className={`text-[11px] font-medium ${overdue > 0 ? "text-red-500" : "text-emerald-700"}`}>Overdue</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {data.map((item) => (
              <div key={item.name} className={rowClass}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                  <StatusChip tone={item.overdue > 0 ? "red" : "slate"}>{item.open} open{item.overdue > 0 ? ` / ${item.overdue} overdue` : ""}</StatusChip>
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
  return (
    <Card title="Needs Attention" href="/tasks" icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} actionLabel="View All" className="md:col-span-2 xl:col-span-2">
      {items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="text-[13px] font-semibold text-emerald-800">No urgent items right now.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                router.push(item.href);
              }}
              className="group/row grid w-full min-w-0 gap-2 border-b border-slate-100 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 md:grid-cols-[1.3fr_auto_auto] md:items-center md:gap-4"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-950">{item.label}</span>
                <span className="block truncate text-xs text-slate-500">{item.detail}</span>
              </span>
              <StatusChip tone={item.tone}>{toneLabels[item.tone]}</StatusChip>
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
  const metrics = useMemo(() => {
    // Exclude TEST records from every metric. Test-ness is derived from the lead (is_test):
    // drop is_test leads, and drop the finances/orders whose lead_id belongs to a test lead.
    const testLeadIds = new Set(crmLeads.filter((l) => l.is_test === true).map((l) => l.id));
    const isTestRow = (r: Record<string, unknown>) => testLeadIds.has(String(r.lead_id ?? ""));
    const rLeads = crmLeads.filter((l) => l.is_test !== true);
    const rFinances = finances.filter((f) => !isTestRow(f));
    const rOrders = orders.filter((o) => !isTestRow(o));
    return {
      pipeline: pipelineOverview(rLeads),
      orderStatuses: ordersByStatus(rOrders),
      followUps: followUpLoad(rLeads, tasks, todayISO),
      taskLoad: taskLoadByFounder(tasks, todayISO),
      attention: needsAttention(rOrders, rFinances, tasks, rLeads, todayISO, sevenDaysAheadISO),
    };
  }, [crmLeads, finances, orders, sevenDaysAheadISO, tasks, todayISO]);

  // Revenue, Invoice Health, and the attention banner now live in the revamped dashboard top
  // section (DashboardTop): brand band, "Needs a founder today" strip, and the Revenue/To
  // Ship/Invoice Health cards. Everything else stays here below — nothing deleted.
  // 3-across (2 at md). The four stat/chart cards fill row 1 (3) + row 2 (1); Needs Attention
  // spans the remaining 2 columns so there's no orphan gap — and at md it becomes a full-width
  // compact band. gap matches the revamped top section (gap-3.5).
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
      <PipelineOverviewCard data={metrics.pipeline} />
      <OrdersPipelineCard data={metrics.orderStatuses} />
      <FollowUpLoadCard data={metrics.followUps} />
      <TaskLoadCard data={metrics.taskLoad} />
      <NeedsAttentionCard items={metrics.attention} />
    </div>
  );
}
