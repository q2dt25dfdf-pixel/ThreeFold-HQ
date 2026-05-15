"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Client = {
  id: string;
  name: string;
  industry: string;
  contact: string;
  contactInformation: string;
  active: boolean;
  address: string;
  orders: number;
  notes: string;
  status: "Active" | "At Risk" | "Dormant" | "Lead";
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
    contactInformation: "",
    active: true,
    address: "",
    orders: 1,
    notes: "First client. Station DSF7, Bay Area warehouse hub. Test order: POPS 2026 Collection — 4 designs, black oversized heavyweight tees. Hannah manages this DSP directly.",
    status: "Active",
  },
];

const emptyForm: ClientForm = { name: "", industry: "", contact: "", contactInformation: "", active: true, address: "", orders: 0, notes: "", status: "Active" };
function FormFields({ form, setForm }: { form: ClientForm; setForm: (next: ClientForm) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Company Name</label>
        <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" placeholder="e.g. POPS - Piranha Ops" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Industry</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={form.industry} onChange={(e) => setForm({...form, industry: e.target.value})}>
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
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Primary Contact</label>
        <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" placeholder="e.g. Ricky" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Contact Information</label>
        <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" placeholder="Email, phone, or preferred contact details" value={form.contactInformation} onChange={(e) => setForm({ ...form, contactInformation: e.target.value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Status</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Client["status"] })}>
          <option>Active</option><option>At Risk</option><option>Dormant</option><option>Lead</option>
        </select>
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm font-semibold text-slate-700">
        Active toggle
        <input className="h-4 w-4 accent-slate-950" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
      </label>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Address</label>
        <AddressAutocomplete className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" placeholder="Start typing an address..." value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
        <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:outline-none md:text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
    </div>
  );
}

function Modal({ title, onSave, onClose, onDelete, children }: { title: string; onSave: () => void; onClose: () => void; onDelete?: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-2 md:p-3 shadow-xl md:p-8">
        <h2 className="text-base md:text-2xl font-semibold text-slate-950 mb-6">{title}</h2>
        {children}
        <div className="mt-6 flex gap-3">
          <button className="min-h-11 flex-1 rounded-3xl bg-slate-950 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800" onClick={onSave}>Save</button>
          <button className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={onClose}>Cancel</button>
        </div>
        {onDelete && <button className="mt-3 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-xs md:text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={onDelete}>Delete client</button>}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const router = useRouter();
  const { data: clients, upsertItem, deleteItem, loading } = useSupabaseTable<Client>("clients", defaultClients);
  const { data: orders } = useSupabaseTable<Order>("orders", []);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "orders">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);

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

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const newClient = { id: `client-${Date.now()}`, ...form };
    upsertItem(newClient);
    setForm(emptyForm);
    setShowAdd(false);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    deleteItem(id);
  };

  if (loading) return <div className="p-2 md:p-8 text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6 text-xs md:text-sm">
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
          <button className="min-h-11 w-full rounded-3xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800 md:w-auto" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>Add client</button>
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
            className={`rounded-2xl bg-white p-2 md:p-6 text-left shadow-md transition hover:-translate-y-0.5 hover:shadow-md ${
              activeFilter === stat.filter ? "border-2 border-slate-950" : "border border-slate-300"
            }`}
          >
            <p className="text-base md:text-4xl font-bold tracking-tight text-slate-950">{stat.value}</p>
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

      {showAdd && <Modal title="Add client" onSave={handleAdd} onClose={() => setShowAdd(false)}><FormFields form={form} setForm={setForm} /></Modal>}
    </div>
  );
}
