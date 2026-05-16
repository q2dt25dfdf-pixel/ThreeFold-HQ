"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, Clock, Edit2, Trash2 } from "lucide-react";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type VendorStatus = "Active" | "Review" | "Paused";

type Vendor = {
  id: string;
  name: string;
  type: string;
  turnaround: string;
  contact: string;
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
  Active: "bg-blue-100 text-blue-800",
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
  const [vendorDraft, setVendorDraft] = useState<Vendor | null>(null);
  const vendorSave = useSaveState();
  const notesSave = useSaveState();
  const [vendorFormError, setVendorFormError] = useState("");

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

  const handleDeleteVendor = () => {
    if (!vendor || !window.confirm("Delete this vendor?")) return;
    deleteItem(vendor.id);
    router.push("/vendors");
  };

  const saveVendorNotes = (notes: string) => {
    if (!vendor) return;
    upsertItem({ ...vendor, notes });
  };

  const handleSaveVendorNotes = async () => {
    if (!vendor) return;
    await notesSave.runSave(() => upsertItem(vendor));
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
    <main className="min-h-screen overflow-x-hidden text-xs text-slate-950 md:text-sm">
      <ErrorBanner message={vendorsError || ordersError} />
      <header className="-mx-4 sm:-mx-6 lg:-mx-8 bg-slate-950 px-4 sm:px-6 lg:px-8 py-6 md:py-8 text-white">
        <button type="button" onClick={() => router.push("/vendors")} className="mb-6 flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vendors
        </button>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200">{vendor.type}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[vendor.status]}`}>{vendor.status}</span>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight md:text-5xl">{vendor.name}</h1>
            <p className="mt-4 flex items-center gap-2 text-xs md:text-sm text-slate-300">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {vendor.contact || "No contact listed"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={openVendorEditor}
              className="inline-flex min-h-11 items-center gap-2 rounded-3xl border border-white/15 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-white/10"
            >
              <Edit2 className="h-4 w-4" aria-hidden="true" />
              Edit contact
            </button>
            <button
              type="button"
              onClick={handleDeleteVendor}
              className="inline-flex min-h-11 items-center gap-2 rounded-3xl border border-white/15 px-5 py-3 text-xs md:text-sm font-semibold text-rose-100 hover:bg-white/10"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-4 md:p-6 lg:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="grid divide-y divide-slate-200 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {[
              { label: "Total orders assigned", value: String(vendorOrders.length), icon: Briefcase },
              { label: "Turnaround time", value: vendor.turnaround, icon: Clock },
              { label: "Status", value: vendor.status, icon: Building2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-start gap-3 p-4 md:p-5">
                  <Icon className="mt-0.5 h-5 w-5 text-blue-500" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                    <p className="mt-2 text-xs md:text-sm font-semibold text-slate-950">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold">Vendor details</h2>
                <p className="mt-1 text-xs md:text-sm text-slate-500">Review vendor profile and contact details.</p>
              </div>
              <button type="button" onClick={openVendorEditor} className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-slate-300 px-4 py-2 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Edit2 className="h-4 w-4" aria-hidden="true" />
                Edit
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {[
                { label: "Name", value: vendor.name },
                { label: "Type", value: vendor.type },
                { label: "Turnaround", value: vendor.turnaround },
                { label: "Contact", value: vendor.contact },
                { label: "Status", value: vendor.status },
                { label: "Orders", value: String(vendor.jobs) },
              ].map((field) => (
                <div key={field.label} className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{field.label}</p>
                  <p className="mt-2 text-xs md:text-sm font-semibold text-slate-950">{field.value || "Not set"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
            <div>
              <h2 className="text-base md:text-lg font-semibold">Assigned orders</h2>
              <p className="mt-1 text-xs md:text-sm text-slate-500">Orders assigned to this vendor.</p>
            </div>

            <div className="mt-5 space-y-3">
              {vendorOrders.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-4 md:p-5 text-xs md:text-sm text-slate-500">No orders assigned yet.</p>}
              {vendorOrders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{order.orderName}</p>
                    <p className="mt-1 text-xs md:text-sm text-slate-500">
                      {order.client || "No client"} · {order.estimatedDeliveryDate || "TBD"} · {formatCurrency(order.amount)}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">{order.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base md:text-lg font-semibold">Notes</h2>
              <p className="mt-1 text-xs md:text-sm text-slate-500">Vendor notes save as you type.</p>
            </div>
            <SaveButton state={notesSave.saveState} onClick={handleSaveVendorNotes} className="w-auto" />
          </div>
          <textarea
            rows={7}
            value={vendor.notes}
            onChange={(event) => saveVendorNotes(event.target.value)}
            className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-2 text-xs leading-6 text-slate-700 outline-none focus:border-slate-400 md:p-4 md:text-sm"
            placeholder="Add vendor notes..."
          />
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
                  className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100"
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
