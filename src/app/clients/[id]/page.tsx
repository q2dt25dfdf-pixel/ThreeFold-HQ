"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Edit2, Mail, Phone, Plus } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type ClientStatus = "Active" | "At Risk" | "Dormant";

type Client = {
  id: string;
  name: string;
  industry: string;
  contact: string;
  email?: string;
  phone?: string;
  location?: string;
  orders: number;
  notes: string;
  status: ClientStatus;
};

type ClientOrder = {
  id: string;
  clientId: string;
  date: string;
  name: string;
  amount: string;
  status: "Draft" | "Due" | "Paid" | "Fulfilled";
};

type ActivityEntry = {
  id: string;
  clientId: string;
  type: "Call" | "Email" | "Text" | "Meeting" | "In Person" | "Other";
  date: string;
  owner: string;
  notes: string;
};

const defaultClients: Client[] = [
  {
    id: "client-1",
    name: "POPS – Piranha Ops",
    industry: "Amazon DSP",
    contact: "Ricky",
    email: "ricky@piranhaops.com",
    phone: "TBD",
    location: "Bay Area, CA",
    orders: 1,
    notes:
      "First client. Station DSF7, Bay Area warehouse hub. Test order: POPS 2026 Collection — 4 designs, black oversized heavyweight tees. Hannah manages this DSP directly.",
    status: "Active",
  },
];

const defaultOrders: ClientOrder[] = [
  {
    id: "order-1",
    clientId: "client-1",
    date: "2026-05-13",
    name: "POPS 2026 Collection",
    amount: "TBD",
    status: "Draft",
  },
];

const owners = ["Alliyah", "Hannah", "Jordan"];
const activityTypes: ActivityEntry["type"][] = ["Call", "Email", "Text", "Meeting", "In Person", "Other"];

const defaultActivity: ActivityEntry[] = [];

function parseAmount(amount: string) {
  const numeric = Number(amount.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function InlineField({
  label,
  value,
  onSave,
  type = "text",
  options,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  type?: "text" | "select";
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      {editing ? (
        type === "select" && options ? (
          <select
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none"
          >
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => event.key === "Enter" && commit()}
            className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none"
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="mt-2 flex w-full items-center justify-between gap-3 text-left text-sm font-semibold text-slate-950 hover:text-slate-600"
        >
          <span>{value || "Add value"}</span>
          <Edit2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const { data: clients, upsertItem: upsertClient, loading: clientsLoading } = useSupabaseTable<Client>("clients", defaultClients);
  const { data: orders, upsertItem: upsertOrder, loading: ordersLoading } = useSupabaseTable<ClientOrder>("client_orders", defaultOrders);
  const { data: activity, upsertItem: upsertActivity, loading: activityLoading } = useSupabaseTable<ActivityEntry>("client_activity", defaultActivity);
  const [editingHeader, setEditingHeader] = useState(false);
  const [orderForm, setOrderForm] = useState({ name: "", date: "", amount: "", status: "Draft" as ClientOrder["status"] });
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [activityForm, setActivityForm] = useState({
    type: "Call" as ActivityEntry["type"],
    owner: "Alliyah",
    notes: "",
  });

  const client = clients.find((item) => item.id === clientId);
  const clientOrders = orders.filter((order) => order.clientId === clientId);
  const clientActivity = activity.filter((entry) => entry.clientId === clientId);

  const totalSpend = useMemo(
    () => clientOrders.reduce((sum, order) => sum + parseAmount(order.amount), 0),
    [clientOrders],
  );

  const saveClient = (fields: Partial<Client>) => {
    if (!client) return;
    upsertClient({ ...client, ...fields });
  };

  const addOrder = async () => {
    if (!orderForm.name.trim()) return;
    const nextOrder: ClientOrder = {
      id: `order-${Date.now()}`,
      clientId,
      name: orderForm.name.trim(),
      date: orderForm.date || new Date().toISOString().split("T")[0],
      amount: orderForm.amount || "TBD",
      status: orderForm.status,
    };
    await upsertOrder(nextOrder);
    setOrderForm({ name: "", date: "", amount: "", status: "Draft" });
    setShowOrderForm(false);
  };

  const addActivity = async () => {
    if (!activityForm.notes.trim()) return;
    const entry: ActivityEntry = {
      id: `activity-${Date.now()}`,
      clientId,
      type: activityForm.type,
      owner: activityForm.owner,
      notes: activityForm.notes.trim(),
      date: new Date().toISOString().split("T")[0],
    };
    await upsertActivity(entry);
    setActivityForm((current) => ({ ...current, notes: "" }));
  };

  if (clientsLoading || ordersLoading || activityLoading) return <div className="p-8 text-slate-500">Loading...</div>;

  if (!client) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <button type="button" onClick={() => router.push("/clients")} className="text-sm font-semibold text-slate-600 hover:text-slate-950">
          ← Clients
        </button>
        <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-semibold text-slate-950">Client not found</h1>
          <p className="mt-2 text-sm text-slate-500">This client may have been deleted or is not available in Supabase.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-950 p-8 text-white">
        <button type="button" onClick={() => router.push("/clients")} className="mb-8 flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Clients
        </button>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">{client.industry}</span>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">{client.status}</span>
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">{client.name}</h1>
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-300">
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4" aria-hidden="true" />{client.contact || "No contact"}</span>
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" aria-hidden="true" />{client.email || "No email"}</span>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" aria-hidden="true" />{client.phone || "No phone"}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditingHeader((value) => !value)}
            className="inline-flex items-center gap-2 rounded-3xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            <Edit2 className="h-4 w-4" aria-hidden="true" />
            Edit contact
          </button>
        </div>

        {editingHeader && (
          <div className="mt-8 grid gap-3 rounded-[2rem] border border-white/10 bg-white/5 p-4 md:grid-cols-3">
            {[
              { label: "Contact", key: "contact", value: client.contact },
              { label: "Email", key: "email", value: client.email ?? "" },
              { label: "Phone", key: "phone", value: client.phone ?? "" },
            ].map((field) => (
              <label key={field.key} className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {field.label}
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-white/30"
                  value={field.value}
                  onChange={(event) => saveClient({ [field.key]: event.target.value } as Partial<Client>)}
                />
              </label>
            ))}
          </div>
        )}
      </header>

      <div className="space-y-6 p-6 lg:p-8">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Total orders", value: String(clientOrders.length || client.orders) },
            { label: "Total spend", value: totalSpend > 0 ? `$${totalSpend.toLocaleString()}` : "$0" },
            { label: "Account status", value: client.status },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[2rem] border border-slate-200 bg-white p-6">
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="mt-3 text-3xl font-semibold text-slate-950">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-950">Account details</h2>
            <p className="mt-1 text-sm text-slate-500">Click a field to edit. Changes save on blur.</p>
            <div className="mt-5 space-y-3">
              <InlineField label="Industry" value={client.industry} onSave={(value) => saveClient({ industry: value })} />
              <InlineField label="Location" value={client.location ?? ""} onSave={(value) => saveClient({ location: value })} />
              <InlineField label="Contact" value={client.contact} onSave={(value) => saveClient({ contact: value })} />
              <InlineField label="Status" value={client.status} onSave={(value) => saveClient({ status: value as ClientStatus })} type="select" options={["Active", "At Risk", "Dormant"]} />
              <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Notes</span>
                <textarea
                  rows={6}
                  value={client.notes}
                  onChange={(event) => saveClient({ notes: event.target.value })}
                  className="mt-2 w-full resize-none bg-transparent text-sm leading-6 text-slate-700 outline-none"
                />
              </label>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Order history</h2>
                <p className="mt-1 text-sm text-slate-500">Past work and invoice context.</p>
              </div>
              <button type="button" onClick={() => setShowOrderForm(true)} className="inline-flex items-center gap-2 rounded-3xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add order
              </button>
            </div>

            {showOrderForm && (
              <div className="mt-5 grid gap-3 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Order name" value={orderForm.name} onChange={(event) => setOrderForm((current) => ({ ...current, name: event.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Date" value={orderForm.date} onChange={(event) => setOrderForm((current) => ({ ...current, date: event.target.value }))} />
                <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Amount" value={orderForm.amount} onChange={(event) => setOrderForm((current) => ({ ...current, amount: event.target.value }))} />
                <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" value={orderForm.status} onChange={(event) => setOrderForm((current) => ({ ...current, status: event.target.value as ClientOrder["status"] }))}>
                  <option>Draft</option>
                  <option>Due</option>
                  <option>Paid</option>
                  <option>Fulfilled</option>
                </select>
                <button type="button" onClick={addOrder} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white md:col-span-2">Save order</button>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {clientOrders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{order.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{order.date} · {order.amount}</p>
                  </div>
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{order.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-950">Activity log</h2>
          <div className="mt-5 grid gap-3 rounded-[2rem] bg-slate-50 p-4 lg:grid-cols-[160px_160px_1fr_auto]">
            <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={activityForm.type} onChange={(event) => setActivityForm((current) => ({ ...current, type: event.target.value as ActivityEntry["type"] }))}>
              {activityTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" value={activityForm.owner} onChange={(event) => setActivityForm((current) => ({ ...current, owner: event.target.value }))}>
              {owners.map((owner) => <option key={owner}>{owner}</option>)}
            </select>
            <input className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Notes" value={activityForm.notes} onChange={(event) => setActivityForm((current) => ({ ...current, notes: event.target.value }))} />
            <button type="button" onClick={addActivity} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Log</button>
          </div>

          <div className="mt-5 space-y-3">
            {clientActivity.length === 0 && <p className="text-sm text-slate-500">No activity logged yet.</p>}
            {clientActivity.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{entry.type}</span>
                  <span className="text-xs text-slate-400">{entry.date} · {entry.owner}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{entry.notes}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
