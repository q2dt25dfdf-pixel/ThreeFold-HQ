"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Clock, Search, Trash2 } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import AddOrderModal from "@/components/orders/AddOrderModal";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabase";

type OrderStatus =
  | "Production"
  | "Quality Check"
  | "Ready"
  | "Delivered"
  | "Cancelled";

type Order = {
  id: string;
  orderName: string;
  client: string;
  vendor: string;
  items: string[];
  quantity: number;
  amount: number;
  status: OrderStatus;
  estimatedDeliveryDate: string;
  notes: string;
};

const statusColors: Record<OrderStatus, string> = {
  Production: "bg-blue-100 text-blue-800",
  "Quality Check": "bg-amber-100 text-amber-800",
  Ready: "bg-teal-100 text-teal-800",
  Delivered: "bg-emerald-100 text-emerald-800",
  Cancelled: "bg-slate-200 text-slate-600",
};

const statusOrder: Record<OrderStatus, number> = {
  Production: 0,
  "Quality Check": 1,
  Ready: 2,
  Delivered: 3,
  Cancelled: 4,
};

const legacyStatusMap: Record<string, OrderStatus> = {
  draft: "Production",
  "in production": "Production",
  "quality control": "Quality Check",
  fulfilled: "Delivered",
  // Old design stages from before the workflow change
  "design phase": "Production",
  "client review": "Production",
  "design approved": "Production",
};

const today = new Date();

function normalizeOrder(order: Order): Order {
  const rawStatus = order.status ?? "Production";
  const status = (legacyStatusMap[rawStatus.trim().toLowerCase()] ?? rawStatus) as OrderStatus;
  return {
    ...order,
    items: Array.isArray(order.items) ? order.items : [],
    quantity: Number(order.quantity || 0),
    amount: Number(order.amount || 0),
    status,
  };
}

function isDueSoon(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const due = new Date(`${date}T00:00:00`);
  const diff = due.getTime() - today.getTime();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}

// Pure date compare — active orders whose delivery date is already in the past.
// Display-only helper; changes no data.
function isOverdue(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const due = new Date(`${date}T00:00:00`);
  return due.getTime() < today.getTime();
}

function daysUntil(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  const due = new Date(`${date}T00:00:00`);
  return Math.max(0, Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

const FILTERS: { label: string; value: OrderStatus | "All" | "Active" }[] = [
  { label: "All", value: "All" },
  { label: "Active", value: "Active" },
  { label: "Production", value: "Production" },
  { label: "Quality Check", value: "Quality Check" },
  { label: "Ready", value: "Ready" },
  { label: "Delivered", value: "Delivered" },
  { label: "Cancelled", value: "Cancelled" },
];

function OrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: orders, deleteItem, loading, error, reload } = useSupabaseTable<Order>("orders", []);
  const [deletingId, setDeletingId] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "All" | "Active">(() => {
    const p = searchParams.get("filter") ?? searchParams.get("status") ?? "";
    if (p === "Active") return "Active";
    if (p === "Production") return "Production";
    if (p === "Quality Check") return "Quality Check";
    if (p === "Ready") return "Ready";
    if (p === "Delivered") return "Delivered";
    if (p === "Cancelled") return "Cancelled";
    return "All";
  });
  const [query, setQuery] = useState("");
  const [showAddOrder, setShowAddOrder] = useState(false);

  const visible = orders
    .map(normalizeOrder)
    .filter((order) => {
      if (filter === "All") return true;
      if (filter === "Active") return order.status !== "Delivered" && order.status !== "Cancelled";
      return order.status === filter;
    })
    .filter((order) => Object.values(order).join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return a.estimatedDeliveryDate.localeCompare(b.estimatedDeliveryDate);
    });

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this order? Its linked invoice will be removed too. The lead and client are not affected.")) return;
    setDeletingId(id);
    // Remove the order AND its own invoice so no orphaned invoice is left behind (an
    // orphaned finances row keeps inflating totals). The finance/invoice row points at
    // this order via data.order_id, and its id is `invoice-{orderId}`; match both. Also
    // remove the deposit_request tied to THIS order (by the order's own ref, then by
    // order_id) so its financial trail goes cleanly. We do NOT touch the lead or the
    // shared client, and we scope strictly to this order (never by lead_id) so an
    // order-level delete can never take out a real lead's whole chain.
    const order = orders.find((o) => o.id === id) as (Order & { deposit_request_id?: string }) | undefined;
    await Promise.all([
      supabase.from("finances").delete().eq("data->>order_id", id),
      supabase.from("finances").delete().eq("id", `invoice-${id}`),
      supabase.from("deposit_requests").delete().eq("data->>order_id", id),
      ...(order?.deposit_request_id
        ? [supabase.from("deposit_requests").delete().eq("id", order.deposit_request_id)]
        : []),
    ]);
    await deleteItem(id);
    setDeletingId("");
  };

  const allNormalized = orders.map(normalizeOrder);

  // Hero + needs-attention derivations — all pure, from existing fields. No new data/query.
  const activeOrders   = allNormalized.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled");
  const activeCount    = activeOrders.length;
  const activeValue    = activeOrders.reduce((sum, o) => sum + o.amount, 0); // NEW reduce over `amount`
  const deliveredCount = allNormalized.filter((o) => o.status === "Delivered").length;

  const overdueOrders = activeOrders.filter((o) => isOverdue(o.estimatedDeliveryDate));
  const dueSoonOrders = activeOrders.filter((o) => !isOverdue(o.estimatedDeliveryDate) && isDueSoon(o.estimatedDeliveryDate));
  const attentionOrders = [
    ...overdueOrders.map((order) => ({ order, kind: "overdue" as const })),
    ...dueSoonOrders.map((order) => ({ order, kind: "duesoon" as const })),
  ];
  const attentionCount = attentionOrders.length;

  // Calm detail respects the filter/search/sort pipeline, then splits done work to the bottom.
  const visibleActive = visible.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled");
  const visibleDone   = visible.filter((o) => o.status === "Delivered" || o.status === "Cancelled");

  const renderOrderCard = (order: Order, muted = false) => {
    const overdue = isOverdue(order.estimatedDeliveryDate);
    const dueSoon = isDueSoon(order.estimatedDeliveryDate);
    const dateAlert = overdue || dueSoon;

    return (
      <article
        key={order.id}
        className={`overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md ${muted ? "opacity-70" : ""}`}
      >
        <div className="w-full p-4 text-left md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-950 md:text-lg">{order.orderName}</h3>
              <p className="mt-1 text-[11px] text-slate-500 md:text-xs">{order.client || "No client selected"}</p>
            </div>
            <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${statusColors[order.status]}`}>
              {order.status}
            </span>
          </div>
          <div className="mt-4 space-y-1.5 text-[11px] text-slate-500 md:text-xs">
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
              <span>Vendor</span>
              <span className="max-w-[150px] truncate text-right font-medium text-slate-800">{order.vendor || "Not assigned"}</span>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
              <span>Items</span>
              <span className="max-w-[180px] truncate text-right font-medium text-slate-800">{order.items.length ? order.items.join(", ") : "None selected"}</span>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
              <span>Quantity</span>
              <span className="font-medium text-slate-800">{order.quantity || 0}</span>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
              <span>Amount</span>
              <span className="font-medium text-slate-800">{formatCurrency(order.amount)}</span>
            </div>
            <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
              <span>Est. delivery</span>
              <span className={`inline-flex items-center gap-1 ${dateAlert ? "font-bold text-rose-600" : "font-medium text-slate-800"}`}>
                {dateAlert && <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                {order.estimatedDeliveryDate || "TBD"}
              </span>
            </div>
            {order.notes && <div className="rounded-2xl bg-slate-50 px-4 py-2 text-[11px] text-slate-500">{order.notes}</div>}
          </div>
        </div>
        <div className="flex gap-3 border-t border-slate-100 px-3 pb-5 pt-4 md:px-6">
          <button
            type="button"
            className="min-h-11 flex-1 rounded-3xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
            onClick={() => router.push(`/orders/${order.id}`)}
          >
            View order →
          </button>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 md:h-10 md:w-10"
            disabled={deletingId === order.id}
            aria-label={`Delete ${order.orderName}`}
            onClick={() => handleDelete(order.id)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </article>
    );
  };

  if (loading) return <LoadingState label="Loading orders..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />

      {/* ── Header + search + add ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-600 md:text-sm">Orders system</p>
          <h1 className="mt-3 text-base font-semibold text-slate-950 md:text-3xl">Orders queue</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <label className="relative w-full sm:w-64 md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs text-slate-900 outline-none focus:border-slate-400 sm:w-64 md:text-sm"
              placeholder="Search orders..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="min-h-11 w-full rounded-3xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:w-auto md:text-sm"
            onClick={() => setShowAddOrder(true)}
          >
            Add order
          </button>
        </div>
      </div>

      {/* ── Hero row: In Production (count-led) + Need Attention + Delivered ────── */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        {/* HERO — In Production. Count is the headline; value in flight is the pill. */}
        <div className="rounded-[2rem] bg-slate-50 p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">In Production</p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{activeCount}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">active order{activeCount !== 1 ? "s" : ""} in the queue</p>
          <span className="mt-3 inline-block rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
            {formatCurrency(activeValue)} in flight
          </span>
        </div>
        {/* Need Attention — amber when > 0 */}
        <div className={`rounded-[2rem] p-5 shadow-sm md:p-6 ${attentionCount > 0 ? "bg-amber-50 ring-1 ring-amber-100" : "bg-white ring-1 ring-slate-100"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Need Attention</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight md:text-3xl ${attentionCount > 0 ? "text-amber-600" : "text-slate-400"}`}>{attentionCount}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">overdue or due within 7 days</p>
          {overdueOrders.length > 0 && (
            <span className="mt-3 inline-block rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-700">{overdueOrders.length} overdue</span>
          )}
        </div>
        {/* Delivered */}
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Delivered</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{deliveredCount}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">completed all-time</p>
        </div>
      </section>

      {/* ── Needs Attention band — each row opens the order ───────────────────── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Needs Attention</h2>
        {attentionOrders.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
            <p className="text-xs font-semibold text-emerald-800">All caught up — no orders need attention.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attentionOrders.map(({ order, kind }) => {
              const days = daysUntil(order.estimatedDeliveryDate);
              return (
                <div
                  key={order.id}
                  className={`flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${kind === "overdue" ? "bg-rose-50" : "bg-amber-50"}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">{order.orderName}</p>
                    <p className="truncate text-[10px] text-slate-500">{order.client ? `${order.client} · ` : ""}{order.status}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${kind === "overdue" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {kind === "overdue" ? `Overdue ${order.estimatedDeliveryDate}` : `Due in ${days} day${days !== 1 ? "s" : ""}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => router.push(`/orders/${order.id}`)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      View order
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Calm detail — filter chips + order cards, done work collapsed below ── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold text-slate-950 md:text-lg">All orders</h2>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition md:text-xs ${
                  filter === f.value ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visibleActive.length === 0 && visibleDone.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-xs font-semibold text-slate-500 md:text-sm">
            No orders match your filters.
          </div>
        ) : (
          <>
            {visibleActive.length > 0 && (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {visibleActive.map((order) => renderOrderCard(order, false))}
              </div>
            )}

            {visibleDone.length > 0 &&
              (filter === "Delivered" || filter === "Cancelled" ? (
                <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {visibleDone.map((order) => renderOrderCard(order, true))}
                </div>
              ) : (
                <details className="group mt-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 md:text-sm">
                    <span>Delivered &amp; cancelled ({visibleDone.length})</span>
                    <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {visibleDone.map((order) => renderOrderCard(order, true))}
                  </div>
                </details>
              ))}
          </>
        )}
      </section>

      <AddOrderModal
        open={showAddOrder}
        onClose={() => setShowAddOrder(false)}
        onSaved={() => reload()}
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading orders..." />}>
      <OrdersContent />
    </Suspense>
  );
}
