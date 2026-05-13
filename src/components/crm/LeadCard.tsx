import type { Lead, PipelineStage } from "./types";

interface LeadCardProps {
  lead: Lead;
  stageIndex: number;
  totalStages: number;
  onOpen: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  onMove: (lead: Lead, targetStage: PipelineStage) => void;
  onDelete: (lead: Lead) => void;
}

const stageBadgeStyles: Record<Lead["stage"], string> = {
  "New Lead": "bg-sky-100 text-sky-700",
  Contacted: "bg-amber-100 text-amber-800",
  "Quote Sent": "bg-violet-100 text-violet-700",
  Approved: "bg-cyan-100 text-cyan-800",
  "In Production": "bg-indigo-100 text-indigo-800",
  Completed: "bg-emerald-100 text-emerald-700",
};

const statusBadgeStyles: Record<Lead["status"], string> = {
  Open: "bg-slate-100 text-slate-700",
  Pending: "bg-amber-100 text-amber-800",
  "At Risk": "bg-rose-100 text-rose-800",
  Won: "bg-emerald-100 text-emerald-700",
};

export default function LeadCard({
  lead,
  stageIndex,
  totalStages,
  onOpen,
  onEdit,
  onMove,
  onDelete,
}: LeadCardProps) {
  const canMoveBack = stageIndex > 0;
  const canMoveForward = stageIndex < totalStages - 1;

  return (
    <button
      type="button"
      onClick={() => onOpen(lead)}
      className="group w-full text-left rounded-[1.5rem] border border-slate-200/60 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-px hover:shadow-md focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-950">{lead.company}</h3>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.24em] ${stageBadgeStyles[lead.stage]}`}>
              {lead.stage}
            </span>
          </div>
          <div className="text-xs text-slate-600">{lead.contact}</div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-base font-semibold text-slate-950">{lead.value}</div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Value</div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs">
          <div className="font-semibold text-slate-900">Follow-up</div>
          <div className="mt-0.5 text-slate-600 text-[11px]">{lead.followUpDate}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-semibold text-white">
              {lead.owner[0]}
            </span>
            <span className="min-w-0 truncate font-semibold text-slate-900 text-[11px]">{lead.owner}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

const pipelineStages = [
  "New Lead",
  "Contacted",
  "Quote Sent",
  "Approved",
  "In Production",
  "Completed",
] as const;
