"use client";

import { useState } from "react";
import { Search, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Invoice = {
  id: string;
  client: string;
  orderName: string;
  amount: string;
  dueDate: string;
  status: "Paid" | "Due" | "Overdue" | "Draft";
  notes: string;
};

const defaultInvoices: Invoice[] = [
  {
    id: "invoice-1",
    client: "POPS – Piranha Ops",
    orderName: "POPS 2026 Collection",
    amount: "TBD",
    dueDate: "TBD",
    status: "Draft",
    notes: "First test order. Amount TBD once print vendor is confirmed and pricing finalized. Station DSF7.",
  },
];

const emptyForm = { client: "", orderName: "", amount: "", dueDate: "", status: "Draft" as Invoice["status"], notes: "" };

const statusColors: Record<Invoice["status"], string> = {
  Paid: "bg-emerald-100 text-emerald-800",
  Due: "bg-amber-100 text-amber-800",
  Overdue: "bg-rose-100 text-rose-800",
  Draft: "bg-slate-100 text-slate-700",
};

const statusPalette: Record<Invoice["status"], string> = {
  Paid: "#10b981",
  Due: "#f59e0b",
  Overdue: "#f43f5e",
  Draft: "#64748b",
};

const monthlyRevenue = [
  { month: "Jan", collected: 1200, outstanding: 900 },
  { month: "Feb", collected: 2200, outstanding: 1300 },
  { month: "Mar", collected: 3200, outstanding: 1600 },
  { month: "Apr", collected: 4500, outstanding: 1800 },
  { month: "May", collected: 6800, outstanding: 2200 },
  { month: "Jun", collected: 8600, outstanding: 2600 },
  { month: "Jul", collected: 10400, outstanding: 3000 },
  { month: "Aug", collected: 12800, outstanding: 3200 },
  { month: "Sep", collected: 15400, outstanding: 3600 },
  { month: "Oct", collected: 18200, outstanding: 3900 },
  { month: "Nov", collected: 21400, outstanding: 4200 },
  { month: "Dec", collected: 25000, outstanding: 4800 },
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function invoiceAmount(amount: string) {
  const n = parseFloat(amount.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

export default function FinancesPage() {
  const { data: invoices, upsertItem, deleteItem, loading } = useSupabaseTable<Invoice>("finances", defaultInvoices);
  const [filter, setFilter] = useState<Invoice["status"] | "All">("All");
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState(emptyForm);

  const visible = (filter === "All" ? invoices : invoices.filter((i) => i.status === filter)).filter((invoice) =>
    Object.values(invoice).join(" ").toLowerCase().includes(query.toLowerCase()),
  );

  const totalPaid = invoices
    .filter((i) => i.status === "Paid")
    .reduce((sum, i) => sum + invoiceAmount(i.amount), 0);

  const totalDue = invoices
    .filter((i) => i.status === "Due" || i.status === "Overdue")
    .reduce((sum, i) => sum + invoiceAmount(i.amount), 0);

  const overdueCount = invoices.filter((i) => i.status === "Overdue").length;
  const goal = 50000;
  const goalPercent = Math.min(100, Math.round((totalPaid / goal) * 100));
  const projectedCompletion = totalPaid > 0
    ? new Date(Date.now() + Math.ceil((goal - totalPaid) / Math.max(totalPaid / 30, 1)) * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Awaiting first paid invoice";

  const statusData = (["Paid", "Due", "Overdue", "Draft"] as Invoice["status"][]).map((status) => ({
    name: status,
    value: invoices.filter((invoice) => invoice.status === status).length,
  }));

  const handleAdd = () => {
    if (!form.client.trim()) return;
    const newInvoice = { id: `invoice-${Date.now()}`, ...form };
    upsertItem(newInvoice);
    setForm(emptyForm);
    setShowModal(false);
  };

  const handleSaveEdit = async () => {
    if (!editInvoice) return;
    await upsertItem(editInvoice);
    setEditInvoice(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    await deleteItem(id);
    setEditInvoice(null);
  };

  const openAddModal = () => {
    setForm(emptyForm);
    setShowModal(true);
  };

  const renderFields = (
    data: typeof emptyForm | Invoice,
    onChange: (next: typeof emptyForm | Invoice) => void,
  ) => (
    <div className="mt-6 space-y-4">
      {[
        { label: "Client", key: "client", placeholder: "e.g. POPS – Piranha Ops" },
        { label: "Order name", key: "orderName", placeholder: "e.g. POPS 2026 Collection" },
        { label: "Amount", key: "amount", placeholder: "e.g. $1,200" },
        { label: "Due date", key: "dueDate", placeholder: "e.g. 2026-06-01" },
      ].map(({ label, key, placeholder }) => (
        <div key={key}>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
          <input
            type={key === "dueDate" ? "date" : "text"}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            placeholder={key === "dueDate" ? undefined : placeholder}
            value={String(data[key as keyof typeof data] ?? "")}
            onClick={key === "dueDate" ? (e) => e.currentTarget.showPicker?.() : undefined}
            onChange={(e) => onChange({ ...data, [key]: e.target.value })}
          />
        </div>
      ))}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Status</label>
        <select
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900"
          value={data.status}
          onChange={(e) => onChange({ ...data, status: e.target.value as Invoice["status"] })}
        >
          <option>Draft</option>
          <option>Due</option>
          <option>Paid</option>
          <option>Overdue</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Notes</label>
        <textarea
          rows={3}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          placeholder="Payment details, notes, reminders..."
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-600">Finances</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Revenue & invoices</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64"
              placeholder="Search invoices..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={openAddModal}>
            Add invoice
          </button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total revenue collected", value: currency.format(totalPaid), trend: "up" },
          { label: "Outstanding balance", value: currency.format(totalDue), trend: totalDue > 0 ? "down" : "up" },
          { label: "Total invoices", value: invoices.length.toString(), trend: "up" },
          { label: "Overdue count", value: overdueCount.toString(), trend: overdueCount > 0 ? "down" : "up" },
        ].map((card) => {
          const TrendIcon = card.trend === "up" ? TrendingUp : TrendingDown;
          return (
            <div key={card.label} className="rounded-[1.75rem] border border-slate-300 bg-white p-5 shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-3xl font-bold tracking-tight text-slate-950">{card.value}</p>
                  <p className="mt-2 text-sm text-slate-600">{card.label}</p>
                </div>
                <span className={`rounded-2xl p-2 ${card.trend === "up" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                  <TrendIcon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="rounded-[2rem] border border-slate-300 bg-white p-6 shadow-md">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Revenue over time</h2>
              <p className="mt-1 text-sm text-slate-600">Monthly collected revenue and projected outstanding balance.</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyRevenue} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                <defs>
                  <linearGradient id="collectedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="outstandingFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} tickFormatter={(value) => `$${Number(value) / 1000}k`} width={44} />
                <Tooltip formatter={(value) => currency.format(Number(value ?? 0))} contentStyle={{ borderRadius: 16, borderColor: "#e2e8f0" }} />
                <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={3} fill="url(#collectedFill)" dot={false} activeDot={false} />
                <Area type="monotone" dataKey="outstanding" name="Outstanding" stroke="#f59e0b" strokeWidth={3} fill="url(#outstandingFill)" dot={false} activeDot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-300 bg-white p-6 shadow-md">
          <h2 className="text-lg font-semibold text-slate-950">Invoice status breakdown</h2>
          <div className="relative mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={74} outerRadius={104} paddingAngle={4} strokeWidth={0}>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={statusPalette[entry.name as Invoice["status"]]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-bold text-slate-950">{invoices.length}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">Invoices</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {statusData.map((item) => (
              <div key={item.name} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusPalette[item.name as Invoice["status"]] }} aria-hidden="true" />
                <span>{item.name}</span>
                <span className="ml-auto font-semibold text-slate-950">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-300 bg-white p-5 shadow-md">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Invoices</h2>
            <p className="mt-1 text-sm text-slate-600">Click any row to edit invoice details.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Invoice["status"] | "All")}
            >
              <option>All</option>
              <option>Draft</option>
              <option>Due</option>
              <option>Paid</option>
              <option>Overdue</option>
            </select>
            <button className="rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={openAddModal}>
              Add invoice
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-widest text-slate-700">
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Due Date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((invoice, index) => (
                <tr
                  key={invoice.id}
                  className={`cursor-pointer text-sm transition hover:bg-gray-100 ${index % 2 === 0 ? "bg-white" : "bg-gray-100/50"}`}
                  onClick={() => setEditInvoice({ ...invoice })}
                >
                  <td className="border-t border-slate-100 px-4 py-4 font-semibold text-slate-950">{invoice.client}</td>
                  <td className="border-t border-slate-100 px-4 py-4 text-slate-600">{invoice.orderName}</td>
                  <td className="border-t border-slate-100 px-4 py-4 font-semibold text-slate-950">{invoice.amount}</td>
                  <td className="border-t border-slate-100 px-4 py-4 text-slate-600">{invoice.dueDate}</td>
                  <td className="border-t border-slate-100 px-4 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${statusColors[invoice.status]}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="border-t border-slate-100 px-4 py-4 text-right text-sm font-semibold text-slate-600">
                    <div className="flex items-center justify-end gap-2">
                      <span>Edit</span>
                      <button
                        type="button"
                        className="rounded-full p-1 text-rose-600 hover:bg-rose-50"
                        aria-label={`Delete ${invoice.orderName}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(invoice.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-300 bg-white p-6 shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Revenue goal</h2>
            <p className="mt-1 text-sm text-slate-600">{currency.format(totalPaid)} of {currency.format(goal)} goal</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-2xl font-bold text-slate-950">{goalPercent}%</p>
            <p className="text-sm text-slate-600">Projected completion: {projectedCompletion}</p>
          </div>
        </div>
        <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${goalPercent}%` }} />
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-semibold text-slate-950">Add invoice</h2>
            {renderFields(form, (next) => setForm(next as typeof emptyForm))}
            <div className="mt-6 flex gap-3">
              <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={handleAdd}>
                Add invoice
              </button>
              <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={() => { setShowModal(false); setForm(emptyForm); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-semibold text-slate-950">Edit invoice</h2>
            {renderFields(editInvoice, (next) => setEditInvoice(next as Invoice))}
            <div className="mt-6 flex gap-3">
              <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={handleSaveEdit}>
                Save
              </button>
              <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={() => setEditInvoice(null)}>
                Cancel
              </button>
            </div>
            <button className="mt-3 w-full rounded-3xl border border-rose-200 bg-rose-50 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100" onClick={() => handleDelete(editInvoice.id)}>
              Delete invoice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
