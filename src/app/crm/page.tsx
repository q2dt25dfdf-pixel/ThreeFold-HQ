"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import LeadDetailModal from "../../components/crm/LeadDetailModal";
import LeadCard from "../../components/crm/LeadCard";
import LeadFormModal from "../../components/crm/LeadFormModal";
import { pipelineStages, type Lead, type PipelineStage } from "../../components/crm/types";
import { useSupabaseTable } from "@/lib/useSupabaseTable";

type Client = {
  id: string;
  name: string;
  company?: string;
  industry: string;
  contact: string;
  email: string;
  phone: string;
  orders: number;
  notes: string;
  status: "Active" | "At Risk" | "Dormant" | "Lead";
};

type FollowUpTask = {
  id: string;
  title: string;
  dueDate: string;
  assignedTo: "";
  owner: "";
  status: "Open" | "Done" | "Complete";
  priority: "High" | "Medium" | "Low";
  notes: string;
  completed: boolean;
  source: "CRM";
  crmLeadId: string;
  leadId: string;
};

const autoFollowUpTaskId = (leadId: string) => "crm-followup-" + leadId;
const hasFollowUpDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date.trim());
const defaultFollowUpTaskNotes = "Auto-generated from CRM lead. Log interaction notes here after follow-up.";

const initialLeads: Lead[] = [
  {
    id: "lead-1",
    company: "Aurora Logistics",
    companyProfile: { industry: "Logistics", address: "San Francisco, CA", website: "auroralogistics.co" },
    contact: "Sam Carter",
    email: "sam.carter@auroralogistics.com",
    phone: "(415) 555-0199",
    value: 18400,
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
    companyProfile: { industry: "Healthcare", address: "San Jose, CA", website: "harborpointdental.com" },
    contact: "Dr. Kim",
    email: "dr.kim@harborpointdental.com",
    phone: "(650) 555-0132",
    value: 8200,
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
    companyProfile: { industry: "E-commerce", address: "Seattle, WA", website: "nexa.com" },
    contact: "Avery Johnson",
    email: "avery.johnson@nexa.com",
    phone: "(212) 555-0174",
    value: 26750,
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
    companyProfile: { industry: "Manufacturing", address: "Chicago, IL", website: "atlasmfg.com" },
    contact: "Ruben Torres",
    email: "ruben.torres@atlasmfg.com",
    phone: "(312) 555-0115",
    value: 41000,
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
    companyProfile: { industry: "Private equity", address: "Denver, CO", website: "stonebridge.vc" },
    contact: "Claire Nguyen",
    email: "claire@stonebridge.vc",
    phone: "(303) 555-0182",
    value: 12500,
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
  const { data: leads, upsertItem, deleteItem, loading, error } = useSupabaseTable<Lead>("crm_leads", initialLeads);
  const { upsertItem: upsertClient } = useSupabaseTable<Client>("clients", []);
  const { data: tasks, upsertItem: upsertTask, deleteItem: deleteTask } = useSupabaseTable<FollowUpTask>("tasks", []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLeadStage, setAddLeadStage] = useState<PipelineStage>("New Lead");
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  const visibleLeads = useMemo(
    () =>
      leads.filter((lead) =>
        JSON.stringify(lead).toLowerCase().includes(search.toLowerCase()),
      ),
    [leads, search],
  );

  const leadsByStage = useMemo(
    () =>
      pipelineStages.map((stage) => ({
        stage,
        leads: visibleLeads.filter((lead) => lead.stage === stage),
      })),
    [visibleLeads],
  );

  const leadValueNumber = (value: Lead["value"]) => {
    if (typeof value === "number") return value;
    const amount = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) ? amount : 0;
  };

  const totalValue = leads.reduce((sum, lead) => sum + leadValueNumber(lead.value), 0);

  const createId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `lead-${Date.now()}`;
  };

  useEffect(() => {
    if (!toastMessage) return;

    const timeout = window.setTimeout(() => setToastMessage(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const openAddLeadModal = (stage: PipelineStage = "New Lead") => {
    setAddLeadStage(stage);
    setShowAddModal(true);
  };

  const syncFollowUpTask = (lead: Lead) => {
    const taskId = autoFollowUpTaskId(lead.id);

    if (!hasFollowUpDate(lead.followUpDate)) {
      deleteTask(taskId);
      return;
    }

    const existingTask = tasks.find((task) => task.id === taskId || task.crmLeadId === lead.id || task.leadId === lead.id);

    upsertTask({
      ...existingTask,
      id: taskId,
      title: `Follow up with ${lead.contact || "lead"} — ${lead.company}`,
      dueDate: lead.followUpDate,
      assignedTo: "",
      owner: "",
      status: existingTask?.status ?? "Open",
      notes: existingTask?.notes || defaultFollowUpTaskNotes,
      priority: existingTask?.priority ?? "Medium",
      completed: existingTask?.completed ?? false,
      source: "CRM",
      crmLeadId: lead.id,
      leadId: lead.id,
    });
  };

  const handleAddLead = async (values: Omit<Lead, "id">) => {
    if (!values.company.trim()) return false;
    const lead = { id: createId(), ...values };

    const leadResponse = await upsertItem(lead);
    if (leadResponse.error) return leadResponse;

    const clientResponse = await upsertClient({
      id: `client-${lead.id}`,
      name: lead.company,
      company: lead.company,
      contact: lead.contact,
      industry: lead.companyProfile.industry,
      email: lead.email,
      phone: lead.phone,
      orders: 0,
      notes: `Added from CRM. Initial inquiry: ${lead.notes}`,
      status: "Lead",
    });
    if (clientResponse.error) return clientResponse;

    syncFollowUpTask(lead);
    setToastMessage("Lead added to pipeline and client account created.");
    return leadResponse;
  };

  const handleSaveDetailLead = async (updated: Lead) => {
    await upsertItem(updated);
    syncFollowUpTask(updated);
    setViewLead(updated);
  };

  const handleMoveLead = (lead: Lead, targetStage: PipelineStage) => {
    upsertItem({ ...lead, stage: targetStage });
  };

  const handleDeleteLead = async (lead: Lead) => {
    await deleteItem(lead.id);
    deleteTask(autoFollowUpTaskId(lead.id));
    if (viewLead?.id === lead.id) setViewLead(null);
  };

  if (loading) return <LoadingState label="Loading CRM..." />;

  return (
    <div className="min-h-screen min-w-0 space-y-10 text-xs md:text-sm">
      <ErrorBanner message={error} />
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-600">CRM Pipeline</p>
          <h1 className="text-base md:text-xl font-bold text-slate-950 md:text-4xl">Manage leads across every stage</h1>
          <p className="text-slate-600 text-xs md:text-sm mt-2">
            Track prospects, follow-ups, approvals, and production handoffs with operational accuracy.
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-3 md:flex-row md:items-center md:w-auto">
          <div className="relative w-full md:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-9 pr-4 text-xs md:text-sm focus:border-slate-500 focus:outline-none sm:w-56 md:py-2.5 md:text-sm"
              placeholder="Search CRM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => openAddLeadModal()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white hover:bg-slate-800 md:py-2.5"
          >
            <Plus size={16} />
            Add lead
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-2 md:p-6 shadow-sm">
          <p className="text-xs md:text-sm uppercase tracking-[0.24em] text-slate-500">Total leads</p>
          <p className="mt-3 text-base md:text-3xl font-semibold text-slate-950">{leads.length}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-2 md:p-6 shadow-sm">
          <p className="text-xs md:text-sm uppercase tracking-[0.24em] text-slate-500">Pipeline value</p>
          <p className="mt-3 text-base md:text-3xl font-semibold text-slate-950">${totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-2 md:p-6 shadow-sm">
          <p className="text-xs md:text-sm uppercase tracking-[0.24em] text-slate-500">Open approvals</p>
          <p className="mt-3 text-base md:text-3xl font-semibold text-slate-950">{leads.filter((lead) => lead.stage === "Approved").length}</p>
        </div>
      </div>

      <div className="bg-zinc-100 pb-6 lg:-mx-8 lg:overflow-x-auto lg:px-8">
        <div className="flex flex-col gap-4 bg-zinc-100 lg:min-w-max lg:flex-row lg:gap-6">
          {leadsByStage.map(({ stage, leads: stageLeads }, stageIndex) => {
            return (
            <div key={stage} className="w-full rounded-[2rem] border border-slate-200/70 bg-slate-50/50 p-2 md:p-3 shadow-sm md:p-5 lg:w-[340px] lg:flex-shrink-0">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200/60">
                <div>
                  <h2 className="text-xs md:text-sm font-semibold tracking-tight text-slate-950">{stage}</h2>
                  <p className="mt-1 text-xs text-slate-500">{stageLeads.length} lead{stageLeads.length === 1 ? "" : "s"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700">
                    {stageLeads.length}
                  </div>
                  <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 md:h-7 md:w-7"
                    aria-label={`Add lead to ${stage}`}
                    onClick={() => openAddLeadModal(stage)}
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
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
                  <button
                    type="button"
                    className="w-full rounded-[1.5rem] border border-dashed border-slate-200/60 bg-white px-4 py-3 md:py-6 text-center text-xs text-slate-500 hover:bg-slate-50"
                    onClick={() => openAddLeadModal(stage)}
                  >
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                        <path d="M12 7v10m5-5H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <p className="mt-3">Ready for your next lead</p>
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <LeadFormModal
        open={showAddModal}
        mode="add"
        initialStage={addLeadStage}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddLead}
      />

      <LeadDetailModal
        open={Boolean(viewLead)}
        lead={viewLead}
        onClose={() => setViewLead(null)}
        onSave={handleSaveDetailLead}
        onDelete={handleDeleteLead}
      />

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white shadow-xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
