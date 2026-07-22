"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ClipboardCopy, ExternalLink, Pin, Trash2 } from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { FieldError } from "@/components/AppState";
import InlineEditTitle from "@/components/InlineEditTitle";
import ModalShell from "@/components/ModalShell";
import SaveButton, { useSaveState } from "@/components/SaveButton";
import { businessTodayISO } from "@/lib/businessDate";
import { TF_PLAIN_CLOSING } from "@/lib/emailSignature";
import { buildGmailComposeUrl } from "@/lib/gmail";
import type { Lead, PipelineStage, CommunicationEntry, DuplicateMatch, NoteEntry } from "./types";
import { pipelineStages, LOST_REASONS, flattenNotes } from "./types";

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

function fmtNoteDate(iso: string) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
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

// One cell of the header strip. `className` carries the responsive flex sizing:
// stacked (Stage full-width, others two-up) below sm; proportional single row at sm+.
function StripCell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 border-b border-r border-slate-200 px-3 py-2.5 ${className ?? ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// One note. Pinned notes get an amber tint/border; unpinned are plain white.
function NoteCard({ note, onTogglePin, onDelete }: { note: NoteEntry; onTogglePin: () => void; onDelete: () => void }) {
  return (
    <div className={`rounded-2xl border p-3 ${note.pinned ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-slate-800">{note.text}</p>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={note.pinned ? "Unpin note" : "Pin note"}
            title={note.pinned ? "Unpin" : "Pin"}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${note.pinned ? "text-amber-600 hover:bg-amber-100" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
          >
            <Pin className="h-4 w-4" fill={note.pinned ? "currentColor" : "none"} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete note"
            title="Delete"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
        {note.pinned && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">PINNED</span>}
        <span className="truncate">{note.author} · {fmtNoteDate(note.created_at)}</span>
      </div>
    </div>
  );
}

export default function LeadDetailModal({ open, lead, onClose, onSave, onDelete, matchingClientId, duplicateMatch, onViewClient, onQuestionnaire, onSendDesign, onSendQuote, onSendDepositRequest, onCompleteFollowUp, canCompleteFollowUp = false, onArchive, onUnarchive }: Props) {
  const [data, setData] = useState<Lead | null>(null);
  const { saveState, resetSaveState, runSave } = useSaveState();

  // Quick Communications: copy-to-clipboard state (which button most recently copied).
  const [copiedCommKey, setCopiedCommKey] = useState<string | null>(null);

  // Activity log form state
  const [logType, setLogType] = useState<CommunicationEntry["type"]>("Call");
  const [logOwner, setLogOwner] = useState("Alliyah");
  const [logDate, setLogDate] = useState(() => businessTodayISO());
  const [logNote, setLogNote] = useState("");
  const [logError, setLogError] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const composerNoteRef = useRef<HTMLTextAreaElement | null>(null);

  // Notes composer state (separate from the activity composer)
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDraftPinned, setNoteDraftPinned] = useState(false);
  const noteDraftRef = useRef<HTMLTextAreaElement | null>(null);
  // Stable migration timestamp per lead open (so the imported note's date/key don't
  // churn across renders before the first save).
  const migratedAtRef = useRef<{ id: string; iso: string } | null>(null);

  // Closed-Lost reason picker
  const [lostPickerOpen, setLostPickerOpen] = useState(false);
  const [pendingLostReason, setPendingLostReason] = useState<string>(LOST_REASONS[0]);

  useEffect(() => {
    setData(null);
    setLogDate(businessTodayISO());
    setEditingIndex(null);
    setComposerOpen(false);
    setShowAllActivity(false);
    setNoteComposerOpen(false);
    setNoteDraft("");
    setNoteDraftPinned(false);
    setLostPickerOpen(false);
    if (open) resetSaveState();
  }, [lead?.id, open, resetSaveState]);

  // Focus the activity note field whenever that composer opens (new entry or edit).
  useEffect(() => {
    if (composerOpen) composerNoteRef.current?.focus();
  }, [composerOpen]);

  // Focus the note field when the notes composer opens.
  useEffect(() => {
    if (noteComposerOpen) noteDraftRef.current?.focus();
  }, [noteComposerOpen]);

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

  // ── Notes: notes_list is the source of truth; `notes` is a flat mirror; ──────
  // notes_original is a write-once undo. Migration is on first render (rendered
  // here) but only PERSISTED on the next save via commitNotes.
  if (!migratedAtRef.current || migratedAtRef.current.id !== lead.id) {
    migratedAtRef.current = { id: lead.id, iso: new Date().toISOString() };
  }
  const migrationTime = migratedAtRef.current.iso;

  const notesList: NoteEntry[] = Array.isArray(current.notes_list)
    ? current.notes_list
    : current.notes && current.notes.trim()
      ? [{ id: "note-import", text: current.notes, pinned: true, author: "Imported", created_at: migrationTime }]
      : [];

  // Every notes change writes notes_list, regenerates the `notes` mirror, and (once,
  // at migration) captures notes_original verbatim.
  const commitNotes = (nextList: NoteEntry[]) => {
    const migrating = !Array.isArray(current.notes_list);
    patch({
      notes_list: nextList,
      notes: flattenNotes(nextList),
      ...(migrating && current.notes_original === undefined && (current.notes ?? "").trim()
        ? { notes_original: current.notes }
        : {}),
    });
  };

  const addNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    const entry: NoteEntry = {
      id: `note-${Date.now()}`,
      text,
      pinned: noteDraftPinned,
      author: current.owner || "Alliyah",
      created_at: new Date().toISOString(),
    };
    commitNotes([entry, ...notesList]);
    setNoteDraft("");
    setNoteDraftPinned(false);
    setNoteComposerOpen(false);
  };

  const toggleNotePin = (id: string) => {
    commitNotes(notesList.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)));
  };

  const removeNote = (id: string) => {
    const note = notesList.find((n) => n.id === id);
    if (!note) return;
    // Unpinned = disposable, delete immediately. Pinned = confirm (they meant it).
    if (note.pinned && !window.confirm("Delete this pinned note?")) return;
    commitNotes(notesList.filter((n) => n.id !== id));
  };

  const byNewest = (a: NoteEntry, b: NoteEntry) => (b.created_at || "").localeCompare(a.created_at || "");
  const pinnedNotes = notesList.filter((n) => n.pinned).sort(byNewest);
  const unpinnedNotes = notesList.filter((n) => !n.pinned).sort(byNewest);

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
    setComposerOpen(false);
  };

  const startEdit = (index: number) => {
    const entry = current.communicationHistory[index];
    setEditingIndex(index);
    setLogType(entry.type);
    setLogOwner(entry.owner);
    setLogDate(entry.date);
    setLogNote(entry.summary);
    setLogError("");
    setComposerOpen(true);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setLogNote("");
    setLogDate(businessTodayISO());
    setLogType("Call");
    setLogOwner("Alliyah");
    setLogError("");
    setComposerOpen(false);
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

  // ── Quick Communications ─────────────────────────────────────────────────────
  // Pre-order copy-to-clipboard messages, one per pipeline stage (they happen before an
  // order exists, so they read from the LEAD, not an order). {client} greets the contact
  // (falls back to the company); {name} references the company/project.
  const commClientRaw = (current.contact || current.company || "").trim();
  const commNameRaw = (current.company || "").trim();
  const commHasBase = Boolean(commClientRaw && commNameRaw);
  const commClient = commClientRaw || "[client]";
  const commName = commNameRaw || "[project]";
  const commNoEmail = !hasEmail;
  // emailBody keeps the full signature (Gmail); textBody strips it and ends "- Threefold" (Copy).
  const commEmailBody = (content: string) => `Hi ${commClient},\n\n${content}\n\n${TF_PLAIN_CLOSING}`;
  const commTextBody = (content: string) => `Hi ${commClient},\n\n${content}\n\n- Threefold`;
  const designContent = `Your design for ${commName} is ready for review! Please take a look and let us know if you'd like any changes, or reply with your approval and we'll move into production.`;
  const quoteContent = `Just following up on the quote we sent for ${commName}. Please let us know if you have any questions or are ready to move forward - we'd love to get this started for you!`;
  const depositContent = `A quick reminder that the deposit for your ${commName} order is due to lock in your production slot. Once received, we'll get started right away!`;
  const commButtons: { key: string; label: string; subject: string; emailBody: string; textBody: string }[] =
    current.stage === "Client Review"
      ? [{
          key: "design-approval",
          label: "Design Approval Request",
          subject: `Your ${commName} design is ready for review`,
          emailBody: commEmailBody(designContent),
          textBody: commTextBody(designContent),
        }]
      : current.stage === "Quote Sent"
      ? [{
          key: "quote-followup",
          label: "Quote Follow-Up",
          subject: `Following up on your ${commName} quote`,
          emailBody: commEmailBody(quoteContent),
          textBody: commTextBody(quoteContent),
        }]
      : current.stage === "Quote Approved"
      ? [{
          key: "deposit-reminder",
          label: "Deposit Reminder",
          subject: `Deposit reminder for your ${commName} order`,
          emailBody: commEmailBody(depositContent),
          textBody: commTextBody(depositContent),
        }]
      : [];

  const handleCommCopy = async (key: string, textBody: string) => {
    if (!commHasBase) return;
    try {
      await navigator.clipboard.writeText(textBody);
      setCopiedCommKey(key);
      window.setTimeout(() => setCopiedCommKey(null), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const handleCommGmail = (subject: string, emailBody: string) => {
    if (!commHasBase || commNoEmail) return;
    window.open(buildGmailComposeUrl({ to: (current.email ?? "").trim(), subject, body: emailBody }), "_blank");
  };

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
        <span className="inline-flex items-center gap-2">
          <InlineEditTitle
            value={current.company}
            onSave={v => patch({ company: v })}
            as="span"
          />
          {current.is_test && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
              Test
            </span>
          )}
        </span>
      }
      subtitle={subtitle}
      onClose={onClose}
      maxWidth="max-w-5xl"
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

        {/* ── Header strip — cells sized to content. Below sm: Stage takes its own
             full-width row, the rest wrap two-up. sm+: one proportional row. ── */}
        <div className="overflow-hidden rounded-2xl border-l border-t border-slate-200">
          <div className="flex flex-wrap">
            <StripCell label="Stage" className="basis-full sm:basis-0 sm:grow-[1.7]">
              <select
                value={current.stage}
                onChange={(e) => changeStage(e.target.value as PipelineStage)}
                className="-ml-0.5 w-full max-w-full rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 outline-none focus:border-slate-500"
              >
                {pipelineStages.map((o) => <option key={o}>{o}</option>)}
              </select>
            </StripCell>
            <StripCell label="Est. Value" className="basis-1/2 sm:basis-0 sm:grow-[1.0]">
              <StripEdit
                display={String(formatLeadValue(current.value))}
                rawValue={String(formatLeadValue(current.value))}
                placeholder="Add value"
                onSave={(v) => patch({ value: parseLeadValue(v) })}
              />
            </StripCell>
            <StripCell label="Owner" className="basis-1/2 sm:basis-0 sm:grow-[0.9]">
              <StripEdit display={current.owner} rawValue={current.owner} placeholder="Assign" onSave={(v) => patch({ owner: v })} />
            </StripCell>
            <StripCell label="Follow-Up" className="basis-1/2 sm:basis-0 sm:grow-[1.0]">
              <StripEdit
                type="date"
                display={current.followUpDate ? fmtDate(current.followUpDate) : undefined}
                rawValue={current.followUpDate}
                placeholder="Set a date"
                onSave={(v) => patch({ followUpDate: v })}
              />
            </StripCell>
            <StripCell label="In Stage" className="basis-1/2 sm:basis-0 sm:grow-[0.8]">
              <span className={`text-sm font-semibold ${inStage === "Unknown" ? "text-slate-400" : "text-slate-950"}`}>{inStage}</span>
            </StripCell>
            <StripCell label="Client" className="basis-1/2 sm:basis-0 sm:grow-[1.1]">
              {hasClient ? (
                <button
                  type="button"
                  onClick={onViewClient}
                  className="max-w-full truncate text-left text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900"
                >
                  {current.company}
                </button>
              ) : (
                <span className="text-sm font-medium text-slate-400">Pending</span>
              )}
            </StripCell>
          </div>
        </div>

        {/* Test toggle — flips is_test (excludes from metrics, allows free delete) */}
        <div className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${
          current.is_test ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
        }`}>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Mark as test</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Excludes this lead and its order/invoice from all metrics. Lets it be deleted freely.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(current.is_test)}
            onClick={() => patch({ is_test: !current.is_test })}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              current.is_test ? "bg-amber-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                current.is_test ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Main layout — stacked on mobile, 2-column on desktop */}
        <div className="grid gap-5 md:grid-cols-[2fr_3fr] md:items-start">

          {/* Left column — Contact fields, then Notes below a divider */}
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

            {/* Notes — separate, pinnable, deletable entries */}
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Notes</h3>
                <span className="text-xs font-semibold text-slate-400">{notesList.length}</span>
              </div>

              {noteComposerOpen ? (
                <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <textarea
                    ref={noteDraftRef}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
                    placeholder="Write a note…"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setNoteDraftPinned((v) => !v)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-semibold ${
                        noteDraftPinned ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Pin className="h-3.5 w-3.5" fill={noteDraftPinned ? "currentColor" : "none"} aria-hidden="true" />
                      {noteDraftPinned ? "Pinned" : "Pin"}
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => { setNoteComposerOpen(false); setNoteDraft(""); setNoteDraftPinned(false); }}
                        className="min-h-9 rounded-2xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={addNote}
                        disabled={!noteDraft.trim()}
                        className="min-h-9 rounded-2xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        Add note
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNoteComposerOpen(true)}
                  className="mb-4 flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500">+</span>
                  Add a note
                </button>
              )}

              {notesList.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 md:text-sm">
                  Standing facts about this lead go here. Pin the ones that always matter.
                </p>
              ) : (
                <div className="space-y-3">
                  {pinnedNotes.map((note) => (
                    <NoteCard key={note.id} note={note} onTogglePin={() => toggleNotePin(note.id)} onDelete={() => removeNote(note.id)} />
                  ))}
                  {pinnedNotes.length > 0 && unpinnedNotes.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Other</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                  {unpinnedNotes.map((note) => (
                    <NoteCard key={note.id} note={note} onTogglePin={() => toggleNotePin(note.id)} onDelete={() => removeNote(note.id)} />
                  ))}
                </div>
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

            {/* Quick Communications - stage-gated copy-to-clipboard messages. Hidden entirely
                when the current stage has no message (only Client Review / Quote Sent / Quote Approved). */}
            {commButtons.length > 0 && (
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">Quick Communications</h3>
                <div className="flex flex-col divide-y divide-slate-100">
                  {commButtons.map((btn) => {
                    const copied = copiedCommKey === btn.key;
                    const gmailDisabled = !commHasBase || commNoEmail;
                    return (
                      <div key={btn.key} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className={`break-words text-xs font-medium ${!commHasBase ? "text-slate-400" : "text-slate-700"}`}>{btn.label}</p>
                          {!commHasBase && <p className="mt-0.5 text-[10px] text-slate-400">Missing client or project name</p>}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={gmailDisabled}
                            title={!commHasBase ? "Missing client or project name" : commNoEmail ? "No email on file - use Copy" : undefined}
                            onClick={() => handleCommGmail(btn.subject, btn.emailBody)}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition ${
                              gmailDisabled
                                ? "cursor-not-allowed bg-slate-100 text-slate-300"
                                : "bg-slate-900 text-white hover:bg-slate-800"
                            }`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open in Gmail
                          </button>
                          <button
                            type="button"
                            disabled={!commHasBase}
                            title={!commHasBase ? "Missing client or project name" : undefined}
                            onClick={() => void handleCommCopy(btn.key, btn.textBody)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                              !commHasBase
                                ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                                : copied
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                            {copied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Activity Log */}
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {/* Header: label left, total count right */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Activity</h3>
                <span className="text-xs font-semibold text-slate-400">{current.communicationHistory.length}</span>
              </div>

              {/* Composer — collapsed to a single row by default, expands on click */}
              {composerOpen || editingIndex !== null ? (
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
                    ref={composerNoteRef}
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="min-h-11 flex-1 rounded-3xl border border-slate-300 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 md:text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={addActivityEntry}
                      disabled={!logNote.trim()}
                      className="min-h-11 flex-1 rounded-3xl bg-slate-900 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 md:text-sm"
                    >
                      {editingIndex !== null
                        ? `Update · ${new Date(logDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                        : `Log · ${new Date(logDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="mb-4 flex min-h-11 w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500">+</span>
                  Log a call, email, or meeting
                </button>
              )}

              {/* History — recent 3 by default, expand in place (no scroll container) */}
              {current.communicationHistory.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 md:text-sm">No activity logged yet.</p>
              ) : (
                (() => {
                  const n = current.communicationHistory.length;
                  const visible = showAllActivity ? current.communicationHistory : current.communicationHistory.slice(0, 3);
                  return (
                    <>
                      <div className="space-y-3">
                        {visible.map((entry, i) => {
                          const fade = !showAllActivity && n > 3 && i === visible.length - 1;
                          return (
                            <div key={entry.id || i} className="relative">
                              <div className={`rounded-2xl border bg-white p-4 ${editingIndex === i ? "border-slate-400 ring-1 ring-slate-300" : "border-slate-200"}`}>
                                <div className="flex items-center justify-between gap-2">
                                  <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${typeColors[entry.type]}`}>
                                    {entry.type}
                                  </span>
                                  <div className="flex shrink-0 items-center gap-3">
                                    <span className="text-xs text-slate-600">{entry.date} · {entry.owner}</span>
                                    <button
                                      type="button"
                                      onClick={() => startEdit(i)}
                                      className="text-xs text-slate-400 underline hover:text-slate-700"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deleteEntry(i)}
                                      className="text-xs text-rose-400 underline hover:text-rose-600"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                                <p className="mt-2 break-words text-base text-slate-700">{entry.summary}</p>
                              </div>
                              {fade && (
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 rounded-b-2xl bg-gradient-to-t from-slate-50 to-transparent" aria-hidden="true" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {n > 3 && (
                        <button
                          type="button"
                          onClick={() => setShowAllActivity((v) => !v)}
                          className="mt-3 min-h-11 w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-900"
                        >
                          {showAllActivity ? "Show fewer ↑" : `Show all ${n} ↓`}
                        </button>
                      )}
                    </>
                  );
                })()
              )}
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
