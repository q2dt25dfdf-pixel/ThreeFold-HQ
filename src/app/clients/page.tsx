"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Search, Trash2 } from "lucide-react";
import ModalShell from "@/components/ModalShell";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { orderEstDeliveryDate } from "@/lib/estDelivery";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { ErrorBanner, FieldError } from "@/components/AppState";
import { ClientsSkeleton } from "@/components/Skeleton";
import SaveButton, { type SaveState, useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Client = {
  id: string;
  name: string;
  industry: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  website: string;
  orders: number;
  notes: string;
  status: "Active" | "Lead" | "At Risk" | "Dormant" | "Inactive";
};
type ClientForm = Omit<Client, "id">;

// Widened from { id, client } to read revenue/status/date off the SAME already-loaded
// orders table (no new query, no new field names). Powers per-client revenue + overdue
// via the detail page's hybrid linkage (client_id || name).
type Order = {
  id: string;
  client: string;
  client_id?: string;
  amount: number;
  status: string;
  estimatedDeliveryDate: string;
};

const today = new Date();

// Same shape the detail page uses to coerce a stored amount to a number.
function orderAmount(amount: number | string) {
  if (typeof amount === "number") return amount;
  const numeric = Number(String(amount).replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

// Same overdue rule as the Orders redesign — pure date compare, display-only.
function isOverdue(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const due = new Date(`${date}T00:00:00`);
  return due.getTime() < today.getTime();
}

function statusPillClass(status: Client["status"]) {
  return status === "Active"
    ? "bg-emerald-100 text-emerald-800"
    : status === "At Risk" || status === "Dormant"
    ? "bg-amber-100 text-amber-800"
    : status === "Lead"
    ? "bg-blue-100 text-blue-800"
    : "bg-slate-100 text-slate-700";
}

const FILTERS: { label: string; value: "all" | "active" | "orders" }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "By orders", value: "orders" },
];

const defaultClients: Client[] = [
  {
    id: "client-1",
    name: "POPS – Piranha Ops",
    industry: "Amazon DSP",
    contact: "Ricky",
    email: "",
    phone: "",
    address: "",
    website: "",
    orders: 1,
    notes: "First client. Station DSF7, Bay Area warehouse hub. Test order: POPS 2026 Collection — 4 designs, black oversized heavyweight tees. Hannah manages this DSP directly.",
    status: "Active",
  },
];

const emptyForm: ClientForm = { name: "", industry: "", contact: "", email: "", phone: "", address: "", address_line1: "", address_line2: "", city: "", state: "", zip: "", country: "", website: "", orders: 0, notes: "", status: "Active" };
function FormFields({ form, setForm }: { form: ClientForm; setForm: (next: ClientForm) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Company Name
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="e.g. POPS - Piranha Ops"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Contact Name
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="e.g. Ricky"
            value={form.contact}
            onChange={(event) => setForm({ ...form, contact: event.target.value })}
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Email Address
          <input
            type="email"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Phone Number
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: formatPhoneNumber(event.target.value) })}
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Company
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            value={form.industry}
            onChange={(event) => setForm({ ...form, industry: event.target.value })}
          >
            <option value="">Select type</option>
            <option>Amazon DSP</option>
            <option>Dental Office</option>
            <option>Medical Practice</option>
            <option>Gym / Fitness Studio</option>
            <option>Restaurant / Food & Beverage</option>
            <option>Retail Store</option>
            <option>Contractor / Trades</option>
            <option>Corporate / Enterprise</option>
            <option>Sports Team</option>
            <option>Real Estate</option>
            <option>Nonprofit</option>
            <option>Other</option>
          </select>
        </label>
        <div className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Business Address
          <AddressAutocomplete
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="Start typing an address..."
            value={form.address}
            onChange={(value) => setForm({ ...form, address: value })}
            onSelectStructured={(s) => setForm({
              ...form,
              address: s.display_name,
              address_line1: s.address_line1,
              city: s.city,
              state: s.state,
              zip: s.zip,
              country: s.country,
            })}
          />
        </div>
      </div>

      {/* Structured address fields — auto-populated from autocomplete, also editable manually */}
      <div className="space-y-3">
        <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Address Line 2 <span className="font-normal text-slate-400">(Suite, Floor, Unit — optional)</span>
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="Suite 100, Unit B..."
            value={form.address_line2 ?? ""}
            onChange={(event) => setForm({ ...form, address_line2: event.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            City
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
              placeholder="San Jose"
              value={form.city ?? ""}
              onChange={(event) => setForm({ ...form, city: event.target.value })}
            />
          </label>
          <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            State
            <input
              type="text"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
              placeholder="CA"
              value={form.state ?? ""}
              onChange={(event) => setForm({ ...form, state: event.target.value })}
            />
          </label>
          <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
            ZIP
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
              placeholder="95128"
              value={form.zip ?? ""}
              onChange={(event) => setForm({ ...form, zip: event.target.value })}
            />
          </label>
        </div>
        <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Country <span className="font-normal text-slate-400">(optional)</span>
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="United States"
            value={form.country ?? ""}
            onChange={(event) => setForm({ ...form, country: event.target.value })}
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Website
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="https://yourwebsite.com"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Status
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as Client["status"] })}
          >
            <option>Active</option>
            <option>Lead</option>
            <option>At Risk</option>
            <option>Dormant</option>
            <option>Inactive</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
        Notes
        <textarea
          rows={5}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </label>
    </div>
  );
}

function Modal({ title, onSave, onClose, onDelete, saveState, mode = "edit", children }: { title: string; onSave: () => void; onClose: () => void; onDelete?: () => void; saveState: SaveState; mode?: "add" | "edit"; children: ReactNode }) {
  const footer = (
    <div className="space-y-3">
      <div className="flex gap-3">
        <SaveButton state={saveState} onClick={onSave} mode={mode} className="flex-1 py-3" />
        <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onClose}>Cancel</button>
      </div>
      {onDelete && (
        <button type="button" className="w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={onDelete}>Delete client</button>
      )}
    </div>
  );
  return (
    <ModalShell title={title} subtitle="Keep client account details ready for orders, follow-ups, and reporting." onClose={onClose} maxWidth="max-w-3xl" footer={footer}>
      {children}
    </ModalShell>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const { data: clients, upsertItem, deleteItem, loading, error } = useSupabaseTable<Client>("clients", defaultClients);
  const { data: orders } = useSupabaseTable<Order>("orders", []);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "orders">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const addSave = useSaveState();
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const orderCountForClient = (clientName: string) =>
    orders.filter((order) => order.client.trim().toLowerCase() === clientName.trim().toLowerCase()).length;

  // Hybrid client↔order linkage, copied verbatim from clients/[id] (lines 167-171):
  // prefer client_id, fall back to case-insensitive name match. Powers revenue + overdue.
  const ordersForClient = (client: Client) =>
    orders.filter((order) =>
      order.client_id ? order.client_id === client.id : order.client.trim().toLowerCase() === client.name.trim().toLowerCase(),
    );
  const revenueForClient = (client: Client) =>
    ordersForClient(client).reduce((sum, order) => sum + orderAmount(order.amount), 0);
  const hasOverdueOrder = (client: Client) =>
    ordersForClient(client).some((order) => order.status !== "Delivered" && order.status !== "Cancelled" && isOverdue(orderEstDeliveryDate(order)));

  const visible = clients
    .filter((client) =>
      Object.values(client).join(" ").toLowerCase().includes(query.toLowerCase()),
    )
    .filter((client) => activeFilter !== "active" || client.status === "Active")
    .sort((a, b) => activeFilter === "orders" ? orderCountForClient(b.name) - orderCountForClient(a.name) : 0);
  const totalOrders = orders.length;
  const activeClients = clients.filter((client) => client.status === "Active").length;

  // Hero + needs-attention derivations — all pure, from already-loaded tables.
  const lifetimeRevenue = orders.reduce((sum, order) => sum + orderAmount(order.amount), 0);
  const atRiskClients = clients.filter((client) => client.status === "At Risk" || client.status === "Dormant");
  const overdueClients = clients.filter((client) => hasOverdueOrder(client));
  const attentionItems = [
    ...atRiskClients.map((client) => ({ client, kind: "status" as const })),
    ...overdueClients.map((client) => ({ client, kind: "overdue" as const })),
  ];
  const attentionCount = attentionItems.length;

  const handleAdd = async () => {
    if (!form.name.trim()) {
      setFormError("Company name is required.");
      return;
    }
    setFormError("");
    const newClient = { id: `client-${Date.now()}`, ...form };
    await addSave.runSave(async () => {
      const response = await upsertItem(newClient);
      if (!response.error) setForm(emptyForm);
      return response;
    }, () => setShowAdd(false));
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    setDeletingId(id);
    void deleteItem(id).finally(() => setDeletingId(""));
  };

  if (loading) return <ClientsSkeleton />;

  return (
    <div className="space-y-6 text-sm md:text-base">
      <ErrorBanner message={error} />

      {/* ── Header + search + add ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-600 md:text-sm">Client accounts</p>
          <h1 className="mt-3 text-base font-semibold text-slate-950 md:text-3xl">Client accounts</h1>
          <p className="mt-2 text-xs text-slate-600 md:text-sm">Manage your client relationships and order history</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <label className="relative w-full sm:w-64 md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs text-slate-900 outline-none focus:border-slate-400 sm:w-64 md:text-sm" placeholder="Search clients..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="min-h-11 w-full rounded-3xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 active:bg-slate-800 md:w-auto md:text-sm" onClick={() => { setForm(emptyForm); setFormError(""); addSave.resetSaveState(); setShowAdd(true); }}>Add client</button>
        </div>
      </div>

      {/* ── Hero row: Active clients (count-led) + Total clients + Need Attention ── */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        {/* HERO — Active clients. Count is the headline; lifetime revenue is the pill. */}
        <div className="rounded-[2rem] bg-slate-50 p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Active Clients</p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{activeClients}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">of {clients.length} total account{clients.length !== 1 ? "s" : ""}</p>
          <span className="mt-3 inline-block rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-slate-200">
            {formatCurrency(lifetimeRevenue)} lifetime revenue booked
          </span>
        </div>
        {/* Total clients */}
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Total Clients</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{clients.length}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">across {totalOrders} order{totalOrders !== 1 ? "s" : ""}</p>
        </div>
        {/* Need Attention */}
        <div className={`rounded-[2rem] p-5 shadow-sm md:p-6 ${attentionCount > 0 ? "bg-amber-50 ring-1 ring-amber-100" : "bg-white ring-1 ring-slate-100"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Need Attention</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight md:text-3xl ${attentionCount > 0 ? "text-amber-600" : "text-slate-400"}`}>{attentionCount}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">at-risk or with an overdue order</p>
          {overdueClients.length > 0 && (
            <span className="mt-3 inline-block rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-semibold text-rose-700">{overdueClients.length} overdue</span>
          )}
        </div>
      </section>

      {/* ── Needs Attention band — each row opens the client ──────────────────── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Needs Attention</h2>
        {attentionItems.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
            <p className="text-xs font-semibold text-emerald-800">All caught up — no clients need attention.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attentionItems.map(({ client, kind }) => (
              <div
                key={`${kind}-${client.id}`}
                className={`flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${kind === "overdue" ? "bg-rose-50" : "bg-amber-50"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">{client.name}</p>
                  <p className="truncate text-[10px] text-slate-500">{client.industry ? `${client.industry} · ` : ""}{client.contact || "No contact"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${kind === "overdue" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                    {kind === "overdue" ? <Clock className="h-3 w-3" aria-hidden="true" /> : null}
                    {kind === "overdue" ? "Overdue order" : client.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/clients/${client.id}`)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    View client
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Calm detail — filter chips + client cards ─────────────────────────── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-base font-semibold text-slate-950 md:text-lg">All clients</h2>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setActiveFilter(f.value)}
                className={`min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition md:text-xs ${
                  activeFilter === f.value ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-xs font-semibold text-slate-500 md:text-sm">
            No clients match your search.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((client) => {
              const orderCount = orderCountForClient(client.name);
              const revenue = revenueForClient(client);
              return (
                <article
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/clients/${client.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/clients/${client.id}`);
                    }
                  }}
                  className="cursor-pointer overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-950 md:text-lg">{client.name}</h3>
                        <p className="mt-1 truncate text-[11px] text-slate-500 md:text-xs">
                          {client.industry || "No industry"}{client.contact ? ` · ${client.contact}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] ${statusPillClass(client.status)}`}>
                        {client.status}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Orders</p>
                        <p className="mt-1 text-base font-bold text-slate-900 md:text-lg">{orderCount}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-400">Revenue</p>
                        <p className="mt-1 text-base font-bold text-emerald-700 md:text-lg">{formatCurrency(revenue)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 border-t border-slate-100 px-3 pb-5 pt-4 md:px-6">
                    <button
                      type="button"
                      className="min-h-11 flex-1 rounded-3xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/clients/${client.id}`);
                      }}
                    >
                      View client →
                    </button>
                    <button
                      type="button"
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 md:h-10 md:w-10"
                      disabled={deletingId === client.id}
                      aria-label={`Delete ${client.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(client.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {showAdd && <Modal title="Add client" onSave={handleAdd} onClose={() => { setShowAdd(false); setFormError(""); }} saveState={addSave.saveState} mode="add"><FormFields form={form} setForm={(next) => { setForm(next); if (formError) setFormError(""); }} /><div className="px-6"><FieldError message={formError} /></div></Modal>}
    </div>
  );
}
