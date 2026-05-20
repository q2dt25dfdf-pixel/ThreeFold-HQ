"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Edit2, Mail, Phone, Trash2 } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import InlineEditTitle from "@/components/InlineEditTitle";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type VendorStatus = "Active" | "Review" | "Paused";

type Vendor = {
  id: string;
  name: string;
  type: string;
  turnaround: string;
  contact: string;
  email?: string;
  phone?: string;
  notes: string;
  status: VendorStatus;
  jobs: number;
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

const defaultVendors: Vendor[] = [
  {
    id: "vendor-1",
    name: "S&S Activewear",
    type: "Blank supplier",
    turnaround: "2-4 days",
    contact: "Online wholesale",
    notes: "Primary blank supplier. Source heavyweight oversized tees and hoodies here. Wholesale pricing, wide SKU range.",
    status: "Active",
    jobs: 1,
  },
  {
    id: "vendor-2",
    name: "Bay Area Print Shop (TBD)",
    type: "Screen print / DTG",
    turnaround: "5-7 days",
    contact: "TBD",
    notes: "Sourcing a local Bay Area print shop for POPS first order. Need to confirm pricing, min quantities, and turnaround.",
    status: "Review",
    jobs: 0,
  },
];

const statusStyles: Record<VendorStatus, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  Review: "bg-amber-100 text-amber-800",
  Paused: "bg-slate-100 text-slate-700",
};

const vendorTypeOptions = [
  "Blank Supplier",
  "Screen Print Shop",
  "DTF Print Shop",
  "DTG Print Shop",
  "Embroidery Shop",
  "Heat Press / Transfer",
  "Fulfillment & Shipping",
  "Packaging Supplier",
  "Photography / Mockups",
  "Other",
];

function formatCurrency(amount: number | string) {
  const numeric = typeof amount === "number" ? amount : Number(amount.replace(/[^0-9.]/g, ""));
  return (Number.isFinite(numeric) ? numeric : 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const vendorId = params.id;

  const { data: vendors, upsertItem, deleteItem, loading: vendorsLoading, error: vendorsError } = useSupabaseTable<Vendor>("vendors", defaultVendors);
  const { data: orders, loading: ordersLoading, error: ordersError } = useSupabaseTable<Order>("orders", []);
  const [editingVendor, setEditingVendor] = useState(false);
  const [editingHeaderContact, setEditingHeaderContact] = useState(false);
  const [vendorDraft, setVendorDraft] = useState<Vendor | null>(null);
  const [vendorHeaderDraft, setVendorHeaderDraft] = useState({ contact: "", email: "", phone: "" });
  const vendorSave = useSaveState();
  const headerContactSave = useSaveState();
  const notesSave = useSaveState();
  const [vendorFormError, setVendorFormError] = useState("");
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const vendor = vendors.find((item) => item.id === vendorId);
  const vendorOrders = orders.filter((order) => vendor && order.vendor.trim().toLowerCase() === vendor.name.trim().toLowerCase());

  const openVendorEditor = () => {
    if (!vendor) return;
    vendorSave.resetSaveState();
    setVendorDraft({ ...vendor });
    setEditingVendor(true);
  };

  const saveVendorDraft = async () => {
    if (!vendorDraft) return;
    if (!vendorDraft.name.trim()) {
      setVendorFormError("Vendor name is required.");
      return;
    }
    setVendorFormError("");
    await vendorSave.runSave(() => upsertItem(vendorDraft), () => { setEditingVendor(false); setVendorDraft(null); setVendorFormError(""); });
  };

  const openVendorHeaderEditor = () => {
    if (!vendor) return;
    headerContactSave.resetSaveState();
    setVendorHeaderDraft({
      contact: vendor.contact ?? "",
      email: vendor.email ?? "",
      phone: vendor.phone ?? "",
    });
    setEditingHeaderContact((value) => !value);
  };

  const saveVendorHeaderContact = async () => {
    if (!vendor) return;
    await headerContactSave.runSave(
      () => upsertItem({ ...vendor, ...vendorHeaderDraft }),
      () => setEditingHeaderContact(false),
    );
  };

  const handleDeleteVendor = () => {
    if (!vendor || !window.confirm("Delete this vendor?")) return;
    deleteItem(vendor.id);
    router.push("/vendors");
  };

  const handleSaveVendorNotes = async () => {
    if (!vendor) return;
    const notes = notesDraft ?? vendor.notes;
    await notesSave.runSave(
      () => upsertItem({ ...vendor, notes }),
      () => setNotesDraft(null),
    );
  };

  if (vendorsLoading || ordersLoading) return <LoadingState label="Loading vendor..." />;

  if (!vendor) {
    return (
      <main className="min-h-screen p-2 md:p-8">
        <button type="button" onClick={() => router.push("/vendors")} className="text-xs md:text-sm font-semibold text-slate-600 hover:text-slate-950">
          ← Vendors
        </button>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-2 md:p-8">
          <h1 className="text-base md:text-2xl font-semibold text-slate-950">Vendor not found</h1>
          <p className="mt-2 text-xs md:text-sm text-slate-500">This vendor may have been deleted or is not available in Supabase.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden text-xs text-slate-950 md:text-sm">
      <ErrorBanner message={vendorsError || ordersError} />
      <header className="px-1 pt-1 text-white sm:px-6 sm:pt-4 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] bg-slate-950 p-5 shadow-sm md:p-7">
          <button type="button" onClick={() => router.push("/vendors")} className="mb-5 flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white md:text-sm">
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            Vendors
          </button>
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
            <div className="min-w-0">
              <InlineEditTitle
                value={vendor.name}
                onSave={name => upsertItem({ ...vendor, name })}
                className="break-words text-2xl font-bold leading-tight tracking-tight text-white md:text-4xl"
              />
              <div className="mt-6 flex min-w-0 flex-wrap gap-3 text-xs text-slate-300 md:gap-4 md:text-sm">
                <span className="flex min-w-0 items-center gap-2 break-words"><Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />{vendor.contact || "No contact"}</span>
                <span className="flex min-w-0 items-center gap-2 break-all"><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{vendor.email || "No email"}</span>
                <span className="flex min-w-0 items-center gap-2 break-words"><Phone className="h-4 w-4 shrink-0" aria-hidden="true" />{vendor.phone || "No phone"}</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200">{vendor.type}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[vendor.status]}`}>{vendor.status}</span>
              </div>
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={openVendorHeaderEditor}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-3xl border border-white/20 px-5 py-3 text-xs font-semibold text-white hover:bg-white/10 md:text-sm"
                >
                  <Edit2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Edit contact
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVendor}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-3xl border border-rose-300/40 bg-rose-400/10 px-5 py-3 text-xs font-semibold text-rose-100 hover:bg-rose-400/15 md:text-sm"
                >
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </div>
          </div>

          {editingHeaderContact && (
            <div className="mt-8 grid gap-3 rounded-[2rem] border border-white/10 bg-white/5 p-4 md:grid-cols-3">
              {[
                { label: "Contact", key: "contact", value: vendorHeaderDraft.contact },
                { label: "Email", key: "email", value: vendorHeaderDraft.email },
                { label: "Phone", key: "phone", value: vendorHeaderDraft.phone },
              ].map((field) => (
                <label key={field.key} className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
                  {field.label}
                  <input
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-xs normal-case tracking-normal text-white outline-none focus:border-white/30 md:text-sm"
                    value={field.value}
                    onChange={(event) => setVendorHeaderDraft((current) => ({ ...current, [field.key]: field.key === 'phone' ? formatPhoneNumber(event.target.value) : event.target.value }))}
                  />
                </label>
              ))}
              <div className="md:col-span-3">
                <button
                  type="button"
                  onClick={saveVendorHeaderContact}
                  disabled={headerContactSave.saveState === "saving"}
                  className="min-h-11 w-full rounded-3xl border border-white/25 bg-white/15 px-5 py-3 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-60 md:text-sm"
                >
                  {headerContactSave.saveState === "saving" ? "Saving..." :
                   headerContactSave.saveState === "success" ? "Saved" :
                   headerContactSave.saveState === "error" ? "Couldn't save. Try again." :
                   "Save contact"}
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="space-y-6 px-1 pb-4 pt-2 sm:p-6 lg:p-8">
        <section className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Total orders assigned", value: String(vendorOrders.length) },
            { label: "Turnaround time", value: vendor.turnaround || "Not set" },
            { label: "Status", value: vendor.status },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <p className="text-xs text-slate-500 md:text-sm">{stat.label}</p>
              <p className="mt-2 text-xl font-semibold text-slate-950 md:mt-3 md:text-3xl">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950 md:text-lg">Vendor details</h2>
                <p className="mt-1 text-xs text-slate-500 md:text-sm">Profile and contact information.</p>
              </div>
              <button type="button" onClick={openVendorEditor} className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 md:px-4">
                <Edit2 className="h-3 w-3" aria-hidden="true" />
                Edit
              </button>
            </div>
            <div className="space-y-2">
              {[
                { label: "Name", value: vendor.name },
                { label: "Type", value: vendor.type },
                { label: "Turnaround", value: vendor.turnaround },
                { label: "Contact", value: vendor.contact },
                { label: "Status", value: vendor.status },
              ].map((field) => (
                <div key={field.label} className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                  <span className="shrink-0 text-xs text-slate-500">{field.label}</span>
                  <span className="min-w-0 break-words text-right text-xs font-medium text-slate-950">{field.value || "Not set"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-950 md:text-lg">Assigned orders</h2>
              <p className="mt-1 text-xs text-slate-500 md:text-sm">Orders assigned to this vendor.</p>
            </div>
            <div className="space-y-3">
              {vendorOrders.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-500 md:p-5 md:text-sm">No orders assigned yet.</p>
              )}
              {vendorOrders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-950">{order.orderName}</p>
                    <p className="mt-1 text-xs text-slate-500 md:text-sm">
                      {order.client || "No client"} · {order.estimatedDeliveryDate || "TBD"} · {formatCurrency(order.amount)}
                    </p>
                  </div>
                  <span className="w-fit shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-blue-800">{order.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full min-w-0 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Notes</h2>
          <textarea
            rows={6}
            value={notesDraft ?? vendor.notes}
            onChange={(event) => setNotesDraft(event.target.value)}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none md:text-sm"
            placeholder="Add vendor notes..."
          />
          <div className="mt-3 flex justify-end">
            <SaveButton state={notesSave.saveState} onClick={handleSaveVendorNotes} className="w-full lg:w-auto" />
          </div>
        </section>
      </div>

      {editingVendor && vendorDraft && (
        <ModalShell
          title="Edit vendor"
          subtitle="Update the vendor profile and save changes."
          onClose={() => { setEditingVendor(false); setVendorDraft(null); vendorSave.resetSaveState(); setVendorFormError(""); }}
          maxWidth="max-w-lg"
          footer={
            <div className="space-y-3">
              <FieldError message={vendorFormError} />
              <div className="flex gap-3">
                <SaveButton state={vendorSave.saveState} onClick={saveVendorDraft} className="flex-1 py-3" />
                <button
                  type="button"
                  onClick={() => { setEditingVendor(false); setVendorDraft(null); vendorSave.resetSaveState(); setVendorFormError(""); }}
                  className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          }
        >
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Name</span>
                <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.name} onChange={(event) => { setVendorDraft({ ...vendorDraft, name: event.target.value }); if (vendorFormError) setVendorFormError(""); }} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Type</span>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.type} onChange={(event) => setVendorDraft({ ...vendorDraft, type: event.target.value })}>
                  {!vendorTypeOptions.includes(vendorDraft.type) && <option>{vendorDraft.type}</option>}
                  {vendorTypeOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Turnaround</span>
                <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.turnaround} onChange={(event) => setVendorDraft({ ...vendorDraft, turnaround: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Contact</span>
                <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.contact} onChange={(event) => setVendorDraft({ ...vendorDraft, contact: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Status</span>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.status} onChange={(event) => setVendorDraft({ ...vendorDraft, status: event.target.value as VendorStatus })}>
                  <option>Active</option>
                  <option>Review</option>
                  <option>Paused</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Orders</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
                  value={vendorDraft.jobs === 0 ? "" : vendorDraft.jobs}
                  placeholder="0"
                  onChange={(event) => {
                    const raw = event.target.value.replace(/^0+(?=\d)/, "");
                    setVendorDraft({ ...vendorDraft, jobs: raw === "" ? 0 : Number(raw) });
                  }}
                />
              </label>
            </div>
        </ModalShell>
      )}
    </main>
  );
}
