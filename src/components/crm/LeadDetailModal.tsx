"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
  onArchive?: (lead: Lead) => void;
  onUnarchive?: (lead: Lead) => void;
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

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Time-in-current-stage from stage_changed_at (feat/timestamps). Never guesses —
// returns "Unknown" when the timestamp is null (legacy records).
function timeInStage(iso?: string | null): string {
  if (!iso) return "Unknown";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Unknown";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  return days === 1 ? "1 day" : `${days} days`;
}

// ── Compact inline editor for the header strip (text / date) ────────────────
function StripEdit({
  display, rawValue, type = "text", placeholder, onSave,
}: {
  display?: string; rawValue?: string; type?: "text" | "date"; placeholder: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rawValue ?? "");
  const ref = useRef(rawValue ?? "");
  const set = (v: string) => { ref.current = v; setDraft(v); };
  const commit = () => { onSave(ref.current); setEditing(false); };

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => set(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="w-full border-0 bg-transparent p-0 text-sm font-semibold text-slate-950 outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => { set(rawValue ?? ""); setEditing(true); }}
      className="w-full text-left text-sm font-semibold text-slate-950 hover:text-slate-500"
    >
      {display || <span className="font-normal text-slate-400">{placeholder}</span>}
    </button>
  );
}

// ── Dense inline-edit row for contact / company (label left, value right) ───
function Row({
  label, value, onSave, type = "text", options,
}: {
  label: string; value?: string; onSave: (v: string) => void;
  type?: "text" | "select" | "date" | "address"; options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef(value ?? "");
  const set = (v: string) => { ref.current = v; setDraft(v); };
  const commit = () => { onSave(ref.current); setEditing(false); };

  const editor = type === "select" && options ? (
    <select
      autoFocus
      className="w-full border-0 bg-transparent text-right text-sm font-semibold text-slate-950 outline-none"
      value={draft}
      onChange={(e) => set(e.target.value)}
      onBlur={commit}
    >
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  ) : type === "address" ? (
    <AddressAutocomplete
      autoFocus
      className="w-full border-0 bg-transparent text-right text-sm font-semibold text-slate-950 outline-none"
      value={draft}
      onChange={set}
      onSelect={(selected) => { ref.current = selected; onSave(selected); setEditing(false); }}
      onBlur={commit}
    />
  ) : (
    <input
      autoFocus
      type={type}
      className="w-full border-0 bg-transparent text-right text-sm font-semibold text-slate-950 outline-none"
      value={draft}
      onChange={(e) => set(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );

  return (
    <div className="group flex items-center justify-between gap-3 border-b border-slate-100 px-2 py-2.5 transition-colors hover:bg-slate-50 last:border-b-0">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      {editing ? (
        <div className="min-w-0 flex-1 pl-4">{editor}</div>
      ) : (
        <button
          type="button"
          onClick={() => { set(value ?? ""); setEditing(true); }}
          className="flex min-h-6 min-w-0 items-center gap-1.5 text-right text-sm font-semibold text-slate-950"
        >
          <span className="truncate">
            {value || <span className="font-normal text-slate-400">Add…</span>}
          </span>
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">
            <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// One cell of the header strip.
function StripCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-r border-slate-200 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function LeadDetailModal({ open, lead, onClose, onSave, onDelete, matchingClientId, duplicateMatch, onViewClient, onQuestionnaire, onSendDesign, onSendQuote, onSendDepositRequest, onCompleteFollowUp, canCompleteFollowUp = false, onArchive, onUnarchive }: Props) {
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

  const changeStage = (next: PipelineStage) => {
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
  const hasEmail = Boolean(current.email && current.email.trim());
  const inStage = timeInStage(current.stage_changed_at);

  // Next-step panel derives from stage. Only three stages have a real "what to send
  // next" — the waiting-on-client stages (Quote Sent, Client Review) deliberately
  // show no panel; their re-send actions live in the footer as exception paths.
  const phrase = inStage === "Today" ? "today" : `${inStage} ago`;
  const showReason = Boolean(current.stage_changed_at);
  let nextStep: { title: string; button: string; onClick: () => void; reason: string | null } | null = null;
  if (current.stage === "Design Phase" && onSendDesign) {
    nextStep = { title: "Send the initial design concepts to the client.", button: "Send Design", onClick: () => onSendDesign(current), reason: showReason ? `Reached the design phase ${phrase}. No concepts sent yet.` : null };
  } else if (current.stage === "Design Approved" && onSendQuote) {
    nextStep = { title: "Send the quote.", button: "Send Quote", onClick: () => onSendQuote(current), reason: showReason ? `Design approved ${phrase}. No quote sent yet.` : null };
  } else if (current.stage === "Quote Approved" && onSendDepositRequest) {
    nextStep = { title: "Send the deposit request.", button: "Send Deposit Request", onClick: () => onSendDepositRequest(current), reason: showReason ? `Quote approved ${phrase}. Nothing has gone out since.` : null };
  }

  // Exception / secondary actions kept in the footer exactly as today.
  const showSendRevisedQuote = current.stage === "Quote Sent" && onSendQuote;
  const showCompleteFollowUp = canCompleteFollowUp && onCompleteFollowUp;
  const showQuestionnaire = current.source === "Website" && onQuestionnaire;

  const emailPart = hasEmail ? current.email : "no email on file";
  const subtitle = [current.contact, current.phone, emailPart].filter(Boolean).join(" · ");

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleDelete}
          className="min-h-11 text-sm font-semibold text-rose-600 hover:text-rose-700 hover:underline"
        >
          Delete
        </button>
        {current.archived ? (
          onUnarchive && (
            <button
              type="button"
              onClick={() => { onUnarchive(current); onClose(); }}
              className="min-h-11 text-sm font-semibold text-emerald-700 hover:underline"
            >
              Unarchive
            </button>
          )
        ) : (
          onArchive && (
            <button
              type="button"
              onClick={() => { onArchive(current); onClose(); }}
              className="min-h-11 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:underline"
            >
              Archive
            </button>
          )
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {showSendRevisedQuote && (
          <button
            type="button"
            onClick={() => onSendQuote(current)}
            className="min-h-11 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Send Revised Quote
          </button>
        )}
        {showCompleteFollowUp && (
          <button
            type="button"
            onClick={() => onCompleteFollowUp(current)}
            className="min-h-11 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            Complete Follow-Up
          </button>
        )}
        {showQuestionnaire && (
          <button
            type="button"
            onClick={onQuestionnaire}
            className="min-h-11 rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Questionnaire
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        <SaveButton state={saveState} onClick={handleSaveChanges} className="rounded-2xl py-2 text-sm" />
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
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={footer}
    >
      <div className="flex flex-col gap-5">

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

        {/* ── Header strip — six cells, bordered & divided, wraps on mobile ── */}
        <div className="overflow-hidden rounded-2xl border-l border-t border-slate-200">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            <StripCell label="Stage">
              <select
                value={current.stage}
                onChange={(e) => changeStage(e.target.value as PipelineStage)}
                className="-ml-0.5 max-w-full rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 outline-none focus:border-slate-500"
              >
                {pipelineStages.map((o) => <option key={o}>{o}</option>)}
              </select>
            </StripCell>
            <StripCell label="Est. Value">
              <StripEdit
                display={String(formatLeadValue(current.value))}
                rawValue={String(formatLeadValue(current.value))}
                placeholder="Add value"
                onSave={(v) => patch({ value: parseLeadValue(v) })}
              />
            </StripCell>
            <StripCell label="Owner">
              <StripEdit display={current.owner} rawValue={current.owner} placeholder="Assign" onSave={(v) => patch({ owner: v })} />
            </StripCell>
            <StripCell label="Follow-Up">
              <StripEdit
                type="date"
                display={current.followUpDate ? fmtDate(current.followUpDate) : undefined}
                rawValue={current.followUpDate}
                placeholder="Set a date"
                onSave={(v) => patch({ followUpDate: v })}
              />
            </StripCell>
            <StripCell label="In Stage">
              <span className={`text-sm font-semibold ${inStage === "Unknown" ? "text-slate-400" : "text-slate-950"}`}>{inStage}</span>
            </StripCell>
            <StripCell label="Client">
              {hasClient ? (
                <button
                  type="button"
                  onClick={onViewClient}
                  className="text-left text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900"
                >
                  {current.company}
                </button>
              ) : (
                <span className="text-sm font-medium text-slate-400">Pending first order</span>
              )}
            </StripCell>
          </div>
        </div>

        {/* Main layout — stacked on mobile, 2-column on desktop */}
        <div className="grid gap-5 md:grid-cols-[2fr_3fr] md:items-start">

          {/* Left column — dense editable rows */}
          <div className="flex min-w-0 flex-col gap-5">
            <div className="min-w-0 rounded-2xl border border-slate-200 px-2 py-1">
              <Row label="Contact name" value={current.contact} onSave={(v) => patch({ contact: v })} />
              <Row label="Email" value={current.email} onSave={(v) => patch({ email: v })} />
              <Row label="Phone" value={current.phone} onSave={(v) => patch({ phone: v })} />
              <Row label="Industry" value={current.companyProfile.industry} onSave={(v) => patchProfile({ industry: v })} type="select" options={INDUSTRY_OPTIONS} />
              <Row label="Address" value={current.companyProfile.address} onSave={(v) => patchProfile({ address: v })} type="address" />
              <Row label="Website" value={current.companyProfile.website} onSave={(v) => patchProfile({ website: v })} />
              {current.stage === "Closed Lost" && (
                <Row label="Lost reason" value={current.lostReason ?? ""} onSave={(v) => patch({ lostReason: v })} type="select" options={[...LOST_REASONS]} />
              )}
            </div>
          </div>

          {/* Right column — next step, warnings, activity, notes */}
          <div className="flex min-w-0 flex-col gap-5">

            {/* Next-step panel — only when there is a real next action */}
            {nextStep && (
              <div className="rounded-2xl bg-slate-900 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Next step</p>
                <p className="mt-2 text-sm font-semibold text-white">{nextStep.title}</p>
                {nextStep.reason && (
                  <p className="mt-1 text-xs text-slate-400">{nextStep.reason}</p>
                )}
                <button
                  type="button"
                  onClick={nextStep.onClick}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  {nextStep.button}
                </button>
              </div>
            )}

            {/* Missing-email warning — only when actually missing */}
            {!hasEmail && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                No email on file. You can&apos;t send a design or quote to this lead until one is added.
              </div>
            )}

            {/* Activity Log */}
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-4 font-semibold text-slate-950">Activity log</h3>

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
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Notes</label>
              <textarea
                rows={6}
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
