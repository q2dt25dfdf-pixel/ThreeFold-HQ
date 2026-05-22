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
      className="group w-full rounded-[2rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400 md:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="truncate text-sm font-semibold text-slate-950">{lead.company}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold uppercase leading-[1.2] tracking-[0.06em] ${stageBadgeStyles[lead.stage]}`}>
              {lead.stage}
            </span>
            {(lead as Lead & { source?: string }).source === "Website" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                Web
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600">{lead.contact}</div>
        </div>
        <div className="flex flex-shrink-0 items-start gap-2 text-right">
          <div>
            <div className="text-base font-semibold text-slate-950">{formatLeadValue(lead.value)}</div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Value</div>
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

      <div className="mt-3 grid gap-2 grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs">
          <div className="font-semibold text-slate-900">Follow-up</div>
          <div className="mt-0.5 text-xs text-slate-600">{lead.followUpDate}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
              {lead.owner[0]}
            </span>
            <span className="min-w-0 truncate text-xs font-semibold text-slate-900">{lead.owner}</span>
          </div>
        </div>
      </div>
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
  "Deposit Paid",
] as const;
