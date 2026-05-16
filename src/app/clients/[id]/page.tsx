"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Edit2, Mail, Phone, Plus } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import AddOrderModal from "@/components/orders/AddOrderModal";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type ClientStatus = "Active" | "At Risk" | "Dormant" | "Lead";

type Client = {
  id: string;
  name: string;
  industry: string;
  contact: string;
  email?: string;
  phone?: string;
  address?: string;
  orders: number;
  notes: string;
  status: ClientStatus;
};

type Order = {
  id: string;
  orderName: string;
  client: string;
  vendor: string;
  items: string[];
  quantity: number;
  amount: number;
  status: "Draft" | "In Production" | "Quality Control" | "Fulfilled";
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

const defaultClients: Client[] = [
  {
    id: "client-1",
    name: "POPS – Piranha Ops",
    industry: "Amazon DSP",
    contact: "Ricky",
    email: "ricky@piranhaops.com",
    phone: "TBD",
    address: "Bay Area, CA",
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

function orderAmount(amount: number | string) {
  if (typeof amount === "number") return amount;
  const numeric = Number(amount.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCurrency(amount: number | string) {
  return orderAmount(amount).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const { data: clients, upsertItem: upsertClient, loading: clientsLoading, error: clientsError } = useSupabaseTable<Client>("clients", defaultClients);
  const { data: orders, loading: ordersLoading, error: ordersError } = useSupabaseTable<Order>("orders", []);
  const { data: activity, upsertItem: upsertActivity, loading: activityLoading } = useSupabaseTable<ActivityEntry>("client_activity", defaultActivity);
  const [editingHeader, setEditingHeader] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [clientDraft, setClientDraft] = useState<Client | null>(null);
  const clientSave = useSaveState();
  const contactSave = useSaveState();
  const [activityForm, setActivityForm] = useState({
    type: "Call" as ActivityEntry["type"],
    owner: "Alliyah",
    notes: "",
  });
  const [clientFormError, setClientFormError] = useState("");
  const [activityErrorText, setActivityErrorText] = useState("");

  const client = clients.find((item) => item.id === clientId);
  const clientOrders = orders.filter((order) => client && order.client.trim().toLowerCase() === client.name.trim().toLowerCase());
  const clientActivity = activity.filter((entry) => entry.clientId === clientId);

  const totalSpend = useMemo(
    () => clientOrders.reduce((sum, order) => sum + orderAmount(order.amount), 0),
    [clientOrders],
  );

  const saveClient = (fields: Partial<Client>) => {
    if (!client) return;
    upsertClient({ ...client, ...fields });
  };

  const openClientEditor = () => {
    if (!client) return;
    clientSave.resetSaveState();
    setClientDraft({ ...client });
  };

  const saveClientDraft = async () => {
    if (!clientDraft) return;
    if (!clientDraft.name.trim()) {
      setClientFormError("Client name is required.");
      return;
    }
    setClientFormError("");
    await clientSave.runSave(() => upsertClient(clientDraft), () => { setClientDraft(null); setClientFormError(""); });
  };

  const saveHeaderContact = async () => {
    if (!client) return;
    await contactSave.runSave(() => upsertClient(client));
  };

  const addActivity = async () => {
    if (!activityForm.notes.trim()) {
      setActivityErrorText("Activity notes are required.");
      return;
    }
    setActivityErrorText("");
    const entry: ActivityEntry = {
      id: `activity-${Date.now()}`,
      clientId,
      type: activityForm.type,
      owner: activityForm.owner,
      notes: activityForm.notes.trim(),
      date: new Date().toISOString().split("T")[0],
    };
    try {
      const response = await upsertActivity(entry);
      if (response?.error) {
        const isTableMissing = (response.error as { code?: string })?.code === "42P01";
        if (!isTableMissing) {
          setActivityErrorText("Couldn't save activity. Please try again.");
          return;
        }
      }
      setActivityForm((current) => ({ ...current, notes: "" }));
    } catch {
      setActivityErrorText("Couldn't save activity. Please try again.");
    }
  };

  if (clientsLoading || ordersLoading) return <LoadingState label="Loading client..." />;

  if (!client) {
    return (
      <div className="min-h-screen p-2 md:p-8">
        <button type="button" onClick={() => router.push("/clients")} className="text-xs md:text-sm font-semibold text-slate-600 hover:text-slate-950">
          ← Clients
        </button>
        <div className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-2 md:p-8">
          <h1 className="text-base md:text-2xl font-semibold text-slate-950">Client not found</h1>
          <p className="mt-2 text-xs md:text-sm text-slate-500">This client may have been deleted or is not available in Supabase.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen text-xs md:text-sm">
      <ErrorBanner message={clientsError || ordersError} />
      <header className="-mx-4 sm:-mx-6 lg:-mx-8 bg-slate-950 px-4 sm:px-6 lg:px-8 py-6 md:py-8 text-white">
        <button type="button" onClick={() => router.push("/clients")} className="mb-6 flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Clients
        </button>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">{client.industry}</span>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">{client.status}</span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-5xl">{client.name}</h1>
            <div className="mt-6 flex flex-wrap gap-4 text-xs md:text-sm text-slate-300">
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4" aria-hidden="true" />{client.contact || "No contact"}</span>
              <span className="flex items-center gap-2"><Mail className="h-4 w-4" aria-hidden="true" />{client.email || "No email"}</span>
              <span className="flex items-center gap-2"><Phone className="h-4 w-4" aria-hidden="true" />{client.phone || "No phone"}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              contactSave.resetSaveState();
              setEditingHeader((value) => !value);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-3xl border border-white/15 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-white/10"
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
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-xs md:text-sm normal-case tracking-normal text-white outline-none focus:border-white/30 md:text-sm"
                  value={field.value}
                  onChange={(event) => saveClient({ [field.key]: event.target.value } as Partial<Client>)}
                />
              </label>
            ))}
            <div className="flex justify-end md:col-span-3">
              <SaveButton state={contactSave.saveState} onClick={saveHeaderContact} className="w-72 bg-white text-slate-950 hover:bg-slate-100" />
            </div>
          </div>
        )}
      </header>

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Total orders", value: String(clientOrders.length) },
            { label: "Total spend", value: totalSpend > 0 ? `$${totalSpend.toLocaleString()}` : "$0" },
            { label: "Account status", value: client.status },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[2rem] border border-slate-200 bg-white p-4 md:p-6">
              <p className="text-xs md:text-sm text-slate-500">{stat.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 md:mt-3 md:text-3xl">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold text-slate-950">Account details</h2>
                <p className="mt-1 text-xs md:text-sm text-slate-500">Review client profile and account notes.</p>
              </div>
              <button type="button" onClick={openClientEditor} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Edit2 className="h-4 w-4" aria-hidden="true" />
                Edit
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {[
                { label: "Industry", value: client.industry },
                { label: "Address", value: client.address ?? "Not set" },
                { label: "Contact", value: client.contact || "Not set" },
                { label: "Status", value: client.status },
                { label: "Notes", value: client.notes || "No notes added yet." },
              ].map((field) => (
                <div key={field.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{field.label}</p>
                  <p className="mt-2 text-xs md:text-sm font-semibold text-slate-950">{field.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-4 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold text-slate-950">Order history</h2>
                <p className="mt-1 text-xs md:text-sm text-slate-500">Orders connected to this client.</p>
              </div>
              <button type="button" onClick={() => setShowOrderModal(true)} className="inline-flex min-h-11 items-center gap-2 rounded-3xl bg-slate-950 px-4 py-2 text-xs md:text-sm font-semibold text-white">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add order
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {clientOrders.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-4 md:p-5 text-xs md:text-sm text-slate-500">No orders added yet.</p>}
              {clientOrders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{order.orderName}</p>
                    <p className="mt-1 text-xs md:text-sm text-slate-500">
                      {order.estimatedDeliveryDate || "TBD"} · {order.vendor || "No vendor"} · {formatCurrency(order.amount)}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">{order.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold text-slate-950">Activity log</h2>
          <div className="mt-5 grid gap-3 rounded-[2rem] bg-slate-50 p-3 md:p-4 lg:grid-cols-[160px_160px_1fr_auto]">
            <select className="rounded-2xl border border-slate-200 px-4 py-3 text-xs md:text-sm md:text-sm" value={activityForm.type} onChange={(event) => setActivityForm((current) => ({ ...current, type: event.target.value as ActivityEntry["type"] }))}>
              {activityTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
            <select className="rounded-2xl border border-slate-200 px-4 py-3 text-xs md:text-sm md:text-sm" value={activityForm.owner} onChange={(event) => setActivityForm((current) => ({ ...current, owner: event.target.value }))}>
              {owners.map((owner) => <option key={owner}>{owner}</option>)}
            </select>
            <input className="rounded-2xl border border-slate-200 px-4 py-3 text-xs md:text-sm md:text-sm" placeholder="Notes" value={activityForm.notes} onChange={(event) => { setActivityForm((current) => ({ ...current, notes: event.target.value })); if (activityErrorText) setActivityErrorText(""); }} />
            <button type="button" onClick={addActivity} className="min-h-11 rounded-2xl bg-slate-950 px-4 py-3 text-xs md:text-sm font-semibold text-white">Log</button>
          </div>
          <FieldError message={activityErrorText} />

          <div className="mt-5 space-y-3">
            {activityLoading && <p className="text-xs md:text-sm text-slate-400">Loading activity…</p>}
            {!activityLoading && clientActivity.length === 0 && (
              <p className="py-4 text-center text-xs md:text-sm text-slate-400">No activity yet.</p>
            )}
            {!activityLoading && clientActivity.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200 p-3 md:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{entry.type}</span>
                  <span className="text-xs text-slate-400">{entry.date} · {entry.owner}</span>
                </div>
                <p className="mt-2 text-xs md:text-sm text-slate-700">{entry.notes}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <AddOrderModal open={showOrderModal} onClose={() => setShowOrderModal(false)} prefilledClient={client.name} />

      {clientDraft && (
        <ModalShell
          title="Edit client"
          onClose={() => { setClientDraft(null); clientSave.resetSaveState(); }}
          maxWidth="max-w-lg"
        >
            <div className="space-y-4">
              {[
                { label: "Name", key: "name" },
                { label: "Industry", key: "industry" },
                { label: "Address", key: "address" },
                { label: "Contact", key: "contact" },
                { label: "Email", key: "email" },
                { label: "Phone", key: "phone" },
              ].map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">{field.label}</span>
                  {field.key === "address" ? (
                    <AddressAutocomplete className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={String(clientDraft.address ?? "")} onChange={(value) => setClientDraft({ ...clientDraft, address: value })} />
                  ) : (
                    <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={String(clientDraft[field.key as keyof Client] ?? "")} onChange={(event) => { setClientDraft({ ...clientDraft, [field.key]: event.target.value }); if (clientFormError) setClientFormError(""); }} />
                  )}
                </label>
              ))}
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Status</span>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={clientDraft.status} onChange={(event) => setClientDraft({ ...clientDraft, status: event.target.value as ClientStatus })}>
                  {clientStatusOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Orders</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  placeholder="0"
                  value={clientDraft.orders === 0 ? "" : clientDraft.orders}
                  onChange={(event) => {
                    const raw = event.target.value.replace(/^0+(?=\d)/, "");
                    setClientDraft({ ...clientDraft, orders: raw === "" ? 0 : Number(raw) });
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</span>
                <textarea rows={4} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={clientDraft.notes} onChange={(event) => setClientDraft({ ...clientDraft, notes: event.target.value })} />
              </label>
            </div>
            <FieldError message={clientFormError} />
            <div className="mt-6 flex gap-3">
              <SaveButton state={clientSave.saveState} onClick={saveClientDraft} className="flex-1 py-3" />
              <button type="button" onClick={() => { setClientDraft(null); clientSave.resetSaveState(); }} className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100">Cancel</button>
            </div>
        </ModalShell>
      )}
    </main>
  );
}
