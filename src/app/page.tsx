"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Calendar,
  CheckSquare,
  Clock,
  DollarSign,
  Package,
  Search,
  Users,
} from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type StorageRecord = Record<string, unknown> & { id: string };
type SearchCategory = "Clients" | "Vendors" | "Orders" | "Finances" | "Tasks";
type SearchResult = {
  id: string;
  category: SearchCategory;
  title: string;
  context: string;
  href: string;
  searchText: string;
};
type Deadline = { title: string; date: Date; type: "Order" | "Event"; href: string };

const defaultSearchRows: StorageRecord[] = [];
const founderNames = ["Alliyah", "Hannah", "Jordan"] as const;
const taskDoneStatuses = new Set(["done", "complete", "completed"]);
const inactiveOrderStatuses = new Set(["delivered", "cancelled", "fulfilled", "completed", "done"]);
const inactiveFinanceStatuses = new Set(["draft", "cancelled"]);

function formatCurrency(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

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
  return task.completed === true || taskDoneStatuses.has(statusText(task));
}

function taskOwner(task: StorageRecord) {
  const owner = stringField(task, "owner").trim();
  return owner || stringField(task, "assignedTo").trim();
}

function numericAmount(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function invoiceTotal(record: StorageRecord) {
  return numericAmount(record.total_amount ?? record.amount);
}

function invoiceDeposit(record: StorageRecord) {
  const d = numericAmount(record.deposit_amount);
  return d > 0 ? d : invoiceTotal(record) * 0.5;
}

function parseRecordDate(rawDate: string): Date | null {
  if (!rawDate) return null;
  const date = new Date(rawDate);
  if (!Number.isNaN(date.getTime())) return date;
  const dateOnly = new Date(`${rawDate}T00:00:00`);
  return Number.isNaN(dateOnly.getTime()) ? null : dateOnly;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusBadgeClass(status: string) {
  const lower = status.toLowerCase();
  if (lower.includes("paid") || lower.includes("fulfilled") || lower.includes("complete") || lower.includes("done") || lower.includes("approved")) return "bg-emerald-100 text-emerald-700";
  if (lower.includes("review") || lower.includes("approval")) return "bg-amber-100 text-amber-700";
  if (lower.includes("progress") || lower.includes("production")) return "bg-blue-100 text-blue-700";
  if (lower.includes("hold") || lower.includes("risk")) return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export default function Home() {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const { data: clients, loading: clientsLoading, error: clientsError } = useSupabaseTable<StorageRecord>("clients", defaultSearchRows);
  const { data: vendors, loading: vendorsLoading, error: vendorsError } = useSupabaseTable<StorageRecord>("vendors", defaultSearchRows);
  const { data: orders, loading: ordersLoading, error: ordersError } = useSupabaseTable<StorageRecord>("orders", defaultSearchRows);
  const { data: finances, loading: financesLoading, error: financesError } = useSupabaseTable<StorageRecord>("finances", defaultSearchRows);
  const { data: tasks, loading: tasksLoading, error: tasksError } = useSupabaseTable<StorageRecord>("tasks", defaultSearchRows);
  const { data: crmLeads, loading: crmLoading, error: crmError } = useSupabaseTable<StorageRecord>("crm_leads", defaultSearchRows);
  const { data: calendarEvents, loading: calendarLoading, error: calendarError } = useSupabaseTable<StorageRecord>("calendar_events", defaultSearchRows);

  const loading = clientsLoading || vendorsLoading || ordersLoading || financesLoading || tasksLoading || crmLoading || calendarLoading;
  const loadError = clientsError || vendorsError || ordersError || financesError || tasksError || crmError || calendarError;

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    [],
  );
  const todayISO = useMemo(() => new Date().toISOString().split("T")[0] ?? "", []);

  // Section 1: Active Orders
  const activeOrders = useMemo(
    () => orders.filter((o) => !inactiveOrderStatuses.has(statusText(o))),
    [orders],
  );

  // Section 2: Unpaid Deposits
  const unpaidDeposits = useMemo(
    () => finances.filter((f) => f.deposit_paid !== true && !inactiveFinanceStatuses.has(statusText(f))),
    [finances],
  );

  // Section 3: Pending Approvals
  const pendingApprovals = useMemo(
    () => orders.filter((o) => {
      const s = statusText(o);
      return s.includes("review") || s.includes("approval") || s === "pending approval";
    }),
    [orders],
  );

  // Section 4: Upcoming Deadlines (next 7 days)
  const upcomingDeadlines = useMemo<Deadline[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setDate(today.getDate() + 7);
    const deadlines: Deadline[] = [];

    for (const o of orders) {
      if (inactiveOrderStatuses.has(statusText(o))) continue;
      const dateStr = stringField(o, "dueDate") || stringField(o, "estimatedDeliveryDate") || stringField(o, "final_due_date");
      if (!dateStr) continue;
      const date = parseRecordDate(dateStr);
      if (!date) continue;
      date.setHours(0, 0, 0, 0);
      if (date >= today && date <= limit) {
        deadlines.push({ title: stringField(o, "orderName", "Unnamed order"), date, type: "Order", href: `/orders/${o.id}` });
      }
    }

    for (const e of calendarEvents) {
      const dateStr = stringField(e, "date") || stringField(e, "start_date") || stringField(e, "startDate");
      if (!dateStr) continue;
      const date = parseRecordDate(dateStr);
      if (!date) continue;
      date.setHours(0, 0, 0, 0);
      if (date >= today && date <= limit) {
        deadlines.push({ title: stringField(e, "title", "Unnamed event"), date, type: "Event", href: "/calendar" });
      }
    }

    return deadlines.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [orders, calendarEvents]);

  // Section 5: Open Tasks
  const openTasks = useMemo(() => tasks.filter((t) => !isTaskDone(t)), [tasks]);
  const tasksByOwner = useMemo(
    () => founderNames.map((name) => ({
      name,
      tasks: openTasks.filter((t) => taskOwner(t).toLowerCase().includes(name.toLowerCase())),
    })),
    [openTasks],
  );

  // Section 6: Next Actions — overdue or due-today CRM follow-ups
  const nextActions = useMemo(
    () => crmLeads
      .filter((lead) => {
        const date = stringField(lead, "followUpDate") || stringField(lead, "follow_up_date");
        return date && date !== "TBD" && date <= todayISO;
      })
      .sort((a, b) => {
        const dateA = stringField(a, "followUpDate") || stringField(a, "follow_up_date");
        const dateB = stringField(b, "followUpDate") || stringField(b, "follow_up_date");
        return dateA.localeCompare(dateB);
      }),
    [crmLeads, todayISO],
  );

  // Search
  const searchData = useMemo<Record<SearchCategory, StorageRecord[]>>(
    () => ({ Clients: clients, Vendors: vendors, Orders: orders, Finances: finances, Tasks: tasks }),
    [clients, finances, orders, tasks, vendors],
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
    const empty: Record<SearchCategory, SearchResult[]> = { Clients: [], Vendors: [], Orders: [], Finances: [], Tasks: [] };
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
      Orders: searchData.Orders.map((job) => ({
        id: stringField(job, "id", `job-${stringField(job, "orderName", "unknown")}`),
        category: "Orders",
        title: stringField(job, "orderName", "Untitled order"),
        context: [stringField(job, "client"), stringField(job, "vendor"), stringField(job, "status")].filter(Boolean).join(" · "),
        href: `/orders/${stringField(job, "id")}`,
        searchText: recordText(job),
      })),
      Finances: searchData.Finances.map((invoice) => ({
        id: stringField(invoice, "id", `invoice-${stringField(invoice, "orderName", "unknown")}`),
        category: "Finances",
        title: stringField(invoice, "orderName", stringField(invoice, "client", "Untitled invoice")),
        context: [stringField(invoice, "client_name", stringField(invoice, "client")), stringField(invoice, "total_amount", stringField(invoice, "amount")), stringField(invoice, "status")].filter(Boolean).join(" · "),
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

  if (loading) return <LoadingState label="Loading dashboard..." />;

  return (
    <main className="min-h-screen text-xs text-[#0f172a] md:text-sm">
      <div className="space-y-6">
        <ErrorBanner message={loadError} />

        {/* Header */}
        <section className="-mx-4 -mt-20 overflow-hidden rounded-none bg-[#0f172a] p-4 pt-24 text-white sm:-mx-6 md:mx-0 md:mt-0 md:rounded-[2rem] md:p-6">
          <p className="text-xs font-medium text-[#94a3b8]">{todayLabel}</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-4xl">Today at Threefold</h1>
          <p className="mt-1 text-xs text-[#94a3b8]">Your operations at a glance.</p>
        </section>

        {/* Global search */}
        <section ref={searchRef} className="relative">
          <Search className="pointer-events-none absolute left-4 top-5 h-5 w-5 text-[#64748b]" aria-hidden="true" />
          <input
            className="w-full rounded-2xl border border-slate-300 bg-white py-4 pl-12 pr-4 text-xs text-slate-950 outline-none transition focus:border-[#3b82f6] focus:ring-4 focus:ring-blue-500/10 md:text-sm"
            placeholder="Search clients, vendors, orders, finances, and tasks..."
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
                          className="block min-h-11 w-full cursor-pointer px-4 py-3 text-left hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-slate-950 md:text-sm">{item.title}</p>
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

        {/* 6 operational sections */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* 1 — Active Orders */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-[#3b82f6]" aria-hidden="true" />
                <h2 className="font-semibold text-[#0f172a]">Active Orders</h2>
                {activeOrders.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">{activeOrders.length}</span>
                )}
              </div>
              <button type="button" onClick={() => router.push("/orders")} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 md:min-h-0">
                View all <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {activeOrders.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No active orders — all clear.</p>
              ) : (
                <>
                  {activeOrders.slice(0, 5).map((order) => {
                    const name = stringField(order, "orderName", "Unnamed order");
                    const client = stringField(order, "client");
                    const status = stringField(order, "status");
                    const dueStr = stringField(order, "dueDate") || stringField(order, "estimatedDeliveryDate") || stringField(order, "final_due_date");
                    const due = dueStr ? parseRecordDate(dueStr) : null;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left hover:border-slate-200 hover:bg-white"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[#0f172a]">{name}</p>
                          {client && <p className="mt-0.5 truncate text-xs text-[#64748b]">{client}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {status && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>{status}</span>}
                          {due && <span className="text-xs text-[#94a3b8]">{formatDateShort(due)}</span>}
                        </div>
                      </button>
                    );
                  })}
                  {activeOrders.length > 5 && (
                    <button type="button" onClick={() => router.push("/orders")} className="w-full pt-1 text-center text-xs text-[#64748b] hover:text-[#3b82f6]">
                      +{activeOrders.length - 5} more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 2 — Unpaid Deposits */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-[#3b82f6]" aria-hidden="true" />
                <h2 className="font-semibold text-[#0f172a]">Unpaid Deposits</h2>
                {unpaidDeposits.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">{unpaidDeposits.length}</span>
                )}
              </div>
              <button type="button" onClick={() => router.push("/finances")} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 md:min-h-0">
                View all <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {unpaidDeposits.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No unpaid deposits — all caught up.</p>
              ) : (
                <>
                  {unpaidDeposits.slice(0, 5).map((invoice) => {
                    const name = stringField(invoice, "orderName", stringField(invoice, "client", "Unnamed invoice"));
                    const client = stringField(invoice, "client", stringField(invoice, "client_name"));
                    const depositAmt = invoiceDeposit(invoice);
                    const total = invoiceTotal(invoice);
                    return (
                      <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[#0f172a]">{name}</p>
                          {client && name !== client && <p className="mt-0.5 truncate text-xs text-[#64748b]">{client}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-amber-600">{formatCurrency(depositAmt)}</p>
                          {total > 0 && <p className="text-xs text-[#94a3b8]">of {formatCurrency(total)}</p>}
                        </div>
                      </div>
                    );
                  })}
                  {unpaidDeposits.length > 5 && (
                    <button type="button" onClick={() => router.push("/finances")} className="w-full pt-1 text-center text-xs text-[#64748b] hover:text-[#3b82f6]">
                      +{unpaidDeposits.length - 5} more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 3 — Pending Approvals */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#3b82f6]" aria-hidden="true" />
                <h2 className="font-semibold text-[#0f172a]">Pending Approvals</h2>
                {pendingApprovals.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">{pendingApprovals.length}</span>
                )}
              </div>
              <button type="button" onClick={() => router.push("/orders")} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 md:min-h-0">
                View all <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {pendingApprovals.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No pending approvals.</p>
              ) : (
                <>
                  {pendingApprovals.slice(0, 5).map((order) => {
                    const name = stringField(order, "orderName", "Unnamed order");
                    const client = stringField(order, "client");
                    const status = stringField(order, "status");
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left hover:border-slate-200 hover:bg-white"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[#0f172a]">{name}</p>
                          {client && <p className="mt-0.5 truncate text-xs text-[#64748b]">{client}</p>}
                        </div>
                        {status && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{status}</span>
                        )}
                      </button>
                    );
                  })}
                  {pendingApprovals.length > 5 && (
                    <button type="button" onClick={() => router.push("/orders")} className="w-full pt-1 text-center text-xs text-[#64748b] hover:text-[#3b82f6]">
                      +{pendingApprovals.length - 5} more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 4 — Upcoming Deadlines */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[#3b82f6]" aria-hidden="true" />
                <h2 className="font-semibold text-[#0f172a]">Upcoming Deadlines</h2>
                {upcomingDeadlines.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">{upcomingDeadlines.length}</span>
                )}
              </div>
              <button type="button" onClick={() => router.push("/calendar")} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 md:min-h-0">
                Calendar <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {upcomingDeadlines.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No deadlines in the next 7 days.</p>
              ) : (
                upcomingDeadlines.slice(0, 6).map((item) => (
                  <button
                    key={`${item.type}-${item.title}-${item.date.getTime()}`}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left hover:border-slate-200 hover:bg-white"
                  >
                    <p className="min-w-0 flex-1 truncate font-semibold text-[#0f172a]">{item.title}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.type === "Order" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
                        {item.type}
                      </span>
                      <span className="text-xs text-[#64748b]">{formatDateShort(item.date)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 5 — Open Tasks */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-[#3b82f6]" aria-hidden="true" />
                <h2 className="font-semibold text-[#0f172a]">Open Tasks</h2>
                {openTasks.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">{openTasks.length}</span>
                )}
              </div>
              <button type="button" onClick={() => router.push("/tasks")} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 md:min-h-0">
                View all <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {openTasks.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No open tasks — all done.</p>
              ) : (
                tasksByOwner.map(({ name, tasks: ownerTasks }) => (
                  <div key={name}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#0f172a]">{name}</p>
                      <span className="text-xs text-[#64748b]">{ownerTasks.length} open</span>
                    </div>
                    {ownerTasks.length === 0 ? (
                      <p className="text-xs text-[#94a3b8]">Nothing open</p>
                    ) : (
                      <div className="space-y-1">
                        {ownerTasks.slice(0, 3).map((task) => {
                          const title = stringField(task, "title", stringField(task, "task", "Untitled task"));
                          const dueDateStr = stringField(task, "dueDate") || stringField(task, "due_date");
                          const due = dueDateStr ? parseRecordDate(dueDateStr) : null;
                          return (
                            <div key={task.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                              <p className="min-w-0 flex-1 truncate text-[#0f172a]">{title}</p>
                              {due && <span className="shrink-0 text-xs text-[#94a3b8]">{formatDateShort(due)}</span>}
                            </div>
                          );
                        })}
                        {ownerTasks.length > 3 && (
                          <p className="text-xs text-[#64748b]">+{ownerTasks.length - 3} more</p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 6 — Next Actions (CRM) */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#3b82f6]" aria-hidden="true" />
                <h2 className="font-semibold text-[#0f172a]">Next Actions</h2>
                {nextActions.length > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">{nextActions.length}</span>
                )}
              </div>
              <button type="button" onClick={() => router.push("/crm")} className="flex min-h-11 items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 md:min-h-0">
                Open CRM <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {nextActions.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No overdue follow-ups — pipeline is on track.</p>
              ) : (
                <>
                  {nextActions.slice(0, 5).map((lead) => {
                    const company = stringField(lead, "company", stringField(lead, "name", "Unnamed lead"));
                    const contact = stringField(lead, "contact");
                    const dateStr = stringField(lead, "followUpDate") || stringField(lead, "follow_up_date");
                    const isToday = dateStr === todayISO;
                    const isOverdue = dateStr < todayISO;
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => router.push("/crm")}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left hover:border-slate-200 hover:bg-white"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-[#0f172a]">{company}</p>
                          {contact && <p className="mt-0.5 truncate text-xs text-[#64748b]">{contact}</p>}
                        </div>
                        <span className={`shrink-0 text-xs font-medium ${isOverdue && !isToday ? "text-red-600" : "text-[#64748b]"}`}>
                          {isToday ? "Today" : dateStr}
                        </span>
                      </button>
                    );
                  })}
                  {nextActions.length > 5 && (
                    <button type="button" onClick={() => router.push("/crm")} className="w-full pt-1 text-center text-xs text-[#64748b] hover:text-[#3b82f6]">
                      +{nextActions.length - 5} more
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
