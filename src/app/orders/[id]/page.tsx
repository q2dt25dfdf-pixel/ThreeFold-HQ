"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, DollarSign, Package, UserRound } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type OrderStatus = "Draft" | "In Production" | "Quality Control" | "Fulfilled";

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
  Draft: "bg-slate-100 text-slate-700",
  "In Production": "bg-blue-100 text-blue-800",
  "Quality Control": "bg-amber-100 text-amber-800",
  Fulfilled: "bg-emerald-100 text-emerald-800",
};

function formatCurrency(amount: number) {
  return Number(amount || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    items: Array.isArray(order.items) ? order.items : [],
    quantity: Number(order.quantity || 0),
    amount: Number(order.amount || 0),
    status: order.status ?? "Draft",
  };
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { data: orders, loading } = useSupabaseTable<Order>("orders", []);
  const order = orders.map(normalizeOrder).find((item) => item.id === params.id);

  if (loading) return <div className="p-2 md:p-8 text-slate-500">Loading...</div>;

  if (!order) {
    return (
      <div className="space-y-6 text-xs md:text-sm">
        <button type="button" onClick={() => router.push("/orders")} className="inline-flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Orders
        </button>
        <div className="rounded-[2rem] border border-slate-300 bg-white p-2 shadow-md md:p-8">
          <h1 className="text-base font-semibold text-slate-950 md:text-2xl">Order not found</h1>
          <p className="mt-2 text-xs text-slate-500 md:text-sm">This order may have been deleted or is not available yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <button type="button" onClick={() => router.push("/orders")} className="inline-flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-600 hover:text-slate-950">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Orders
      </button>

      <section className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-md">
        <div className="bg-slate-950 p-4 text-white md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Order detail</p>
              <h1 className="mt-3 text-base font-semibold md:text-3xl">{order.orderName}</h1>
              <p className="mt-2 text-xs text-slate-300 md:text-sm">{order.client || "No client selected"}</p>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${statusColors[order.status]}`}>
              {order.status}
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-2 md:grid-cols-2 md:p-8">
          {[
            { label: "Vendor", value: order.vendor || "Not assigned", icon: UserRound },
            { label: "Items", value: order.items.length ? order.items.join(", ") : "None selected", icon: Package },
            { label: "Quantity", value: String(order.quantity || 0), icon: Package },
            { label: "Amount", value: formatCurrency(order.amount), icon: DollarSign },
            { label: "Est. delivery", value: order.estimatedDeliveryDate || "TBD", icon: CalendarDays },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.label} className="rounded-2xl bg-gray-100 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950 md:text-base">{item.value}</p>
              </div>
            );
          })}
          <div className="rounded-2xl bg-gray-100 px-4 py-3 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Notes</p>
            <p className="mt-2 text-xs text-slate-700 md:text-sm">{order.notes || "No notes yet."}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
