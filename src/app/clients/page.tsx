"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
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
  website: string;
  orders: number;
  notes: string;
  status: "Active" | "Lead" | "At Risk" | "Dormant" | "Inactive";
};
type ClientForm = Omit<Client, "id">;

type Order = {
  id: string;
  client: string;
};

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

const emptyForm: ClientForm = { name: "", industry: "", contact: "", email: "", phone: "", address: "", website: "", orders: 0, notes: "", status: "Active" };
function FormFields({ form, setForm }: { form: ClientForm; setForm: (next: ClientForm) => void }) {
  return (
    <div className="space-y-6 px-6 py-6">
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-700">
          Company Name
          <input
            type="text"
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
            placeholder="e.g. POPS - Piranha Ops"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          Contact Name
          <input
            type="text"
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
            placeholder="e.g. Ricky"
            value={form.contact}
            onChange={(event) => setForm({ ...form, contact: event.target.value })}
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-700">
          Email Address
          <input
            type="email"
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          Phone Number
          <input
            type="text"
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-700">
          Industry
          <select
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
            value={form.industry}
            onChange={(event) => setForm({ ...form, industry: event.target.value })}
          >
            <option value="">Select industry</option>
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
        <label className="space-y-2 text-sm text-slate-700">
          Address
          <AddressAutocomplete
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
            placeholder="Start typing an address..."
            value={form.address}
            onChange={(value) => setForm({ ...form, address: value })}
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-sm text-slate-700">
          Website
          <input
            type="text"
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
            placeholder="https://yourwebsite.com"
            value={form.website}
            onChange={(event) => setForm({ ...form, website: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm text-slate-700">
          Status
          <select
            className="w-full rounded-3xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
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

      <label className="block space-y-2 text-sm text-slate-700">
        Notes
        <textarea
          rows={5}
          className="w-full rounded-[1.5rem] border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 md:text-sm"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </label>
    </div>
  );
}

function Modal({ title, onSave, onClose, onDelete, saveState, mode = "edit", children }: { title: string; onSave: () => void; onClose: () => void; onDelete?: () => void; saveState: SaveState; mode?: "add" | "edit"; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 sm:px-6">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">Keep client account details ready for orders, follow-ups, and reporting.</p>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-full bg-slate-100 px-3 py-2 text-slate-600 transition hover:bg-slate-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {children}
        <div className="flex flex-col gap-3 px-6 pb-6 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="min-h-11 rounded-3xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <SaveButton state={saveState} onClick={onSave} mode={mode} className="w-72 bg-slate-900 text-sm hover:bg-slate-800" />
        </div>
        {onDelete && <button className="mx-6 mb-6 w-[calc(100%-3rem)] rounded-3xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={onDelete}>Delete client</button>}
      </div>
    </div>
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

  const visible = clients
    .filter((client) =>
      Object.values(client).join(" ").toLowerCase().includes(query.toLowerCase()),
    )
    .filter((client) => activeFilter !== "active" || client.status === "Active")
    .sort((a, b) => activeFilter === "orders" ? orderCountForClient(b.name) - orderCountForClient(a.name) : 0);
  const totalOrders = orders.length;
  const activeClients = clients.filter((client) => client.status === "Active").length;

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

  if (loading) return <LoadingState label="Loading clients..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-600">Client accounts</p>
          <h1 className="mt-3 text-base md:text-xl font-bold text-slate-950 md:text-4xl">Client accounts</h1>
          <p className="mt-3 text-xs md:text-sm text-slate-600 md:text-base">Manage your client relationships and order history</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <label className="relative w-full md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64" placeholder="Search clients..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="min-h-11 w-full rounded-3xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800 active:bg-slate-900 md:w-auto" onClick={() => { setForm(emptyForm); setFormError(""); addSave.resetSaveState(); setShowAdd(true); }}>Add client</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Total clients", value: clients.length, filter: "all" as const },
          { label: "Active clients", value: activeClients, filter: "active" as const },
          { label: "Total orders", value: totalOrders, filter: "orders" as const },
        ].map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() => setActiveFilter(stat.filter)}
            className={`rounded-2xl bg-white p-4 md:p-6 text-left shadow-md transition hover:-translate-y-0.5 hover:shadow-md ${
              activeFilter === stat.filter ? "border-2 border-slate-950" : "border border-slate-300"
            }`}
          >
            <p className="text-2xl font-bold tracking-tight text-slate-950 md:text-4xl">{stat.value}</p>
            <p className="mt-2 text-xs md:text-sm text-slate-600">{stat.label}</p>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <div className="hidden bg-zinc-100 px-6 py-3 text-xs uppercase tracking-widest text-slate-400 md:grid md:grid-cols-[1.4fr_1fr_1fr_0.6fr_0.9fr_2rem]">
          <div>Company</div>
          <div>Industry</div>
          <div>Contact</div>
          <div>Orders</div>
          <div>Status</div>
          <div aria-hidden="true" />
        </div>
        <div className="divide-y divide-slate-200">
          {visible.map((client, index) => (
            <div
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
              className={`grid w-full grid-cols-1 gap-2 px-3 py-3 text-left transition hover:bg-blue-50 md:grid-cols-[1.4fr_1fr_1fr_0.6fr_0.9fr_2rem] md:items-center md:gap-0 md:px-6 md:py-4 ${
                index % 2 === 0 ? "bg-zinc-50" : "bg-white"
              } cursor-pointer`}
            >
              <div className="text-xs md:text-sm font-semibold text-slate-950">{client.name}</div>
              <div className="text-xs md:text-sm text-slate-600">{client.industry}</div>
              <div className="text-xs md:text-sm text-slate-600">{client.contact}</div>
              <div className="text-xs md:text-sm text-slate-600">{orderCountForClient(client.name)}</div>
              <div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${client.status === "Active" ? "bg-emerald-100 text-emerald-800" : client.status === "At Risk" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                  {client.status}
                </span>
              </div>
              <button
                type="button"
                className="justify-self-start rounded-full p-1 text-rose-600 hover:bg-rose-50 md:justify-self-end"
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
          ))}
          {visible.length === 0 && (
            <div className="bg-white px-3 md:px-6 py-10 text-center text-xs md:text-sm text-slate-600">
              No clients match your search.
            </div>
          )}
        </div>
      </div>

      {showAdd && <Modal title="Add client" onSave={handleAdd} onClose={() => { setShowAdd(false); setFormError(""); }} saveState={addSave.saveState} mode="add"><FormFields form={form} setForm={(next) => { setForm(next); if (formError) setFormError(""); }} /><div className="px-6"><FieldError message={formError} /></div></Modal>}
    </div>
  );
}
