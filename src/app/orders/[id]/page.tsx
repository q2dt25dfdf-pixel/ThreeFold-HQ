"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Archive, ArrowLeft, Check, ClipboardCopy, Edit2, ExternalLink, Eye, EyeOff, FileText, RotateCcw, Send, Trash2, User } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabase";
import InlineEditTitle from "@/components/InlineEditTitle";
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
import SendFinalInvoiceModal from "@/components/SendFinalInvoiceModal";
import type { QuestionnaireFile } from "@/components/crm/types";
import { parseAmount } from "@/lib/invoiceCalc";
import { businessTodayISO } from "@/lib/businessDate";

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
  order_name?: string;
  client: string;
  vendor: string;
  vendor_id?: string;
  vendor_name?: string;
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
  client_updates?: ClientUpdate[];
  source?: string;
  lead_id?: string;
  intake_snapshot?: IntakeSnapshot;
  client_id?: string;
  portal_token?: string;
  portal_enabled?: boolean;
  deposit_request_id?: string;
  vendor_cost_cents?: number;
  vendor_invoice_status?: string;
  vendor_payment_status?: string;
  vendor_paid_by?: string;
  vendor_notes?: string;
};

type ClientUpdate = { id: string; date: string; text: string };

type DesignVersionStatus = "In Review" | "Needs Revision" | "Approved" | "Production Ready";

type DesignVersion = {
  id: string;
  version_number: number;
  name: string;
  drive_url?: string;
  image_path?: string;
  status: DesignVersionStatus;
  notes: string;
  date_added: string;
  is_final?: boolean;
  show_in_portal?: boolean;
  archived?: boolean;
};

type Invoice = {
  id: string;
  client: string;
  client_name?: string;
  client_id?: string;
  client_email?: string;
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
  "Production",
  "Quality Check",
  "Ready",
  "Delivered",
] as const;

const ALL_STATUS_OPTIONS = [...TIMELINE_STAGES, "Cancelled"] as const;

const DESIGN_VERSION_STATUSES: DesignVersionStatus[] = [
  "In Review",
  "Needs Revision",
  "Approved",
  "Production Ready",
];

const VENDOR_INVOICE_STATUSES = ["not_received", "received"] as const;
const VENDOR_PAYMENT_STATUSES = ["unpaid", "paid"] as const;
const VENDOR_PAID_BY_OPTIONS = ["", "Alliyah", "Hannah", "Jordan", "Company Account"] as const;

function statusToStageIndex(status: string): number {
  const s = status?.trim().toLowerCase();
  const map: Record<string, number> = {
    production: 0,
    "in production": 0,
    "design phase": 0,
    "client review": 0,
    "design approved": 0,
    draft: 0,
    "quality check": 1,
    "quality control": 1,
    ready: 2,
    delivered: 3,
    fulfilled: 3,
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
    image_path: version.image_path,
    status: isDesignVersionStatus(version.status) ? version.status : "In Review",
    notes: version.notes ?? "",
    date_added: version.date_added ?? "",
    is_final: version.is_final ?? false,
    show_in_portal: version.show_in_portal,
    archived: version.archived ?? false,
  }));
}

function isVersionInPortal(v: DesignVersion): boolean {
  if (v.show_in_portal !== undefined) return v.show_in_portal === true;
  return true;
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
  const { data: invoices, upsertItem: upsertInvoice } = useSupabaseTable<Invoice>("finances", []);

  const order = orders.map(normalizeOrder).find((o) => o.id === params.id);
  const orderDesignVersionsKey = JSON.stringify(order?.design_versions ?? []);

  // Only match by order_id — never match by name/title to avoid picking up stale invoices.
  // invoices are ordered by id DESC from Supabase (most recently created first), so .find() returns
  // the newest when multiple invoices exist for the same order.
  const invoice = invoices.find((inv) => {
    if (!order) return false;
    return Boolean(inv.order_id && inv.order_id === order.id);
  });

  // Authoritative amounts cross-referenced from deposit request
  const [authAmounts, setAuthAmounts] = useState<{ total: number; deposit: number; balance: number } | null>(null);

  useEffect(() => {
    const depositRequestId =
      (invoice as { deposit_request_id?: string } | undefined)?.deposit_request_id ||
      order?.deposit_request_id ||
      undefined;

    if (depositRequestId) {
      void supabase
        .from("deposit_requests")
        .select("data")
        .eq("id", depositRequestId)
        .limit(1)
        .then(({ data: rows }) => {
          if (rows && rows.length > 0) {
            const dep = rows[0].data as Record<string, unknown>;
            const t = parseAmount(dep.total_amount);
            const d = parseAmount(dep.deposit_amount) > 0 ? parseAmount(dep.deposit_amount) : t * 0.5;
            if (t > 0) { setAuthAmounts({ total: t, deposit: d, balance: Math.max(t - d, 0) }); return; }
          }
          // Deposit request row found but has no usable total — fall back to stored values
          const t = parseAmount(invoice?.total_amount) || parseAmount(order?.amount) || 0;
          const d = parseAmount(invoice?.deposit_amount) > 0 ? parseAmount(invoice?.deposit_amount) : t * 0.5;
          setAuthAmounts({ total: t, deposit: d, balance: Math.max(t - d, 0) });
        });
    } else if (invoice || order) {
      const t = parseAmount(invoice?.total_amount) || parseAmount(order?.amount) || 0;
      const d = parseAmount(invoice?.deposit_amount) > 0 ? parseAmount(invoice?.deposit_amount) : t * 0.5;
      setAuthAmounts({ total: t, deposit: d, balance: Math.max(t - d, 0) });
    } else {
      setAuthAmounts(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, order?.id, order?.deposit_request_id]);

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [generatingInvoicePreview, setGeneratingInvoicePreview] = useState(false);
  const [sendInvoiceOpen, setSendInvoiceOpen] = useState(false);

  // Timeline
  const [stageSaving, setStageSaving] = useState(false);

  // Clipboard
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Client Updates
  const [newUpdateDate, setNewUpdateDate] = useState('');
  const [newUpdateText, setNewUpdateText] = useState('');
  const clientUpdatesSave = useSaveState();

  // Vendor Cost
  const [vendorCostCents, setVendorCostCents] = useState("");
  const [vendorInvoiceStatus, setVendorInvoiceStatus] = useState("not_received");
  const [vendorPaymentStatus, setVendorPaymentStatus] = useState("unpaid");
  const [vendorPaidBy, setVendorPaidBy] = useState("");
  const [vendorNotes, setVendorNotes] = useState("");
  const vendorCostSave = useSaveState();

  // Design image uploads
  const [designImageUrls, setDesignImageUrls] = useState<Record<string, string>>({});
  const [uploadingVersionId, setUploadingVersionId] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  // Signed URLs for intake file attachments — generated server-side to avoid browser auth/RLS mismatch
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const [fileUrlsLoaded, setFileUrlsLoaded] = useState(false);
  useEffect(() => {
    const files = order?.intake_snapshot?.files;
    setFileUrls({});
    setFileUrlsLoaded(false);
    if (!files?.length) return;
    const paths = files.map((f) => f.path).filter(Boolean);
    fetch("/api/internal/signed-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    })
      .then((res) => (res.ok ? res.json() : {}))
      .then((urls: Record<string, string>) => {
        setFileUrls(urls);
        setFileUrlsLoaded(true);
      })
      .catch(() => {
        setFileUrls({});
        setFileUrlsLoaded(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  // Initialize local text fields from order once
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (order && !initialized) {
      setNextAction(order.nextAction ?? "");
      setInternalNotes(order.internalNotes ?? "");
      setVendorCostCents(order.vendor_cost_cents ? String(order.vendor_cost_cents) : "");
      setVendorInvoiceStatus(order.vendor_invoice_status ?? "not_received");
      setVendorPaymentStatus(order.vendor_payment_status ?? "unpaid");
      setVendorPaidBy(order.vendor_paid_by ?? "");
      setVendorNotes(order.vendor_notes ?? "");
      setInitialized(true);
    }
  }, [order, initialized]);

  // Load signed preview URLs for any design versions that already have image_path.
  // Depends on designVersionSource so it re-runs whenever saved design versions change.
  useEffect(() => {
    const paths = designVersionDrafts
      .filter((v) => v.image_path)
      .map((v) => v.image_path!);
    if (!paths.length) return;
    fetch('/api/internal/design-signed-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then((urls: Record<string, string>) => setDesignImageUrls(urls))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designVersionSource]);

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
      () => upsertItem(normalizeOrder({ ...orderDraft, order_name: orderDraft.orderName, quantity: qty, amount: Number(editAmountCents || "0") / 100 })),
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

  const saveVendorCost = () => {
    if (!order) return;
    const cents = parseInt(vendorCostCents || "0", 10);
    if (isNaN(cents) || cents < 0) return;
    vendorCostSave.runSave(() =>
      upsertItem({
        ...order,
        vendor_cost_cents: cents,
        vendor_invoice_status: vendorInvoiceStatus,
        vendor_payment_status: vendorPaymentStatus,
        vendor_paid_by: vendorPaidBy,
        vendor_notes: vendorNotes,
      }),
    );
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

  const handleDesignImageUpload = async (versionId: string, file: File) => {
    if (!order) return;
    setUploadingVersionId(versionId);
    setUploadErrors((prev) => { const n = { ...prev }; delete n[versionId]; return n; });

    // Fixed path per version — upsert overwrites on replace, no accumulation
    const path = `orders/${order.id}/${versionId}/design`;

    const { error: uploadErr } = await supabase.storage
      .from('order-designs')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
      setUploadErrors((prev) => ({ ...prev, [versionId]: uploadErr.message }));
      setUploadingVersionId(null);
      return;
    }

    // Generate preview URL immediately so the thumbnail shows without waiting for re-render
    try {
      const res = await fetch('/api/internal/design-signed-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [path] }),
      });
      if (res.ok) {
        const urls: Record<string, string> = await res.json();
        if (urls[path]) setDesignImageUrls((prev) => ({ ...prev, [path]: urls[path] }));
      }
    } catch {
      // Non-fatal: preview will appear on next page load
    }

    const updatedVersions = designVersionDrafts.map((v) =>
      v.id === versionId ? { ...v, image_path: path } : v,
    );
    setDesignVersionDrafts(updatedVersions);
    saveDesignVersions(updatedVersions);
    setUploadingVersionId(null);
  };

  const handleInvoiceSent = (sender: string, invoiceLink: string) => {
    if (!order) return;
    const entry: ClientUpdate = {
      id: `invoice-sent-${Date.now()}`,
      date: businessTodayISO(),
      text: `Final invoice sent by ${sender}.\nPortal: ${invoiceLink}`,
    };
    upsertItem({ ...order, client_updates: [entry, ...(order.client_updates ?? [])] });
  };

  const addClientUpdate = () => {
    if (!order || !newUpdateDate.trim() || !newUpdateText.trim()) return;
    const updates: ClientUpdate[] = [
      ...(order.client_updates ?? []),
      { id: crypto.randomUUID(), date: newUpdateDate.trim(), text: newUpdateText.trim() },
    ];
    clientUpdatesSave.runSave(
      () => upsertItem({ ...order, client_updates: updates }),
      () => { setNewUpdateDate(''); setNewUpdateText(''); },
    );
  };

  const deleteClientUpdate = (updateId: string) => {
    if (!order) return;
    const updates = (order.client_updates ?? []).filter((u) => u.id !== updateId);
    clientUpdatesSave.runSave(() => upsertItem({ ...order, client_updates: updates }));
  };

  const copyPortalLink = async () => {
    if (!order?.portal_token) return;
    const url = `${window.location.origin}/portal/${order.portal_token}`;
    await navigator.clipboard.writeText(url);
    setPortalCopied(true);
    window.setTimeout(() => setPortalCopied(false), 2000);
  };

  const toggleFinalDesign = (id: string) => {
    const versions = designVersionDrafts.map((v) => ({
      ...v,
      is_final: v.id === id ? !v.is_final : false,
    }));
    setDesignVersionDrafts(versions);
    saveDesignVersions(versions);
  };

  const toggleShowInPortal = (id: string) => {
    const versions = designVersionDrafts.map((v) =>
      v.id === id ? { ...v, show_in_portal: !isVersionInPortal(v) } : v,
    );
    setDesignVersionDrafts(versions);
    saveDesignVersions(versions);
  };

  const moveToHistory = (id: string) => {
    const versions = designVersionDrafts.map((v) =>
      v.id === id ? { ...v, archived: true, is_final: false, show_in_portal: false } : v,
    );
    setDesignVersionDrafts(versions);
    saveDesignVersions(versions);
  };

  const restoreFromHistory = (id: string) => {
    const versions = designVersionDrafts.map((v) =>
      v.id === id ? { ...v, archived: false } : v,
    );
    setDesignVersionDrafts(versions);
    saveDesignVersions(versions);
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
  const totalAmount = authAmounts?.total ?? parseAmount(invoice?.total_amount);
  const depositAmount = authAmounts?.deposit ?? parseAmount(invoice?.deposit_amount);
  const balanceRemaining = authAmounts?.balance ?? parseAmount(invoice?.balance_remaining);
  const activeVersions = designVersionDrafts
    .filter((v) => !v.archived)
    .sort((a, b) => {
      if (a.is_final && !b.is_final) return -1;
      if (!a.is_final && b.is_final) return 1;
      return new Date(b.date_added).getTime() - new Date(a.date_added).getTime();
    });
  const archivedVersions = designVersionDrafts.filter((v) => v.archived);

  const linkedClient = clients.find(
    (c) =>
      (order.client_id && c.id === order.client_id) ||
      (c.name?.trim().toLowerCase() === order.client?.trim().toLowerCase()),
  );
  const portalToken = order.portal_token;
  const portalUrl = portalToken
    ? (typeof window !== "undefined" ? window.location.origin : "") + `/portal/${portalToken}`
    : null;

  const openInvoicePreview = async () => {
    if (!invoice || generatingInvoicePreview) return;
    setGeneratingInvoicePreview(true);
    try {
      const res = await fetch("/api/invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const d = await res.json() as { publicLink?: string; error?: string };
      if (d.publicLink) window.open(d.publicLink, "_blank");
    } catch {
      // silently fail — user can retry
    } finally {
      setGeneratingInvoicePreview(false);
    }
  };

  const createAndOpenInvoice = async () => {
    // If an invoice already exists, open it directly instead of creating a duplicate.
    if (invoice) {
      router.push(`/finances?invoice=${invoice.id}`);
      return;
    }
    setCreatingInvoice(true);
    const clientName = linkedClient?.name || order.client || "";

    // Use authoritative amounts from deposit request when available; fall back to order.amount
    let total = authAmounts?.total || Number(order.amount) || 0;
    let deposit = authAmounts?.deposit || total * 0.5;

    const orderDepositRequestId = order?.deposit_request_id;
    if (!authAmounts && orderDepositRequestId) {
      const { data: depRows } = await supabase
        .from("deposit_requests")
        .select("data")
        .eq("id", orderDepositRequestId)
        .limit(1);
      if (depRows && depRows.length > 0) {
        const dep = depRows[0].data as Record<string, unknown>;
        const t = parseAmount(dep.total_amount);
        const d = parseAmount(dep.deposit_amount);
        if (t > 0) total = t;
        if (d > 0) deposit = d;
      }
    }

    const newInvoice: Invoice = {
      id: `invoice-${Date.now()}`,
      client: clientName,
      client_name: clientName,
      client_id: linkedClient?.id || order.client_id || "",
      orderName: order.orderName,
      order_name: order.orderName,
      order_id: order.id,
      total_amount: total,
      deposit_amount: deposit,
      deposit_paid: false,
      balance_remaining: Math.max(total - deposit, 0),
      final_paid: false,
      status: "Draft",
      notes: "",
    };
    const result = await upsertInvoice(newInvoice);
    setCreatingInvoice(false);
    if (!result.error) {
      router.push(`/finances?invoice=${newInvoice.id}`);
    }
  };

  const QuickActionsSection = (
    <div className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Quick Actions</h2>
      <div className="flex flex-wrap gap-2">

        {/* Open Client */}
        <button
          type="button"
          disabled={!linkedClient}
          title={linkedClient ? `Open ${linkedClient.name}` : "No linked client found"}
          onClick={() => linkedClient && router.push(`/clients/${linkedClient.id}`)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold transition md:min-h-0 ${
            linkedClient
              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
          }`}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
          Open Client
        </button>

        {/* Create Invoice / Open Invoice */}
        <button
          type="button"
          disabled={creatingInvoice}
          onClick={() => void createAndOpenInvoice()}
          className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold transition md:min-h-0 ${
            creatingInvoice
              ? "cursor-wait border-slate-100 bg-slate-50 text-slate-400"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          {creatingInvoice ? "Creating…" : invoice ? "Open Invoice" : "Create Invoice"}
        </button>

        {/* Preview Invoice */}
        <button
          type="button"
          disabled={!invoice || generatingInvoicePreview}
          title={!invoice ? "Create an invoice first" : "Preview the client-facing invoice page"}
          onClick={() => void openInvoicePreview()}
          className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold transition md:min-h-0 ${
            !invoice || generatingInvoicePreview
              ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          }`}
        >
          <Eye className="h-3.5 w-3.5 shrink-0" />
          {generatingInvoicePreview ? "Opening…" : "Preview Invoice"}
        </button>

        {/* Copy Portal Link */}
        <button
          type="button"
          disabled={!portalToken}
          title={portalToken ? "Copy portal link to clipboard" : "Generate a portal link first"}
          onClick={() => void copyPortalLink()}
          className={`inline-flex min-h-11 items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold transition md:min-h-0 ${
            portalCopied
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : portalToken
              ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
          }`}
        >
          {portalCopied ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          ) : (
            <ClipboardCopy className="h-3.5 w-3.5 shrink-0" />
          )}
          {portalCopied ? "Portal link copied" : "Copy Portal Link"}
        </button>

        {/* Open Portal */}
        {portalUrl ? (
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 md:min-h-0"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Open Portal
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Generate a portal link first"
            className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-400 md:min-h-0"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            Open Portal
          </button>
        )}

      </div>
    </div>
  );

  // --- Section JSX (rendered once per layout; both layouts share state) ---

  const TimelineSection = (
    <div className="w-full overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Order Timeline</h2>
      <div className="w-full">
        <div className="relative flex w-full items-start">
          {/* Background connector — runs between first and last circle centers */}
          <div
            className="pointer-events-none absolute h-0.5 bg-slate-200"
            style={{ top: '14px', left: '12.5%', right: '12.5%' }}
          />
          {/* Completed connector overlay */}
          {currentStageIndex > 0 && (
            <div
              className="pointer-events-none absolute h-0.5 bg-emerald-400"
              style={{
                top: '14px',
                left: '12.5%',
                right: `${100 - (currentStageIndex + 0.5) * 25}%`,
              }}
            />
          )}
          {TIMELINE_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStageIndex;
            const isCurrent = idx === currentStageIndex;
            return (
              <button
                key={stage}
                type="button"
                disabled={stageSaving}
                onClick={() => handleStageClick(stage)}
                title={`Set stage to ${stage}`}
                className="group relative z-10 flex flex-1 flex-col items-center gap-1.5 disabled:cursor-wait"
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
                <span className={`max-w-[72px] text-center text-[10px] leading-tight ${
                  isCurrent ? "font-bold text-blue-700" : isCompleted ? "font-medium text-emerald-600" : "text-slate-400"
                }`}>
                  {stage}
                </span>
              </button>
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
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-3xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 lg:min-h-0 lg:w-auto"
        >
          Add Version
        </button>
      </div>

      {activeVersions.length === 0 ? (
        <p className="text-xs text-slate-400">No design versions added yet.</p>
      ) : (
        <div className="space-y-3">
          {activeVersions.map((version) => {
            const inPortal = isVersionInPortal(version);
            return (
              <div
                key={version.id}
                className={`w-full min-w-0 rounded-2xl border p-3 ${
                  version.is_final ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50"
                }`}
              >
                {/* Header row */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xs font-semibold text-slate-950">Version {version.version_number}</h3>
                      {version.is_final && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold text-white">
                          <Check className="h-3 w-3" />
                          Final Design
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${designVersionStatusBadgeClass(version.status)}`}>
                        {version.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">Added {formatDesignVersionDate(version.date_added)}</p>
                  </div>
                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 lg:shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleFinalDesign(version.id)}
                      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition lg:min-h-0 ${
                        version.is_final
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {version.is_final ? "Unmark Final" : "Mark as Final Design"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleShowInPortal(version.id)}
                      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition lg:min-h-0 ${
                        inPortal
                          ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          : "border-slate-200 bg-white text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      {inPortal ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {inPortal ? "Shown in Portal" : "Hidden from Portal"}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveToHistory(version.id)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 lg:min-h-0"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Move to Version History
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDesignVersion(version.id)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 lg:min-h-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* Fields */}
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
                      placeholder="Google Drive link (optional)"
                      value={version.drive_url ?? ""}
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
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-700 md:text-sm">
                      Design image <span className="font-normal text-slate-400">(portal thumbnail)</span>
                    </p>
                    {version.image_path && designImageUrls[version.image_path] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={designImageUrls[version.image_path]}
                        alt="Design preview"
                        className="mb-2 w-full rounded-xl border border-slate-200 object-contain"
                        style={{ maxHeight: '180px' }}
                      />
                    )}
                    <label
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition md:text-sm ${
                        uploadingVersionId === version.id
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        disabled={uploadingVersionId === version.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleDesignImageUpload(version.id, file);
                          e.target.value = '';
                        }}
                      />
                      {uploadingVersionId === version.id
                        ? 'Uploading…'
                        : version.image_path
                        ? 'Replace image'
                        : 'Upload image'}
                    </label>
                    {uploadErrors[version.id] && (
                      <p className="mt-1.5 text-xs text-rose-600">{uploadErrors[version.id]}</p>
                    )}
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

      {/* Version History */}
      {archivedVersions.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400 hover:text-slate-600"
          >
            Version History ({archivedVersions.length})
            <RotateCcw className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
          </button>
          {historyOpen && (
            <div className="mt-3 space-y-2">
              {archivedVersions.map((version) => (
                <div key={version.id} className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">Version {version.version_number}</span>
                      {version.name && <span className="text-xs text-slate-500">{version.name}</span>}
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${designVersionStatusBadgeClass(version.status)}`}>
                        {version.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400">Added {formatDesignVersionDate(version.date_added)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => restoreFromHistory(version.id)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDesignVersion(version.id)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-2xl border border-red-100 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setSendInvoiceOpen(true)}
              disabled={invoice.final_paid}
              title={invoice.final_paid ? "Invoice is already paid in full" : "Send final invoice email to client"}
              className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-xs font-semibold transition ${
                invoice.final_paid
                  ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Send className="h-3.5 w-3.5 shrink-0" />
              Send Final Invoice
            </button>
          </div>
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

  const vendorCostDisplay = vendorCostCents
    ? formatCurrency(parseInt(vendorCostCents, 10) / 100)
    : "$0.00";
  const vendorInvoiceBadge =
    vendorInvoiceStatus === "received"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-slate-100 text-slate-500";
  const vendorPaymentBadge =
    vendorPaymentStatus === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : "bg-amber-100 text-amber-700";

  const VendorCostSection = (
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Vendor Cost</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${vendorInvoiceBadge}`}>
            {vendorInvoiceStatus === "received" ? "Invoice received" : "Invoice pending"}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${vendorPaymentBadge}`}>
            {vendorPaymentStatus === "paid" ? "Paid" : "Unpaid"}
          </span>
        </div>
      </div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-xl font-bold text-slate-950">{vendorCostDisplay}</span>
        {vendorPaidBy && (
          <span className="text-xs text-slate-400">paid by {vendorPaidBy}</span>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Cost (USD)</label>
          <input
            type="text"
            inputMode="numeric"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 focus:border-slate-400 focus:bg-white focus:outline-none md:text-sm"
            placeholder="$0.00"
            value={centsToCurrency(vendorCostCents)}
            onKeyDown={(e) => handleCurrencyKeyDown(e, setVendorCostCents)}
            onPaste={(e) => {
              e.preventDefault();
              setVendorCostCents((c) => (c + e.clipboardData.getData("text").replace(/\D/g, "")).replace(/^0+(?=\d)/, ""));
            }}
            onChange={() => {}}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Vendor Invoice</label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 focus:border-slate-400 focus:outline-none md:text-sm"
              value={vendorInvoiceStatus}
              onChange={(e) => setVendorInvoiceStatus(e.target.value)}
            >
              {VENDOR_INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "not_received" ? "Not received" : "Received"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment Status</label>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 focus:border-slate-400 focus:outline-none md:text-sm"
              value={vendorPaymentStatus}
              onChange={(e) => setVendorPaymentStatus(e.target.value)}
            >
              {VENDOR_PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "unpaid" ? "Unpaid" : "Paid"}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Paid By</label>
          <select
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 focus:border-slate-400 focus:outline-none md:text-sm"
            value={vendorPaidBy}
            onChange={(e) => setVendorPaidBy(e.target.value)}
          >
            {VENDOR_PAID_BY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o === "" ? "—" : o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Vendor Notes</label>
          <textarea
            rows={3}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none md:text-sm"
            placeholder="Invoice number, PO reference, payment details..."
            value={vendorNotes}
            onChange={(e) => setVendorNotes(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <SaveButton state={vendorCostSave.saveState} onClick={saveVendorCost} mode="edit" className="w-full lg:w-auto" />
        </div>
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
  const hasIntake = intakeGroups.length > 0 || intakeFiles.length > 0;
  const longIntakeLabels = new Set(["Company description", "Meaning / brand story", "Style preferences", "Original notes"]);

  const IntakeSection = (intakeGroups.length > 0 || intakeFiles.length > 0) ? (
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Intake / Questionnaire</h2>
      <div className="flex flex-col gap-4">
        {intakeGroups.map((group) => (
          <div key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{group.title}</p>
            <div className="divide-y divide-slate-200/70">
              {group.fields.map(({ label, value }) => (
                <div key={label} className={longIntakeLabels.has(label) ? "py-3" : "flex flex-wrap items-start gap-3 py-3"}>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">{label}</span>
                  <span className={longIntakeLabels.has(label) ? "mt-1 block min-w-0 whitespace-pre-wrap break-words text-left text-xs font-medium leading-relaxed text-slate-900" : "min-w-0 flex-1 break-words text-left text-xs font-medium leading-relaxed text-slate-900"}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {intakeFiles.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Attached files</p>
            {intakeFiles.map((file) => {
              const url = fileUrls[file.path];
              return (
                <div key={file.id} className="flex flex-col gap-3 rounded-xl bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-900">{file.name}</p>
                    <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                        View
                      </a>
                    ) : fileUrlsLoaded ? (
                      <span className="text-[10px] font-semibold text-rose-500">Unavailable</span>
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

  const renderUpdateText = (text: string) => {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlPattern);
    return parts.map((part, i) =>
      urlPattern.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-blue-600 underline">
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  };

  const ClientUpdatesSection = (
    <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Client Updates</h2>
      {(order.client_updates ?? []).length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {[...(order.client_updates ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map((u) => (
            <div key={u.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-slate-400">{u.date}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-700">{renderUpdateText(u.text)}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteClientUpdate(u.id)}
                className="mt-0.5 shrink-0 text-slate-300 transition hover:text-red-500"
                aria-label="Delete update"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <input
          type="date"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 focus:border-slate-400 focus:outline-none md:text-sm"
          value={newUpdateDate}
          onChange={(e) => setNewUpdateDate(e.target.value)}
          onClick={(e) => e.currentTarget.showPicker?.()}
        />
        <textarea
          rows={3}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none md:text-sm"
          placeholder="Update text (visible to client on portal)"
          value={newUpdateText}
          onChange={(e) => setNewUpdateText(e.target.value)}
        />
        <div className="flex justify-end">
          <SaveButton state={clientUpdatesSave.saveState} onClick={addClientUpdate} mode="add" className="w-full lg:w-auto" />
        </div>
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
              <InlineEditTitle
                value={order.orderName}
                onSave={orderName => upsertItem({ ...order, orderName, order_name: orderName })}
                className="mt-2 break-words text-2xl font-bold leading-tight text-white md:text-4xl"
              />
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

      {/* Quick Actions */}
      {QuickActionsSection}

      {/* Mobile layout — single column (InternalNotes appears full-width below PortalSection) */}
      <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }} className="flex min-w-0 flex-col gap-4 lg:hidden">
        {TimelineSection}
        {NextActionSection}
        {DesignVersionsSection}
        {PaymentStatusSection}
        {OrderDetailsSection}
        {VendorCostSection}
        {IntakeSection}
        {CommunicationSection}
        {ClientUpdatesSection}
      </div>

      {/* Desktop layout — 3 columns with intake data, 2 columns without */}
      {/* InternalNotes is rendered full-width below PortalSection for all layouts */}
      {hasIntake ? (
        <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6">
          <div className="flex flex-col gap-6">
            {PaymentStatusSection}
            {OrderDetailsSection}
            {VendorCostSection}
            {IntakeSection}
          </div>
          <div className="flex flex-col gap-6">
            {TimelineSection}
            {DesignVersionsSection}
          </div>
          <div className="flex flex-col gap-6">
            {CommunicationSection}
            {NextActionSection}
            {ClientUpdatesSection}
          </div>
        </div>
      ) : (
        <div className="hidden lg:grid lg:grid-cols-2 lg:gap-6">
          <div className="flex flex-col gap-6">
            {PaymentStatusSection}
            {OrderDetailsSection}
            {VendorCostSection}
            {CommunicationSection}
            {ClientUpdatesSection}
          </div>
          <div className="flex flex-col gap-6">
            {TimelineSection}
            {DesignVersionsSection}
            {NextActionSection}
          </div>
        </div>
      )}

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

      {/* Internal Notes — full-width below Client Portal for all order types */}
      {InternalNotesSection}

      {/* Send final invoice modal */}
      <SendFinalInvoiceModal
        open={sendInvoiceOpen}
        invoice={invoice ?? null}
        onClose={() => setSendInvoiceOpen(false)}
        onSent={handleInvoiceSent}
      />

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
                onSelect={(r) => setOrderDraft({ ...orderDraft, vendor: recordName(r), vendor_name: recordName(r), vendor_id: r.id })}
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
