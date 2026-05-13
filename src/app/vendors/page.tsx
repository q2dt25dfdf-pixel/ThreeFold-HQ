"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, Package, Printer, Search } from "lucide-react";

type Vendor = {
  id: string;
  name: string;
  type: string;
  turnaround: string;
  contact: string;
  notes: string;
  status: "Active" | "Review" | "Paused";
  jobs: number;
};

const defaultVendors: Vendor[] = [
  {
    id: "vendor-1",
    name: "S&S Activewear",
    type: "Blank supplier",
    turnaround: "2–4 days",
    contact: "Online wholesale",
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
    notes: "Sourcing a local Bay Area print shop for POPS first order. Need to confirm pricing, min quantities, and turnaround.",
    status: "Review",
    jobs: 0,
  },
];

function useLocalStorage<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initial;
    } catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}

const emptyForm = { name: "", type: "", turnaround: "", contact: "", notes: "", status: "Review" as Vendor["status"], jobs: 0 };

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useLocalStorage<Vendor[]>("tf_vendors", defaultVendors);
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);

  const visible = vendors.filter((vendor) =>
    Object.values(vendor).join(" ").toLowerCase().includes(query.toLowerCase()),
  );
  const groupedVendors = [
    {
      label: "Blank Suppliers",
      headerClass: "border-l-blue-500",
      icon: Package,
      vendors: visible.filter((vendor) => {
        const type = vendor.type.toLowerCase();
        return type.includes("blank") || type.includes("supplier");
      }),
    },
    {
      label: "Print & Production",
      headerClass: "border-l-violet-500",
      icon: Printer,
      vendors: visible.filter((vendor) => {
        const type = vendor.type.toLowerCase();
        return type.includes("print") || type.includes("dtg") || type.includes("screen") || type.includes("embroidery");
      }),
    },
    {
      label: "Other",
      headerClass: "border-l-slate-400",
      icon: Box,
      vendors: visible.filter((vendor) => {
        const type = vendor.type.toLowerCase();
        const isBlankSupplier = type.includes("blank") || type.includes("supplier");
        const isPrintProduction = type.includes("print") || type.includes("dtg") || type.includes("screen") || type.includes("embroidery");
        return !isBlankSupplier && !isPrintProduction;
      }),
    },
  ].filter((section) => section.vendors.length > 0);

  const handleAdd = () => {
    if (!form.name.trim()) return;
    setVendors((prev) => [{ id: `vendor-${Date.now()}`, ...form }, ...prev]);
    setForm(emptyForm);
    setShowModal(false);
  };

  const renderFields = (
    data: typeof emptyForm | Vendor,
    onChange: (next: typeof emptyForm | Vendor) => void,
  ) => (
    <div className="mt-6 space-y-4">
      {[
        { label: "Vendor name", key: "name", placeholder: "e.g. S&S Activewear" },
        { label: "Type", key: "type", placeholder: "e.g. Blank supplier, Screen print, DTG" },
        { label: "Turnaround time", key: "turnaround", placeholder: "e.g. 3–5 days" },
        { label: "Contact", key: "contact", placeholder: "Name, email, or website" },
      ].map(({ label, key, placeholder }) => (
        <div key={key}>
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
          <input
            type="text"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            placeholder={placeholder}
            value={String(data[key as keyof typeof data] ?? "")}
            onChange={(e) => onChange({ ...data, [key]: e.target.value })}
          />
        </div>
      ))}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Status</label>
        <select
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900"
          value={data.status}
          onChange={(e) => onChange({ ...data, status: e.target.value as Vendor["status"] })}
        >
          <option>Active</option>
          <option>Review</option>
          <option>Paused</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Notes</label>
        <textarea
          rows={3}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          placeholder="Pricing notes, minimums, quality feedback..."
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-600">Vendors</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Vendor network</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64"
              placeholder="Search vendors..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            className="rounded-3xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => setShowModal(true)}
          >
            Add vendor
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {groupedVendors.map((section, sectionIndex) => {
          const Icon = section.icon;

          return (
            <section key={section.label} className={sectionIndex > 0 ? "border-t border-slate-300 pt-8" : ""}>
              <div className={`mb-4 flex items-center gap-2 border-l-4 pl-3 text-lg font-bold text-slate-950 ${section.headerClass}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                <h2>{section.label}</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {section.vendors.map((vendor) => (
                  <button
                    key={vendor.id}
                    type="button"
                    onClick={() => router.push(`/vendors/${vendor.id}`)}
                    className={`rounded-[2rem] border border-slate-300 bg-white p-6 text-left shadow-md transition hover:-translate-y-0.5 hover:shadow-md ${
                      vendor.status === "Active" ? "border-t-2 border-t-emerald-400" :
                      vendor.status === "Review" ? "border-t-2 border-t-amber-400" : "border-t-2 border-t-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-bold text-slate-950">{vendor.name}</h3>
                        <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          {vendor.type}
                        </span>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] ${
                        vendor.status === "Active" ? "bg-emerald-100 text-emerald-800" :
                        vendor.status === "Review" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                      }`}>
                        {vendor.status}
                      </span>
                    </div>
                    <div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white text-sm">
                      <div className="px-3 py-3">
                        <p className="text-xs text-slate-400">Turnaround</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{vendor.turnaround}</p>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-xs text-slate-400">Contact</p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-950">{vendor.contact}</p>
                      </div>
                      <div className="px-3 py-3">
                        <p className="text-xs text-slate-400">Jobs assigned</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{vendor.jobs}</p>
                      </div>
                    </div>
                    {vendor.notes && (
                      <div className="mt-3 rounded-xl bg-zinc-50 p-3">
                        <p className="text-xs text-slate-600">{vendor.notes}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {groupedVendors.length === 0 && (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
            No vendors match your search.
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-semibold text-slate-950">Add vendor</h2>
            {renderFields(form, (next) => setForm(next as typeof emptyForm))}
            <div className="mt-6 flex gap-3">
              <button className="flex-1 rounded-3xl bg-slate-950 py-3 text-sm font-semibold text-white hover:bg-slate-800" onClick={handleAdd}>
                Add vendor
              </button>
              <button className="flex-1 rounded-3xl border border-slate-300 py-3 text-sm font-semibold text-slate-700 hover:bg-gray-100" onClick={() => { setShowModal(false); setForm(emptyForm); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
