"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2, Circle, Clock, Package, Plus, Truck } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type JobStatus = "Pending" | "Approved" | "In Production" | "Fulfilled";
type JobFlag = "none" | "backordered" | "delayed" | "rush" | "attention";

type Job = {
  id: string;
  client: string;
  orderName: string;
  vendor: string;
  dueDate: string;
  quantity: string;
  status: JobStatus;
  flag: JobFlag;
  flagNote: string;
  notes: string;
};

type DesignSpec = {
  id: string;
  jobId: string;
  name: string;
  description: string;
  placement: string;
};

type VendorInfo = {
  id: string;
  jobId: string;
  name: string;
  contact: string;
  turnaround: string;
};

const defaultJobs: Job[] = [
  {
    id: "job-1",
    client: "POPS – Piranha Ops",
    orderName: "POPS 2026 Collection",
    vendor: "TBD – sourcing Bay Area print shop",
    dueDate: "TBD",
    quantity: "4 designs · Black oversized heavyweight tees",
    status: "In Production",
    flag: "none",
    flagNote: "",
    notes:
      "Designs: Highway Badge, Dotted Circle, Golden Gate, Classic White on Black. Sleeve detail: left PRIME 2026, right POPS. Back tag: Made by three, worn by all. Station: DSF7.",
  },
];

const defaultDesigns: DesignSpec[] = [
  { id: "design-1", jobId: "job-1", name: "Highway Badge", description: "Route-inspired badge graphic for the POPS collection.", placement: "Front chest, centered" },
  { id: "design-2", jobId: "job-1", name: "Dotted Circle", description: "Circular dotted mark with station energy and team identity.", placement: "Back graphic" },
  { id: "design-3", jobId: "job-1", name: "Golden Gate", description: "Bay Area bridge reference with lightweight linework.", placement: "Front oversized print" },
  { id: "design-4", jobId: "job-1", name: "Classic White on Black", description: "Minimal white type treatment on black heavyweight tees.", placement: "Front and sleeve detail" },
];

const timelineSteps = ["Order Placed", "Design Approved", "Sent to Vendor", "In Production", "Quality Check", "Fulfilled"] as const;

const statusIndex: Record<JobStatus, number> = {
  Pending: 0,
  Approved: 1,
  "In Production": 3,
  Fulfilled: 5,
};

const statusStyles: Record<JobStatus, string> = {
  Pending: "bg-slate-100 text-slate-700",
  Approved: "bg-amber-100 text-amber-800",
  "In Production": "bg-blue-100 text-blue-800",
  Fulfilled: "bg-emerald-100 text-emerald-800",
};

const flagBanners: Record<Exclude<JobFlag, "none">, { className: string; label: string }> = {
  rush: { className: "bg-rose-600 text-white", label: "RUSH" },
  attention: { className: "bg-amber-500 text-white", label: "ATTENTION" },
  delayed: { className: "bg-orange-500 text-white", label: "DELAYED" },
  backordered: { className: "bg-blue-600 text-white", label: "BACKORDERED" },
};

function normalizeJob(job: Job): Job {
  return { ...job, flag: job.flag ?? "none", flagNote: job.flagNote ?? "" };
}

const defaultVendorInfo: VendorInfo[] = [];

function getStation(notes: string) {
  const match = notes.match(/Station:\s*([A-Z0-9-]+)/i);
  return match?.[1] ?? "DSF7";
}

function InlineEditable({
  value,
  onSave,
  className,
  inputClassName,
  options,
}: {
  value: string;
  onSave: (value: string) => void;
  className: string;
  inputClassName: string;
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return options ? (
      <select
        autoFocus
        className={inputClassName}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    ) : (
      <input
        autoFocus
        className={inputClassName}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      {value}
    </button>
  );
}

export default function ProductionDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const jobId = params.id;

  const { data: jobs, upsertItem: upsertJob, loading: jobsLoading } = useSupabaseTable<Job>("production", defaultJobs.map(normalizeJob));
  const { data: designs, upsertItem: upsertDesign, loading: designsLoading } = useSupabaseTable<DesignSpec>("production_designs", defaultDesigns);
  const { data: vendorInfos, upsertItem: upsertVendorInfo, loading: vendorInfoLoading } = useSupabaseTable<VendorInfo>("production_vendor_info", defaultVendorInfo);
  const [designForm, setDesignForm] = useState({ name: "", description: "", placement: "" });
  const [showDesignForm, setShowDesignForm] = useState(false);

  const normalizedJobs = useMemo(() => jobs.map(normalizeJob), [jobs]);
  const job = normalizedJobs.find((item) => item.id === jobId);
  const jobDesigns = designs.filter((design) => design.jobId === jobId);
  const vendorInfo = vendorInfos.find((item) => item.jobId === jobId) ?? {
    id: `vendor-info-${jobId}`,
    jobId,
    name: job?.vendor ?? "",
    contact: "TBD",
    turnaround: "5-7 days",
  };

  const currentStep = useMemo(() => (job ? statusIndex[job.status] : 0), [job]);
  const flag = job?.flag ?? "none";
  const flagBanner = flag === "none" ? null : flagBanners[flag];

  const saveJob = (fields: Partial<Job>) => {
    if (!job) return;
    upsertJob(normalizeJob({ ...job, ...fields }));
  };

  const saveVendorInfo = (fields: Partial<VendorInfo>) => {
    upsertVendorInfo({ ...vendorInfo, ...fields });
  };

  const addDesign = () => {
    if (!designForm.name.trim()) return;
    const nextDesign: DesignSpec = {
      id: `design-${Date.now()}`,
      jobId,
      name: designForm.name.trim(),
      description: designForm.description.trim(),
      placement: designForm.placement.trim(),
    };
    upsertDesign(nextDesign);
    setDesignForm({ name: "", description: "", placement: "" });
    setShowDesignForm(false);
  };

  if (jobsLoading || designsLoading || vendorInfoLoading) return <div className="p-8 text-slate-500">Loading...</div>;

  if (!job) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <button type="button" onClick={() => router.push("/production")} className="text-sm font-semibold text-slate-600 hover:text-slate-950">
          ← Production
        </button>
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="text-2xl font-semibold text-slate-950">Production job not found</h1>
          <p className="mt-2 text-sm text-slate-500">This production job may have been deleted or is not available in Supabase.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white">
        {flagBanner && (
          <div className={`-mx-8 -mt-8 mb-8 px-8 py-2 text-xs font-semibold tracking-[0.2em] ${flagBanner.className}`}>
            {flagBanner.label}{job.flagNote ? ` - ${job.flagNote}` : ""}
          </div>
        )}
        <button type="button" onClick={() => router.push("/production")} className="mb-8 flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Production
        </button>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[job.status]}`}>{job.status}</span>
              <span className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-slate-200">{getStation(job.notes)}</span>
            </div>
            <InlineEditable
              value={job.orderName}
              onSave={(value) => saveJob({ orderName: value })}
              className="mt-5 block max-w-4xl text-left text-4xl font-semibold tracking-tight text-white transition hover:text-slate-200 md:text-5xl"
              inputClassName="mt-5 block w-full max-w-4xl rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-4xl font-semibold tracking-tight text-white outline-none focus:border-white/50 md:text-5xl"
            />
            <p className="mt-4 text-base text-slate-300">{job.client}</p>
          </div>
          <Package className="h-12 w-12 text-blue-300" aria-hidden="true" />
        </div>
      </header>

      <div className="space-y-6 p-6 lg:p-8">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="grid divide-y divide-slate-200 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
            {[
              { label: "Vendor", value: job.vendor, icon: Truck, field: "vendor" as const },
              { label: "Due date", value: job.dueDate, icon: Calendar, field: "dueDate" as const },
              { label: "Quantity", value: job.quantity, icon: Package, field: "quantity" as const },
              { label: "Status", value: job.status, icon: Clock, field: "status" as const, options: ["Pending", "Approved", "In Production", "Fulfilled"] },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-start gap-3 p-5">
                  <Icon className="mt-0.5 h-5 w-5 text-blue-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                    <InlineEditable
                      value={item.value}
                      onSave={(value) => saveJob({ [item.field]: value } as Partial<Job>)}
                      options={item.options}
                      className="mt-2 block max-w-full text-left text-sm font-semibold text-slate-950 transition hover:text-blue-600"
                      inputClassName="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 outline-none focus:border-blue-300"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Design specs</h2>
                <p className="mt-1 text-sm text-slate-500">Collection artwork, description, and placement notes.</p>
              </div>
              <button type="button" onClick={() => setShowDesignForm(true)} className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add design
              </button>
            </div>

            {showDesignForm && (
              <div className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Design name" value={designForm.name} onChange={(event) => setDesignForm((current) => ({ ...current, name: event.target.value }))} />
                <textarea className="resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" rows={2} placeholder="Description" value={designForm.description} onChange={(event) => setDesignForm((current) => ({ ...current, description: event.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Placement notes" value={designForm.placement} onChange={(event) => setDesignForm((current) => ({ ...current, placement: event.target.value }))} />
                <button type="button" onClick={addDesign} className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white">Save design</button>
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {jobDesigns.map((design) => (
                <div key={design.id} className="rounded-2xl border border-slate-200 p-5">
                  <p className="text-base font-semibold text-slate-950">{design.name}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{design.description || "No description yet."}</p>
                  <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">{design.placement || "Placement TBD"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Production timeline</h2>
            <div className="mt-6 space-y-0">
              {timelineSteps.map((step, index) => {
                const complete = index < currentStep;
                const current = index === currentStep;
                return (
                  <div key={step} className="relative flex gap-4 pb-7 last:pb-0">
                    {index < timelineSteps.length - 1 && <div className="absolute left-[9px] top-6 h-full w-px bg-slate-200" />}
                    <div className="relative z-10 mt-1">
                      {complete ? (
                        <CheckCircle2 className="h-5 w-5 text-blue-500" aria-hidden="true" />
                      ) : current ? (
                        <Clock className="h-5 w-5 text-blue-500" aria-hidden="true" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-300" aria-hidden="true" />
                      )}
                    </div>
                    <div className={current ? "rounded-2xl border border-blue-100 bg-blue-50 p-4" : "p-1"}>
                      <p className="font-semibold text-slate-950">{step}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {complete ? "Complete" : current ? "Current step" : "Upcoming"}
                        {complete || current ? ` · ${new Date().toISOString().split("T")[0]}` : ""}
                      </p>
                      {current && <p className="mt-2 text-sm text-blue-700">Active production focus for this collection.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <textarea
            value={job.notes}
            onChange={(event) => saveJob({ notes: event.target.value })}
            rows={7}
            className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 outline-none focus:border-blue-300"
          />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Vendor info</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              { label: "Vendor name", key: "name", value: vendorInfo.name },
              { label: "Contact", key: "contact", value: vendorInfo.contact },
              { label: "Turnaround", key: "turnaround", value: vendorInfo.turnaround },
            ].map((field) => (
              <label key={field.key} className="rounded-2xl border border-slate-200 p-4">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{field.label}</span>
                <input
                  value={field.value}
                  onChange={(event) => saveVendorInfo({ [field.key]: event.target.value } as Partial<VendorInfo>)}
                  className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-950 outline-none"
                />
              </label>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
