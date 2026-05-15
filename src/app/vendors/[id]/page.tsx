"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, Clock, Edit2, Plus, Trash2 } from "lucide-react";
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

type VendorJob = {
  id: string;
  vendorId: string;
  name: string;
  client: string;
  date: string;
  status: "Pending" | "Approved" | "In Production" | "Fulfilled";
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

const defaultVendorJobs: VendorJob[] = [
  {
    id: "vendor-job-1",
    vendorId: "vendor-2",
    name: "POPS 2026 Collection",
    client: "POPS - Piranha Ops",
    date: "2026-05-13",
    status: "In Production",
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

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const vendorId = params.id;

  const { data: vendors, upsertItem, deleteItem, loading: vendorsLoading } = useSupabaseTable<Vendor>("vendors", defaultVendors);
  const { data: jobs, upsertItem: upsertJob, loading: jobsLoading } = useSupabaseTable<VendorJob>("vendor_jobs", defaultVendorJobs);
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({
    name: "",
    client: "",
    date: "",
    status: "Pending" as VendorJob["status"],
  });
  const [editingVendor, setEditingVendor] = useState(false);
  const [vendorDraft, setVendorDraft] = useState<Vendor | null>(null);

  const vendor = vendors.find((item) => item.id === vendorId);
  const vendorJobs = jobs.filter((job) => job.vendorId === vendorId);

  const openVendorEditor = () => {
    if (!vendor) return;
    setVendorDraft({ ...vendor });
    setEditingVendor(true);
  };

  const saveVendorDraft = () => {
    if (!vendorDraft) return;
    upsertItem(vendorDraft);
    setEditingVendor(false);
    setVendorDraft(null);
  };

  const handleDeleteVendor = () => {
    if (!vendor || !window.confirm("Delete this vendor?")) return;
    deleteItem(vendor.id);
    router.push("/vendors");
  };

  const addJob = () => {
    if (!jobForm.name.trim()) return;
    const nextJob: VendorJob = {
      id: `vendor-job-${Date.now()}`,
      vendorId,
      name: jobForm.name.trim(),
      client: jobForm.client.trim() || "TBD",
      date: jobForm.date || new Date().toISOString().split("T")[0],
      status: jobForm.status,
    };
    upsertJob(nextJob);
    if (vendor) upsertItem({ ...vendor, jobs: vendorJobs.length + 1 });
    setJobForm({ name: "", client: "", date: "", status: "Pending" });
    setShowJobForm(false);
  };

  if (vendorsLoading || jobsLoading) return <div className="p-2 md:p-8 text-slate-500">Loading...</div>;

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
    <main className="min-h-screen text-xs text-slate-950 md:text-sm">
      <header className="bg-slate-950 p-2 md:p-3 text-white md:p-8">
        <button type="button" onClick={() => router.push("/vendors")} className="mb-8 flex items-center gap-2 text-xs md:text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vendors
        </button>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200">{vendor.type}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[vendor.status]}`}>{vendor.status}</span>
            </div>
            <h1 className="mt-5 text-base md:text-xl font-semibold tracking-tight md:text-5xl">{vendor.name}</h1>
            <p className="mt-4 flex items-center gap-2 text-xs md:text-sm text-slate-300">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {vendor.contact || "No contact listed"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleDeleteVendor}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-rose-300/60 bg-rose-500/10 px-4 py-2 text-xs md:text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
            <Briefcase className="h-12 w-12 text-blue-300" aria-hidden="true" />
          </div>
        </div>
      </header>

      <div className="space-y-6 p-2 md:p-6 lg:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="grid divide-y divide-slate-200 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {[
              { label: "Total jobs assigned", value: String(vendorJobs.length || vendor.jobs), icon: Briefcase },
              { label: "Turnaround time", value: vendor.turnaround, icon: Clock },
              { label: "Status", value: vendor.status, icon: Building2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-start gap-3 p-2 md:p-5">
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
          <div className="rounded-2xl border border-slate-200 bg-white p-2 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold">Vendor details</h2>
                <p className="mt-1 text-xs md:text-sm text-slate-500">Review vendor profile, contacts, and operational notes.</p>
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
                { label: "Jobs", value: String(vendor.jobs) },
                { label: "Notes", value: vendor.notes },
              ].map((field) => (
                <div key={field.label} className="rounded-2xl border border-slate-200 bg-white p-2 md:p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{field.label}</p>
                  <p className="mt-2 text-xs md:text-sm font-semibold text-slate-950">{field.value || "Not set"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-2 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base md:text-lg font-semibold">Job history</h2>
                <p className="mt-1 text-xs md:text-sm text-slate-500">Production work assigned to this vendor.</p>
              </div>
              <button type="button" onClick={() => setShowJobForm(true)} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-blue-500 px-4 py-2 text-xs md:text-sm font-semibold text-white hover:bg-blue-600">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add job
              </button>
            </div>

            {showJobForm && (
              <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-2 md:p-4 md:grid-cols-2">
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-xs md:text-sm outline-none md:text-sm" placeholder="Job name" value={jobForm.name} onChange={(event) => setJobForm((current) => ({ ...current, name: event.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-xs md:text-sm outline-none md:text-sm" placeholder="Client" value={jobForm.client} onChange={(event) => setJobForm((current) => ({ ...current, client: event.target.value }))} />
                <input type="date" className="rounded-xl border border-slate-200 px-4 py-3 text-xs md:text-sm outline-none md:text-sm" value={jobForm.date} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => setJobForm((current) => ({ ...current, date: event.target.value }))} />
                <select className="rounded-xl border border-slate-200 px-4 py-3 text-xs md:text-sm outline-none md:text-sm" value={jobForm.status} onChange={(event) => setJobForm((current) => ({ ...current, status: event.target.value as VendorJob["status"] }))}>
                  <option>Pending</option>
                  <option>Approved</option>
                  <option>In Production</option>
                  <option>Fulfilled</option>
                </select>
                <button type="button" onClick={addJob} className="min-h-11 rounded-xl bg-blue-500 px-4 py-3 text-xs md:text-sm font-semibold text-white md:col-span-2">Save job</button>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {vendorJobs.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-2 md:p-5 text-xs md:text-sm text-slate-500">No jobs assigned yet.</p>}
              {vendorJobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{job.name}</p>
                    <p className="mt-1 text-xs md:text-sm text-slate-500">{job.client} · {job.date}</p>
                  </div>
                  <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">{job.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-2 md:p-6">
          <h2 className="text-base md:text-lg font-semibold">Notes</h2>
          <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-2 md:p-4 text-xs md:text-sm leading-6 text-slate-700">
            {vendor.notes || "No notes added yet."}
          </p>
        </section>
      </div>

      {editingVendor && vendorDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] bg-white p-2 md:p-3 shadow-xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base md:text-2xl font-semibold text-slate-950">Edit vendor</h2>
                <p className="mt-1 text-xs md:text-sm text-slate-500">Update the vendor profile and save changes.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingVendor(false);
                  setVendorDraft(null);
                }}
                className="min-h-11 rounded-full border border-slate-300 px-3 py-1 text-xs md:text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Name</span>
                <input className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.name} onChange={(event) => setVendorDraft({ ...vendorDraft, name: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Type</span>
                <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.type} onChange={(event) => setVendorDraft({ ...vendorDraft, type: event.target.value })}>
                  {!vendorTypeOptions.includes(vendorDraft.type) && (
                    <option>{vendorDraft.type}</option>
                  )}
                  {vendorTypeOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
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
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Jobs</span>
                <input type="number" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.jobs} onChange={(event) => setVendorDraft({ ...vendorDraft, jobs: Number(event.target.value) })} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</span>
                <textarea rows={4} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:border-slate-500 focus:outline-none md:text-sm" value={vendorDraft.notes} onChange={(event) => setVendorDraft({ ...vendorDraft, notes: event.target.value })} />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={saveVendorDraft} className="min-h-11 flex-1 rounded-3xl bg-slate-950 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingVendor(false);
                  setVendorDraft(null);
                }}
                className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
