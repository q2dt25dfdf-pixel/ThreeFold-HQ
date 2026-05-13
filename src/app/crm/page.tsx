"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import LeadDetailModal from "../../components/crm/LeadDetailModal";
import LeadCard from "../../components/crm/LeadCard";
import LeadFormModal from "../../components/crm/LeadFormModal";
import { pipelineStages, type Lead, type PipelineStage } from "../../components/crm/types";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

const initialLeads: Lead[] = [
  {
    id: "lead-1",
    company: "Aurora Logistics",
    companyProfile: { industry: "Logistics", location: "San Francisco, CA", website: "auroralogistics.co" },
    contact: "Sam Carter",
    email: "sam.carter@auroralogistics.com",
    phone: "(415) 555-0199",
    value: "$18,400",
    notes: "Explore a custom CRM integration for logistics planning, shipment monitoring, and compliance workflows.",
    owner: "Hannah",
    stage: "New Lead",
    followUpDate: "2026-05-16",
    status: "Open",
    communicationHistory: [
      { id: "comm-1", type: "Email", date: "2026-05-10", owner: "Hannah", summary: "Sent initial intake form to client." },
    ],
  },
  {
    id: "lead-2",
    company: "HarborPoint Dental",
    companyProfile: { industry: "Healthcare", location: "San Jose, CA", website: "harborpointdental.com" },
    contact: "Dr. Kim",
    email: "dr.kim@harborpointdental.com",
    phone: "(650) 555-0132",
    value: "$8,200",
    notes: "Review current appointment scheduling and billing automation requirements before sending the proposal.",
    owner: "Jordan",
    stage: "Contacted",
    followUpDate: "2026-05-14",
    status: "Pending",
    communicationHistory: [
      { id: "comm-2", type: "Call", date: "2026-05-11", owner: "Jordan", summary: "Discussed timeline and approval path." },
    ],
  },
  {
    id: "lead-3",
    company: "Nexa Corporate",
    companyProfile: { industry: "E-commerce", location: "Seattle, WA", website: "nexa.com" },
    contact: "Avery Johnson",
    email: "avery.johnson@nexa.com",
    phone: "(212) 555-0174",
    value: "$26,750",
    notes: "Quote sent for enterprise onboarding, includes advanced reporting and team permissions.",
    owner: "Alliyah",
    stage: "Quote Sent",
    followUpDate: "2026-05-18",
    status: "Pending",
    communicationHistory: [
      { id: "comm-3", type: "Email", date: "2026-05-12", owner: "Alliyah", summary: "Sent detailed proposal with custom terms." },
    ],
  },
  {
    id: "lead-4",
    company: "Atlas Manufacturing",
    companyProfile: { industry: "Manufacturing", location: "Chicago, IL", website: "atlasmfg.com" },
    contact: "Ruben Torres",
    email: "ruben.torres@atlasmfg.com",
    phone: "(312) 555-0115",
    value: "$41,000",
    notes: "Production kickoff completed. Monitoring launch deliverables and weekly status reviews.",
    owner: "Hannah",
    stage: "Approved",
    followUpDate: "2026-05-19",
    status: "Open",
    communicationHistory: [
      { id: "comm-4", type: "Meeting", date: "2026-05-13", owner: "Hannah", summary: "Reviewed approval timeline and next steps." },
    ],
  },
  {
    id: "lead-5",
    company: "Stonebridge Ventures",
    companyProfile: { industry: "Private equity", location: "Denver, CO", website: "stonebridge.vc" },
    contact: "Claire Nguyen",
    email: "claire@stonebridge.vc",
    phone: "(303) 555-0182",
    value: "$12,500",
    notes: "Project completed successfully. Preparing client handoff, documentation, and follow-up items.",
    owner: "Jordan",
    stage: "In Production",
    followUpDate: "2026-05-20",
    status: "Won",
    communicationHistory: [
      { id: "comm-5", type: "Call", date: "2026-05-09", owner: "Jordan", summary: "Confirmed final artwork and delivery schedule." },
    ],
  },
];

export default function CRMPage() {
  const { data: leads, upsertItem, deleteItem, loading } = useSupabaseTable<Lead>("crm_leads", initialLeads);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [query, setQuery] = useState("");

  const visibleLeads = useMemo(
    () =>
      leads.filter((lead) =>
        JSON.stringify(lead).toLowerCase().includes(query.toLowerCase()),
      ),
    [leads, query],
  );

  const leadsByStage = useMemo(
    () => pipelineStages.map((stage) => visibleLeads.filter((lead) => lead.stage === stage)),
    [visibleLeads],
  );

  const totalValue = leads.reduce(
    (sum, lead) => sum + Number(lead.value.replace(/[^0-9.-]/g, "")),
    0,
  );

  const createId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `lead-${Date.now()}`;
  };

  const handleAddLead = async (values: Omit<Lead, "id">) => {
    await upsertItem({ id: createId(), ...values });
    setIsAddOpen(false);
  };

  const handleSaveDetailLead = async (updated: Lead) => {
    await upsertItem(updated);
    setViewLead(updated);
  };

  const handleMoveLead = (lead: Lead, targetStage: PipelineStage) => {
    upsertItem({ ...lead, stage: targetStage });
  };

  const handleDeleteLead = async (lead: Lead) => {
    await deleteItem(lead.id);
    if (viewLead?.id === lead.id) setViewLead(null);
  };

  if (loading) return <div className="p-8 text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen min-w-full space-y-10 bg-zinc-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-slate-500">CRM Pipeline</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Manage leads across every stage</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Track prospects, follow-ups, approvals, and production handoffs with operational accuracy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none focus:border-slate-400 sm:w-64"
              placeholder="Search CRM..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded-3xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => setIsAddOpen(true)}
          >
            + Add lead
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total leads</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{leads.length}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Pipeline value</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">${totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Open approvals</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{leads.filter((lead) => lead.stage === "Approved").length}</p>
        </div>
      </div>

      <div className="-mx-6 overflow-x-auto bg-zinc-100 px-6 pb-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-6 bg-zinc-100">
          {leadsByStage.map((stageLeads, stageIndex) => (
            <div key={pipelineStages[stageIndex]} className="w-[340px] flex-shrink-0 rounded-[2rem] border border-slate-200/70 bg-slate-50/50 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200/60">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-slate-950">{pipelineStages[stageIndex]}</h2>
                  <p className="mt-1 text-xs text-slate-500">{stageLeads.length} lead{stageLeads.length === 1 ? "" : "s"}</p>
                </div>
                <div className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700">
                  {stageLeads.length}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {stageLeads.length ? (
                  stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      stageIndex={stageIndex}
                      totalStages={pipelineStages.length}
                      onOpen={setViewLead}
                      onEdit={() => {}}
                      onMove={handleMoveLead}
                      onDelete={handleDeleteLead}
                    />
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-200/60 bg-white px-4 py-6 text-center text-xs text-slate-500">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                        <path d="M12 7v10m5-5H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <p className="mt-3">Ready for your next lead</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <LeadFormModal
        open={isAddOpen}
        mode="add"
        onClose={() => setIsAddOpen(false)}
        onSubmit={handleAddLead}
      />

      <LeadDetailModal
        open={Boolean(viewLead)}
        lead={viewLead}
        onClose={() => setViewLead(null)}
        onSave={handleSaveDetailLead}
        onDelete={handleDeleteLead}
      />
    </div>
  );
}
