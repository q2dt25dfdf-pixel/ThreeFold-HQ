"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Factory,
  LayoutDashboard,
  ListChecks,
  Search,
  Users,
} from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { pipelineStages } from "@/components/crm/types";

type StorageRecord = Record<string, unknown> & { id: string };

type SearchCategory = "Clients" | "Vendors" | "Production" | "Finances" | "Tasks";

type SearchResult = {
  id: string;
  category: SearchCategory;
  title: string;
  context: string;
  href: string;
  searchText: string;
};

const focusItems = [
  {
    label: "POPS 2026 Collection",
    meta: "Production",
    status: "In production",
  },
  {
    label: "Bay Area DSP outreach",
    meta: "CRM",
    status: "Contact next leads",
  },
  {
    label: "Vendor confirmation",
    meta: "Operations",
    status: "Awaiting decision",
  },
];

const formatCurrency = (value: number) => `$${value.toLocaleString()}`;
const defaultSearchRows: StorageRecord[] = [];
const founders = ["Alliyah", "Hannah", "Jordan"] as const;
const completedStatuses = new Set(["done", "complete", "completed", "fulfilled"]);
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function recordText(record: StorageRecord): string {
  return Object.values(record).map(valueText).join(" ");
}

function stringField(record: StorageRecord, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function statusText(record: StorageRecord) {
  return stringField(record, "status").trim().toLowerCase();
}

function isTaskDone(task: StorageRecord) {
  return task.completed === true || completedStatuses.has(statusText(task));
}

function taskOwner(task: StorageRecord) {
  return stringField(task, "owner", stringField(task, "assignedTo")).trim();
}

function isProductionActive(job: StorageRecord) {
  return !completedStatuses.has(statusText(job));
}

function numericAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const amount = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function monthIndex(record: StorageRecord) {
  const rawDate = stringField(record, "createdAt", stringField(record, "created_at", stringField(record, "dueDate", stringField(record, "followUpDate"))));
  const date = new Date(`${rawDate}T00:00:00`);
  return Number.isNaN(date.getTime()) ? -1 : date.getMonth();
}

export default function Home() {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: clients } = useSupabaseTable<StorageRecord>("clients", defaultSearchRows);
  const { data: vendors } = useSupabaseTable<StorageRecord>("vendors", defaultSearchRows);
  const { data: production } = useSupabaseTable<StorageRecord>("production", defaultSearchRows);
  const { data: finances } = useSupabaseTable<StorageRecord>("finances", defaultSearchRows);
  const { data: tasks } = useSupabaseTable<StorageRecord>("tasks", defaultSearchRows);
  const { data: crmLeads } = useSupabaseTable<StorageRecord>("crm_leads", defaultSearchRows);

  const openTasks = useMemo(() => tasks.filter((task) => !isTaskDone(task)), [tasks]);
  const doneTasks = useMemo(() => tasks.filter(isTaskDone), [tasks]);
  const activeProduction = useMemo(() => production.filter(isProductionActive), [production]);
  const collectedRevenue = useMemo(
    () => finances.filter((invoice) => statusText(invoice) === "paid").reduce((sum, invoice) => sum + numericAmount(invoice.amount), 0),
    [finances],
  );
  const pipelineValue = useMemo(
    () => crmLeads.reduce((sum, lead) => sum + numericAmount(lead.value), 0),
    [crmLeads],
  );

  const heroTrend = useMemo(
    () =>
      monthLabels.map((month, index) => ({
        month,
        value:
          finances.filter((invoice) => monthIndex(invoice) <= index && statusText(invoice) === "paid").reduce((sum, invoice) => sum + numericAmount(invoice.amount), 0) +
          crmLeads.filter((lead) => monthIndex(lead) <= index).reduce((sum, lead) => sum + numericAmount(lead.value), 0),
      })),
    [crmLeads, finances],
  );

  const revenueData = useMemo(
    () =>
      monthLabels.slice(0, 6).map((month, index) => ({
        month,
        collected: finances.filter((invoice) => monthIndex(invoice) === index && statusText(invoice) === "paid").reduce((sum, invoice) => sum + numericAmount(invoice.amount), 0),
        pipeline: crmLeads.filter((lead) => monthIndex(lead) === index).reduce((sum, lead) => sum + numericAmount(lead.value), 0),
      })),
    [crmLeads, finances],
  );

  const pipelineData = useMemo(() => {
    const counts = crmLeads.reduce<Record<string, number>>((acc, lead) => {
      const stage = stringField(lead, "stage", "Unknown");
      acc[stage] = (acc[stage] ?? 0) + 1;
      return acc;
    }, {});
    const knownStages = pipelineStages.map((stage) => ({ stage, count: counts[stage] ?? 0 }));
    const extraStages = Object.entries(counts)
      .filter(([stage]) => !(pipelineStages as readonly string[]).includes(stage))
      .map(([stage, count]) => ({ stage, count }));
    return [...knownStages, ...extraStages];
  }, [crmLeads]);

  const taskData = useMemo(
    () =>
      founders.map((name) => ({
        name,
        open: openTasks.filter((task) => taskOwner(task) === name).length,
        complete: doneTasks.filter((task) => taskOwner(task) === name).length,
      })),
    [doneTasks, openTasks],
  );

  const workloadData = useMemo(
    () => [
      { name: "Open", value: openTasks.length, color: "#3b82f6" },
      { name: "Done", value: doneTasks.length, color: "#10b981" },
    ],
    [doneTasks.length, openTasks.length],
  );

  const metricCards = useMemo(
    () => [
      {
        label: "Clients",
        value: String(clients.length),
        detail: "Active accounts",
        href: "/clients",
        icon: Users,
      },
      {
        label: "CRM",
        value: String(crmLeads.length),
        detail: "Leads across pipeline",
        href: "/crm",
        icon: Building2,
      },
      {
        label: "Production",
        value: String(activeProduction.length),
        detail: "Active jobs",
        href: "/production",
        icon: Factory,
      },
      {
        label: "Tasks",
        value: String(openTasks.length),
        detail: "Open founder actions",
        href: "/tasks",
        icon: ListChecks,
      },
    ],
    [activeProduction.length, clients.length, crmLeads.length, openTasks.length],
  );

  const searchData = useMemo<Record<SearchCategory, StorageRecord[]>>(
    () => ({
      Clients: clients,
      Vendors: vendors,
      Production: production,
      Finances: finances,
      Tasks: tasks,
    }),
    [clients, finances, production, tasks, vendors],
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSearchOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const groupedResults = useMemo(() => {
    const query = globalQuery.trim().toLowerCase();
    const empty: Record<SearchCategory, SearchResult[]> = {
      Clients: [],
      Vendors: [],
      Production: [],
      Finances: [],
      Tasks: [],
    };
    if (query.length < 2) return empty;

    const results: Record<SearchCategory, SearchResult[]> = {
      Clients: searchData.Clients.map((client) => ({
        id: stringField(client, "id", `client-${stringField(client, "name", "unknown")}`),
        category: "Clients",
        title: stringField(client, "name", "Untitled client"),
        context: [stringField(client, "industry"), stringField(client, "contact"), stringField(client, "status")].filter(Boolean).join(" · "),
        href: `/clients/${stringField(client, "id")}`,
        searchText: recordText(client),
      })),
      Vendors: searchData.Vendors.map((vendor) => ({
        id: stringField(vendor, "id", `vendor-${stringField(vendor, "name", "unknown")}`),
        category: "Vendors",
        title: stringField(vendor, "name", "Untitled vendor"),
        context: [stringField(vendor, "type"), stringField(vendor, "contact"), stringField(vendor, "status")].filter(Boolean).join(" · "),
        href: `/vendors/${stringField(vendor, "id")}`,
        searchText: recordText(vendor),
      })),
      Production: searchData.Production.map((job) => ({
        id: stringField(job, "id", `job-${stringField(job, "orderName", "unknown")}`),
        category: "Production",
        title: stringField(job, "orderName", "Untitled production job"),
        context: [stringField(job, "client"), stringField(job, "vendor"), stringField(job, "status")].filter(Boolean).join(" · "),
        href: `/production/${stringField(job, "id")}`,
        searchText: recordText(job),
      })),
      Finances: searchData.Finances.map((invoice) => ({
        id: stringField(invoice, "id", `invoice-${stringField(invoice, "orderName", "unknown")}`),
        category: "Finances",
        title: stringField(invoice, "orderName", stringField(invoice, "client", "Untitled invoice")),
        context: [stringField(invoice, "client"), stringField(invoice, "amount"), stringField(invoice, "status")].filter(Boolean).join(" · "),
        href: "/finances",
        searchText: recordText(invoice),
      })),
      Tasks: searchData.Tasks.map((task) => ({
        id: stringField(task, "id", `task-${stringField(task, "title", "unknown")}`),
        category: "Tasks",
        title: stringField(task, "title", stringField(task, "task", "Untitled task")),
        context: [stringField(task, "owner"), stringField(task, "status"), stringField(task, "priority")].filter(Boolean).join(" · "),
        href: "/tasks",
        searchText: recordText(task),
      })),
    };

    return Object.fromEntries(
      Object.entries(results).map(([category, items]) => [
        category,
        items.filter((item) => item.searchText.toLowerCase().includes(query)),
      ]),
    ) as Record<SearchCategory, SearchResult[]>;
  }, [globalQuery, searchData]);

  const totalResults = Object.values(groupedResults).reduce((sum, items) => sum + items.length, 0);

  return (
    <main className="min-h-screen bg-gray-100 text-[#0f172a]">
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[8px] bg-[#0f172a] text-white">
          <div className="grid min-h-[260px] gap-8 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr] lg:p-8">
            <div className="flex flex-col justify-between gap-10">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#cbd5e1]">
                  <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-8 text-sm font-medium text-[#e2e8f0]">Operations dashboard</p>
                <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white md:text-5xl">Threefold HQ</h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#e2e8f0]">
                  A premium command center for revenue, client work, production progress, and founder execution.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Revenue collected", value: formatCurrency(collectedRevenue) },
                  { label: "Pipeline value", value: formatCurrency(pipelineValue) },
                  { label: "Active clients", value: String(clients.length) },
                ].map((item) => (
                  <div key={item.label} className="rounded-[8px] border border-[#cbd5e1] p-4 shadow-md">
                    <p className="text-xs font-medium text-[#e2e8f0]">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[220px]">
              <div className="absolute right-0 top-0 flex items-center gap-2 rounded-[8px] border border-[#cbd5e1] px-3 py-2 text-xs font-medium text-[#e2e8f0]">
                <ArrowUpRight className="h-4 w-4 text-[#10b981]" aria-hidden="true" />
                Operational trend
              </div>
              <div className="h-full pt-14">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={heroTrend} margin={{ top: 16, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="heroTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }}
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        color: "#0f172a",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#heroTrendFill)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        <section ref={searchRef} className="relative">
          <Search className="pointer-events-none absolute left-4 top-5 h-5 w-5 text-[#64748b]" aria-hidden="true" />
          <input
            className="w-full rounded-2xl border border-slate-300 bg-white py-4 pl-12 pr-4 text-sm text-slate-950 outline-none transition focus:border-[#3b82f6] focus:ring-4 focus:ring-blue-500/10"
            placeholder="Search clients, vendors, production, finances, and tasks..."
            value={globalQuery}
            onChange={(event) => {
              setGlobalQuery(event.target.value);
              setSearchOpen(event.target.value.trim().length >= 2);
            }}
            onFocus={() => {
              setSearchOpen(globalQuery.trim().length >= 2);
            }}
          />

          {searchOpen && globalQuery.trim().length >= 2 && (
            <div className="absolute left-0 right-0 z-30 mt-2 max-h-96 overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-xl">
              {totalResults === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-600">No results found</div>
              ) : (
                (Object.keys(groupedResults) as SearchCategory[]).map((category) => {
                  const items = groupedResults[category];
                  if (!items.length) return null;
                  return (
                    <div key={category}>
                      <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-widest text-slate-700">{category}</p>
                      {items.map((item) => (
                        <button
                          key={`${item.category}-${item.id}`}
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setGlobalQuery("");
                            router.push(item.href);
                          }}
                          className="block min-h-11 w-full cursor-pointer px-4 py-3 text-left hover:bg-gray-100"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{item.category}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{item.context || "No additional context"}</p>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                type="button"
                onClick={() => router.push(card.href)}
                className="group min-h-11 rounded-[8px] border border-[#cbd5e1] bg-[#ffffff] p-5 text-left shadow-md transition hover:border-[#3b82f6] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#cbd5e1] text-[#3b82f6]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#64748b] transition group-hover:translate-x-0.5 group-hover:text-[#3b82f6]" aria-hidden="true" />
                </div>
                <p className="mt-6 text-sm font-medium text-[#64748b]">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-normal text-[#0f172a]">{card.value}</p>
                <p className="mt-2 text-sm text-[#64748b]">{card.detail}</p>
              </button>
            );
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-[8px] border border-[#cbd5e1] bg-[#ffffff] p-6 shadow-md">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">Revenue and pipeline</h2>
                <p className="mt-1 text-sm text-[#64748b]">Collected revenue against expected sales motion.</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-2 text-[#64748b]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
                  Collected
                </span>
                <span className="flex items-center gap-2 text-[#64748b]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
                  Pipeline
                </span>
              </div>
            </div>

            <div className="mt-6 h-[310px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pipelineFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={formatCurrency} />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value ?? 0))}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      color: "#0f172a",
                    }}
                  />
                  <Area type="monotone" dataKey="pipeline" stroke="#3b82f6" strokeWidth={2} fill="url(#pipelineFill)" dot={false} />
                  <Area type="monotone" dataKey="collected" stroke="#10b981" strokeWidth={2} fill="url(#collectedFill)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[8px] border border-[#cbd5e1] bg-[#ffffff] p-6 shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">Workload</h2>
                <p className="mt-1 text-sm text-[#64748b]">Open versus complete.</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-[#10b981]" aria-hidden="true" />
            </div>

            <div className="mt-6 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={workloadData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3}>
                    {workloadData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      color: "#0f172a",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {workloadData.map((item) => (
                <div key={item.name} className="rounded-[8px] border border-[#cbd5e1] p-4 shadow-md">
                  <p className="text-sm text-[#64748b]">{item.name}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[8px] border border-[#cbd5e1] bg-[#ffffff] p-6 shadow-md xl:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">Pipeline stages</h2>
                <p className="mt-1 text-sm text-[#64748b]">Lead flow from first contact through production.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/crm")}
                className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-[#cbd5e1] bg-[#ffffff] px-3 py-2 text-sm font-medium text-[#0f172a] transition hover:border-[#3b82f6]"
              >
                Open CRM
                <ArrowUpRight className="h-4 w-4 text-[#3b82f6]" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      color: "#0f172a",
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[8px] border border-[#cbd5e1] bg-[#ffffff] p-6 shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">Founder tasks</h2>
                <p className="mt-1 text-sm text-[#64748b]">Open work by owner.</p>
              </div>
              <button
                type="button"
                aria-label="Open tasks"
                onClick={() => router.push("/tasks")}
                className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#cbd5e1] text-[#0f172a] transition hover:border-[#3b82f6] hover:text-[#3b82f6] md:h-9 md:w-9"
              >
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {taskData.map((person) => (
                <div key={person.name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#0f172a]">{person.name}</span>
                    <span className="text-[#64748b]">{person.open} open</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-[8px] bg-[#e2e8f0]">
                    <div className="h-full rounded-[8px] bg-[#3b82f6]" style={{ width: `${Math.max(12, person.open * 18)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[8px] border border-[#cbd5e1] bg-[#ffffff] p-6 shadow-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a]">Operational focus</h2>
              <p className="mt-1 text-sm text-[#64748b]">The highest-signal work for this week.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/production")}
              className="inline-flex min-h-11 items-center gap-2 rounded-[8px] bg-[#0f172a] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0f172a]"
            >
              Production queue
              <Factory className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {focusItems.map((item) => (
              <div key={item.label} className="rounded-[8px] border border-[#cbd5e1] p-4 shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[#64748b]">{item.meta}</p>
                  <span className="rounded-[8px] border border-[#cbd5e1] px-2.5 py-1 text-xs font-medium text-[#0f172a]">
                    {item.status}
                  </span>
                </div>
                <p className="mt-4 text-base font-semibold text-[#0f172a]">{item.label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
