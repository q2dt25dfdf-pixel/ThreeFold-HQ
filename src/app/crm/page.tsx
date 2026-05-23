"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { ErrorBanner, LoadingState } from "@/components/AppState";
import LeadDetailModal from "../../components/crm/LeadDetailModal";
import LeadCard from "../../components/crm/LeadCard";
import LeadFormModal from "../../components/crm/LeadFormModal";
import SendQuoteModal from "../../components/crm/SendQuoteModal";
import SendDepositModal from "../../components/crm/SendDepositModal";
import CompleteFollowUpModal from "../../components/crm/CompleteFollowUpModal";
import { pipelineStages, type Lead, type PipelineStage, type DuplicateMatch, type QuestionnaireFile, type CommunicationEntry } from "../../components/crm/types";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabase";
import { addDaysToISODate, businessTodayISO } from "@/lib/businessDate";
import {
  autoFollowUpTaskId,
  canCompleteLeadFollowUp,
  findFollowUpTaskForLead,
  hasFollowUpDate,
  isLeadFollowUpDueWithin,
  leadFollowUpDate,
} from "@/lib/followUps";

type Client = {
  id: string;
  name: string;
  company?: string;
  industry: string;
  contact: string;
  email: string;
  phone: string;
  owner?: string;
  address?: string;
  website?: string;
  orders: number;
  notes: string;
  status: "Active" | "At Risk" | "Dormant" | "Lead";
};

type FollowUpTask = {
  id: string;
  title: string;
  dueDate: string;
  due_date?: string;
  assignedTo: string;
  owner: string;
  status: "Open" | "Done" | "Complete" | string;
  priority: "High" | "Medium" | "Low";
  notes: string;
  completed: boolean;
  completedAt?: string;
  completed_at?: string;
  source: "CRM";
  crmLeadId: string;
  leadId: string;
  crm_lead_id?: string;
  lead_id?: string;
};

type IntakeSnapshot = {
  contact_title?: string;
  contact_method?: string;
  company_description?: string;
  quantity?: string;
  target_date?: string;
  project_timeline?: string;
  budget?: string;
  apparel_types?: string;
  audience?: string;
  station_code?: string;
  meaning?: string;
  style?: string;
  colors?: string;
  notes?: string;
  files?: QuestionnaireFile[];
};

type Order = {
  id: string;
  orderName: string;
  order_name?: string;
  order_number?: string;
  client: string;
  client_id?: string;
  client_name?: string;
  vendor: string;
  items: string[];
  quantity: number;
  amount: number;
  status: string;
  estimatedDeliveryDate: string;
  notes: string;
  source?: string;
  lead_id?: string;
  questionnaire_id?: string;
  quote_id?: string;
  deposit_request_id?: string;
  intake_snapshot?: IntakeSnapshot;
};

type InvoiceRecord = {
  id: string;
  client: string;
  client_id?: string;
  client_name?: string;
  client_email?: string;
  orderName: string;
  order_name?: string;
  order_id?: string;
  lead_id?: string;
  quote_id?: string;
  deposit_request_id?: string;
  total_amount: number;
  amount?: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_paid_date?: string;
  balance_remaining: number;
  final_due_date?: string;
  final_paid: boolean;
  status: string;
  notes: string;
};

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function detectDuplicateMatch(lead: Lead, clients: Client[]): DuplicateMatch | null {
  if (isDepositPaid(lead.stage as string)) return null;

  const email = lead.email?.trim().toLowerCase();
  const company = normalizeForMatch(lead.company);

  if (email) {
    const m = clients.find((c) => c.email?.trim().toLowerCase() === email);
    if (m) return { matchType: "likely_existing", clientName: m.name, clientId: m.id };
  }

  if (company.length >= 2) {
    const m = clients.find((c) => {
      const cn = normalizeForMatch(c.name);
      const cc = normalizeForMatch(c.company ?? "");
      return cn === company || (cc.length > 0 && cc === company);
    });
    if (m) return { matchType: "likely_existing", clientName: m.name, clientId: m.id };
  }

  if (company.length >= 4) {
    const m = clients.find((c) => {
      const cn = normalizeForMatch(c.name);
      const cc = normalizeForMatch(c.company ?? "");
      return [cn, cc]
        .filter((t) => t.length >= 4)
        .some((t) => t.includes(company) || company.includes(t));
    });
    if (m) return { matchType: "possible_duplicate", clientName: m.name, clientId: m.id };
  }

  return null;
}

// "Approved" is the legacy final CRM stage name — treat it same as "Deposit Paid"
function isDepositPaid(stage: string): boolean {
  return stage === "Deposit Paid" || stage === "Approved";
}

// Map old stage names from existing Supabase records to the new pipeline
const LEGACY_CRM_STAGES: Record<string, PipelineStage> = { Approved: "Deposit Paid" };
function normalizeCRMStage(stage: string): PipelineStage {
  if (LEGACY_CRM_STAGES[stage]) return LEGACY_CRM_STAGES[stage];
  if ((pipelineStages as readonly string[]).includes(stage)) return stage as PipelineStage;
  return "New Lead";
}
const defaultFollowUpTaskNotes = "Auto-generated from CRM lead. Log interaction notes here after follow-up.";
const normalizeMatchValue = (value: string | undefined) => (value ?? "").trim().toLowerCase();

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
    stage: "Deposit Paid",
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
    stage: "Deposit Paid",
    followUpDate: "2026-05-20",
    status: "Won",
    communicationHistory: [
      { id: "comm-5", type: "Call", date: "2026-05-09", owner: "Jordan", summary: "Confirmed final artwork and delivery schedule." },
    ],
  },
];

function CRMContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: leads, upsertItem, deleteItem, loading, error } = useSupabaseTable<Lead>("crm_leads", initialLeads);
  const { data: clients, upsertItem: upsertClient, reload: reloadClients } = useSupabaseTable<Client>("clients", []);
  const { data: tasks, upsertItem: upsertTask, deleteItem: deleteTask } = useSupabaseTable<FollowUpTask>("tasks", []);
  const { upsertItem: upsertOrder } = useSupabaseTable<Order>("orders", []);
  const { upsertItem: upsertFinance } = useSupabaseTable<InvoiceRecord>("finances", []);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLeadStage, setAddLeadStage] = useState<PipelineStage>("New Lead");
  const [viewLeadId, setViewLeadId] = useState<string | null>(null);
  const [quoteLead, setQuoteLead] = useState<Lead | null>(null);
  const [depositLead, setDepositLead] = useState<Lead | null>(null);
  const [completingLead, setCompletingLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  const viewParam = searchParams.get("view");
  const [viewMode, setViewMode] = useState<"open" | "followups" | null>(
    viewParam === "open" ? "open" : viewParam === "followups" ? "followups" : null,
  );

  const todayISO = useMemo(() => businessTodayISO(), []);
  const sevenDaysAheadISO = useMemo(() => addDaysToISODate(todayISO, 7), [todayISO]);

  const viewLead = leads.find((l) => l.id === viewLeadId) ?? null;

  const visibleLeads = useMemo(() => {
    let list = leads.filter((lead) =>
      JSON.stringify(lead).toLowerCase().includes(search.toLowerCase()),
    );
    if (viewMode === "open") {
      list = list.filter((lead) => !isDepositPaid(lead.stage as string));
    } else if (viewMode === "followups") {
      list = list.filter((lead) => isLeadFollowUpDueWithin(lead, tasks, sevenDaysAheadISO));
    }
    return list;
  }, [leads, search, viewMode, tasks, sevenDaysAheadISO]);

  const leadsByStage = useMemo(
    () =>
      pipelineStages.map((stage) => ({
        stage,
        leads: visibleLeads.filter((lead) => normalizeCRMStage(lead.stage as string) === stage),
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

    const existingTask = findFollowUpTaskForLead(tasks, lead.id) as FollowUpTask | undefined;
    const existingDueDate = existingTask?.dueDate ?? existingTask?.due_date;
    const dateChanged = Boolean(existingTask && existingDueDate !== lead.followUpDate);

    upsertTask({
      ...existingTask,
      id: taskId,
      title: `Follow up with ${lead.contact || "lead"} — ${lead.company}`,
      dueDate: lead.followUpDate,
      due_date: lead.followUpDate,
      assignedTo: "",
      owner: "",
      status: dateChanged ? "Open" : (existingTask?.status ?? "Open"),
      notes: existingTask?.notes || defaultFollowUpTaskNotes,
      priority: existingTask?.priority ?? "Medium",
      completed: dateChanged ? false : (existingTask?.completed ?? false),
      completedAt: dateChanged ? undefined : existingTask?.completedAt,
      completed_at: dateChanged ? undefined : existingTask?.completed_at,
      source: "CRM",
      crmLeadId: lead.id,
      leadId: lead.id,
      crm_lead_id: lead.id,
      lead_id: lead.id,
    });
  };

  const completeFollowUp = async (lead: Lead) => {
    const existingTask = findFollowUpTaskForLead(tasks, lead.id) as FollowUpTask | undefined;
    if (!hasFollowUpDate(lead.followUpDate)) return;
    const completedAt = new Date().toISOString();

    await upsertTask({
      ...existingTask,
      id: autoFollowUpTaskId(lead.id),
      title: existingTask?.title ?? `Follow up with ${lead.contact || "lead"} — ${lead.company}`,
      dueDate: existingTask?.dueDate ?? lead.followUpDate,
      due_date: existingTask?.due_date ?? lead.followUpDate,
      assignedTo: existingTask?.assignedTo ?? "",
      owner: existingTask?.owner ?? "",
      status: "Done",
      notes: existingTask?.notes || defaultFollowUpTaskNotes,
      priority: existingTask?.priority ?? "Medium",
      completed: true,
      completedAt,
      completed_at: completedAt,
      source: "CRM",
      crmLeadId: lead.id,
      leadId: lead.id,
      crm_lead_id: lead.id,
      lead_id: lead.id,
    });
    setToastMessage(`Follow-up completed for ${lead.company}.`);
  };

  const handleCompleteFollowUpWithLog = async (lead: Lead, entry: CommunicationEntry) => {
    const updated: Lead = {
      ...lead,
      communicationHistory: [entry, ...lead.communicationHistory],
    };
    await upsertItem(updated);
    await completeFollowUp(lead);
    setCompletingLead(null);
  };

  const findClientForLead = (lead: Lead | null, previousLead?: Lead | null): Client | null => {
    if (!lead) return null;
    const email = normalizeMatchValue(lead.email);
    const previousEmail = normalizeMatchValue(previousLead?.email);
    const company = normalizeMatchValue(lead.company);
    const previousCompany = normalizeMatchValue(previousLead?.company);

    if (email) {
      const emailMatch = clients.find((client) => normalizeMatchValue(client.email) === email);
      if (emailMatch) return emailMatch;
    }
    if (previousEmail) {
      const previousEmailMatch = clients.find((client) => normalizeMatchValue(client.email) === previousEmail);
      if (previousEmailMatch) return previousEmailMatch;
    }

    if (company) {
      const companyMatch = clients.find((client) => normalizeMatchValue(client.name || client.company) === company);
      if (companyMatch) return companyMatch;
    }
    if (previousCompany) {
      const previousCompanyMatch = clients.find((client) => normalizeMatchValue(client.name || client.company) === previousCompany);
      if (previousCompanyMatch) return previousCompanyMatch;
    }

    return clients.find((client) => client.id === `client-${lead.id}`) ?? null;
  };

  const syncClientFromLead = async (lead: Lead, previousLead?: Lead | null) => {
    const match = findClientForLead(lead, previousLead);
    const clientId = match?.id ?? `client-${lead.id}`;

    await upsertClient({
      ...match,
      id: clientId,
      name: lead.company,
      company: lead.company,
      contact: lead.contact,
      email: lead.email,
      phone: lead.phone,
      owner: lead.owner,
      industry: lead.companyProfile.industry,
      address: lead.companyProfile.address,
      website: lead.companyProfile.website,
      orders: match?.orders ?? 0,
      notes: match?.notes ?? `Added from CRM. Initial inquiry: ${lead.notes}`,
      status: match?.status ?? "Lead",
    });
  };

  const handleApproveLead = async (lead: Lead) => {
    const existingClient = findClientForLead(lead);
    const clientId = existingClient?.id ?? `client-${lead.id}`;
    await syncClientFromLead(lead);
    await reloadClients();

    // Generate a sequential order number
    const year = new Date().getFullYear();
    const { count: orderCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });
    const orderNumber = `TF-ORD-${year}-${String((orderCount ?? 0) + 1).padStart(4, "0")}`;
    const orderId = `order-lead-${lead.id}`;
    const orderName = `${lead.company} — ${orderNumber}`;

    // Look up the deposit request for this lead using the specific ID on the lead,
    // so we always get the latest request rather than an arbitrary old one.
    type DepositRow = { total_amount: number; deposit_amount: number; balance_remaining: number };
    const leadDepositRequestId = lead.deposit_request_id;
    const { data: depositRows } = leadDepositRequestId
      ? await supabase
          .from("deposit_requests")
          .select("id,data")
          .eq("id", leadDepositRequestId)
          .limit(1)
      : await supabase
          .from("deposit_requests")
          .select("id,data")
          .eq("data->>lead_id", lead.id)
          .order("id", { ascending: false })
          .limit(1);
    const depositData = depositRows?.[0]?.data as DepositRow | undefined;

    const rawValue = lead.value;
    const leadTotal =
      typeof rawValue === "number"
        ? rawValue
        : Number(String(rawValue).replace(/[^0-9.-]/g, "")) || 0;
    const totalAmount =
      depositData?.total_amount != null && Number(depositData.total_amount) > 0
        ? Number(depositData.total_amount)
        : leadTotal;
    const depositAmount = depositData?.deposit_amount ?? Math.round(totalAmount * 0.5 * 100) / 100;
    const balanceRemaining = depositData?.balance_remaining ?? Math.max(totalAmount - depositAmount, 0);
    const today = businessTodayISO();

    // Create the order
    await upsertOrder({
      id: orderId,
      orderName,
      order_name: orderName,
      order_number: orderNumber,
      client: lead.company,
      client_id: clientId,
      client_name: lead.company,
      vendor: "",
      items: [],
      quantity: 0,
      amount: totalAmount,
      status: "Production",
      estimatedDeliveryDate: "",
      notes: "",
      source: lead.source === "Website" ? "Website Lead" : "CRM Lead",
      lead_id: lead.id,
      questionnaire_id: lead.questionnaire_id ?? "",
      quote_id: lead.quote_id ?? "",
      deposit_request_id: lead.deposit_request_id ?? "",
      intake_snapshot: {
        contact_title: lead.contact_title ?? "",
        contact_method: lead.contact_method ?? "",
        company_description: lead.company_description ?? "",
        quantity: lead.quantity ?? "",
        target_date: lead.target_date ?? "",
        project_timeline: lead.project_timeline ?? "",
        budget: lead.budget ?? "",
        apparel_types: lead.apparel_types ?? "",
        audience: lead.audience ?? "",
        station_code: lead.station_code ?? "",
        meaning: lead.meaning ?? "",
        style: lead.style ?? "",
        colors: lead.colors ?? "",
        notes: lead.notes ?? "",
        files: lead.questionnaire_files ?? [],
      },
    });

    // Generate client portal token for the order
    void fetch("/api/portal/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });

    // Create invoice record
    const invoiceId = `invoice-${orderId}`;
    const invoiceNotes = [
      "Created automatically when lead reached Deposit Paid.",
      lead.quote_number ? `Quote: ${lead.quote_number}.` : "",
      lead.deposit_request_number ? `Deposit Request: ${lead.deposit_request_number}.` : "",
    ].filter(Boolean).join(" ");

    await upsertFinance({
      id: invoiceId,
      client: lead.company,
      client_id: clientId,
      client_name: lead.company,
      client_email: lead.email ?? "",
      orderName,
      order_name: orderName,
      order_id: orderId,
      lead_id: lead.id,
      quote_id: lead.quote_id ?? "",
      deposit_request_id: lead.deposit_request_id ?? "",
      total_amount: totalAmount,
      amount: totalAmount,
      deposit_amount: depositAmount,
      deposit_paid: true,
      deposit_paid_date: today,
      balance_remaining: balanceRemaining,
      final_due_date: "",
      final_paid: false,
      status: "Deposit Paid",
      notes: invoiceNotes,
    });

    setToastMessage(
      `${lead.company} moved to Deposit Paid. Order ${orderNumber}, Invoice, and Client Portal created.`,
    );
  };

  const handleAddLead = async (values: Omit<Lead, "id">) => {
    if (!values.company.trim()) return false;
    const lead = { id: createId(), ...values };

    const leadResponse = await upsertItem(lead);
    if (leadResponse.error) return leadResponse;

    syncFollowUpTask(lead);
    setToastMessage("Lead added to pipeline.");
    return leadResponse;
  };

  const handleSaveDetailLead = async (updated: Lead) => {
    await upsertItem(updated);
    syncFollowUpTask(updated);
    if (isDepositPaid(updated.stage as string) && !isDepositPaid(viewLead?.stage as string ?? "")) {
      await handleApproveLead(updated);
    }
  };

  const handleMoveLead = async (lead: Lead, targetStage: PipelineStage) => {
    const updated = { ...lead, stage: targetStage };
    await upsertItem(updated);
    if (targetStage === "Deposit Paid") {
      await handleApproveLead(updated);
    }
  };

  const handleDeleteLead = async (lead: Lead) => {
    await deleteItem(lead.id);
    deleteTask(autoFollowUpTaskId(lead.id));
    if (viewLeadId === lead.id) setViewLeadId(null);
  };

  const handleOpenSendQuote = (lead: Lead) => {
    setViewLeadId(null);
    setQuoteLead(lead);
  };

  const handleQuoteSent = async (lead: Lead, result: { quoteId: string; quoteNumber: string; publicLink: string }) => {
    const updated: Lead = {
      ...lead,
      stage: "Quote Sent",
      quote_id: result.quoteId,
      quote_number: result.quoteNumber,
      communicationHistory: [
        {
          id: `comm-quote-${Date.now()}`,
          type: "Email",
          date: businessTodayISO(),
          owner: lead.owner || "Alliyah",
          summary: `Quote sent. Quote #${result.quoteNumber}. View: ${result.publicLink}`,
        },
        ...lead.communicationHistory,
      ],
    };
    await upsertItem(updated);
    syncFollowUpTask(updated);
    setToastMessage(`Quote ${result.quoteNumber} sent to ${lead.email}. Lead moved to Quote Sent.`);
  };

  const handleOpenSendDeposit = (lead: Lead) => {
    setViewLeadId(null);
    setDepositLead(lead);
  };

  const handleDepositSent = async (lead: Lead, result: { depositRequestId: string; depositRequestNumber: string; publicLink: string }) => {
    const updated: Lead = {
      ...lead,
      deposit_request_id: result.depositRequestId,
      deposit_request_number: result.depositRequestNumber,
      communicationHistory: [
        {
          id: `comm-deposit-${Date.now()}`,
          type: "Email",
          date: businessTodayISO(),
          owner: lead.owner || "Alliyah",
          summary: `Deposit request sent. Request #${result.depositRequestNumber}. View: ${result.publicLink}`,
        },
        ...lead.communicationHistory,
      ],
    };
    await upsertItem(updated);
    setToastMessage(`Deposit request ${result.depositRequestNumber} sent to ${lead.email}.`);
  };

  if (loading) return <LoadingState label="Loading CRM..." />;

  return (
    <div className="min-h-screen min-w-0 space-y-6 text-xs md:text-sm">
      <ErrorBanner message={error} />
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:overflow-x-visible">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-600 md:text-sm">CRM Pipeline</p>
          <h1 className="mt-3 text-base font-semibold text-slate-950 md:text-3xl">Manage leads across every stage</h1>
          <p className="text-slate-600 text-xs md:text-sm mt-2">
            Track prospects, follow-ups, approvals, and production handoffs with operational accuracy.
          </p>
          <button
            type="button"
            onClick={() => openAddLeadModal()}
            className="mt-4 hidden min-h-11 items-center gap-2 rounded-3xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 md:inline-flex"
          >
            <Plus size={16} />
            Add lead
          </button>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-3 md:w-auto md:flex-row md:items-center">
          {viewMode && (
            <div className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5">
              <span className="text-xs font-semibold text-blue-700">
                {viewMode === "open" ? "Open leads" : "Follow-ups due"}
              </span>
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setViewMode(null)}
                className="ml-0.5 text-blue-400 hover:text-blue-700"
              >
                ×
              </button>
            </div>
          )}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-9 pr-4 text-xs focus:border-slate-500 focus:outline-none md:py-2.5 md:text-sm"
              placeholder="Search CRM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => openAddLeadModal()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-3xl bg-slate-900 px-5 py-3 text-xs font-semibold text-white hover:bg-slate-800 md:hidden"
          >
            <Plus size={16} />
            Add lead
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500 md:text-sm">Total leads</p>
          <p className="mt-2 text-xl font-semibold text-slate-950 md:mt-3 md:text-3xl">{leads.length}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500 md:text-sm">Pipeline value</p>
          <p className="mt-2 text-xl font-semibold text-slate-950 md:mt-3 md:text-3xl">${totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500 md:text-sm">Deposit paid</p>
          <p className="mt-2 text-xl font-semibold text-slate-950 md:mt-3 md:text-3xl">{leads.filter((lead) => isDepositPaid(lead.stage as string)).length}</p>
        </div>
      </div>

      {(() => {
        const followUpLeads = leads
          .filter((l) => (
            !isDepositPaid(l.stage as string) &&
            canCompleteLeadFollowUp(l, tasks)
          ))
          .sort((a, b) => leadFollowUpDate(a).localeCompare(leadFollowUpDate(b)));
        if (followUpLeads.length === 0) return null;
        return (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">CRM</p>
                <h2 className="text-base font-bold text-slate-950 md:text-lg">Pipeline Follow-Ups</h2>
              </div>
              <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-amber-800 shadow-sm">
                {followUpLeads.length} due
              </span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {followUpLeads.map((lead) => (
                <article key={lead.id} className="rounded-2xl border border-amber-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950">{lead.contact}</p>
                      <p className="mt-1 truncate text-xs text-slate-600">{lead.company}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        Due {leadFollowUpDate(lead)}
                      </span>
                      <button
                        type="button"
                        className="min-h-11 rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        onClick={() => setViewLeadId(lead.id)}
                      >
                        View lead
                      </button>
                      <button
                        type="button"
                        className="min-h-11 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        onClick={() => setCompletingLead(lead)}
                      >
                        Complete Follow-Up
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })()}

      <div className="bg-zinc-100 pb-6 lg:-mx-8 lg:overflow-x-auto lg:px-8 lg:pb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-4 lg:items-start lg:pr-6">
          {leadsByStage.map(({ stage, leads: stageLeads }, stageIndex) => {
            return (
            <div key={stage} className="w-full lg:w-[295px] lg:shrink-0 rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm md:p-4">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200/60">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-slate-950">{stage}</h2>
                  <p className="mt-1 text-xs text-slate-500">{stageLeads.length} lead{stageLeads.length === 1 ? "" : "s"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-700">
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
                      onOpen={(lead) => setViewLeadId(lead.id)}
                      onEdit={() => {}}
                      onMove={handleMoveLead}
                      onDelete={handleDeleteLead}
                      onCompleteFollowUp={(l) => setCompletingLead(l)}
                      canCompleteFollowUp={canCompleteLeadFollowUp(lead, tasks)}
                      duplicateMatch={detectDuplicateMatch(lead, clients)}
                    />
                  ))
                ) : (
                  <button
                    type="button"
                    className="w-full rounded-[2rem] border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500 hover:bg-slate-50 md:text-sm"
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
        onClose={() => setViewLeadId(null)}
        onSave={handleSaveDetailLead}
        onDelete={handleDeleteLead}
        matchingClientId={viewLead ? (findClientForLead(viewLead)?.id ?? null) : null}
        duplicateMatch={viewLead ? detectDuplicateMatch(viewLead, clients) : null}
        canCompleteFollowUp={viewLead ? canCompleteLeadFollowUp(viewLead, tasks) : false}
        onCompleteFollowUp={(l) => setCompletingLead(l)}
        onViewClient={() => {
          const match = viewLead ? findClientForLead(viewLead) : null;
          if (match) { setViewLeadId(null); router.push(`/clients/${match.id}`); }
        }}
        onQuestionnaire={() => {
          if (viewLead) { setViewLeadId(null); router.push(`/crm/leads/${viewLead.id}`); }
        }}
        onSendQuote={handleOpenSendQuote}
        onSendDepositRequest={handleOpenSendDeposit}
      />

      <SendQuoteModal
        open={Boolean(quoteLead)}
        lead={quoteLead}
        onClose={() => setQuoteLead(null)}
        onSent={(result) => {
          if (quoteLead) void handleQuoteSent(quoteLead, result);
          setQuoteLead(null);
        }}
      />

      <SendDepositModal
        open={Boolean(depositLead)}
        lead={depositLead}
        onClose={() => setDepositLead(null)}
        onSent={(result) => {
          if (depositLead) void handleDepositSent(depositLead, result);
          setDepositLead(null);
        }}
      />

      {completingLead && (
        <CompleteFollowUpModal
          lead={completingLead}
          onSubmit={(entry) => handleCompleteFollowUpWithLog(completingLead, entry)}
          onClose={() => setCompletingLead(null)}
        />
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-slate-950 px-5 py-3 text-xs md:text-sm font-semibold text-white shadow-xl">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default function CRMPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading CRM..." />}>
      <CRMContent />
    </Suspense>
  );
}
