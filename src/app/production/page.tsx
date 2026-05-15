"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Search, Trash2 } from "lucide-react";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type JobFlag = "none" | "backordered" | "delayed" | "rush" | "attention";

type Job = {
  id: string;
  client: string;
  orderName: string;
  vendor: string;
  dueDate: string;
  quantity: string;
  status: "Pending" | "Approved" | "In Production" | "Fulfilled";
  flag: JobFlag;
  flagNote: string;
  notes: string;
};

const defaultJobs: Job[] = [
  {
    id: "job-1",
    client: "POPS – Piranha Ops",
    orderName: "POPS 2026 Collection",
    vendor: "TBD – Bay Area print shop",
    dueDate: "2026-05-30",
    quantity: "48 tees · 4 designs",
    status: "In Production",
    flag: "none",
    flagNote: "",
    notes: "Highway Badge, Dotted Circle, Golden Gate, Classic White on Black. DSF7."
  },
  {
    id: "job-2",
    client: "Bay Area Dental Group",
    orderName: "Staff Polos Spring 2026",
    vendor: "S&S Activewear + Local Print",
    dueDate: "2026-06-05",
    quantity: "24 polos · 2 colors",
    status: "Approved",
    flag: "rush",
    flagNote: "Client needs before June 10 event",
    notes: "Navy and white. Left chest logo embroidery."
  },
  {
    id: "job-3",
    client: "Sunrise Logistics DSP",
    orderName: "Driver Uniforms Q2",
    vendor: "West Coast Screenprint",
    dueDate: "2026-06-12",
    quantity: "60 tees · 1 design",
    status: "Pending",
    flag: "attention",
    flagNote: "Awaiting final logo file from client",
    notes: "Black heavyweight tees. Back print only."
  },
  {
    id: "job-4",
    client: "Iron Peak Gym",
    orderName: "Member Hoodies 2026",
    vendor: "Golden State Print Co.",
    dueDate: "2026-05-25",
    quantity: "36 hoodies · 2 designs",
    status: "In Production",
    flag: "delayed",
    flagNote: "Vendor pushed back due date by 5 days",
    notes: "Charcoal and black. Front chest + back print."
  },
  {
    id: "job-5",
    client: "Delta Force DSP",
    orderName: "Warehouse Crew Tees",
    vendor: "Local Label Works",
    dueDate: "2026-06-20",
    quantity: "80 tees · 1 design",
    status: "Pending",
    flag: "backordered",
    flagNote: "Blank supplier backordered on XL size",
    notes: "White on black. Simple wordmark design."
  },
  {
    id: "job-6",
    client: "Coastal Med Clinic",
    orderName: "Staff Scrubs Branding",
    vendor: "S&S Activewear",
    dueDate: "2026-06-08",
    quantity: "20 scrub sets",
    status: "Approved",
    flag: "none",
    flagNote: "",
    notes: "Navy scrubs. Small left chest embroidery."
  },
  {
    id: "job-7",
    client: "Harbor DSP",
    orderName: "Summer Driver Tees",
    vendor: "West Coast Screenprint",
    dueDate: "2026-07-01",
    quantity: "45 tees · 2 designs",
    status: "Fulfilled",
    flag: "none",
    flagNote: "",
    notes: "Completed and delivered."
  },
  {
    id: "job-8",
    client: "Peak Performance Gym",
    orderName: "Coach Jackets Fall",
    vendor: "Golden State Print Co.",
    dueDate: "2026-05-22",
    quantity: "18 jackets",
    status: "In Production",
    flag: "rush",
    flagNote: "Due date is very soon — prioritize",
    notes: "Black full-zip jackets. Back and chest print."
  }
];

const emptyForm: Job = { id: "", client: "", orderName: "", vendor: "", dueDate: "", quantity: "", status: "Pending", flag: "none", flagNote: "", notes: "" };

const statusColors: Record<Job["status"], string> = {
  Pending: "bg-slate-100 text-slate-700",
  Approved: "bg-amber-100 text-amber-800",
  "In Production": "bg-blue-100 text-blue-800",
  Fulfilled: "bg-emerald-100 text-emerald-800",
};

const flagOrder: Record<JobFlag, number> = { rush: 0, attention: 1, delayed: 2, backordered: 3, none: 4 };
const statusOrder: Record<Job["status"], number> = { "In Production": 0, Approved: 1, Pending: 2, Fulfilled: 3 };
const today = new Date(2026, 4, 13);
const flagBanners: Record<Exclude<JobFlag, "none">, { className: string; label: string }> = {
  rush: { className: "bg-rose-600 text-white", label: "RUSH" },
  attention: { className: "bg-amber-500 text-white", label: "ATTENTION" },
  delayed: { className: "bg-orange-500 text-white", label: "DELAYED" },
  backordered: { className: "bg-blue-600 text-white", label: "BACKORDERED" },
};

function normalizeJob(job: Job): Job {
  return { ...job, flag: job.flag ?? "none", flagNote: job.flagNote ?? "" };
}

function isDueSoon(dueDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return false;
  const due = new Date(`${dueDate}T00:00:00`);
  const diff = due.getTime() - today.getTime();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}

function FormFields({ data, onChange }: { data: Job; onChange: (f: Job) => void }) {
  return (
    <div className="space-y-4">
      {[
        { label: "Client", key: "client", placeholder: "e.g. POPS – Piranha Ops" },
        { label: "Order name", key: "orderName", placeholder: "e.g. POPS 2026 Collection" },
        { label: "Vendor", key: "vendor", placeholder: "e.g. Bay Area print shop" },
        { label: "Due date", key: "dueDate", placeholder: "e.g. 2026-06-15 or TBD" },
        { label: "Quantity / items", key: "quantity", placeholder: "e.g. 48 tees · 4 designs" },
      ].map(({ label, key, placeholder }) => (
        <div key={key}>
          <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">{label}</label>
          <input type={key === "dueDate" ? "date" : "text"} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:outline-none md:text-sm" placeholder={key === "dueDate" ? undefined : placeholder} value={data[key as keyof Pick<Job, "client" | "orderName" | "vendor" | "dueDate" | "quantity">]} onClick={key === "dueDate" ? (e) => e.currentTarget.showPicker?.() : undefined} onChange={(e) => onChange({ ...data, [key]: e.target.value })} />
        </div>
      ))}
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Status</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={data.status} onChange={(e) => onChange({ ...data, status: e.target.value as Job["status"] })}>
          <option>Pending</option><option>Approved</option><option>In Production</option><option>Fulfilled</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Flag</label>
        <select className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 md:text-sm" value={data.flag} onChange={(e) => onChange({ ...data, flag: e.target.value as JobFlag, flagNote: e.target.value === "none" ? "" : data.flagNote })}>
          <option value="none">None</option>
          <option value="rush">Rush</option>
          <option value="attention">Attention</option>
          <option value="delayed">Delayed</option>
          <option value="backordered">Backordered</option>
        </select>
      </div>
      {data.flag !== "none" && (
        <div>
          <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Flag note</label>
          <input type="text" className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:outline-none md:text-sm" placeholder="Reason for flag..." value={data.flagNote} onChange={(e) => onChange({ ...data, flagNote: e.target.value })} />
        </div>
      )}
      <div>
        <label className="mb-1.5 block text-xs md:text-sm font-semibold text-slate-700">Notes</label>
        <textarea rows={3} className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-xs md:text-sm text-slate-900 focus:outline-none md:text-sm" value={data.notes} onChange={(e) => onChange({ ...data, notes: e.target.value })} />
      </div>
    </div>
  );
}

function Modal({ title, onSave, onClose, children }: { title: string; onSave: () => void; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-2 md:p-3 shadow-xl md:p-8">
        <h2 className="mb-6 text-base md:text-2xl font-semibold text-slate-950">{title}</h2>
        {children}
        <div className="mt-6 flex gap-3">
          <button className="min-h-11 flex-1 rounded-3xl bg-slate-950 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800" onClick={onSave}>Save</button>
          <button className="min-h-11 flex-1 rounded-3xl border border-slate-300 py-3 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function ProductionPage() {
  const router = useRouter();
  const { data: jobs, upsertItem, deleteItem, loading } = useSupabaseTable<Job>("production", defaultJobs);
  const [filter, setFilter] = useState<Job["status"] | "All">("All");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [form, setForm] = useState(emptyForm);

  const normalizedJobs = jobs.map(normalizeJob);
  const visible = normalizedJobs
    .filter((job) => filter === "All" || job.status === filter)
    .filter((job) => !flaggedOnly || job.flag !== "none")
    .filter((job) => Object.values(job).join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      if (flagOrder[a.flag] !== flagOrder[b.flag]) return flagOrder[a.flag] - flagOrder[b.flag];
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      return a.dueDate.localeCompare(b.dueDate);
    });

  const handleAdd = () => {
    if (!form.client.trim()) return;
    const newJob = { ...form, id: `job-${Date.now()}` };
    upsertItem(newJob);
    setForm(emptyForm); setShowAdd(false);
  };

  const handleSaveEdit = async () => {
    if (!editJob) return;
    await upsertItem(editJob);
    setEditJob(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this item?")) return;
    deleteItem(id);
    setEditJob(null);
  };

  if (loading) return <div className="p-2 md:p-8 text-slate-500">Loading...</div>;

  return (
    <div className="space-y-6 text-xs md:text-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-slate-600">Production system</p>
          <h1 className="mt-3 text-base md:text-3xl font-semibold text-slate-950">Production queue</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
          <label className="relative w-full md:w-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-xs md:text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64"
              placeholder="Search production..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="min-h-11 w-full rounded-3xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800 md:w-auto" onClick={() => { setForm(emptyForm); setShowAdd(true); }}>Add job</button>
          <select className="min-h-11 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm text-slate-900" value={filter} onChange={(e) => setFilter(e.target.value as Job["status"] | "All")}>
            <option>All</option><option>Pending</option><option>Approved</option><option>In Production</option><option>Fulfilled</option>
          </select>
          <label className="flex min-h-11 items-center gap-2 rounded-3xl border border-slate-300 bg-white px-4 py-3 text-xs md:text-sm font-semibold text-slate-700">
            <input className="h-4 w-4 accent-slate-950" type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} />
            Flagged only
          </label>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        {visible.map((job) => {
          const flag = job.flag ?? "none";
          const banner = flag === "none" ? null : flagBanners[flag];
          const dueSoon = isDueSoon(job.dueDate);

          return (
            <article key={job.id} className="overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-md transition hover:-translate-y-0.5 hover:shadow-md">
              {banner && (
                <div className={`rounded-t-[2rem] px-4 py-1.5 text-xs font-semibold ${banner.className}`}>
                  {banner.label} — {job.flagNote}
                </div>
              )}
              <button type="button" onClick={() => router.push(`/production/${job.id}`)} className="w-full p-2 md:p-6 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base md:text-xl font-semibold text-slate-950">{job.orderName}</h2>
                    <p className="mt-1 text-xs md:text-sm text-slate-600">{job.client}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${statusColors[job.status]}`}>{job.status}</span>
                </div>
                <div className="mt-4 space-y-2 text-xs md:text-sm text-slate-600">
                  <div className="flex justify-between rounded-2xl bg-gray-100 px-4 py-2"><span>Vendor</span><span className="max-w-[150px] truncate text-right font-medium text-slate-900">{job.vendor}</span></div>
                  <div className="flex justify-between rounded-2xl bg-gray-100 px-4 py-2">
                    <span>Due</span>
                    <span className={`inline-flex items-center gap-1 ${dueSoon ? "font-bold text-rose-600" : ""}`}>
                      {dueSoon && <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
                      {job.dueDate}
                    </span>
                  </div>
                  {job.quantity && <div className="rounded-2xl bg-gray-100 px-4 py-2 text-xs text-slate-600">{job.quantity}</div>}
                </div>
                <p className="mt-3 text-xs text-slate-600">Click to view production detail →</p>
              </button>
              <div className="flex gap-3 border-t border-slate-100 px-3 md:px-6 pb-5 pt-4">
                <button type="button" className="min-h-11 flex-1 rounded-3xl border border-slate-300 bg-white px-4 py-2.5 text-xs md:text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={() => setEditJob({ ...job })}>
                  Edit job
                </button>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 md:h-10 md:w-10"
                  aria-label={`Delete ${job.orderName}`}
                  onClick={() => handleDelete(job.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {showAdd && <Modal title="Add production job" onSave={handleAdd} onClose={() => setShowAdd(false)}><FormFields data={form} onChange={setForm} /></Modal>}
      {editJob && <Modal title="Edit production job" onSave={handleSaveEdit} onClose={() => setEditJob(null)}><FormFields data={editJob} onChange={setEditJob} /></Modal>}
    </div>
  );
}
