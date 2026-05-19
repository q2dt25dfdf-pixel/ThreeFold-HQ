"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Search, Trash2 } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import AddOrderModal from "@/components/orders/AddOrderModal";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type OrderStatus =
  | "Design Phase"
  | "Client Review"
  | "Design Approved"
  | "Production"
  | "Quality Check"
  | "Ready"
  | "Delivered";

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
  "Design Phase": "bg-indigo-100 text-indigo-800",
  "Client Review": "bg-purple-100 text-purple-800",
  "Design Approved": "bg-green-100 text-green-800",
  Production: "bg-blue-100 text-blue-800",
  "Quality Check": "bg-amber-100 text-amber-800",
  Ready: "bg-teal-100 text-teal-800",
  Delivered: "bg-emerald-100 text-emerald-800",
};

const statusOrder: Record<OrderStatus, number> = {
  Production: 0,
  "Quality Check": 1,
  "Client Review": 2,
  "Design Approved": 3,
  "Design Phase": 4,
  Ready: 5,
  Delivered: 6,
};

const legacyStatusMap: Record<string, OrderStatus> = {
  draft: "Design Phase",
  "in production": "Production",
  "quality control": "Quality Check",
  fulfilled: "Delivered",
};

const today = new Date(2026, 4, 13);

function normalizeOrder(order: Order): Order {
  const rawStatus = order.status ?? "Design Phase";
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

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function OrdersPage() {
  const router = useRouter();
  const { data: orders, deleteItem, loading, error, reload } = useSupabaseTable<Order>("orders", []);
  const [deletingId, setDeletingId] = useState("");
  const [filter, setFilter] = useState<OrderStatus | "All">("All");
  const [query, setQuery] = useState("");
  const [showAddOrder, setShowAddOrder] = useState(false);

  const visible = orders
    .map(normalizeOrder)
    .filter((order) => filter === "All" || order.status === filter)
    .filter((order) => Object.values(order).join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return a.estimatedDeliveryDate.localeCompare(b.estimatedDeliveryDate);
    });

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this order?")) return;
    setDeletingId(id);
    await deleteItem(id);
    setDeletingId("");
  };

  if (loading) return <LoadingState label="Loading orders..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Orders system</p>
          <h1 className="mt-3 text-base md:text-3xl font-semibold text-slate-950">Orders queue</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <label className="relative w-full md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64"
              placeholder="Search orders..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="min-h-11 w-full rounded-3xl bg-slate-900 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800 md:w-auto"
            onClick={() => setShowAddOrder(true)}
          >
            Add order
          </button>
          <select
            className="min-h-11 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm text-slate-900"
            value={filter}
            onChange={(event) => setFilter(event.target.value as OrderStatus | "All")}
          >
            <option>All</option>
            <option>Design Phase</option>
            <option>Client Review</option>
            <option>Design Approved</option>
            <option>Production</option>
            <option>Quality Check</option>
            <option>Ready</option>
            <option>Delivered</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {visible.map((order) => {
          const dueSoon = isDueSoon(order.estimatedDeliveryDate);

          return (
            <article key={order.id} className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="w-full p-4 text-left md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-950 md:text-xl">{order.orderName}</h2>
                    <p className="mt-1 text-xs text-slate-600 md:text-sm">{order.client || "No client selected"}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${statusColors[order.status]}`}>
                    {order.status}
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-xs text-slate-600 md:text-sm">
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
                    <span>Vendor</span>
                    <span className="max-w-[150px] truncate text-right font-medium text-slate-900">{order.vendor || "Not assigned"}</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
                    <span>Items</span>
                    <span className="max-w-[180px] truncate text-right font-medium text-slate-900">{order.items.length ? order.items.join(", ") : "None selected"}</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
                    <span>Quantity</span>
                    <span className="font-medium text-slate-900">{order.quantity || 0}</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
                    <span>Amount</span>
                    <span className="font-medium text-slate-900">{formatCurrency(order.amount)}</span>
                  </div>
                  <div className="flex justify-between rounded-2xl bg-slate-50 px-4 py-2">
                    <span>Est. delivery</span>
                    <span className={`inline-flex items-center gap-1 ${dueSoon ? "font-bold text-rose-600" : "font-medium text-slate-900"}`}>
                      {dueSoon && <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                      {order.estimatedDeliveryDate || "TBD"}
                    </span>
                  </div>
                  {order.notes && <div className="rounded-2xl bg-slate-50 px-4 py-2 text-xs text-slate-600">{order.notes}</div>}
                </div>
              </div>
              <div className="flex gap-3 border-t border-slate-100 px-3 pb-5 pt-4 md:px-6">
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-3xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
                  onClick={() => router.push(`/orders/${order.id}`)}
                >
                  View order
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
        })}
        {visible.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-xs font-semibold text-slate-500 md:text-sm xl:col-span-3">
            No orders match your filters.
          </div>
        )}
      </div>

      <AddOrderModal
        open={showAddOrder}
        onClose={() => setShowAddOrder(false)}
        onSaved={() => reload()}
      />
    </div>
  );
}
