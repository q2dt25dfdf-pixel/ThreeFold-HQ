"use client";

import { useState } from "react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { Lead, PipelineStage, CommunicationEntry } from "./types";
import { pipelineStages } from "./types";

interface Props {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSave: (lead: Lead) => void | Promise<void>;
  onDelete: (lead: Lead) => void;
}

const OWNERS = ["Alliyah", "Hannah", "Jordan"];
const CONTACT_TYPES: CommunicationEntry["type"][] = [
  "Call", "Email", "Text", "Meeting", "In Person", "Other",
];

function formatLeadValue(value: Lead["value"]) {
  if (typeof value === "number") {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return value;
}

function parseLeadValue(value: string) {
  const amount = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

// Inline editable field — click value to edit, blur to save
function InlineField({
  label,
  value,
  onSave,
  type = "text",
  options,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "select" | "date" | "address";
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-300/50 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      {editing ? (
        type === "select" && options ? (
          <select
            autoFocus
            className="w-full border-0 bg-transparent text-left text-base font-semibold text-slate-950 outline-none sm:text-right md:text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
          >
            {options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : type === "address" ? (
          <AddressAutocomplete
            autoFocus
            className="w-full border-0 bg-transparent text-left text-base font-semibold text-slate-950 outline-none sm:w-64 sm:text-right md:text-sm"
            value={draft}
            onChange={setDraft}
            onBlur={commit}
          />
        ) : (
          <input
            autoFocus
            type={type}
            className="w-full border-0 bg-transparent text-left text-base font-semibold text-slate-950 outline-none sm:w-40 sm:text-right md:text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => { setDraft(value); setEditing(true); }}
          className="group flex min-h-11 items-center gap-1.5 text-left text-sm font-semibold text-slate-950 hover:text-slate-600 sm:min-h-0 sm:text-right"
        >
          {value}
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" aria-hidden="true">
            <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

export default function LeadDetailModal({ open, lead, onClose, onSave, onDelete }: Props) {
  const [data, setData] = useState<Lead | null>(null);
  const [saveLabel, setSaveLabel] = useState("Save Changes");

  // Activity log form state
  const [logType, setLogType] = useState<CommunicationEntry["type"]>("Call");
  const [logOwner, setLogOwner] = useState("Alliyah");
  const [logNote, setLogNote] = useState("");

  if (!open || !lead) return null;

  // Use live lead data, patch locally via onSave
  const current = data ?? lead;

  const patch = (fields: Partial<Lead>) => {
    const updated = { ...current, ...fields };
    setData(updated);
    onSave(updated);
  };

  const patchProfile = (fields: Partial<Lead["companyProfile"]>) => {
    patch({ companyProfile: { ...current.companyProfile, ...fields } });
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete lead "${lead.company}"? This cannot be undone.`)) return;
    onDelete(lead);
    onClose();
  };

  const handleSaveChanges = async () => {
    await onSave(current);
    setSaveLabel("Saved ✓");
    window.setTimeout(() => setSaveLabel("Save Changes"), 1200);
  };

  const addActivityEntry = () => {
    if (!logNote.trim()) return;
    const entry: CommunicationEntry = {
      id: `comm-${Date.now()}`,
      type: logType,
      date: new Date().toISOString().split("T")[0],
      owner: logOwner,
      summary: logNote.trim(),
    };
    patch({ communicationHistory: [entry, ...current.communicationHistory] });
    setLogNote("");
  };

  const typeColors: Record<CommunicationEntry["type"], string> = {
    Call: "bg-blue-100 text-blue-800",
    Email: "bg-violet-100 text-violet-800",
    Text: "bg-emerald-100 text-emerald-800",
    Meeting: "bg-amber-100 text-amber-800",
    "In Person": "bg-rose-100 text-rose-800",
    Other: "bg-slate-100 text-slate-700",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="h-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2.5rem] border border-slate-300 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-8 px-5 py-6 sm:px-10 sm:py-10">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-600">Lead details</p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{current.company}</h2>
              <p className="text-sm text-slate-600">{current.contact} · {current.email} · {current.phone}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-300 hover:bg-gray-100 md:h-10 md:w-10"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Snapshot + Company Profile */}
          <div className="border-t border-slate-300/60 pt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-[1.75rem] border border-slate-300/70 bg-gray-100/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 mb-4">Snapshot — click any field to edit</p>
              <div className="space-y-3">
                <InlineField label="Estimated value" value={formatLeadValue(current.value)} onSave={(v) => patch({ value: parseLeadValue(v) })} />
                <InlineField label="Status" value={current.status} onSave={(v) => patch({ status: v as Lead["status"] })} type="select" options={["Open", "Pending", "At Risk", "Won"]} />
                <InlineField label="Stage" value={current.stage} onSave={(v) => patch({ stage: v as PipelineStage })} type="select" options={[...pipelineStages]} />
                <InlineField label="Follow-up" value={current.followUpDate} onSave={(v) => patch({ followUpDate: v })} type="date" />
                <InlineField label="Owner" value={current.owner} onSave={(v) => patch({ owner: v })} type="select" options={OWNERS} />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-300/70 bg-gray-100/50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 mb-4">Company profile</p>
              <div className="space-y-3">
                <InlineField label="Industry" value={current.companyProfile.industry} onSave={(v) => patchProfile({ industry: v })} />
                <InlineField label="Address" value={current.companyProfile.address} onSave={(v) => patchProfile({ address: v })} type="address" />
                <InlineField label="Website" value={current.companyProfile.website} onSave={(v) => patchProfile({ website: v })} />
              </div>
            </div>
          </div>

          {/* Activity Log + Notes */}
          <div className="border-t border-slate-300/60 pt-6 grid gap-6 sm:grid-cols-2">

            {/* Activity Log */}
            <div className="rounded-[1.75rem] border border-slate-300/70 bg-gray-100/50 p-5">
              <h3 className="font-semibold text-slate-950 mb-4">Activity log</h3>

              {/* Add entry form */}
              <div className="rounded-2xl bg-white border border-slate-300/50 p-4 mb-4 space-y-3">
                <div className="flex gap-2">
                  <select
                    className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-gray-100 px-3 py-2 text-sm font-semibold text-slate-700 outline-none sm:text-xs"
                    value={logType}
                    onChange={(e) => setLogType(e.target.value as CommunicationEntry["type"])}
                  >
                    {CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <select
                    className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-gray-100 px-3 py-2 text-sm font-semibold text-slate-700 outline-none sm:text-xs"
                    value={logOwner}
                    onChange={(e) => setLogOwner(e.target.value)}
                  >
                    {OWNERS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <textarea
                  rows={2}
                  className="w-full resize-none rounded-xl border border-slate-300 bg-gray-100 px-3 py-2 text-base text-slate-700 outline-none focus:border-slate-400 md:text-sm"
                  placeholder="What happened? Add notes..."
                  value={logNote}
                  onChange={(e) => setLogNote(e.target.value)}
                />
                <button
                  type="button"
                  onClick={addActivityEntry}
                  disabled={!logNote.trim()}
                  className="min-h-11 w-full rounded-xl bg-slate-950 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  Log activity · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </button>
              </div>

              {/* History */}
              <div className="space-y-3">
                {current.communicationHistory.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-4">No activity logged yet.</p>
                )}
                {current.communicationHistory.map((entry) => (
                  <div key={entry.id} className="rounded-2xl bg-white border border-slate-300/50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeColors[entry.type]}`}>
                        {entry.type}
                      </span>
                      <span className="text-xs text-slate-600">{entry.date} · {entry.owner}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{entry.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-[1.75rem] border border-slate-300/70 bg-gray-100/50 p-5">
              <label className="block font-semibold text-slate-950 mb-4">Notes</label>
              <textarea
                rows={8}
                className="w-full resize-none rounded-2xl border border-slate-300/50 bg-white p-4 text-base text-slate-700 outline-none focus:border-slate-400 md:text-sm"
                value={current.notes}
                placeholder="Add notes about this lead..."
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-300/60 pt-6">
            <button
              type="button"
              onClick={handleDelete}
              className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 md:min-h-0"
            >
              Delete
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveChanges}
                className="min-h-11 rounded-2xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 md:min-h-0"
              >
                {saveLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-gray-100 md:min-h-0"
              >
                Close
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
