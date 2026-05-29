import type { Lead, PipelineStage, DuplicateMatch } from "./types";
import { AlertTriangle, CheckCircle, Trash2 } from "lucide-react";

interface LeadCardProps {
  lead: Lead;
  stageIndex: number;
  totalStages: number;
  onOpen: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onMove: (lead: Lead, targetStage: PipelineStage) => void;
  onDelete: (lead: Lead) => void;
  onCompleteFollowUp?: (lead: Lead) => void;
  canCompleteFollowUp?: boolean;
  duplicateMatch?: DuplicateMatch | null;
}

const stageBadgeStyles: Record<Lead["stage"], string> = {
  "New Lead": "bg-slate-100 text-slate-700",
  Contacted: "bg-amber-100 text-amber-800",
  "Design Phase": "bg-indigo-100 text-indigo-800",
  "Client Review": "bg-purple-100 text-purple-800",
  "Design Approved": "bg-green-100 text-green-800",
  "Quote Sent": "bg-blue-100 text-blue-800",
  "Quote Approved": "bg-emerald-100 text-emerald-800",
  "Deposit Paid": "bg-teal-100 text-teal-800",
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

const ACTIVITY_EMOJI: Record<string, string> = {
  Call: "📞",
  Email: "✉️",
  Text: "💬",
  Meeting: "📅",
  "In Person": "🤝",
  Other: "📋",
};

export default function LeadCard({
  lead,
  stageIndex,
  totalStages,
  onOpen,
  onEdit,
  onMove,
  onDelete,
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
      className="group w-full rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-sm transition duration-200 hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 md:rounded-[2rem] md:p-5"
    >
      <div className="flex items-start justify-between gap-1.5 md:gap-2">
        <div className="min-w-0 flex-1 space-y-0.5 md:space-y-1.5">
          <h3 className="truncate text-xs font-semibold leading-4 text-slate-950 md:text-sm md:leading-5">{lead.company}</h3>
          <div className="flex flex-wrap items-center gap-1">
            <span className={`inline-block max-w-full truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase leading-[1.15] tracking-[0.05em] md:px-3 md:py-1 md:text-[11px] ${stageBadgeStyles[lead.stage]}`}>
              {lead.stage}
            </span>
            {(lead as Lead & { source?: string }).source === "Website" && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700 md:px-2 md:text-[10px]">
                Web
              </span>
            )}
          </div>
          <div className="truncate text-[10px] text-slate-600 md:text-xs">{lead.contact}</div>
          <div className="truncate text-[10px] text-slate-400 md:text-xs">
            {latestActivity
              ? `${ACTIVITY_EMOJI[latestActivity.type] ?? "•"} ${latestActivity.type} · ${formatActivityDate(latestActivity.date)}`
              : "No activity"}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-start gap-1 text-right md:gap-2">
          <div className="min-w-0">
            <div className="max-w-16 truncate text-xs font-semibold text-slate-950 md:max-w-none md:text-base">{formatLeadValue(lead.value)}</div>
            <div className="text-[8px] uppercase tracking-[0.18em] text-slate-400 md:text-[10px] md:tracking-[0.22em]">Value</div>
          </div>
          <button
            type="button"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 md:min-h-10 md:min-w-10"
            aria-label={`Delete ${lead.company}`}
            onClick={(event) => {
              event.stopPropagation();
              if (!window.confirm("Delete this item?")) return;
              onDelete(lead);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 md:mt-3 md:gap-2">
        <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs md:rounded-2xl md:px-3 md:py-2">
          <div className="truncate text-[11px] font-semibold text-slate-900 md:text-xs">Follow-up</div>
          <div className="truncate text-[10px] text-slate-600 md:mt-0.5 md:text-xs">{lead.followUpDate}</div>
        </div>
        <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs md:rounded-2xl md:px-3 md:py-2">
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-semibold text-white md:h-6 md:w-6 md:text-[10px]">
              {lead.owner[0]}
            </span>
            <span className="min-w-0 truncate text-[11px] font-semibold text-slate-900 md:text-xs">{lead.owner}</span>
          </div>
        </div>
      </div>
      {canCompleteFollowUp && onCompleteFollowUp && (
        <button
          type="button"
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 md:mt-3 md:rounded-2xl"
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
        <div className={`mt-2 flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold md:mt-3 md:px-3 md:py-2 md:text-xs ${
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
