"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ClipboardCopy, Edit2 } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import ModalShell from "@/components/ModalShell";
import {
  centsToCurrency,
  handleCurrencyKeyDown,
  itemOptions,
  type LookupRecord,
  recordName,
  SmartSearchInput,
} from "@/components/orders/OrderFormShared";

type Order = {
  id: string;
  orderName: string;
  client: string;
  vendor: string;
  items: string[];
  quantity: number;
  amount: number;
  status: string;
  estimatedDeliveryDate: string;
  notes: string;
  owner?: string;
  nextAction?: string;
  internalNotes?: string;
};

type Invoice = {
  id: string;
  client: string;
  orderName: string;
  order_id?: string;
  order_name?: string;
  total_amount: string | number;
  deposit_amount: string | number;
  deposit_paid: boolean;
  balance_remaining: string | number;
  final_paid: boolean;
  final_due_date?: string;
  status: string;
  notes: string;
};

type CommButton = {
  key: string;
  label: string;
  message: string;
  disabled: boolean;
  disabledReason: string;
};

const TIMELINE_STAGES = [
  "Inquiry",
  "Quote Sent",
  "Deposit Paid",
  "Design Phase",
  "Client Review",
  "Approved",
  "Production",
  "Quality Check",
  "Ready",
  "Delivered",
] as const;

// All status values usable in the edit modal dropdown
const ALL_STATUS_OPTIONS = [
  "Draft",
  "Quote Sent",
  "Deposit Paid",
  "Design Phase",
  "Client Review",
  "Approved",
  "In Production",
  "Quality Control",
  "Ready",
  "Fulfilled",
];

function statusToStageIndex(status: string): number {
  const s = status.trim().toLowerCase();
  const map: Record<string, number> = {
    draft: 0, inquiry: 0,
    "quote sent": 1,
    "deposit paid": 2,
    "design phase": 3,
    "client review": 4,
    approved: 5,
    "in production": 6, production: 6,
    "quality control": 7, "quality check": 7,
    ready: 8,
    fulfilled: 9, delivered: 9,
  };
  return map[s] ?? 0;
}

function stageToStatus(stage: string): string {
  const map: Record<string, string> = {
    "Inquiry": "Draft",
    "Quote Sent": "Quote Sent",
    "Deposit Paid": "Deposit Paid",
    "Design Phase": "Design Phase",
    "Client Review": "Client Review",
    "Approved": "Approved",
    "Production": "In Production",
    "Quality Check": "Quality Control",
    "Ready": "Ready",
    "Delivered": "Fulfilled",
  };
  return map[stage] ?? stage;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "fulfilled" || s === "delivered" || s === "ready") return "bg-emerald-100 text-emerald-800";
  if (s.includes("production")) return "bg-blue-100 text-blue-800";
  if (s.includes("quality") || s.includes("check")) return "bg-amber-100 text-amber-800";
  if (s === "approved") return "bg-green-100 text-green-800";
  if (s.includes("review")) return "bg-purple-100 text-purple-800";
  if (s.includes("design")) return "bg-indigo-100 text-indigo-800";
  if (s.includes("quote") || s.includes("sent")) return "bg-cyan-100 text-cyan-800";
  if (s.includes("deposit") || s.includes("paid")) return "bg-teal-100 text-teal-800";
  return "bg-slate-100 text-slate-700";
}

function invoiceStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "paid in full" || s.includes("paid")) return "bg-emerald-100 text-emerald-700";
  if (s === "overdue") return "bg-red-100 text-red-700";
  if (s.includes("due")) return "bg-amber-100 text-amber-700";
  if (s === "in progress") return "bg-blue-100 text-blue-700";
  if (s === "cancelled") return "bg-slate-100 text-slate-500";
  return "bg-slate-100 text-slate-600";
}

function formatCurrency(value: string | number): string {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) : "$0.00";
}

function normalizeOrder(order: Order): Order {
  return {
    ...order,
    items: Array.isArray(order.items) ? order.items : [],
    quantity: Number(order.quantity || 0),
    amount: Number(order.amount || 0),
    status: order.status ?? "Draft",
    nextAction: order.nextAction ?? "",
    internalNotes: order.internalNotes ?? "",
    owner: order.owner ?? "",
  };
}

function numericValue(v: string | number): number {
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function buildCommButtons(order: Order): CommButton[] {
  const hasBase = Boolean(order.client?.trim() && order.orderName?.trim());
  const hasItems = Boolean(order.quantity && order.items?.length);
  const client = order.client || "[client]";
  const name = order.orderName || "[order]";
  const qty = order.quantity ? String(order.quantity) : "";
  const items = order.items?.join(", ") || "";
  const due = order.estimatedDeliveryDate || "TBD";

  return [
    {
      key: "quote-followup",
      label: "Copy Quote Follow-Up",
      message: `Hi ${client},\n\nJust following up on the quote we sent for ${name}. Please let us know if you have any questions or are ready to move forward — we'd love to get this started for you!\n\nBest,\nThreefold`,
      disabled: !hasBase,
      disabledReason: "Missing client or order name",
    },
    {
      key: "deposit-reminder",
      label: "Copy Deposit Reminder",
      message: `Hi ${client},\n\nA quick reminder that the deposit for your ${name} order is due to lock in your production slot. Once received, we'll get started right away!\n\nBest,\nThreefold`,
      disabled: !hasBase,
      disabledReason: "Missing client or order name",
    },
    {
      key: "design-approval",
      label: "Copy Design Approval Request",
      message: `Hi ${client},\n\nYour design for ${name} is ready for review! Please take a look and let us know if you'd like any changes, or reply with your approval and we'll move to production.\n\nBest,\nThreefold`,
      disabled: !hasBase,
      disabledReason: "Missing client or order name",
    },
    {
      key: "production-update",
      label: "Copy Production Update",
      message: `Hi ${client},\n\nGreat news — your ${name} order${qty ? ` (${qty}${items ? " " + items : ""})` : ""} is currently in production. Estimated delivery: ${due}. We'll keep you posted!\n\nBest,\nThreefold`,
      disabled: !hasBase || !hasItems,
      disabledReason: !hasBase ? "Missing client or order name" : "Missing quantity or items",
    },
    {
      key: "delivery-confirm",
      label: "Copy Delivery Confirmation",
      message: `Hi ${client},\n\nYour ${name} order has been delivered! We hope everything looks great. Please reach out if there's anything we can help with.\n\nThank you for working with Threefold!`,
      disabled: !hasBase,
      disabledReason: "Missing client or order name",
    },
    {
      key: "reorder-checkin",
      label: "Copy Reorder Check-In",
      message: `Hi ${client},\n\nWe loved working on ${name} with you! Whenever you're ready for your next project, just let us know and we'll get a quote over right away.\n\nBest,\nThreefold`,
      disabled: !hasBase,
      disabledReason: "Missing client or order name",
    },
  ];
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const { data: orders, upsertItem, loading, error } = useSupabaseTable<Order>("orders", []);
  const { data: clients } = useSupabaseTable<LookupRecord>("clients", []);
  const { data: vendors } = useSupabaseTable<LookupRecord>("vendors", []);
  const { data: invoices } = useSupabaseTable<Invoice>("finances", []);

  const order = orders.map(normalizeOrder).find((o) => o.id === params.id);

  const invoice = invoices.find((inv) => {
    if (!order) return false;
    const byId = inv.order_id && inv.order_id === order.id;
    const byName = (inv.order_name ?? inv.orderName ?? "").toLowerCase() === order.orderName.toLowerCase();
    return byId || byName;
  });

  // Edit modal state (preserved exactly)
  const [orderDraft, setOrderDraft] = useState<Order | null>(null);
  const [editAmountCents, setEditAmountCents] = useState("");
  const [editQuantityStr, setEditQuantityStr] = useState("");
  const [formError, setFormError] = useState("");
  const orderSave = useSaveState();

  // Next Action
  const [nextAction, setNextAction] = useState("");
  const nextActionSave = useSaveState();

  // Internal Notes
  const [internalNotes, setInternalNotes] = useState("");
  const notesSave = useSaveState();

  // Timeline
  const [stageSaving, setStageSaving] = useState(false);

  // Clipboard
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Initialize local text fields from order once
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (order && !initialized) {
      setNextAction(order.nextAction ?? "");
      setInternalNotes(order.internalNotes ?? "");
      setInitialized(true);
    }
  }, [order, initialized]);

  // --- Handlers ---

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
    if (!orderDraft.orderName.trim()) { setFormError("Order name is required."); return; }
    const qty = Number(editQuantityStr);
    if (!editQuantityStr.trim() || qty <= 0) { setFormError("Quantity must be greater than 0."); return; }
    setFormError("");
    await orderSave.runSave(
      () => upsertItem(normalizeOrder({ ...orderDraft, quantity: qty, amount: Number(editAmountCents || "0") / 100 })),
      closeOrderEditor,
    );
  };

  const handleStageClick = async (stage: string) => {
    if (!order || stageSaving) return;
    setStageSaving(true);
    await upsertItem({ ...order, status: stageToStatus(stage) });
    setStageSaving(false);
  };

  const saveNextAction = () => {
    if (!order) return;
    nextActionSave.runSave(() => upsertItem({ ...order, nextAction }));
  };

  const saveInternalNotes = () => {
    if (!order) return;
    notesSave.runSave(() => upsertItem({ ...order, internalNotes }));
  };

  const handleCopy = async (btn: CommButton) => {
    if (btn.disabled) return;
    try {
      await navigator.clipboard.writeText(btn.message);
      setCopiedKey(btn.key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  if (loading) return <LoadingState label="Loading order..." />;

  if (!order) {
    return (
      <div className="w-full overflow-x-hidden space-y-6 text-xs md:text-sm">
        <button type="button" onClick={() => router.push("/orders")} className="inline-flex items-center gap-2 font-semibold text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" />
          Orders
        </button>
        <div className="rounded-[2rem] border border-slate-300 bg-white p-6 shadow-md md:p-8">
          <h1 className="text-base font-semibold text-slate-950 md:text-2xl">Order not found</h1>
          <p className="mt-2 text-slate-500">This order may have been deleted or is not available.</p>
        </div>
      </div>
    );
  }

  const currentStageIndex = statusToStageIndex(order.status);
  const commButtons = buildCommButtons(order);
  const totalAmount = numericValue(invoice?.total_amount ?? 0);
  const depositAmount = numericValue(invoice?.deposit_amount ?? 0);
  const balanceRemaining = numericValue(invoice?.balance_remaining ?? 0);

  // --- Section JSX (rendered once per layout; both layouts share state) ---

  const TimelineSection = (
    <div className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Order Timeline</h2>
      <div className="w-full overflow-x-auto pb-2">
        <div className="flex min-w-max items-start">
          {TIMELINE_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            const isLast = idx === TIMELINE_STAGES.length - 1;
            return (
              <div key={stage} className="flex items-start">
                <button
                  type="button"
                  disabled={stageSaving}
                  onClick={() => handleStageClick(stage)}
                  title={`Set stage to ${stage}`}
                  className="group flex flex-col items-center gap-1.5 px-1 disabled:cursor-wait"
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all ${
                    isCompleted
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : isCurrent
                      ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200"
                      : "border-slate-200 bg-white text-slate-300 group-hover:border-slate-400 group-enabled:hover:border-slate-400"
                  }`}>
                    {isCompleted ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <div className={`h-2 w-2 rounded-full ${isCurrent ? "bg-white" : "bg-slate-200 group-enabled:group-hover:bg-slate-400"}`} />
                    )}
                  </div>
                  <span className={`max-w-[58px] text-center text-[10px] leading-tight ${
                    isCurrent ? "font-bold text-blue-700" : isCompleted ? "font-medium text-emerald-600" : "text-slate-400"
                  }`}>
                    {stage}
                  </span>
                </button>
                {!isLast && (
                  <div className={`mt-3 h-0.5 w-5 shrink-0 ${idx < currentStageIndex ? "bg-emerald-400" : "bg-slate-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {stageSaving && <p className="mt-2 text-[10px] text-slate-400">Saving…</p>}
    </div>
  );

  const NextActionSection = (
    <div className="rounded-[2rem] border border-blue-100 bg-blue-50 p-4 shadow-sm md:p-5">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600">Next Action</h2>
      <textarea
        rows={3}
        className="w-full resize-none rounded-2xl border border-blue-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none md:text-sm"
        placeholder="What needs to happen next?"
        value={nextAction}
        onChange={(e) => setNextAction(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <SaveButton state={nextActionSave.saveState} onClick={saveNextAction} mode="edit" />
      </div>
    </div>
  );

  const PaymentStatusSection = (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Payment Status</h2>
      {!invoice ? (
        <p className="text-xs text-slate-400">No invoice linked to this order yet.</p>
      ) : (
        <div className="space-y-2.5">
          {[
            { label: "Total invoice", value: formatCurrency(totalAmount), extra: null },
            {
              label: "Deposit",
              value: formatCurrency(depositAmount),
              extra: (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${invoice.deposit_paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                  {invoice.deposit_paid ? "Paid" : "Unpaid"}
                </span>
              ),
            },
            {
              label: "Balance remaining",
              value: formatCurrency(balanceRemaining),
              extra: null,
              valueClass: balanceRemaining > 0 ? "text-amber-700" : "text-emerald-700",
            },
            {
              label: "Final payment",
              value: "",
              extra: (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${invoice.final_paid ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {invoice.final_paid ? "Paid" : "Pending"}
                </span>
              ),
            },
          ].map(({ label, value, extra, valueClass }) => (
            <div key={label} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
              <span className="shrink-0 text-xs text-slate-500">{label}</span>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                {value && <span className={`text-xs font-semibold ${valueClass ?? "text-slate-950"}`}>{value}</span>}
                {extra}
              </div>
            </div>
          ))}
          {invoice.status && (
            <div className="pt-1">
              <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${invoiceStatusBadgeClass(invoice.status)}`}>
                {invoice.status}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const OrderDetailsSection = (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Order Details</h2>
        <button
          type="button"
          onClick={openOrderEditor}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <Edit2 className="h-3 w-3" />
          Edit
        </button>
      </div>
      <div className="space-y-2">
        {([
          { label: "Items", value: order.items.length ? order.items.join(", ") : "None selected" },
          { label: "Quantity", value: String(order.quantity || 0) },
          { label: "Amount", value: formatCurrency(order.amount) },
          { label: "Vendor", value: order.vendor || "Not assigned" },
          { label: "Est. delivery", value: order.estimatedDeliveryDate || "TBD" },
        ] as const).map(({ label, value }) => (
          <div key={label} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="shrink-0 text-xs text-slate-500">{label}</span>
            <span className="min-w-0 break-words text-right text-xs font-medium text-slate-950">{value}</span>
          </div>
        ))}
        {order.notes && (
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Design notes</p>
            <p className="mt-1.5 text-xs text-slate-700">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );

  const InternalNotesSection = (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Internal Notes</h2>
      <textarea
        rows={4}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none md:text-sm"
        placeholder="Team notes, blockers, context — visible to Threefold only."
        value={internalNotes}
        onChange={(e) => setInternalNotes(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <SaveButton state={notesSave.saveState} onClick={saveInternalNotes} mode="edit" />
      </div>
    </div>
  );

  const CommunicationSection = (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Quick Communications</h2>
      <div className="flex flex-col gap-2">
        {commButtons.map((btn) => {
          const copied = copiedKey === btn.key;
          return (
            <div key={btn.key}>
              <button
                type="button"
                disabled={btn.disabled}
                title={btn.disabled ? btn.disabledReason : undefined}
                onClick={() => handleCopy(btn)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-xs font-semibold transition ${
                  btn.disabled
                    ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                    : copied
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span>{btn.label}</span>
                {copied ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <ClipboardCopy className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
              </button>
              {btn.disabled && (
                <p className="mt-0.5 px-1 text-[10px] text-slate-400">Missing order data</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="w-full overflow-x-hidden space-y-5 text-xs md:text-sm">
      <ErrorBanner message={error} />

      {/* Back nav */}
      <button
        type="button"
        onClick={() => router.push("/orders")}
        className="inline-flex items-center gap-2 font-semibold text-slate-600 hover:text-slate-950"
      >
        <ArrowLeft className="h-4 w-4" />
        Orders
      </button>

      {/* SECTION 1 — Header */}
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-md">
        <div className="bg-slate-950 px-5 py-6 text-white md:px-8 md:py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Order</p>
              <h1 className="mt-2 break-words text-2xl font-bold leading-tight text-white md:text-4xl">{order.orderName}</h1>
              <p className="mt-1.5 text-sm text-slate-300">{order.client || "No client assigned"}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${statusBadgeClass(order.status)}`}>
                  {order.status}
                </span>
                {order.owner && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                    {order.owner}
                  </span>
                )}
                {order.estimatedDeliveryDate && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                    Due {order.estimatedDeliveryDate}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={openOrderEditor}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-2xl border border-white/20 px-5 py-3 text-xs font-semibold text-white hover:bg-white/10 md:text-sm"
            >
              <Edit2 className="h-4 w-4" />
              Edit order
            </button>
          </div>
        </div>
      </section>

      {/* Mobile layout — single column */}
      <div className="flex flex-col gap-4 lg:hidden">
        {TimelineSection}
        {NextActionSection}
        {PaymentStatusSection}
        {OrderDetailsSection}
        {CommunicationSection}
        {InternalNotesSection}
      </div>

      {/* Desktop layout — 3 columns */}
      <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6">
        <div className="flex flex-col gap-6">
          {PaymentStatusSection}
          {OrderDetailsSection}
        </div>
        <div className="flex flex-col gap-6">
          {TimelineSection}
          {NextActionSection}
          {InternalNotesSection}
        </div>
        <div className="flex flex-col gap-6">
          {CommunicationSection}
        </div>
      </div>

      {/* Edit order modal (preserved exactly) */}
      {orderDraft && (
        <ModalShell
          title="Edit order"
          subtitle="Update this order's details, items, and production status."
          onClose={closeOrderEditor}
          maxWidth="max-w-2xl"
          footer={
            <div className="space-y-3">
              <FieldError message={formError} />
              <div className="flex gap-3">
                <SaveButton state={orderSave.saveState} onClick={saveOrderDraft} className="flex-1 py-3" />
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-gray-100 md:text-sm"
                  onClick={closeOrderEditor}
                >
                  Cancel
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Order name</label>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={orderDraft.orderName}
                onChange={(e) => { setOrderDraft({ ...orderDraft, orderName: e.target.value }); if (formError) setFormError(""); }}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SmartSearchInput
                label="Client"
                value={orderDraft.client}
                onChange={(v) => setOrderDraft({ ...orderDraft, client: v })}
                onSelect={(r) => setOrderDraft({ ...orderDraft, client: recordName(r) })}
                records={clients}
                placeholder="Type to search clients..."
              />
              <SmartSearchInput
                label="Vendor"
                value={orderDraft.vendor}
                onChange={(v) => setOrderDraft({ ...orderDraft, vendor: v })}
                onSelect={(r) => setOrderDraft({ ...orderDraft, vendor: recordName(r) })}
                records={vendors}
                placeholder="Type to search vendors..."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Items</label>
              <div className="flex flex-wrap gap-2">
                {itemOptions.map((item) => {
                  const selected = orderDraft.items.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={selected}
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition md:text-sm ${
                        selected ? "border-slate-400 bg-gray-100 text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-gray-100"
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
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  placeholder="e.g. 48"
                  value={editQuantityStr}
                  onChange={(e) => { setEditQuantityStr(e.target.value.replace(/^0+(?=\d)/, "")); if (formError) setFormError(""); }}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Amount</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={centsToCurrency(editAmountCents)}
                  onKeyDown={(e) => handleCurrencyKeyDown(e, setEditAmountCents)}
                  onPaste={(e) => {
                    e.preventDefault();
                    setEditAmountCents((c) => (c + e.clipboardData.getData("text").replace(/\D/g, "")).replace(/^0+(?=\d)/, ""));
                  }}
                  onChange={() => {}}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Status</label>
                <select
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 md:text-sm"
                  value={orderDraft.status}
                  onChange={(e) => setOrderDraft({ ...orderDraft, status: e.target.value })}
                >
                  {ALL_STATUS_OPTIONS.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Est. delivery date</label>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={orderDraft.estimatedDeliveryDate}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onChange={(e) => setOrderDraft({ ...orderDraft, estimatedDeliveryDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Notes</label>
              <textarea
                rows={4}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                placeholder="Order details, delivery notes, production reminders..."
                value={orderDraft.notes}
                onChange={(e) => setOrderDraft({ ...orderDraft, notes: e.target.value })}
              />
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
