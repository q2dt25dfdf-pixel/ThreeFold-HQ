"use client";

import { useState } from "react";
import ModalShell from "@/components/ModalShell";
import { FieldError } from "@/components/AppState";
import { businessTodayISO } from "@/lib/businessDate";
import type { CommunicationEntry, Lead } from "./types";

const CONTACT_TYPES: CommunicationEntry["type"][] = [
  "Call", "Email", "Text", "Meeting", "In Person", "Other",
];
const OWNERS = ["Alliyah", "Hannah", "Jordan"];

type Props = {
  lead: Lead;
  onSubmit: (entry: CommunicationEntry) => Promise<void>;
  onClose: () => void;
};

export default function CompleteFollowUpModal({ lead, onSubmit, onClose }: Props) {
  const [logType, setLogType] = useState<CommunicationEntry["type"]>("Call");
  const [logOwner, setLogOwner] = useState(lead.owner && OWNERS.includes(lead.owner) ? lead.owner : "Alliyah");
  const [logDate, setLogDate] = useState(() => businessTodayISO());
  const [logNote, setLogNote] = useState("");
  const [logError, setLogError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!logNote.trim()) {
      setLogError("Please add a summary of what happened.");
      return;
    }
    setSaving(true);
    const entry: CommunicationEntry = {
      id: `comm-complete-${Date.now()}`,
      type: logType,
      date: logDate,
      owner: logOwner,
      summary: logNote.trim(),
    };
    await onSubmit(entry);
    setSaving(false);
  };

  const footer = (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="min-h-11 flex-1 rounded-3xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 md:text-sm"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={saving || !logNote.trim()}
        className="min-h-11 flex-1 rounded-3xl bg-emerald-600 py-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 md:text-sm"
      >
        {saving ? "Saving…" : "Complete Follow-Up"}
      </button>
    </div>
  );

  return (
    <ModalShell
      title="Log activity & complete follow-up"
      subtitle={`${lead.contact} — ${lead.company}`}
      maxWidth="max-w-md"
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        <p className="text-xs text-slate-500 md:text-sm">
          How was this follow-up completed? The activity will be saved to the lead before marking it done.
        </p>

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
          rows={4}
          className="w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs text-slate-900 outline-none focus:border-slate-400 md:text-sm"
          placeholder="What happened? Summarize the interaction..."
          value={logNote}
          onChange={(e) => {
            setLogNote(e.target.value);
            if (logError) setLogError("");
          }}
        />
        <FieldError message={logError} />
      </div>
    </ModalShell>
  );
}
