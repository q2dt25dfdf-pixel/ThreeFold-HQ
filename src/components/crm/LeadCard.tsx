import type { Lead, PipelineStage, DuplicateMatch } from "./types";
import { AlertTriangle, CheckCircle, FlaskConical, Trash2 } from "lucide-react";

interface LeadCardProps {
  lead: Lead;
  stageIndex: number;
  totalStages: number;
  onOpen: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onMove: (lead: Lead, targetStage: PipelineStage) => void;
  onDelete: (lead: Lead) => void;
  onToggleTest?: (lead: Lead) => void;
  onCompleteFollowUp?: (lead: Lead) => void;
  canCompleteFollowUp?: boolean;
  duplicateMatch?: DuplicateMatch | null;
}

const stageBadgeStyles: Record<Lead["stage"], string> = {
  "New Lead": "bg-slate-100 text-slate-700",
  Contacted: "bg-amber-100 text-amber-800",
  "Design Phase": "bg-indigo-100 text-indigo-800",
  "Mockup Phase": "bg-sky-100 text-sky-800",
  "Client Review": "bg-purple-100 text-purple-800",
  "Design Approved": "bg-green-100 text-green-800",
  "Quote Sent": "bg-blue-100 text-blue-800",
  "Quote Approved": "bg-emerald-100 text-emerald-800",
  "Deposit Paid": "bg-teal-100 text-teal-800",
  "Closed Lost": "bg-slate-200 text-slate-600",
};

const statusBadgeStyles: Record<Lead["status"], string> = {
  Open: "bg-slate-100 text-slate-700",
  Pending: "bg-amber-100 text-amber-800",
  "At Risk": "bg-rose-100 text-rose-800",
  Won: "bg-emerald-100 text-emerald-700",
};

function formatLeadValue(value: Lead["value"]) {
  if (typeof value === "number") {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  return value;
}

function formatActivityDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d`;
  if (diffDays < 84) return `${Math.floor(diffDays / 7)}w`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LeadCard({
  lead,
  stageIndex,
  totalStages,
  onOpen,
  onEdit,
  onMove,
  onDelete,
  onToggleTest,
  onCompleteFollowUp,
  canCompleteFollowUp = false,
  duplicateMatch,
}: LeadCardProps) {
  const canMoveBack = stageIndex > 0;
  const canMoveForward = stageIndex < totalStages - 1;

  const history = lead.communicationHistory ?? [];
  const latestActivity = history.length > 0
    ? [...history].sort((a, b) => b.date.localeCompare(a.date))[0]
    : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(lead);
        }
      }}
      className={`group w-full rounded-[1.5rem] bg-white p-3.5 text-left shadow-sm ring-1 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 ${
        lead.is_test ? "ring-amber-200" : "ring-slate-100"
      }`}
    >
      {/* Top row: name + badges on the left, value on the right (no collision) */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-slate-950">{lead.company}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${stageBadgeStyles[lead.stage]}`}>
              {lead.stage}
            </span>
            {(lead as Lead & { source?: string }).source === "Website" && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                Web
              </span>
            )}
            {lead.is_test && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                Test
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-sm font-bold text-slate-900">{formatLeadValue(lead.value)}</span>
      </div>

      {/* Meta: quiet grey-dot labeled lines */}
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400">Last</span>
          <span className="min-w-0 truncate text-[11px] text-slate-600">
            {latestActivity
              ? `${latestActivity.type} · ${formatActivityDate(latestActivity.date)}`
              : "No activity"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.06em] text-slate-400">Follow-up</span>
          <span className="min-w-0 truncate text-[11px] text-slate-600">{lead.followUpDate || "TBD"}</span>
        </div>
      </div>

      {/* Conditional strips, full-width below meta */}
      {lead.stage === "Closed Lost" && lead.lostReason && (
        <div className="mt-3 rounded-2xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Lost:</span> {lead.lostReason}
        </div>
      )}
      {canCompleteFollowUp && onCompleteFollowUp && (
        <button
          type="button"
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          onClick={(event) => {
            event.stopPropagation();
            onCompleteFollowUp(lead);
          }}
        >
          <CheckCircle className="h-4 w-4" aria-hidden="true" />
          Complete Follow-Up
        </button>
      )}
      {duplicateMatch && (
        <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
          duplicateMatch.matchType === "likely_existing"
            ? "bg-amber-100 text-amber-800"
            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
        }`}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {duplicateMatch.matchType === "likely_existing" ? "Likely existing client" : "Possible duplicate"}: {duplicateMatch.clientName}
          </span>
        </div>
      )}

      {/* Footer: owner on the left, action buttons on the right */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-semibold text-white">
            {lead.owner[0]}
          </span>
          <span className="min-w-0 truncate text-[11px] text-slate-600">{lead.owner}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onToggleTest && (
            <button
              type="button"
              className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                lead.is_test
                  ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              }`}
              aria-label={lead.is_test ? `Unmark ${lead.company} as test` : `Mark ${lead.company} as test`}
              title={lead.is_test ? "Test record - click to unmark" : "Mark as test"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleTest(lead);
              }}
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100"
            aria-label={`Delete ${lead.company}`}
            onClick={(event) => {
              event.stopPropagation();
              if (!window.confirm("Delete this item?")) return;
              onDelete(lead);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

const pipelineStages = [
  "New Lead",
  "Contacted",
  "Design Phase",
  "Client Review",
  "Design Approved",
  "Quote Sent",
  "Quote Approved",
  "Deposit Paid",
] as const;
