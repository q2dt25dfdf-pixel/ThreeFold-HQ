"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { FieldError } from "@/components/AppState";
import InlineEditTitle from "@/components/InlineEditTitle";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { businessTodayISO } from "@/lib/businessDate";
import type { Lead, PipelineStage, CommunicationEntry, DuplicateMatch } from "./types";
import { pipelineStages, LOST_REASONS } from "./types";

interface Props {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
  onSave: (lead: Lead) => void | Promise<void>;
  onDelete: (lead: Lead) => void;
  matchingClientId?: string | null;
  duplicateMatch?: DuplicateMatch | null;
  onViewClient?: () => void;
  onQuestionnaire?: () => void;
  onSendDesign?: (lead: Lead) => void;
  onSendQuote?: (lead: Lead) => void;
  onSendDepositRequest?: (lead: Lead) => void;
  onCompleteFollowUp?: (lead: Lead) => void;
  canCompleteFollowUp?: boolean;
}

const OWNERS = ["Alliyah", "Hannah", "Jordan"];
const INDUSTRY_OPTIONS = [
  "Amazon DSP",
  "Dental",
  "Gym / Fitness",
  "Contractor",
  "Restaurant",
  "Retail",
  "Corporate",
  "Sports Team",
  "Other",
];
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
  directEdit,
}: {
  label: string;
  value?: string;
  onSave: (v: string) => void;
  type?: "text" | "select" | "date" | "address";
  options?: string[];
  directEdit?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const draftRef = useRef(value ?? "");

  const updateDraft = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = () => {
    onSave(draftRef.current);
    setEditing(false);
  };

  if (directEdit && type === "select" && options) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-300/50 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <select
          className="w-full border-0 bg-transparent text-left text-base font-semibold text-slate-950 outline-none sm:w-auto sm:text-right md:text-sm"
          value={value ?? ""}
          onChange={(e) => onSave(e.target.value)}
        >
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-300/50 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-slate-600">{label}</span>
      {editing ? (
        type === "select" && options ? (
          <select
            autoFocus
            className="w-full border-0 bg-transparent text-left text-base font-semibold text-slate-950 outline-none sm:text-right md:text-sm"
            value={draft}
            onChange={(e) => updateDraft(e.target.value)}
            onBlur={commit}
          >
            {options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : type === "address" ? (
          <AddressAutocomplete
            autoFocus
            className="w-full border-0 bg-transparent text-left text-base font-semibold text-slate-950 outline-none md:text-sm"
            value={draft}
            onChange={updateDraft}
            onSelect={(selected) => {
              draftRef.current = selected;
              onSave(selected);
              setEditing(false);
            }}
            onBlur={commit}
          />
        ) : (
          <input
            autoFocus
            type={type}
            className="w-full border-0 bg-transparent text-left text-base font-semibold text-slate-950 outline-none sm:w-40 sm:text-right md:text-sm"
            value={draft}
            onChange={(e) => updateDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === "Enter" && commit()}
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => { updateDraft(value ?? ""); setEditing(true); }}
          className="group flex min-h-11 items-center gap-1.5 text-left text-sm font-semibold text-slate-950 hover:text-slate-600 sm:text-right"
        >
          {value || <span className="font-normal text-slate-400 text-xs">Add…</span>}
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" aria-hidden="true">
            <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

export default function LeadDetailModal({ open, lead, onClose, onSave, onDelete, matchingClientId, duplicateMatch, onViewClient, onQuestionnaire, onSendDesign, onSendQuote, onSendDepositRequest, onCompleteFollowUp, canCompleteFollowUp = false }: Props) {
  const [data, setData] = useState<Lead | null>(null);
  const { saveState, resetSaveState, runSave } = useSaveState();

  // Activity log form state
  const [logType, setLogType] = useState<CommunicationEntry["type"]>("Call");
  const [logOwner, setLogOwner] = useState("Alliyah");
  const [logDate, setLogDate] = useState(() => businessTodayISO());
  const [logNote, setLogNote] = useState("");
  const [logError, setLogError] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Closed-Lost reason picker
  const [lostPickerOpen, setLostPickerOpen] = useState(false);
  const [pendingLostReason, setPendingLostReason] = useState<string>(LOST_REASONS[0]);

  useEffect(() => {
    setData(null);
    setLogDate(businessTodayISO());
    setEditingIndex(null);
    setLostPickerOpen(false);
    if (open) resetSaveState();
  }, [lead?.id, open, resetSaveState]);

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
    await runSave(() => onSave(current), onClose);
  };

  const addActivityEntry = () => {
    if (!logNote.trim()) {
      setLogError("Activity notes are required.");
      return;
    }
    setLogError("");
    if (editingIndex !== null) {
      const updated = current.communicationHistory.map((e, i) =>
        i === editingIndex
          ? { ...e, type: logType, date: logDate, owner: logOwner, summary: logNote.trim() }
          : e
      );
      patch({ communicationHistory: updated });
      setEditingIndex(null);
      setLogType("Call");
      setLogOwner("Alliyah");
    } else {
      const entry: CommunicationEntry = {
        id: `comm-${Date.now()}`,
        type: logType,
        date: logDate,
        owner: logOwner,
        summary: logNote.trim(),
      };
      patch({ communicationHistory: [entry, ...current.communicationHistory] });
    }
    setLogNote("");
    setLogDate(businessTodayISO());
  };

  const startEdit = (index: number) => {
    const entry = current.communicationHistory[index];
    setEditingIndex(index);
    setLogType(entry.type);
    setLogOwner(entry.owner);
    setLogDate(entry.date);
    setLogNote(entry.summary);
    setLogError("");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setLogNote("");
    setLogDate(businessTodayISO());
    setLogType("Call");
    setLogOwner("Alliyah");
    setLogError("");
  };

  const deleteEntry = (index: number) => {
    if (!window.confirm("Delete this activity entry?")) return;
    const updated = current.communicationHistory.filter((_, i) => i !== index);
    patch({ communicationHistory: updated });
    if (editingIndex === index) cancelEdit();
  };

  const typeColors: Record<CommunicationEntry["type"], string> = {
    Call: "bg-blue-100 text-blue-800",
    Email: "bg-violet-100 text-violet-800",
    Text: "bg-emerald-100 text-emerald-800",
    Meeting: "bg-amber-100 text-amber-800",
    "In Person": "bg-rose-100 text-rose-800",
    Other: "bg-slate-100 text-slate-700",
  };

  const hasClient = Boolean(matchingClientId);
  const clientBtnClass = hasClient
    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400";
  const clientBtnLabel = hasClient ? "View Client Record" : "Client record pending";

  const showSendDesign = current.stage === "Design Phase" && onSendDesign;
  const showSendQuote = current.stage === "Design Approved" && onSendQuote;
  const showSendRevisedQuote = current.stage === "Quote Sent" && onSendQuote;
  const showSendDeposit = current.stage === "Quote Approved" && onSendDepositRequest;
  const showCompleteFollowUp = canCompleteFollowUp && onCompleteFollowUp;

  const footer = (
    <div className="flex flex-col gap-3">
      {/* Mobile: workflow action buttons */}
      {showSendDesign && (
        <button
          type="button"
          onClick={() => onSendDesign(current)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-violet-300 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-800 hover:bg-violet-100 transition lg:hidden"
        >
          Send Design
        </button>
      )}
      {showSendQuote && (
        <button
          type="button"
          onClick={() => onSendQuote(current)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition lg:hidden"
        >
          Send Quote
        </button>
      )}
      {showSendRevisedQuote && (
        <button
          type="button"
          onClick={() => onSendQuote(current)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-900 bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition lg:hidden"
        >
          Send Revised Quote
        </button>
      )}
      {showSendDeposit && (
        <button
          type="button"
          onClick={() => onSendDepositRequest(current)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-amber-600 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition lg:hidden"
        >
          Send Deposit Request
        </button>
      )}
      {showCompleteFollowUp && (
        <button
          type="button"
          onClick={() => onCompleteFollowUp(current)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition lg:hidden"
        >
          Complete Follow-Up
        </button>
      )}

      {/* Mobile: full-width client button */}
      <button
        type="button"
        disabled={!hasClient}
        onClick={hasClient ? onViewClient : undefined}
        className={`flex min-h-11 w-full items-center justify-center rounded-2xl border px-5 py-3 text-sm font-semibold transition lg:hidden ${clientBtnClass}`}
      >
        {clientBtnLabel}
      </button>
      {current.source === "Website" && onQuestionnaire && (
        <button
          type="button"
          onClick={onQuestionnaire}
          className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition lg:hidden"
        >
          Questionnaire
        </button>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleDelete}
          className="min-h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          Delete
        </button>
        <div className="flex items-center gap-3">
          {/* Desktop: workflow action buttons */}
          {showSendDesign && (
            <button
              type="button"
              onClick={() => onSendDesign(current)}
              className="hidden min-h-11 items-center rounded-3xl border border-violet-300 bg-violet-50 px-5 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 transition lg:inline-flex"
            >
              Send Design
            </button>
          )}
          {showSendQuote && (
            <button
              type="button"
              onClick={() => onSendQuote(current)}
              className="hidden min-h-11 items-center rounded-3xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition lg:inline-flex"
            >
              Send Quote
            </button>
          )}
          {showSendRevisedQuote && (
            <button
              type="button"
              onClick={() => onSendQuote(current)}
              className="hidden min-h-11 items-center rounded-3xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition lg:inline-flex"
            >
              Send Revised Quote
            </button>
          )}
          {showSendDeposit && (
            <button
              type="button"
              onClick={() => onSendDepositRequest(current)}
              className="hidden min-h-11 items-center rounded-3xl border border-amber-600 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 transition lg:inline-flex"
            >
              Send Deposit Request
            </button>
          )}
          {showCompleteFollowUp && (
            <button
              type="button"
              onClick={() => onCompleteFollowUp(current)}
              className="hidden min-h-11 items-center rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition lg:inline-flex"
            >
              Complete Follow-Up
            </button>
          )}
          {/* Desktop: inline client button */}
          <button
            type="button"
            disabled={!hasClient}
            onClick={hasClient ? onViewClient : undefined}
            className={`hidden min-h-11 items-center rounded-2xl border px-4 py-2 text-sm font-semibold transition lg:inline-flex ${clientBtnClass}`}
          >
            {clientBtnLabel}
          </button>
          {current.source === "Website" && onQuestionnaire && (
            <button
              type="button"
              onClick={onQuestionnaire}
              className="hidden min-h-11 items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition lg:inline-flex"
            >
              Questionnaire
            </button>
          )}
          <SaveButton state={saveState} onClick={handleSaveChanges} className="rounded-2xl py-2 text-sm" />
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <ModalShell
      title={
        <InlineEditTitle
          value={current.company}
          onSave={v => patch({ company: v })}
          as="span"
        />
      }
      subtitle={[current.contact, current.email, current.phone].filter(Boolean).join(" · ")}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={footer}
    >
      <div className="flex flex-col gap-6">

        {duplicateMatch && (
          <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs ${
            duplicateMatch.matchType === "likely_existing"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-yellow-200 bg-yellow-50 text-yellow-900"
          }`}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {duplicateMatch.matchType === "likely_existing" ? "Likely existing client" : "Possible duplicate"}
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                {duplicateMatch.clientName} is already in your client list. Review before approving.
              </p>
            </div>
          </div>
        )}

        {/* Main layout — stacked on mobile, 2-column on desktop */}
        <div className="grid gap-6 md:grid-cols-[2fr_3fr] md:items-start">

          {/* Left column — structured fields */}
          <div className="flex flex-col gap-5">

            {/* Snapshot */}
            <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 md:p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Snapshot — click any field to edit</p>
              <div className="space-y-3">
                <InlineField label="Estimated value" value={formatLeadValue(current.value)} onSave={(v) => patch({ value: parseLeadValue(v) })} />
                <InlineField
                  label="Stage"
                  value={current.stage}
                  onSave={(v) => {
                    const next = v as PipelineStage;
                    if (next === current.stage) return;
                    if (next === "Closed Lost") {
                      setPendingLostReason(current.lostReason || LOST_REASONS[0]);
                      setLostPickerOpen(true);
                      return;
                    }
                    if (current.stage === "Closed Lost") {
                      patch({ stage: next, lostReason: undefined });
                      return;
                    }
                    patch({ stage: next });
                  }}
                  type="select"
                  options={[...pipelineStages]}
                  directEdit
                />
                <InlineField label="Follow-up" value={current.followUpDate} onSave={(v) => patch({ followUpDate: v })} type="date" />
                <InlineField label="Owner" value={current.owner} onSave={(v) => patch({ owner: v })} />
                {current.stage === "Closed Lost" && (
                  <InlineField
                    label="Lost reason"
                    value={current.lostReason ?? ""}
                    onSave={(v) => patch({ lostReason: v })}
                    type="select"
                    options={[...LOST_REASONS]}
                    directEdit
                  />
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 md:p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Contact info — click to edit</p>
              <div className="space-y-3">
                <InlineField label="Contact name" value={current.contact} onSave={(v) => patch({ contact: v })} />
                <InlineField label="Email" value={current.email} onSave={(v) => patch({ email: v })} type="text" />
                <InlineField label="Phone" value={current.phone} onSave={(v) => patch({ phone: v })} />
              </div>
            </div>

            {/* Company Profile */}
            <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 md:p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Company profile</p>
              <div className="space-y-3">
                <InlineField label="Industry" value={current.companyProfile.industry} onSave={(v) => patchProfile({ industry: v })} type="select" options={INDUSTRY_OPTIONS} />
                <InlineField label="Address" value={current.companyProfile.address} onSave={(v) => patchProfile({ address: v })} type="address" />
                <InlineField label="Website" value={current.companyProfile.website} onSave={(v) => patchProfile({ website: v })} />
              </div>
            </div>

          </div>

          {/* Right column — activity log + notes */}
          <div className="flex flex-col gap-5">

            {/* Activity Log */}
            <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 md:p-5">
              <h3 className="mb-4 font-semibold text-slate-950">Activity log</h3>

              {/* Add entry form */}
              <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex gap-2">
                  <select
                    className="min-h-11 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none md:text-sm"
                    value={logType}
                    onChange={(e) => setLogType(e.target.value as CommunicationEntry["type"])}
                  >
                    {CONTACT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <select
                    className="min-h-11 flex-1 rounded-2xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none md:text-sm"
                    value={logOwner}
                    onChange={(e) => setLogOwner(e.target.value)}
                  >
                    {OWNERS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs text-slate-700 outline-none focus:border-slate-400 md:text-sm"
                  value={logDate}
                  max={businessTodayISO()}
                  onChange={(e) => setLogDate(e.target.value)}
                />
                <textarea
                  rows={2}
                  className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                  placeholder="What happened? Add notes..."
                  value={logNote}
                  onChange={(e) => {
                    setLogNote(e.target.value);
                    if (logError) setLogError("");
                  }}
                />
                <FieldError message={logError} />
                {editingIndex !== null && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="min-h-11 w-full rounded-3xl border border-slate-300 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={addActivityEntry}
                  disabled={!logNote.trim()}
                  className="min-h-11 w-full rounded-3xl bg-slate-900 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 md:text-sm"
                >
                  {editingIndex !== null
                    ? `Update activity · ${new Date(logDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : `Log activity · ${new Date(logDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </button>
              </div>

              {/* History — contained scroll so the modal stays manageable */}
              <div className="max-h-60 space-y-3 overflow-y-auto pr-0.5">
                {current.communicationHistory.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No activity logged yet.</p>
                )}
                {current.communicationHistory.map((entry, i) => (
                  <div
                    key={entry.id || i}
                    className={`rounded-2xl border bg-white p-4 ${editingIndex === i ? "border-slate-400 ring-1 ring-slate-300" : "border-slate-200"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${typeColors[entry.type]}`}>
                        {entry.type}
                      </span>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-slate-600">{entry.date} · {entry.owner}</span>
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          className="text-[11px] text-slate-400 underline hover:text-slate-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEntry(i)}
                          className="text-[11px] text-rose-400 underline hover:text-rose-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 break-words text-sm text-slate-700">{entry.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="min-w-0 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 md:p-5">
              <label className="mb-4 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Notes</label>
              <textarea
                rows={8}
                className="w-full resize-none rounded-2xl border border-slate-300 bg-white p-4 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                value={current.notes}
                placeholder="Add notes about this lead..."
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>

          </div>

        </div>

      </div>

      {lostPickerOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-950">Move to Closed Lost</h3>
            <p className="mt-1 text-xs text-slate-600">Pick a reason so we can track why this lead closed.</p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Reason
            </label>
            <select
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500"
              value={pendingLostReason}
              onChange={(e) => setPendingLostReason(e.target.value)}
            >
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setLostPickerOpen(false)}
                className="min-h-11 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  patch({ stage: "Closed Lost", lostReason: pendingLostReason });
                  setLostPickerOpen(false);
                }}
                className="min-h-11 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Mark as Closed Lost
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
