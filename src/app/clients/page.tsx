"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";

type Client = {
  id: string;
  name: string;
  industry: string;
  contact: string;
  orders: number;
  notes: string;
  status: "Active" | "At Risk" | "Dormant";
};

const defaultClients: Client[] = [
  {
    id: "client-1",
    name: "POPS – Piranha Ops",
    industry: "Amazon DSP",
    contact: "Ricky",
    orders: 1,
    notes: "First client. Station DSF7, Bay Area warehouse hub. Test order: POPS 2026 Collection — 4 designs, black oversized heavyweight tees. Hannah manages this DSP directly.",
    status: "Active",
  },
];

function useLocalStorage<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try { const item = localStorage.getItem(key); return item ? JSON.parse(item) : initial; }
    catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

const emptyForm = { name: "", industry: "", contact: "", orders: 0, notes: "", status: "Active" as Client["status"] };

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useLocalStorage<Client[]>("tf_clients", defaultClients);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "orders">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const visible = clients
    .filter((client) =>
      Object.values(client).join(" ").toLowerCase().includes(query.toLowerCase()),
    )
    .filter((client) => activeFilter !== "active" || client.status === "Active")
    .sort((a, b) => activeFilter === "orders" ? b.orders - a.orders : 0);
  const totalOrders = clients.reduce((sum, client) => sum + client.orders, 0);
  const activeClients = clients.filter((client) => client.status === "Active").length;

  const handleAdd = () => {
    if (!form.name.trim()) return;
    setClients((prev) => [{ id: `client-${Date.now()}`, ...form }, ...prev]);
    setForm(emptyForm);
    setShowAdd(false);
  };

  const FormFields = ({ data, onChange }: { data: typeof emptyForm | Client; onChange: (f: any) => void }) => (
    <div className="space-y-4">
      {[
        { label: "Company name", key: "name", placeholder: "e.g. POPS – Piranha Ops" },
        { label: "Industry", key: "industry", placeholder: "e.g. Amazon DSP" },
        { label: "Primary contact", key: "contact", placeholder: "e.g. Ricky" },
      ].map(({ label, key, placeholder }) => (
        <div key={key}>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
          <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none" placeholder={placeholder} value={(data as any)[key]} onChange={(e) => onChange({ ...data, [key]: e.target.value })} />
        </div>
      ))}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Orders</label>
        <input type="number" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" value={(data as any).orders} onChange={(e) => onChange({ ...data, orders: Number(e.target.value) })} />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Status</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900" value={(data as any).status} onChange={(e) => onChange({ ...data, status: e.target.value })}>
          <option>Active</option><option>At Risk</option><option>Dormant</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Notes</label>
        <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:outline-none" value={(data as any).notes} onChange={(e) => onChange({ ...data, notes: e.target.value })} />
      </div>
    </div>
  );

  const Modal = ({ title, onSave, onClose, onDelete, children }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold text-slate-950 mb-6">{title}</h2>
        {children}
        <div className="mt-6 flex gap-3">
          <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={onSave}>Save</button>
          <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={onClose}>Cancel</button>
        </div>
        {onDelete && <button className="mt-3 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={onDelete}>Delete client</button>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-600">Client accounts</p>
          <h1 className="mt-3 text-4xl font-bold text-slate-950">Client accounts</h1>
          <p className="mt-3 text-base text-slate-600">Manage your client relationships and order history</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64" placeholder="Search clients..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>Add client</button>
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
            className={`rounded-2xl bg-white p-6 text-left shadow-md transition hover:-translate-y-0.5 hover:shadow-md ${
              activeFilter === stat.filter ? "border-2 border-slate-950" : "border border-slate-300"
            }`}
          >
            <p className="text-4xl font-bold tracking-tight text-slate-950">{stat.value}</p>
            <p className="mt-2 text-sm text-slate-600">{stat.label}</p>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_0.6fr_0.9fr_2rem] bg-zinc-100 px-6 py-3 text-xs uppercase tracking-widest text-slate-400">
          <div>Company</div>
          <div>Industry</div>
          <div>Contact</div>
          <div>Orders</div>
          <div>Status</div>
          <div aria-hidden="true" />
        </div>
        <div className="divide-y divide-slate-200">
          {visible.map((client, index) => (
            <button
              key={client.id}
              type="button"
              onClick={() => router.push(`/clients/${client.id}`)}
              className={`grid w-full grid-cols-[1.4fr_1fr_1fr_0.6fr_0.9fr_2rem] items-center px-6 py-4 text-left transition hover:bg-blue-50 ${
                index % 2 === 0 ? "bg-zinc-50" : "bg-white"
              } cursor-pointer`}
            >
              <div className="text-sm font-semibold text-slate-950">{client.name}</div>
              <div className="text-sm text-slate-600">{client.industry}</div>
              <div className="text-sm text-slate-600">{client.contact}</div>
              <div className="text-sm text-slate-600">{client.orders}</div>
              <div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${client.status === "Active" ? "bg-emerald-100 text-emerald-800" : client.status === "At Risk" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                  {client.status}
                </span>
              </div>
              <ChevronRight className="h-4 w-4 justify-self-end text-slate-400" aria-hidden="true" />
            </button>
          ))}
          {visible.length === 0 && (
            <div className="bg-white px-6 py-10 text-center text-sm text-slate-600">
              No clients match your search.
            </div>
          )}
        </div>
      </div>

      {showAdd && <Modal title="Add client" onSave={handleAdd} onClose={() => setShowAdd(false)}><FormFields data={form} onChange={setForm} /></Modal>}
    </div>
  );
}
