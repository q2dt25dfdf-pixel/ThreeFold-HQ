"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Briefcase, Building2, Clock, Edit2, Plus } from "lucide-react";

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

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
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

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const vendorId = params.id;

  const [vendors, setVendors] = useState<Vendor[]>(() => readStorage<Vendor[]>("tf_vendors", defaultVendors));
  const [jobs, setJobs] = useState<VendorJob[]>(() => readStorage<VendorJob[]>("tf_vendor_jobs", defaultVendorJobs));
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({
    name: "",
    client: "",
    date: "",
    status: "Pending" as VendorJob["status"],
  });

  useEffect(() => {
    const storedVendors = readStorage<Vendor[]>("tf_vendors", defaultVendors);
    const storedJobs = readStorage<VendorJob[]>("tf_vendor_jobs", defaultVendorJobs);
    writeStorage("tf_vendors", storedVendors);
    writeStorage("tf_vendor_jobs", storedJobs);
  }, []);

  const vendor = vendors.find((item) => item.id === vendorId);
  const vendorJobs = jobs.filter((job) => job.vendorId === vendorId);

  const saveVendor = (fields: Partial<Vendor>) => {
    setVendors((current) => {
      const updated = current.map((item) => (item.id === vendorId ? { ...item, ...fields } : item));
      writeStorage("tf_vendors", updated);
      return updated;
    });
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
    const updated = [nextJob, ...jobs];
    setJobs(updated);
    writeStorage("tf_vendor_jobs", updated);
    saveVendor({ jobs: vendorJobs.length + 1 });
    setJobForm({ name: "", client: "", date: "", status: "Pending" });
    setShowJobForm(false);
  };

  if (!vendor) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <button type="button" onClick={() => router.push("/vendors")} className="text-sm font-semibold text-slate-600 hover:text-slate-950">
          ← Vendors
        </button>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-semibold text-slate-950">Vendor not found</h1>
          <p className="mt-2 text-sm text-slate-500">This vendor may have been deleted or is not available in localStorage.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-slate-950 p-8 text-white">
        <button type="button" onClick={() => router.push("/vendors")} className="mb-8 flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vendors
        </button>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200">{vendor.type}</span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[vendor.status]}`}>{vendor.status}</span>
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">{vendor.name}</h1>
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              {vendor.contact || "No contact listed"}
            </p>
          </div>
          <Briefcase className="h-12 w-12 text-blue-300" aria-hidden="true" />
        </div>
      </header>

      <div className="space-y-6 p-6 lg:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="grid divide-y divide-slate-200 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {[
              { label: "Total jobs assigned", value: String(vendorJobs.length || vendor.jobs), icon: Briefcase },
              { label: "Turnaround time", value: vendor.turnaround, icon: Clock },
              { label: "Status", value: vendor.status, icon: Building2 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-start gap-3 p-5">
                  <Icon className="mt-0.5 h-5 w-5 text-blue-500" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Vendor details</h2>
            <p className="mt-1 text-sm text-slate-500">Click a field to edit. Changes save on blur.</p>
            <div className="mt-5 space-y-3">
              <InlineField label="Type" value={vendor.type} onSave={(value) => saveVendor({ type: value })} />
              <InlineField label="Turnaround" value={vendor.turnaround} onSave={(value) => saveVendor({ turnaround: value })} />
              <InlineField label="Contact" value={vendor.contact} onSave={(value) => saveVendor({ contact: value })} />
              <InlineField label="Status" value={vendor.status} onSave={(value) => saveVendor({ status: value as VendorStatus })} type="select" options={["Active", "Review", "Paused"]} />
              <InlineField label="Notes" value={vendor.notes} onSave={(value) => saveVendor({ notes: value })} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Job history</h2>
                <p className="mt-1 text-sm text-slate-500">Production work assigned to this vendor.</p>
              </div>
              <button type="button" onClick={() => setShowJobForm(true)} className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add job
              </button>
            </div>

            {showJobForm && (
              <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-2">
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Job name" value={jobForm.name} onChange={(event) => setJobForm((current) => ({ ...current, name: event.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Client" value={jobForm.client} onChange={(event) => setJobForm((current) => ({ ...current, client: event.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Date" value={jobForm.date} onChange={(event) => setJobForm((current) => ({ ...current, date: event.target.value }))} />
                <select className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" value={jobForm.status} onChange={(event) => setJobForm((current) => ({ ...current, status: event.target.value as VendorJob["status"] }))}>
                  <option>Pending</option>
                  <option>Approved</option>
                  <option>In Production</option>
                  <option>Fulfilled</option>
                </select>
                <button type="button" onClick={addJob} className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white md:col-span-2">Save job</button>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {vendorJobs.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No jobs assigned yet.</p>}
              {vendorJobs.map((job) => (
                <div key={job.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">{job.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{job.client} · {job.date}</p>
                  </div>
                  <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-800">{job.status}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <textarea
            value={vendor.notes}
            onChange={(event) => saveVendor({ notes: event.target.value })}
            rows={7}
            className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 outline-none focus:border-blue-300"
          />
        </section>
      </div>
    </main>
  );
}
