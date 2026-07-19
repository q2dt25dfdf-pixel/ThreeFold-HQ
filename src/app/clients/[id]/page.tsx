"use client";

/*
 * SQL migration — run once in Supabase SQL editor to enable client activity logging:
 *
 * create table if not exists client_activity (
 *   id   text primary key,
 *   data jsonb
 * );
 * alter table client_activity enable row level security;
 * create policy "open_access" on client_activity for all using (true) with check (true);
 */

import { useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Check, Edit2, Mail, Phone, Pin, Plus, Trash2 } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { flattenNotes, type NoteEntry, type QuestionnaireFile } from "@/components/crm/types";
import AddOrderModal from "@/components/orders/AddOrderModal";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import InlineEditTitle from "@/components/InlineEditTitle";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { businessTodayISO } from "@/lib/businessDate";
import { formatPhoneNumber } from "@/lib/formatPhone";

type ClientStatus = "Active" | "At Risk" | "Dormant" | "Lead";

type Client = {
  id: string;
  name: string;
  industry: string;
  contact: string;
  email?: string;
  phone?: string;
  owner?: string;
  address?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  website?: string;
  orders: number;
  notes: string;
  notes_list?: NoteEntry[];
  notes_original?: string;
  status: ClientStatus;
};

type Order = {
  id: string;
  orderName: string;
  client: string;
  client_id?: string;
  vendor: string;
  items: string[];
  quantity: number;
  amount: number;
  status: string;
  estimatedDeliveryDate: string;
  notes: string;
};

type ActivityEntry = {
  id: string;
  clientId: string;
  type: "Call" | "Email" | "Text" | "Meeting" | "In Person" | "Other";
  date: string;
  owner: string;
  notes: string;
};

type CRMLead = {
  id: string;
  company: string;
  contact: string;
  email: string;
  phone: string;
  owner: string;
  companyProfile: {
    industry: string;
    address: string;
    website: string;
  };
  stage: string;
  status: string;
  notes: string;
  communicationHistory: Array<{ id: string; type: string; date: string; owner: string; summary: string }>;
  source?: string;
  contact_title?: string;
  contact_method?: string;
  company_description?: string;
  quantity?: string;
  target_date?: string;
  budget?: string;
  apparel_types?: string;
  audience?: string;
  station_code?: string;
  meaning?: string;
  style?: string;
  colors?: string;
  questionnaire_files?: QuestionnaireFile[];
};

const defaultClients: Client[] = [
  {
    id: "client-1",
    name: "POPS – Piranha Ops",
    industry: "Amazon DSP",
    contact: "Ricky",
    email: "ricky@piranhaops.com",
    phone: "TBD",
    owner: "Ricky",
    address: "Bay Area, CA",
    website: "",
    orders: 1,
    notes:
      "First client. Station DSF7, Bay Area warehouse hub. Test order: POPS 2026 Collection — 4 designs, black oversized heavyweight tees. Hannah manages this DSP directly.",
    status: "Active",
  },
];

const owners = ["Alliyah", "Hannah", "Jordan"];
const activityTypes: ActivityEntry["type"][] = ["Call", "Email", "Text", "Meeting", "In Person", "Other"];
const defaultActivity: ActivityEntry[] = [];
const clientStatusOptions: ClientStatus[] = ["Active", "At Risk", "Dormant", "Lead"];

// Color-coded activity type pills — copied from the CRM lead's version (LeadDetailModal).
const typeColors: Record<ActivityEntry["type"], string> = {
  Call: "bg-blue-100 text-blue-800",
  Email: "bg-violet-100 text-violet-800",
  Text: "bg-emerald-100 text-emerald-800",
  Meeting: "bg-amber-100 text-amber-800",
  "In Person": "bg-rose-100 text-rose-800",
  Other: "bg-slate-100 text-slate-700",
};

const today = new Date();

function isOverdue(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const due = new Date(`${date}T00:00:00`);
  return due.getTime() < today.getTime();
}

function orderAmount(amount: number | string) {
  if (typeof amount === "number") return amount;
  const numeric = Number(amount.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(amount: number | string) {
  return orderAmount(amount).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function statusPillClass(status: ClientStatus) {
  return status === "Active"
    ? "bg-emerald-100 text-emerald-800"
    : status === "At Risk" || status === "Dormant"
    ? "bg-amber-100 text-amber-800"
    : status === "Lead"
    ? "bg-blue-100 text-blue-800"
    : "bg-slate-100 text-slate-700";
}

function fmtNoteDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtComposerDate(date: string) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const normalizeMatchValue = (value: string | undefined) => (value ?? "").trim().toLowerCase();

// One client note — pinned notes get an amber tint/border; unpinned are plain white.
// Replicated locally from the CRM lead's NoteCard (not imported from LeadDetailModal).
function NoteCard({ note, onTogglePin, onDelete }: { note: NoteEntry; onTogglePin: () => void; onDelete: () => void }) {
  return (
    <div className={`rounded-2xl border p-3 ${note.pinned ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-800 md:text-sm">{note.text}</p>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
            title={note.pinned ? "Unpin" : "Pin"}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${note.pinned ? "text-amber-600 hover:bg-amber-100" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
          >
            <Pin className="h-4 w-4" fill={note.pinned ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete note"
            title="Delete"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
        {note.pinned && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">PINNED</span>}
        <span className="truncate">{note.author} · {fmtNoteDate(note.created_at)}</span>
      </div>
    </div>
  );
}

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const { data: clients, upsertItem: upsertClient, loading: clientsLoading, error: clientsError } = useSupabaseTable<Client>("clients", defaultClients);
  const { data: orders, upsertItem: upsertOrder, loading: ordersLoading, error: ordersError, reload: reloadOrders } = useSupabaseTable<Order>("orders", []);
  const { data: activity, upsertItem: upsertActivity, deleteItem: deleteActivity, loading: activityLoading } = useSupabaseTable<ActivityEntry>("client_activity", defaultActivity);
  const { data: crmLeads, upsertItem: upsertLead } = useSupabaseTable<CRMLead>("crm_leads", []);
  const [editingHeader, setEditingHeader] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [clientDraft, setClientDraft] = useState<Client | null>(null);
  const clientSave = useSaveState();
  const contactSave = useSaveState();

  // Activity composer state — mirrors the CRM lead's collapsed/expand composer.
  const [activityForm, setActivityForm] = useState({
    type: "Call" as ActivityEntry["type"],
    owner: "Alliyah",
    notes: "",
    date: businessTodayISO(),
  });
  const [activityComposerOpen, setActivityComposerOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [activityErrorText, setActivityErrorText] = useState("");

  // Notes composer state (pinnable timeline, mirrors the CRM lead).
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDraftPinned, setNoteDraftPinned] = useState(false);
  // Stable migration timestamp per client open, so the imported note's date/key don't
  // churn across renders before the first save.
  const migratedAtRef = useRef<{ id: string; iso: string } | null>(null);

  const [clientFormError, setClientFormError] = useState("");

  const client = clients.find((item) => item.id === clientId);
  const clientOrders = orders.filter((order) => {
    if (!client) return false;
    if (order.client_id) return order.client_id === clientId;
    return order.client.trim().toLowerCase() === client.name.trim().toLowerCase();
  });
  const clientActivity = activity
    .filter((entry) => entry.clientId === clientId)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.id || "").localeCompare(a.id || ""));

  const totalSpend = useMemo(
    () => clientOrders.reduce((sum, order) => sum + orderAmount(order.amount), 0),
    [clientOrders],
  );

  const overdueClientOrders = clientOrders.filter(
    (order) => order.status !== "Delivered" && order.status !== "Cancelled" && isOverdue(order.estimatedDeliveryDate),
  );

  const matchingLead = useMemo(() => {
    if (!client) return null;
    const email = client.email?.trim().toLowerCase();
    const name = client.name?.trim().toLowerCase();
    return crmLeads.find((l) =>
      (email && l.email?.trim().toLowerCase() === email) ||
      (name && l.company?.trim().toLowerCase() === name)
    ) ?? null;
  }, [client, crmLeads]);

  const leadCommHistory = Array.isArray(matchingLead?.communicationHistory)
    ? matchingLead.communicationHistory
    : [];

  const findLeadForClient = (clientRecord: Client, previousClient?: Client | null) => {
    const email = normalizeMatchValue(clientRecord.email);
    const previousEmail = normalizeMatchValue(previousClient?.email);
    const company = normalizeMatchValue(clientRecord.name);
    const previousCompany = normalizeMatchValue(previousClient?.name);

    if (email) {
      const emailMatch = crmLeads.find((lead) => normalizeMatchValue(lead.email) === email);
      if (emailMatch) return emailMatch;
    }
    if (previousEmail) {
      const previousEmailMatch = crmLeads.find((lead) => normalizeMatchValue(lead.email) === previousEmail);
      if (previousEmailMatch) return previousEmailMatch;
    }

    if (company) {
      const companyMatch = crmLeads.find((lead) => normalizeMatchValue(lead.company) === company);
      if (companyMatch) return companyMatch;
    }
    if (previousCompany) {
      return crmLeads.find((lead) => normalizeMatchValue(lead.company) === previousCompany);
    }

    return undefined;
  };

  const syncClientProfileToLead = async (updatedClient: Client, previousClient?: Client | null) => {
    const lead = findLeadForClient(updatedClient, previousClient);
    if (!lead) return;

    await upsertLead({
      ...lead,
      company: updatedClient.name,
      contact: updatedClient.contact,
      email: updatedClient.email ?? "",
      phone: updatedClient.phone ?? "",
      owner: updatedClient.owner ?? lead.owner,
      companyProfile: {
        ...lead.companyProfile,
        industry: updatedClient.industry,
        address: updatedClient.address ?? "",
        website: updatedClient.website ?? "",
      },
    });
  };

  const saveClient = (fields: Partial<Client>) => {
    if (!client) return;
    const updatedClient = { ...client, ...fields };
    void upsertClient(updatedClient).then((response) => {
      if (!response.error) void syncClientProfileToLead(updatedClient, client);
    });
  };

  const openClientEditor = () => {
    if (!client) return;
    clientSave.resetSaveState();
    setClientDraft({ ...client, owner: client.owner ?? "" });
  };

  const saveClientDraft = async () => {
    if (!clientDraft) return;
    if (!clientDraft.name.trim()) {
      setClientFormError("Client name is required.");
      return;
    }
    setClientFormError("");
    const previousClient = client;
    await clientSave.runSave(async () => {
      const response = await upsertClient(clientDraft);
      if (!response.error) await syncClientProfileToLead(clientDraft, previousClient);
      return response;
    }, () => { setClientDraft(null); setClientFormError(""); });
  };

  const saveHeaderContact = async () => {
    if (!client) return;
    await contactSave.runSave(async () => {
      const response = await upsertClient(client);
      if (!response.error) await syncClientProfileToLead(client, client);
      return response;
    });
  };

  // Add or (when editingActivityId is set) update a client_activity row. Keeps the
  // client's own table + `notes` field — no rename to `summary`, no schema change.
  const addActivity = async () => {
    if (!activityForm.notes.trim()) {
      setActivityErrorText("Activity notes are required.");
      return;
    }
    setActivityErrorText("");
    const entry: ActivityEntry = {
      id: editingActivityId ?? `activity-${Date.now()}`,
      clientId,
      type: activityForm.type,
      owner: activityForm.owner,
      notes: activityForm.notes.trim(),
      date: activityForm.date,
    };
    try {
      const response = await upsertActivity(entry);
      if (response?.error) {
        setActivityErrorText("Couldn't save activity. Please try again.");
        return;
      }
      setActivityForm((current) => ({ ...current, type: "Call", owner: "Alliyah", notes: "", date: businessTodayISO() }));
      setEditingActivityId(null);
      setActivityComposerOpen(false);
    } catch {
      setActivityErrorText("Couldn't save activity. Please try again.");
    }
  };

  const startEditActivity = (entry: ActivityEntry) => {
    setEditingActivityId(entry.id);
    setActivityForm({ type: entry.type, owner: entry.owner, notes: entry.notes, date: entry.date });
    setActivityErrorText("");
    setActivityComposerOpen(true);
  };

  const cancelActivityEdit = () => {
    setEditingActivityId(null);
    setActivityForm((current) => ({ ...current, type: "Call", owner: "Alliyah", notes: "", date: businessTodayISO() }));
    setActivityErrorText("");
    setActivityComposerOpen(false);
  };

  const deleteActivityEntry = (id: string) => {
    if (!window.confirm("Delete this activity entry?")) return;
    void deleteActivity(id);
    if (editingActivityId === id) cancelActivityEdit();
  };

  if (clientsLoading || ordersLoading) return <LoadingState label="Loading client..." />;

  if (!client) {
    return (
      <div className="min-h-screen p-2 md:p-8">
        <button type="button" onClick={() => router.push("/clients")} className="flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-950 md:text-sm">
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Clients
        </button>
        <div className="mt-8 rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-8">
          <h1 className="text-base font-semibold text-slate-950 md:text-2xl">Client not found</h1>
          <p className="mt-2 text-xs text-slate-500 md:text-sm">This client may have been deleted or is not available in Supabase.</p>
        </div>
      </div>
    );
  }

  // Notes: notes_list is the source of truth; `notes` (string) is a flat mirror the rest of
  // the app still reads. A legacy single `notes` string migrates into ONE pinned "Imported"
  // note for display, and is PERSISTED on the next commitNotes (with notes_original backup).
  if (!migratedAtRef.current || migratedAtRef.current.id !== client.id) {
    migratedAtRef.current = { id: client.id, iso: new Date().toISOString() };
  }
  const migrationTime = migratedAtRef.current.iso;

  const notesList: NoteEntry[] = Array.isArray(client.notes_list)
    ? client.notes_list
    : client.notes && client.notes.trim()
      ? [{ id: "note-import", text: client.notes, pinned: true, author: "Imported", created_at: migrationTime }]
      : [];

  const commitNotes = (nextList: NoteEntry[]) => {
    const migrating = !Array.isArray(client.notes_list);
    void upsertClient({
      ...client,
      notes_list: nextList,
      notes: flattenNotes(nextList),
      ...(migrating && client.notes_original === undefined && (client.notes ?? "").trim()
        ? { notes_original: client.notes }
        : {}),
    });
  };

  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    const entry: NoteEntry = {
      id: `note-${Date.now()}`,
      text,
      pinned: noteDraftPinned,
      author: client.owner || "Alliyah",
      created_at: new Date().toISOString(),
    };
    commitNotes([entry, ...notesList]);
    setNoteDraft("");
    setNoteDraftPinned(false);
    setNoteComposerOpen(false);
  };

  const toggleNotePin = (id: string) => {
    commitNotes(notesList.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
  };

  const removeNote = (id: string) => {
    const note = notesList.find((n) => n.id === id);
    if (!note) return;
    if (note.pinned && !window.confirm("Delete this pinned note?")) return;
    commitNotes(notesList.filter((n) => n.id !== id));
  };

  const byNewest = (a: NoteEntry, b: NoteEntry) => (b.created_at || "").localeCompare(a.created_at || "");
  const pinnedNotes = notesList.filter((n) => n.pinned).sort(byNewest);
  const unpinnedNotes = notesList.filter((n) => !n.pinned).sort(byNewest);

  const leadQuestionnaireFields = [
    { label: "Contact title", value: matchingLead?.contact_title },
    { label: "Preferred contact", value: matchingLead?.contact_method },
    { label: "Company description", value: matchingLead?.company_description },
    { label: "Requested quantity", value: matchingLead?.quantity },
    { label: "Target date", value: matchingLead?.target_date },
    { label: "Budget", value: matchingLead?.budget },
    { label: "Apparel types", value: matchingLead?.apparel_types },
    { label: "Audience", value: matchingLead?.audience },
    { label: "Station code", value: matchingLead?.station_code },
    { label: "Meaning / brand story", value: matchingLead?.meaning },
    { label: "Style preferences", value: matchingLead?.style },
    { label: "Colors", value: matchingLead?.colors },
  ].filter((f) => f.value?.trim());

  const needsAttention = overdueClientOrders.length > 0 || client.status === "At Risk" || client.status === "Dormant";

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden text-xs md:text-sm">
      <ErrorBanner message={clientsError || ordersError} />

      <div className="space-y-6 px-1 pb-4 pt-2 sm:p-6 lg:p-8">
        {/* ── Light hero (replaces the old dark header) ─────────────────────────── */}
        <header className="rounded-[2rem] bg-slate-50 p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <button type="button" onClick={() => router.push("/clients")} className="mb-5 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 md:text-sm">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            Clients
          </button>
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] lg:items-start">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Client</p>
              <InlineEditTitle
                value={client.name}
                onSave={name => saveClient({ name })}
                className="mt-2 break-words text-2xl font-semibold leading-tight tracking-tight text-slate-950 md:text-4xl"
              />
              <div className="mt-4 flex min-w-0 flex-wrap gap-3 text-xs text-slate-600 md:gap-4 md:text-sm">
                <span className="flex min-w-0 items-center gap-2 break-words"><Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{client.contact || "No contact"}</span>
                <span className="flex min-w-0 items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{client.email || "No email"}</span>
                <span className="flex min-w-0 items-center gap-2 break-words"><Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />{client.phone || "No phone"}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 ring-1 ring-slate-200">{client.industry || "No industry"}</span>
                <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${statusPillClass(client.status)}`}>{client.status}</span>
              </div>
            </div>
            {/* Spend headline + supporting stats */}
            <div className="flex min-w-0 flex-col gap-3">
              <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Total Spent</p>
                <p className="mt-2 text-3xl font-bold tracking-tight text-emerald-700 md:text-4xl">{formatCurrency(totalSpend)}</p>
                <p className="mt-1.5 text-[11px] text-slate-500">across {clientOrders.length} order{clientOrders.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  contactSave.resetSaveState();
                  setEditingHeader((value) => !value);
                }}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-3xl border border-slate-300 bg-white px-5 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
              >
                <Edit2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Edit contact
              </button>
            </div>
          </div>

          {needsAttention && (
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {overdueClientOrders.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-[11px] font-semibold text-rose-700">
                  {overdueClientOrders.length} overdue order{overdueClientOrders.length !== 1 ? "s" : ""}
                </span>
              )}
              {(client.status === "At Risk" || client.status === "Dormant") && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold text-amber-700">
                  Account {client.status}
                </span>
              )}
            </div>
          )}

          {editingHeader && (
            <div className="mt-6 grid gap-3 rounded-[2rem] bg-white p-4 ring-1 ring-slate-100 md:grid-cols-3">
              {[
                { label: "Contact", key: "contact", value: client.contact },
                { label: "Email", key: "email", value: client.email ?? "" },
                { label: "Phone", key: "phone", value: client.phone ?? "" },
              ].map((field) => (
                <label key={field.key} className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">
                  {field.label}
                  <input
                    className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500 md:text-sm"
                    value={field.value}
                    onChange={(event) => saveClient({ [field.key]: field.key === 'phone' ? formatPhoneNumber(event.target.value) : event.target.value } as Partial<Client>)}
                  />
                </label>
              ))}
              <div className="md:col-span-3">
                <button
                  type="button"
                  onClick={saveHeaderContact}
                  disabled={contactSave.saveState === "saving"}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-3xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 md:text-sm"
                >
                  {contactSave.saveState === "saving" ? "Saving…" :
                   contactSave.saveState === "success" ? <><Check className="h-4 w-4" aria-hidden="true" /> Saved</> :
                   contactSave.saveState === "error" ? "Couldn't save. Try again." :
                   "Save contact"}
                </button>
              </div>
            </div>
          )}
        </header>

        {matchingLead && (
          <button
            type="button"
            onClick={() => router.push("/crm")}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            View CRM Lead
          </button>
        )}

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950 md:text-lg">Account details</h2>
                <p className="mt-1 text-xs text-slate-500 md:text-sm">Review client profile and account details.</p>
              </div>
              <button type="button" onClick={openClientEditor} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm">
                <Edit2 className="h-4 w-4" aria-hidden="true" />
                Edit
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {[
                { label: "Company", value: client.industry },
                { label: "Address", value: client.address ?? "Not set" },
                { label: "Website", value: client.website || "Not set" },
                { label: "Owner", value: client.owner || "Not set" },
                { label: "Status", value: client.status },
              ].map((field) => (
                <div key={field.label} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{field.label}</p>
                  <p className="mt-1.5 text-xs font-semibold text-slate-950 md:text-sm">{field.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950 md:text-lg">Order history</h2>
                <p className="mt-1 text-xs text-slate-500 md:text-sm">Orders connected to this client.</p>
              </div>
              <button type="button" onClick={() => setShowOrderModal(true)} className="inline-flex min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 md:text-sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add order
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {clientOrders.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-500 md:p-5 md:text-sm">No orders added yet.</p>}
              {clientOrders.map((order) => {
                const overdue = order.status !== "Delivered" && order.status !== "Cancelled" && isOverdue(order.estimatedDeliveryDate);
                return (
                  <div key={order.id} className="flex flex-col gap-3 rounded-2xl bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{order.orderName}</p>
                      <p className={`mt-1 text-xs md:text-sm ${overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                        {order.estimatedDeliveryDate || "TBD"}{overdue ? " · overdue" : ""} · {order.vendor || "No vendor"} · {formatCurrency(order.amount)}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 ring-1 ring-slate-200">{order.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {matchingLead && (
          <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950 md:text-lg">Lead History</h2>
                <p className="mt-1 text-xs text-slate-500 md:text-sm">Original CRM lead data — edit on the CRM page.</p>
              </div>
              <button
                type="button"
                onClick={() => router.push("/crm")}
                className="shrink-0 rounded-2xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-slate-50"
              >
                Open in CRM
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-700">
                  {matchingLead.stage}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {matchingLead.status}
                </span>
              </div>
              {matchingLead.notes && (
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Lead notes</p>
                  <p className="mt-1.5 text-xs text-slate-700 md:text-sm">{matchingLead.notes}</p>
                </div>
              )}
              {leadQuestionnaireFields.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Questionnaire</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {matchingLead.source && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                          {matchingLead.source}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400">{matchingLead.company}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/crm/leads/${matchingLead.id}`)}
                    className="shrink-0 rounded-2xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-slate-50"
                  >
                    View Questionnaire
                  </button>
                </div>
              )}
              {leadCommHistory.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Activity from CRM</p>
                  <div className="space-y-2">
                    {leadCommHistory.map((entry) => (
                      <div key={entry.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">{entry.type}</span>
                          <span className="text-xs text-slate-400">{entry.date} · {entry.owner}</span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-700 md:text-sm">{entry.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Activity log — matches the CRM lead's version, on client_activity ──── */}
        <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Activity</h2>
              <span className="text-xs font-semibold text-slate-400">{clientActivity.length}</span>
            </div>

            {activityComposerOpen || editingActivityId !== null ? (
              <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex gap-2">
                  <select
                    className="min-h-11 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none md:text-sm"
                    value={activityForm.type}
                    onChange={(e) => setActivityForm((current) => ({ ...current, type: e.target.value as ActivityEntry["type"] }))}
                  >
                    {activityTypes.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <select
                    className="min-h-11 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none md:text-sm"
                    value={activityForm.owner}
                    onChange={(e) => setActivityForm((current) => ({ ...current, owner: e.target.value }))}
                  >
                    {owners.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs text-slate-700 outline-none focus:border-slate-400 md:text-sm"
                  value={activityForm.date}
                  max={businessTodayISO()}
                  onChange={(e) => setActivityForm((current) => ({ ...current, date: e.target.value }))}
                />
                <textarea
                  rows={2}
                  className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                  placeholder="What happened? Add notes..."
                  value={activityForm.notes}
                  onChange={(e) => { setActivityForm((current) => ({ ...current, notes: e.target.value })); if (activityErrorText) setActivityErrorText(""); }}
                />
                <FieldError message={activityErrorText} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelActivityEdit}
                    className="min-h-11 flex-1 rounded-3xl border border-slate-300 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addActivity}
                    disabled={!activityForm.notes.trim()}
                    className="min-h-11 flex-1 rounded-3xl bg-slate-900 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 md:text-sm"
                  >
                    {editingActivityId !== null ? `Update · ${fmtComposerDate(activityForm.date)}` : `Log · ${fmtComposerDate(activityForm.date)}`}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setActivityComposerOpen(true)}
                className="mb-4 flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Plus className="h-3 w-3" aria-hidden="true" /></span>
                Log a call, email, or meeting
              </button>
            )}

            {activityLoading && clientActivity.length === 0 ? (
              <p className="text-xs text-slate-400 md:text-sm">Loading activity…</p>
            ) : clientActivity.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No activity logged yet.</p>
            ) : (
              (() => {
                const n = clientActivity.length;
                const visibleEntries = showAllActivity ? clientActivity : clientActivity.slice(0, 3);
                return (
                  <>
                    <div className="space-y-3">
                      {visibleEntries.map((entry, i) => {
                        const fade = !showAllActivity && n > 3 && i === visibleEntries.length - 1;
                        return (
                          <div key={entry.id} className="relative">
                            <div className={`rounded-2xl border bg-white p-4 ${editingActivityId === entry.id ? "border-slate-400 ring-1 ring-slate-300" : "border-slate-200"}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${typeColors[entry.type]}`}>
                                  {entry.type}
                                </span>
                                <div className="flex shrink-0 items-center gap-3">
                                  <span className="text-xs text-slate-600">{entry.date} · {entry.owner}</span>
                                  <button type="button" onClick={() => startEditActivity(entry)} className="text-[11px] text-slate-400 underline hover:text-slate-700">Edit</button>
                                  <button type="button" onClick={() => deleteActivityEntry(entry.id)} className="text-[11px] text-rose-400 underline hover:text-rose-600">Delete</button>
                                </div>
                              </div>
                              <p className="mt-2 break-words text-xs text-slate-700 md:text-sm">{entry.notes}</p>
                            </div>
                            {fade && (
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 rounded-b-2xl bg-gradient-to-t from-slate-50 to-transparent" aria-hidden="true" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {n > 3 && (
                      <button
                        type="button"
                        onClick={() => setShowAllActivity((v) => !v)}
                        className="mt-3 min-h-11 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-900"
                      >
                        {showAllActivity ? "Show fewer" : `Show all ${n}`}
                      </button>
                    )}
                  </>
                );
              })()
            )}
          </div>
        </section>

        {/* ── Notes — pinnable timeline, matches the CRM lead ────────────────────── */}
        <section className="w-full min-w-0 rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Notes</h2>
              <span className="text-xs font-semibold text-slate-400">{notesList.length}</span>
            </div>

            {noteComposerOpen ? (
              <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <textarea
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                  placeholder="Write a note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setNoteDraftPinned((v) => !v)}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-semibold ${
                      noteDraftPinned ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Pin className="h-3.5 w-3.5" fill={noteDraftPinned ? "currentColor" : "none"} aria-hidden="true" />
                    {noteDraftPinned ? "Pinned" : "Pin"}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setNoteComposerOpen(false); setNoteDraft(""); setNoteDraftPinned(false); }}
                      className="min-h-9 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addNote}
                      disabled={!noteDraft.trim()}
                      className="min-h-9 rounded-2xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      Add note
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNoteComposerOpen(true)}
                className="mb-4 flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500"><Plus className="h-3 w-3" aria-hidden="true" /></span>
                Add a note
              </button>
            )}

            {notesList.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 md:text-sm">
                Standing facts about this client go here. Pin the ones that always matter.
              </p>
            ) : (
              <div className="space-y-3">
                {pinnedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} onTogglePin={() => toggleNotePin(note.id)} onDelete={() => removeNote(note.id)} />
                ))}
                {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Other</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
                {unpinnedNotes.map((note) => (
                  <NoteCard key={note.id} note={note} onTogglePin={() => toggleNotePin(note.id)} onDelete={() => removeNote(note.id)} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <AddOrderModal
        open={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        prefilledClient={client.name}
        onSaved={async (savedOrder) => {
          if (!savedOrder.client_id) {
            await upsertOrder({ ...savedOrder, client_id: clientId });
          }
          await reloadOrders();
        }}
      />

      {clientDraft && (
        <ModalShell
          title="Edit client"
          onClose={() => { setClientDraft(null); clientSave.resetSaveState(); }}
          maxWidth="max-w-lg"
          footer={
            <div className="space-y-3">
              <FieldError message={clientFormError} />
              <div className="flex gap-3">
                <SaveButton state={clientSave.saveState} onClick={saveClientDraft} className="flex-1 py-3" />
                <button type="button" onClick={() => { setClientDraft(null); clientSave.resetSaveState(); }} className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm">Cancel</button>
              </div>
            </div>
          }
        >
            <div className="space-y-4">
              {[
                { label: "Name", key: "name" },
                { label: "Company", key: "industry" },
                { label: "Website", key: "website" },
                { label: "Owner", key: "owner" },
                { label: "Contact", key: "contact" },
                { label: "Email", key: "email" },
                { label: "Phone", key: "phone" },
              ].map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">{field.label}</span>
                  <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={String(clientDraft[field.key as keyof Client] ?? "")} onChange={(event) => { setClientDraft({ ...clientDraft, [field.key]: event.target.value }); if (clientFormError) setClientFormError(""); }} />
                </label>
              ))}

              {/* Address — autocomplete fills all structured fields in one update */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Business Address</span>
                <AddressAutocomplete
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={clientDraft.address ?? ""}
                  onChange={(value) => setClientDraft({ ...clientDraft, address: value })}
                  onSelectStructured={(s) => setClientDraft({
                    ...clientDraft,
                    address: s.display_name,
                    address_line1: s.address_line1,
                    city: s.city,
                    state: s.state,
                    zip: s.zip,
                    country: s.country,
                  })}
                />
              </div>

              {/* Structured address fields */}
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">
                  Address Line 2 <span className="font-normal text-slate-400">(Suite, Floor, Unit)</span>
                </span>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                  placeholder="Suite 100, Unit B..."
                  value={clientDraft.address_line2 ?? ""}
                  onChange={(e) => setClientDraft({ ...clientDraft, address_line2: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">City</span>
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                    placeholder="San Jose"
                    value={clientDraft.city ?? ""}
                    onChange={(e) => setClientDraft({ ...clientDraft, city: e.target.value })}
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">State</span>
                  <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                    placeholder="CA"
                    value={clientDraft.state ?? ""}
                    onChange={(e) => setClientDraft({ ...clientDraft, state: e.target.value })}
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">ZIP</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                    placeholder="95128"
                    value={clientDraft.zip ?? ""}
                    onChange={(e) => setClientDraft({ ...clientDraft, zip: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">
                  Country <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input
                  type="text"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
                  placeholder="United States"
                  value={clientDraft.country ?? ""}
                  onChange={(e) => setClientDraft({ ...clientDraft, country: e.target.value })}
                />
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Status</span>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={clientDraft.status} onChange={(event) => setClientDraft({ ...clientDraft, status: event.target.value as ClientStatus })}>
                  {clientStatusOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-700 md:text-sm">Orders</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  placeholder="0"
                  value={clientDraft.orders === 0 ? "" : clientDraft.orders}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/^0+(?=\d)/, "");
                    setClientDraft({ ...clientDraft, orders: raw === "" ? 0 : Number(raw) });
                  }}
                />
              </label>
            </div>
        </ModalShell>
      )}
    </main>
  );
}
