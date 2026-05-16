import { X } from "lucide-react";
import type { Lead } from "./types";

interface ClientSlideOverProps {
  open: boolean;
  lead: Lead | null;
  onClose: () => void;
}

export default function ClientSlideOver({ open, lead, onClose }: ClientSlideOverProps) {
  if (!open || !lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/20 backdrop-blur-sm">
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-col gap-8 px-8 py-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Lead details</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{lead.company}</h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">{lead.contact} • {lead.email}</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-t border-slate-200/60 pt-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-[1.75rem] border border-slate-200/70 bg-slate-50/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">Snapshot</p>
                <div className="mt-5 space-y-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 border border-slate-200/50">
                    <span className="text-slate-600">Status</span>
                    <span className="font-semibold text-slate-950">{lead.status}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 border border-slate-200/50">
                    <span className="text-slate-600">Stage</span>
                    <span className="font-semibold text-slate-950">{lead.stage}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 border border-slate-200/50">
                    <span className="text-slate-600">Follow-up</span>
                    <span className="font-semibold text-slate-950">{lead.followUpDate}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 border border-slate-200/50">
                    <span className="text-slate-600">Owner</span>
                    <span className="font-semibold text-slate-950">{lead.owner}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200/70 bg-slate-50/50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">Company profile</p>
                <div className="mt-5 space-y-3 text-sm text-slate-700">
                  <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200/50">
                    <div className="font-semibold text-slate-950">Industry</div>
                    <div className="mt-1 text-slate-600">{lead.companyProfile.industry}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200/50">
                    <div className="font-semibold text-slate-950">Address</div>
                    <div className="mt-1 text-slate-600">{lead.companyProfile.address}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200/50">
                    <div className="font-semibold text-slate-950">Website</div>
                    <div className="mt-1 text-slate-600">{lead.companyProfile.website || "Not available"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200/60 pt-8">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-[1.75rem] border border-slate-200/70 bg-slate-50/50 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-950">Activity log</h3>
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700">History</span>
                </div>
                <div className="mt-5 space-y-3 text-slate-700">
                  {lead.communicationHistory.map((entry) => (
                    <div key={entry.id} className="rounded-2xl bg-white border border-slate-200/50 p-4">
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
                        <span>{entry.type}</span>
                        <span>{entry.date}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{entry.summary}</p>
                      <p className="mt-1 text-xs text-slate-600">Owner: {entry.owner}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200/70 bg-slate-50/50 p-5">
                <p className="font-semibold text-slate-950">Notes</p>
                <div className="mt-4 rounded-2xl bg-white border border-slate-200/50 px-4 py-4 text-sm leading-7 text-slate-700">
                  {lead.notes}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
