"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, DollarSign, Edit2, Package, UserRound } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import ModalShell from "@/components/ModalShell";
import {
  centsToCurrency,
  handleCurrencyKeyDown,
  itemOptions,
  LookupRecord,
  recordName,
  SmartSearchInput,
  statusOptions,
} from "@/components/orders/OrderFormShared";

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
  const { data: orders, upsertItem, loading, error } = useSupabaseTable<Order>("orders", []);
  const { data: clients } = useSupabaseTable<LookupRecord>("clients", []);
  const { data: vendors } = useSupabaseTable<LookupRecord>("vendors", []);
  const order = orders.map(normalizeOrder).find((item) => item.id === params.id);
  const [orderDraft, setOrderDraft] = useState<Order | null>(null);
  const [editAmountCents, setEditAmountCents] = useState("");
  const [editQuantityStr, setEditQuantityStr] = useState("");
  const orderSave = useSaveState();
  const [formError, setFormError] = useState("");

  const openOrderEditor = () => {
    if (!order) return;
    setOrderDraft({ ...order, items: [...order.items] });
    setEditAmountCents(order.amount > 0 ? String(Math.round(order.amount * 100)) : "");
    setEditQuantityStr(order.quantity > 0 ? String(order.quantity) : "");
    setFormError("");
    orderSave.resetSaveState();
  };

  const closeOrderEditor = () => {
    setOrderDraft(null);
    setFormError("");
    orderSave.resetSaveState();
  };

  const toggleEditItem = (item: string) => {
    if (!orderDraft) return;
    const items = orderDraft.items.includes(item)
      ? orderDraft.items.filter((i) => i !== item)
      : [...orderDraft.items, item];
    setOrderDraft({ ...orderDraft, items });
  };

  const saveOrderDraft = async () => {
    if (!orderDraft) return;
    if (!orderDraft.orderName.trim()) {
      setFormError("Order name is required.");
      return;
    }
    const qty = Number(editQuantityStr);
    if (!editQuantityStr.trim() || qty <= 0) {
      setFormError("Quantity must be greater than 0.");
      return;
    }
    setFormError("");
    await orderSave.runSave(() =>
      upsertItem(
        normalizeOrder({
          ...orderDraft,
          quantity: qty,
          amount: Number(editAmountCents || "0") / 100,
        }),
      ),
    );
  };

  if (loading) return <LoadingState label="Loading order..." />;

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
      <ErrorBanner message={error} />
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={openOrderEditor}
                className="inline-flex min-h-11 items-center gap-2 rounded-3xl border border-white/15 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-white/10"
              >
                <Edit2 className="h-4 w-4" aria-hidden="true" />
                Edit order
              </button>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${statusColors[order.status]}`}>
                {order.status}
              </span>
            </div>
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

      {orderDraft && (
        <ModalShell
          title="Edit order"
          subtitle="Update this order's details, items, and production status."
          onClose={closeOrderEditor}
          maxWidth="max-w-2xl"
        >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Order name</label>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  value={orderDraft.orderName}
                  onChange={(event) => {
                    setOrderDraft({ ...orderDraft, orderName: event.target.value });
                    if (formError) setFormError("");
                  }}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <SmartSearchInput
                  label="Client"
                  value={orderDraft.client}
                  onChange={(value) => setOrderDraft({ ...orderDraft, client: value })}
                  onSelect={(record) => setOrderDraft({ ...orderDraft, client: recordName(record) })}
                  records={clients}
                  placeholder="Type to search clients..."
                />
                <SmartSearchInput
                  label="Vendor"
                  value={orderDraft.vendor}
                  onChange={(value) => setOrderDraft({ ...orderDraft, vendor: value })}
                  onSelect={(record) => setOrderDraft({ ...orderDraft, vendor: recordName(record) })}
                  records={vendors}
                  placeholder="Type to search vendors..."
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Items</label>
                <div className="flex flex-wrap gap-2">
                  {itemOptions.map((item) => {
                    const selected = orderDraft.items.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={selected}
                        className={`rounded-2xl border px-3 py-2 text-xs md:text-sm font-semibold transition ${
                          selected
                            ? "border-slate-400 bg-gray-100 text-slate-900"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-gray-100"
                        }`}
                        onClick={() => toggleEditItem(item)}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    placeholder="e.g. 48"
                    value={editQuantityStr}
                    onChange={(event) => {
                      setEditQuantityStr(event.target.value.replace(/^0+(?=\d)/, ""));
                      if (formError) setFormError("");
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Amount</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    value={centsToCurrency(editAmountCents)}
                    onKeyDown={(event) => handleCurrencyKeyDown(event, setEditAmountCents)}
                    onPaste={(event) => {
                      event.preventDefault();
                      setEditAmountCents((current) =>
                        (current + event.clipboardData.getData("text").replace(/\D/g, "")).replace(/^0+(?=\d)/, ""),
                      );
                    }}
                    onChange={() => {}}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Status</label>
                  <select
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900"
                    value={orderDraft.status}
                    onChange={(event) => setOrderDraft({ ...orderDraft, status: event.target.value as OrderStatus })}
                  >
                    {statusOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Est. delivery date</label>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                    value={orderDraft.estimatedDeliveryDate}
                    onClick={(event) => event.currentTarget.showPicker?.()}
                    onChange={(event) => setOrderDraft({ ...orderDraft, estimatedDeliveryDate: event.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
                <textarea
                  rows={4}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
                  placeholder="Order details, delivery notes, production reminders..."
                  value={orderDraft.notes}
                  onChange={(event) => setOrderDraft({ ...orderDraft, notes: event.target.value })}
                />
              </div>
            </div>

            <FieldError message={formError} />

            <div className="mt-6 flex gap-3">
              <SaveButton state={orderSave.saveState} onClick={saveOrderDraft} className="flex-1 py-3" />
              <button
                type="button"
                className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100"
                onClick={closeOrderEditor}
              >
                Cancel
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  );
}
