"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ClipboardCopy, Edit2, ExternalLink, Trash2 } from "lucide-react";
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
import PortalSection from "@/components/PortalSection";
import type { QuestionnaireFile } from "@/components/crm/types";
import { getSignedUrls } from "@/lib/getSignedUrl";

type IntakeSnapshot = {
  contact_title?: string;
  contact_method?: string;
  company_description?: string;
  quantity?: string;
  target_date?: string;
  project_timeline?: string;
  budget?: string;
  apparel_types?: string;
  audience?: string;
  station_code?: string;
  meaning?: string;
  style?: string;
  colors?: string;
  notes?: string;
  files?: QuestionnaireFile[];
};

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
  design_versions?: DesignVersion[];
  source?: string;
  lead_id?: string;
  intake_snapshot?: IntakeSnapshot;
};

type DesignVersionStatus = "In Review" | "Needs Revision" | "Approved" | "Production Ready";

type DesignVersion = {
  id: string;
  version_number: number;
  name: string;
  drive_url: string;
  status: DesignVersionStatus;
  notes: string;
  date_added: string;
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
  "Design Phase",
  "Client Review",
  "Design Approved",
  "Production",
  "Quality Check",
  "Ready",
  "Delivered",
] as const;

const ALL_STATUS_OPTIONS = [...TIMELINE_STAGES];

const DESIGN_VERSION_STATUSES: DesignVersionStatus[] = [
  "In Review",
  "Needs Revision",
  "Approved",
  "Production Ready",
];

function statusToStageIndex(status: string): number {
  const s = status?.trim().toLowerCase();
  const map: Record<string, number> = {
    "design phase": 0,
    "client review": 1,
    "design approved": 2,
    production: 3,
    "in production": 3,
    "quality check": 4,
    "quality control": 4,
    ready: 5,
    delivered: 6,
    fulfilled: 6,
    draft: 0,
  };
  return map[s] ?? 0;
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

function designVersionStatusBadgeClass(status: DesignVersionStatus): string {
  const map: Record<DesignVersionStatus, string> = {
    "In Review": "bg-slate-100 text-slate-700",
    "Needs Revision": "bg-amber-100 text-amber-700",
    "Approved": "bg-emerald-100 text-emerald-700",
    "Production Ready": "bg-blue-100 text-blue-700",
  };
  return map[status];
}

function isDesignVersionStatus(value: string): value is DesignVersionStatus {
  return DESIGN_VERSION_STATUSES.includes(value as DesignVersionStatus);
}

function normalizeDesignVersions(versions?: DesignVersion[] | null): DesignVersion[] {
  if (!Array.isArray(versions)) return [];

  return versions.map((version, index) => ({
    id: version.id || `design-version-${version.version_number || index + 1}`,
    version_number: Number(version.version_number || index + 1),
    name: version.name ?? "",
    drive_url: version.drive_url ?? "",
    status: isDesignVersionStatus(version.status) ? version.status : "In Review",
    notes: version.notes ?? "",
    date_added: version.date_added ?? "",
  }));
}

function formatDesignVersionDate(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
    design_versions: normalizeDesignVersions(order.design_versions),
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryBadgeClass(category: string): string {
  const map: Record<string, string> = {
    logo: "bg-blue-100 text-blue-700",
    inspiration: "bg-purple-100 text-purple-700",
    pdf: "bg-red-100 text-red-700",
    mockup: "bg-amber-100 text-amber-700",
    other: "bg-slate-100 text-slate-600",
  };
  return map[category] ?? "bg-slate-100 text-slate-600";
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();

  const { data: orders, upsertItem, loading, error } = useSupabaseTable<Order>("orders", []);
  const { data: clients } = useSupabaseTable<LookupRecord>("clients", []);
  const { data: vendors } = useSupabaseTable<LookupRecord>("vendors", []);
  const { data: invoices } = useSupabaseTable<Invoice>("finances", []);

  const order = orders.map(normalizeOrder).find((o) => o.id === params.id);
  const orderDesignVersionsKey = JSON.stringify(order?.design_versions ?? []);

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

  // Design Versions
  const [designVersionDrafts, setDesignVersionDrafts] = useState<DesignVersion[]>([]);
  const [designVersionSource, setDesignVersionSource] = useState({ orderId: "", key: "[]" });
  const [isAddVersionOpen, setIsAddVersionOpen] = useState(false);
  const [newDesignVersion, setNewDesignVersion] = useState({
    name: "",
    drive_url: "",
    status: "In Review" as DesignVersionStatus,
    notes: "",
  });
  const designVersionsSave = useSaveState();
  const addDesignVersionSave = useSaveState();

  // Timeline
  const [stageSaving, setStageSaving] = useState(false);

  // Clipboard
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Signed URLs for intake file attachments
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const files = order?.intake_snapshot?.files;
    if (!files?.length) return;
    getSignedUrls(files.map((f) => f.path)).then(setFileUrls);
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize local text fields from order once
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (order && !initialized) {
      setNextAction(order.nextAction ?? "");
      setInternalNotes(order.internalNotes ?? "");
      setInitialized(true);
    }
  }, [order, initialized]);

  if (order && (designVersionSource.orderId !== order.id || designVersionSource.key !== orderDesignVersionsKey)) {
    setDesignVersionSource({ orderId: order.id, key: orderDesignVersionsKey });
    setDesignVersionDrafts(normalizeDesignVersions(order.design_versions));
  }

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
    await upsertItem({ ...order, status: stage });
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

  const closeAddVersionModal = () => {
    setIsAddVersionOpen(false);
    setNewDesignVersion({ name: "", drive_url: "", status: "In Review", notes: "" });
    addDesignVersionSave.resetSaveState();
  };

  const saveDesignVersions = (versions: DesignVersion[], onSuccess?: () => void) => {
    if (!order) return;
    designVersionsSave.runSave(
      () => upsertItem({ ...order, design_versions: versions }),
      onSuccess,
    );
  };

  const saveNewDesignVersion = () => {
    if (!order) return;
    const existingVersions = designVersionDrafts;
    const nextVersionNumber = existingVersions.reduce((max, version) => Math.max(max, version.version_number), 0) + 1;
    const version: DesignVersion = {
      id: crypto.randomUUID(),
      version_number: nextVersionNumber,
      name: newDesignVersion.name,
      drive_url: newDesignVersion.drive_url,
      status: newDesignVersion.status,
      notes: newDesignVersion.notes,
      date_added: new Date().toISOString(),
    };
    const versions = [...existingVersions, version];
    setDesignVersionDrafts(versions);
    addDesignVersionSave.runSave(
      () => upsertItem({ ...order, design_versions: versions }),
      closeAddVersionModal,
    );
  };

  const updateDesignVersionDraft = (id: string, updates: Partial<DesignVersion>) => {
    setDesignVersionDrafts((versions) => versions.map((version) => (
      version.id === id ? { ...version, ...updates } : version
    )));
  };

  const deleteDesignVersion = (id: string) => {
    const versions = designVersionDrafts.filter((version) => version.id !== id);
    setDesignVersionDrafts(versions);
    saveDesignVersions(versions);
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
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
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
  const latestProductionReady = designVersionDrafts
    .filter((version) => version.status === "Production Ready")
    .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())[0];
  const displayedDesignVersions = latestProductionReady
    ? [
        latestProductionReady,
        ...designVersionDrafts.filter((version) => version.id !== latestProductionReady.id),
      ]
    : designVersionDrafts;

  // --- Section JSX (rendered once per layout; both layouts share state) ---

  const TimelineSection = (
    <div className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Order Timeline</h2>
      <div className="w-full overflow-x-auto pb-2">
        <div className="flex min-w-[600px] items-start">
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

  const DesignVersionsSection = (
    <div className="w-full min-w-0 overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Design Versions</h2>
        <button
          type="button"
          onClick={() => {
            addDesignVersionSave.resetSaveState();
            setIsAddVersionOpen(true);
          }}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-3xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 lg:min-h-0 lg:w-auto"
        >
          Add Version
        </button>
      </div>

      {displayedDesignVersions.length === 0 ? (
        <p className="text-xs text-slate-400">No design versions added yet.</p>
      ) : (
        <div className="space-y-3">
          {displayedDesignVersions.map((version) => {
            const isHighlighted = latestProductionReady?.id === version.id;
            return (
              <div
                key={version.id}
                className={`w-full min-w-0 rounded-2xl border p-3 ${
                  isHighlighted ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-semibold text-slate-950">Version {version.version_number}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${designVersionStatusBadgeClass(version.status)}`}>
                        {version.status === "Production Ready" && <Check className="h-3 w-3" />}
                        {version.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">Added {formatDesignVersionDate(version.date_added)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteDesignVersion(version.id)}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 lg:w-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none md:text-sm"
                    placeholder="Version name"
                    value={version.name}
                    onChange={(e) => updateDesignVersionDraft(version.id, { name: e.target.value })}
                  />
                  <div className="flex w-full min-w-0 flex-col gap-2 lg:flex-row">
                    <input
                      type="url"
                      className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none md:text-sm"
                      placeholder="Google Drive link"
                      value={version.drive_url}
                      onChange={(e) => updateDesignVersionDraft(version.id, { drive_url: e.target.value })}
                    />
                    <a
                      href={version.drive_url || undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!version.drive_url}
                      className={`inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-xs font-semibold lg:w-auto ${
                        version.drive_url
                          ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          : "pointer-events-none border-slate-100 bg-slate-100 text-slate-400"
                      }`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open in Drive
                    </a>
                  </div>
                  <select
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 focus:border-slate-400 focus:outline-none md:text-sm"
                    value={version.status}
                    onChange={(e) => updateDesignVersionDraft(version.id, { status: e.target.value as DesignVersionStatus })}
                  >
                    {DESIGN_VERSION_STATUSES.map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none md:text-sm"
                    placeholder="Revision notes"
                    value={version.notes}
                    onChange={(e) => updateDesignVersionDraft(version.id, { notes: e.target.value })}
                  />
                  <div className="flex justify-end">
                    <SaveButton
                      state={designVersionsSave.saveState}
                      onClick={() => saveDesignVersions(designVersionDrafts)}
                      mode="edit"
                      className="w-full lg:w-auto"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const NextActionSection = (
    <div className="w-full min-w-0 rounded-[2rem] border border-blue-100 bg-blue-50 p-4 shadow-sm md:p-5">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600">Next Action</h2>
      <textarea
        rows={3}
        className="w-full resize-none rounded-2xl border border-blue-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:outline-none md:text-sm"
        placeholder="What needs to happen next?"
        value={nextAction}
        onChange={(e) => setNextAction(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <SaveButton state={nextActionSave.saveState} onClick={saveNextAction} mode="edit" className="w-full lg:w-auto" />
      </div>
    </div>
  );

  const PaymentStatusSection = (
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
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
            <div key={label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
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
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
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
          <div key={label} className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
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

  const intakeGroups = [
    {
      title: "Contact",
      fields: [
        { label: "Contact title", value: order.intake_snapshot?.contact_title },
        { label: "Preferred contact", value: order.intake_snapshot?.contact_method },
      ],
    },
    {
      title: "Project",
      fields: [
        { label: "Company description", value: order.intake_snapshot?.company_description },
        { label: "Requested quantity", value: order.intake_snapshot?.quantity },
        { label: "Project timeline", value: order.intake_snapshot?.project_timeline ?? order.intake_snapshot?.target_date },
        { label: "Budget", value: order.intake_snapshot?.budget },
      ],
    },
    {
      title: "Audience",
      fields: [
        { label: "Apparel types", value: order.intake_snapshot?.apparel_types },
        { label: "Audience", value: order.intake_snapshot?.audience },
        { label: "Station code", value: order.intake_snapshot?.station_code },
      ],
    },
    {
      title: "Design direction",
      fields: [
        { label: "Meaning / brand story", value: order.intake_snapshot?.meaning },
        { label: "Style preferences", value: order.intake_snapshot?.style },
        { label: "Colors", value: order.intake_snapshot?.colors },
        { label: "Original notes", value: order.intake_snapshot?.notes },
      ],
    },
  ].map((group) => ({ ...group, fields: group.fields.filter((f) => f.value?.trim()) })).filter((group) => group.fields.length > 0);

  const intakeFiles: QuestionnaireFile[] = order.intake_snapshot?.files ?? [];

  const IntakeSection = (intakeGroups.length > 0 || intakeFiles.length > 0) ? (
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Intake / Questionnaire</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {intakeGroups.map((group) => (
          <div key={group.title} className="rounded-2xl bg-slate-50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{group.title}</p>
            <div className="space-y-2">
              {group.fields.map(({ label, value }) => (
                <div key={label} className="flex flex-wrap items-start justify-between gap-3">
                  <span className="shrink-0 text-xs text-slate-500">{label}</span>
                  <span className="min-w-0 max-w-[60%] break-words text-right text-xs font-medium text-slate-950">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {intakeFiles.length > 0 && (
          <div className={intakeGroups.length > 0 ? "space-y-2 rounded-2xl bg-slate-50 p-3 md:col-span-2" : "space-y-2 rounded-2xl bg-slate-50 p-3 md:col-span-2"}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Attached files</p>
            {intakeFiles.map((file) => {
              const url = fileUrls[file.path];
              return (
                <div key={file.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-900">{file.name}</p>
                    <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${categoryBadgeClass(file.category)}`}>
                      {file.category}
                    </span>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-slate-50"
                      >
                        Download
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400">Loading…</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  ) : null;

  const InternalNotesSection = (
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Internal Notes</h2>
      <textarea
        rows={4}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none md:text-sm"
        placeholder="Team notes, blockers, context — visible to Threefold only."
        value={internalNotes}
        onChange={(e) => setInternalNotes(e.target.value)}
      />
      <div className="mt-3 flex justify-end">
        <SaveButton state={notesSave.saveState} onClick={saveInternalNotes} mode="edit" className="w-full lg:w-auto" />
      </div>
    </div>
  );

  const CommunicationSection = (
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
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
                <span className="min-w-0 break-words">{btn.label}</span>
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
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }} className="space-y-5 text-xs md:text-sm">
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
      <section className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
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
                {order.source && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                    {order.source}
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
      <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }} className="flex min-w-0 flex-col gap-4 lg:hidden">
        {TimelineSection}
        {NextActionSection}
        {DesignVersionsSection}
        {PaymentStatusSection}
        {OrderDetailsSection}
        {IntakeSection}
        {CommunicationSection}
        {InternalNotesSection}
      </div>

      {/* Desktop layout — 3 columns */}
      <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6">
        <div className="flex flex-col gap-6">
          {PaymentStatusSection}
          {OrderDetailsSection}
          {IntakeSection}
        </div>
        <div className="flex flex-col gap-6">
          {TimelineSection}
          {DesignVersionsSection}
        </div>
        <div className="flex flex-col gap-6">
          {CommunicationSection}
          {NextActionSection}
          {InternalNotesSection}
        </div>
      </div>

      {/* Add design version modal */}
      {isAddVersionOpen && (
        <ModalShell
          title="Add design version"
          subtitle="Save a new design link and review status for this order."
          onClose={closeAddVersionModal}
          maxWidth="max-w-xl"
          footer={
            <div className="flex gap-3">
              <SaveButton state={addDesignVersionSave.saveState} onClick={saveNewDesignVersion} mode="add" className="flex-1 py-3" />
              <button
                type="button"
                className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
                onClick={closeAddVersionModal}
              >
                Cancel
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Version name</label>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={newDesignVersion.name}
                onChange={(e) => setNewDesignVersion({ ...newDesignVersion, name: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Google Drive link</label>
              <input
                type="url"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={newDesignVersion.drive_url}
                onChange={(e) => setNewDesignVersion({ ...newDesignVersion, drive_url: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Status</label>
              <select
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 md:text-sm"
                value={newDesignVersion.status}
                onChange={(e) => setNewDesignVersion({ ...newDesignVersion, status: e.target.value as DesignVersionStatus })}
              >
                {DESIGN_VERSION_STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Revision notes</label>
              <textarea
                rows={4}
                className="w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                value={newDesignVersion.notes}
                onChange={(e) => setNewDesignVersion({ ...newDesignVersion, notes: e.target.value })}
              />
            </div>
          </div>
        </ModalShell>
      )}

      {order && <PortalSection orderId={params.id} />}

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
                  className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
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
                        selected ? "border-slate-400 bg-slate-50 text-slate-900" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
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
