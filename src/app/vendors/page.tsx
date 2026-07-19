"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ModalShell from "@/components/ModalShell";
import { Check, Edit2, Search, Trash2 } from "lucide-react";
import { formatPhoneNumber } from "@/lib/formatPhone";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { ErrorBanner, FieldError, LoadingState } from "@/components/AppState";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import {
  VENDOR_PRODUCT_CATEGORIES,
  VENDOR_SAMPLE_STATUSES,
  type VendorProductCategory,
  type VendorSampleStatus,
} from "@/lib/constants";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Vendor = {
  id: string;
  name: string;
  type: string;
  turnaround: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  moq?: string;
  pricingNotes?: string;
  productCategories?: VendorProductCategory[];
  sampleStatus?: VendorSampleStatus;
  preferredVendor?: boolean;
  approvedVendor?: boolean;
  notes: string;
  status: "Active" | "Review" | "Inactive";
  jobs: number;
};

// Widened to read cost_lines off the SAME already-loaded orders table (no new query).
// Powers the aggregate "$ owed to suppliers" pill (sum of unpaid cost lines).
type CostLine = { amount_cents: number; status: string; supplier?: string };
type Order = {
  id: string;
  vendor: string;
  cost_lines?: CostLine[];
};

function centsToUsd(cents: number) {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

const defaultVendors: Vendor[] = [
  {
    id: "vendor-1",
    name: "S&S Activewear",
    type: "Blank supplier",
    turnaround: "2–4 days",
    contact: "Online wholesale",
    email: "",
    phone: "",
    address: "",
    website: "",
    moq: "",
    pricingNotes: "Wholesale pricing, wide SKU range.",
    productCategories: ["T-Shirts"],
    sampleStatus: "Not Requested",
    preferredVendor: true,
    approvedVendor: true,
    notes: "Primary blank supplier. Source heavyweight oversized tees and hoodies here. Wholesale pricing, wide SKU range.",
    status: "Active",
    jobs: 1,
  },
  {
    id: "vendor-2",
    name: "Bay Area Print Shop (TBD)",
    type: "Screen print / DTG",
    turnaround: "5–7 days",
    contact: "TBD",
    email: "",
    phone: "",
    address: "",
    website: "",
    moq: "",
    pricingNotes: "",
    productCategories: ["Screen Print"],
    sampleStatus: "Not Requested",
    preferredVendor: false,
    approvedVendor: false,
    notes: "Sourcing a local Bay Area print shop for POPS first order. Need to confirm pricing, min quantities, and turnaround.",
    status: "Review",
    jobs: 0,
  },
];

const emptyForm: Omit<Vendor, "id"> = {
  name: "",
  type: "",
  turnaround: "",
  contact: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  moq: "",
  pricingNotes: "",
  productCategories: [],
  sampleStatus: "Not Requested",
  preferredVendor: false,
  approvedVendor: false,
  notes: "",
  status: "Review",
  jobs: 0,
};
type VendorTab = "all" | "production" | "suppliers" | "specialty";
const VENDOR_TABS: { value: VendorTab; label: string }[] = [
  { value: "all",        label: "All"        },
  { value: "production", label: "Production" },
  { value: "suppliers",  label: "Suppliers"  },
  { value: "specialty",  label: "Specialty"  },
];

function vendorTabFor(type: string): VendorTab {
  const t = type.toLowerCase();
  if (t.includes("screen") || t.includes("dtf") || t.includes("dtg") || t.includes("embroidery")) return "production";
  if (t.includes("blank") || t.includes("fulfillment") || t.includes("packaging") || t.includes("shipping") || t.includes("supplier")) return "suppliers";
  return "specialty";
}

export default function VendorsPage() {
  const router = useRouter();
  const { data: vendors, upsertItem, deleteItem, loading, error } = useSupabaseTable<Vendor>("vendors", defaultVendors);
  const { data: orders } = useSupabaseTable<Order>("orders", []);
  const [showModal, setShowModal] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState("");
  const [query, setQuery] = useState("");
  const [activeVendorTab, setActiveVendorTab] = useState<VendorTab>("all");
  const [form, setForm] = useState(emptyForm);
  const addSave = useSaveState();
  const editSave = useSaveState();
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const orderCountForVendor = (vendorName: string) =>
    orders.filter((order) => (order.vendor ?? "").trim().toLowerCase() === vendorName.trim().toLowerCase()).length;

  const visible = vendors.filter((vendor) =>
    Object.values(vendor).join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const tabVendors = activeVendorTab === "all"
    ? visible
    : visible.filter((v) => vendorTabFor(v.type) === activeVendorTab);

  // Hero + needs-attention derivations — all pure, from already-loaded tables.
  const activeSuppliers = vendors.filter((v) => v.status === "Active").length;
  // Aggregate owed = sum of ALL unpaid production cost lines across every order. This is
  // reliable at the aggregate level — no fragile per-supplier free-text matching needed.
  const owedCents = orders.reduce(
    (sum, order) =>
      sum + (Array.isArray(order.cost_lines) ? order.cost_lines : []).reduce(
        (s, l) => s + (l.status !== "paid" ? Number(l.amount_cents) || 0 : 0),
        0,
      ),
    0,
  );
  const needReviewVendors = vendors.filter((v) => v.status === "Review" || !v.approvedVendor);

  const handleAdd = async () => {
    if (!form.name.trim()) {
      setFormError("Company name is required.");
      return;
    }
    setFormError("");
    const newVendor = { id: `vendor-${Date.now()}`, ...form };
    await addSave.runSave(async () => {
      const response = await upsertItem(newVendor);
      if (!response.error) setForm(emptyForm);
      return response;
    }, () => { setShowModal(false); setFormError(""); });
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendorId(vendor.id);
    setForm({
      ...emptyForm,
      ...vendor,
      productCategories: vendor.productCategories ?? [],
      sampleStatus: vendor.sampleStatus ?? "Not Requested",
      preferredVendor: Boolean(vendor.preferredVendor),
      approvedVendor: Boolean(vendor.approvedVendor),
    });
    setFormError("");
    editSave.resetSaveState();
  };

  const handleEdit = async () => {
    if (!editingVendorId) return;
    if (!form.name.trim()) {
      setFormError("Company name is required.");
      return;
    }
    setFormError("");
    const updatedVendor = { id: editingVendorId, ...form };
    await editSave.runSave(async () => upsertItem(updatedVendor), () => {
      setEditingVendorId("");
      setForm(emptyForm);
      setFormError("");
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    setDeletingId(id);
    void deleteItem(id).finally(() => setDeletingId(""));
  };

  const toggleProductCategory = (category: VendorProductCategory) => {
    const currentCategories = form.productCategories ?? [];
    setForm({
      ...form,
      productCategories: currentCategories.includes(category)
        ? currentCategories.filter((item) => item !== category)
        : [...currentCategories, category],
    });
  };

  const renderFields = () => (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Company Name
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="e.g. S&S Activewear"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Contact Name
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="Name or primary contact"
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
          Supplier Type
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
          >
            <option value="">Select type</option>
            <option>Blank Supplier</option>
            <option>Screen Print Shop</option>
            <option>DTF Print Shop</option>
            <option>DTG Print Shop</option>
            <option>Embroidery Shop</option>
            <option>Heat Press / Transfer</option>
            <option>Fulfillment & Shipping</option>
            <option>Packaging Supplier</option>
            <option>Photography / Mockups</option>
            <option>Other</option>
          </select>
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Address
          <AddressAutocomplete
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="Start typing an address..."
            value={form.address}
            onChange={(value) => setForm({ ...form, address: value })}
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
          Turnaround Time
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="e.g. 3-5 days"
            value={form.turnaround}
            onChange={(event) => setForm({ ...form, turnaround: event.target.value })}
          />
        </label>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Status
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            value={form.status}
            onChange={(event) => setForm({ ...form, status: event.target.value as Vendor["status"] })}
          >
            <option>Active</option>
            <option>Review</option>
            <option>Inactive</option>
          </select>
        </label>
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          Sample Status
          <select
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            value={form.sampleStatus ?? "Not Requested"}
            onChange={(event) => setForm({ ...form, sampleStatus: event.target.value as VendorSampleStatus })}
          >
            {VENDOR_SAMPLE_STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-slate-700 md:text-sm">Product Categories</legend>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {VENDOR_PRODUCT_CATEGORIES.map((category) => (
            <label key={category} className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 md:text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-slate-900"
                checked={(form.productCategories ?? []).includes(category)}
                onChange={() => toggleProductCategory(category)}
              />
              {category}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 md:grid-cols-2">
        <label className="space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
          MOQ
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
            placeholder="e.g. 24 pieces"
            value={form.moq ?? ""}
            onChange={(event) => setForm({ ...form, moq: event.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 md:text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
              checked={Boolean(form.preferredVendor)}
              onChange={(event) => setForm({ ...form, preferredVendor: event.target.checked })}
            />
            Preferred Supplier
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 md:text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
              checked={Boolean(form.approvedVendor)}
              onChange={(event) => setForm({ ...form, approvedVendor: event.target.checked })}
            />
            Approved Supplier
          </label>
        </div>
      </div>

      <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
        Pricing Notes
        <textarea
          rows={3}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          placeholder="Pricing tiers, fees, discounts, or quote notes..."
          value={form.pricingNotes ?? ""}
          onChange={(event) => setForm({ ...form, pricingNotes: event.target.value })}
        />
      </label>

      <label className="block space-y-2 text-xs font-semibold text-slate-700 md:text-sm">
        Notes
        <textarea
          rows={5}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-normal text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm"
          placeholder="Pricing notes, minimums, quality feedback..."
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </label>
    </div>
  );

  if (loading) return <LoadingState label="Loading suppliers..." />;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-600 md:text-sm">Suppliers</p>
          <h1 className="mt-3 text-base font-semibold text-slate-950 md:text-3xl">Suppliers</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <label className="relative w-full sm:w-64 md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs text-slate-900 outline-none focus:border-slate-400 sm:w-64 md:text-sm"
              placeholder="Search suppliers..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="min-h-11 w-full rounded-3xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:w-auto md:text-sm"
            onClick={() => { setFormError(""); addSave.resetSaveState(); setShowModal(true); }}
          >
            Add supplier
          </button>
        </div>
      </div>

      {/* ── Hero row: Active suppliers (count-led) + Total suppliers + Need Review ── */}
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        {/* HERO — Active suppliers. Count is the headline; aggregate owed is the pill. */}
        <div className="rounded-[2rem] bg-slate-50 p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Active Suppliers</p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">{activeSuppliers}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">of {vendors.length} total supplier{vendors.length !== 1 ? "s" : ""}</p>
          <span className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ${owedCents > 0 ? "bg-amber-100 text-amber-700" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
            {centsToUsd(owedCents)} owed to suppliers
          </span>
        </div>
        {/* Total suppliers */}
        <div className="rounded-[2rem] bg-white p-5 shadow-sm ring-1 ring-slate-100 md:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Total Suppliers</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{vendors.length}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">in your network</p>
        </div>
        {/* Need Review */}
        <div className={`rounded-[2rem] p-5 shadow-sm md:p-6 ${needReviewVendors.length > 0 ? "bg-amber-50 ring-1 ring-amber-100" : "bg-white ring-1 ring-slate-100"}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Need Review</p>
          <p className={`mt-2 text-2xl font-bold tracking-tight md:text-3xl ${needReviewVendors.length > 0 ? "text-amber-600" : "text-slate-400"}`}>{needReviewVendors.length}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">in review or not yet approved</p>
        </div>
      </section>

      {/* ── Needs Attention — suppliers awaiting review/approval ──────────────────── */}
      <section className="rounded-[2rem] bg-white p-4 shadow-sm ring-1 ring-slate-100 md:p-5">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Needs Attention</h2>
        {needReviewVendors.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>
            <p className="text-xs font-semibold text-emerald-800">All caught up — every supplier is reviewed and approved.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {needReviewVendors.map((vendor) => (
              <div key={vendor.id} className="flex flex-col gap-3 rounded-2xl bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-900">{vendor.name}</p>
                  <p className="truncate text-[10px] text-slate-500">{vendor.type || "No type"} · {vendor.status}{!vendor.approvedVendor ? " · not approved" : ""}</p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/vendors/${vendor.id}`)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View supplier
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <>
      {/* Vendor tab bar */}
      <div className="overflow-x-auto pb-1">
        <nav className="inline-flex w-fit min-w-max items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1" aria-label="Supplier categories">
          {VENDOR_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveVendorTab(tab.value)}
              className={`min-h-10 rounded-full px-4 py-2 text-xs font-semibold transition md:text-sm ${
                activeVendorTab === tab.value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tabVendors.map((vendor) => (
                  <article
                    key={vendor.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/vendors/${vendor.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(`/vendors/${vendor.id}`);
                      }
                    }}
                    className={`rounded-[2rem] bg-white p-4 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:shadow-md md:p-5 ${
                      vendor.status === "Active" ? "border-t-2 border-t-emerald-400" :
                      vendor.status === "Review" ? "border-t-2 border-t-amber-400" : "border-t-2 border-t-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base md:text-xl font-bold text-slate-950">{vendor.name}</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            {vendor.type || "No type"}
                          </span>
                          {vendor.preferredVendor && (
                            <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Preferred Supplier</span>
                          )}
                          {vendor.approvedVendor && (
                            <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Approved Supplier</span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${
                          vendor.status === "Active" ? "bg-emerald-100 text-emerald-800" :
                          vendor.status === "Review" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                        }`}>
                          {vendor.status}
                        </span>
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 md:min-h-10 md:min-w-10"
                          aria-label={`Edit ${vendor.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEdit(vendor);
                          }}
                        >
                          <Edit2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 md:min-h-10 md:min-w-10"
                          disabled={deletingId === vendor.id}
                          aria-label={`Delete ${vendor.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDelete(vendor.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-1 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white text-xs md:text-sm md:grid-cols-3 md:divide-x sm:divide-y-0">
                      <div className="px-3 py-3">
                        <p className="text-xs text-slate-400">Turnaround</p>
                        <p className="mt-1 text-xs md:text-sm font-semibold text-slate-950">{vendor.turnaround}</p>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-xs text-slate-400">Contact</p>
                        <p className="mt-1 truncate text-xs md:text-sm font-semibold text-slate-950">{vendor.contact}</p>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-xs text-slate-400">Orders using</p>
                        <p className="mt-1 text-xs md:text-sm font-semibold text-slate-950">{orderCountForVendor(vendor.name)}</p>
                      </div>
                    </div>
                    {((vendor.productCategories?.length ?? 0) > 0 || vendor.sampleStatus || vendor.moq) && (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap gap-2">
                          {(vendor.productCategories ?? []).map((category) => (
                            <span key={category} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{category}</span>
                          ))}
                        </div>
                        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                          <p><span className="font-semibold text-slate-500">Sample:</span> {vendor.sampleStatus ?? "Not Requested"}</p>
                          <p><span className="font-semibold text-slate-500">MOQ:</span> {vendor.moq || "Not set"}</p>
                        </div>
                      </div>
                    )}
                    {vendor.notes && (
                      <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-600">{vendor.notes}</p>
                      </div>
                    )}
                  </article>
        ))}
      </div>
      {tabVendors.length === 0 && (
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500 md:text-sm">
          {visible.length === 0 ? "No suppliers match your search." : "No suppliers in this category yet."}
        </div>
      )}
      </>

      {showModal && (
        <ModalShell
          title="Add supplier"
          subtitle="Keep supplier details ready for sourcing, production, and fulfillment."
          onClose={() => { setShowModal(false); setForm(emptyForm); setFormError(""); }}
          maxWidth="max-w-3xl"
          footer={
            <div className="space-y-3">
              <FieldError message={formError} />
              <div className="flex gap-3">
                <SaveButton state={addSave.saveState} onClick={handleAdd} mode="add" className="flex-1 py-3" />
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setShowModal(false); setForm(emptyForm); setFormError(""); }}>Cancel</button>
              </div>
            </div>
          }
        >
          {renderFields()}
        </ModalShell>
      )}

      {editingVendorId && (
        <ModalShell
          title="Edit supplier"
          subtitle="Update supplier details for sourcing, production, and fulfillment."
          onClose={() => { setEditingVendorId(""); setForm(emptyForm); setFormError(""); editSave.resetSaveState(); }}
          maxWidth="max-w-3xl"
          footer={
            <div className="space-y-3">
              <FieldError message={formError} />
              <div className="flex gap-3">
                <SaveButton state={editSave.saveState} onClick={handleEdit} className="flex-1 py-3" />
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => { setEditingVendorId(""); setForm(emptyForm); setFormError(""); editSave.resetSaveState(); }}>Cancel</button>
              </div>
            </div>
          }
        >
          {renderFields()}
        </ModalShell>
      )}
    </div>
  );
}
