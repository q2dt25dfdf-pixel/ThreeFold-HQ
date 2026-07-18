export const pipelineStages = [
  "New Lead",
  "Contacted",
  "Design Phase",
  "Mockup Phase",
  "Client Review",
  "Design Approved",
  "Quote Sent",
  "Quote Approved",
  "Deposit Paid",
  "Closed Lost",
] as const;

export type PipelineStage = (typeof pipelineStages)[number];

export type CommunicationEntry = {
  id: string;
  type: "Call" | "Email" | "Text" | "Meeting" | "In Person" | "Other";
  date: string;
  owner: string;
  summary: string;
};

export type CompanyProfile = {
  industry: string;
  address: string;
  website: string;
};

// A single lead note. notes_list is the source of truth; `notes` (string) is a
// regenerated flat mirror the rest of the app still reads.
export type NoteEntry = {
  id: string;
  text: string;
  pinned: boolean;
  created_at: string;
  author: string;
};

// Flat mirror written to lead.notes on every notes_list change: pinned first
// (newest first), then unpinned (newest first), text only, joined by newlines —
// so the six downstream consumers keep seeing a plain, current notes string.
export function flattenNotes(list: NoteEntry[]): string {
  const byNewest = (a: NoteEntry, b: NoteEntry) => (b.created_at || "").localeCompare(a.created_at || "");
  const pinned = list.filter((n) => n.pinned).sort(byNewest);
  const unpinned = list.filter((n) => !n.pinned).sort(byNewest);
  return [...pinned, ...unpinned].map((n) => n.text).join("\n");
}

export type LeadStatus = "Open" | "Pending" | "At Risk" | "Won";

export type Lead = {
  id: string;
  company: string;
  companyProfile: CompanyProfile;
  contact: string;
  email: string;
  phone: string;
  value: string | number;
  notes: string;
  owner: string;
  stage: PipelineStage;
  followUpDate: string;
  status: LeadStatus;
  communicationHistory: CommunicationEntry[];
  source?: string;
  questionnaire_id?: string;
  // Website questionnaire fields (flat, for backward compat with existing Supabase rows)
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
  questionnaire_files?: QuestionnaireFile[];
  // Quote & deposit tracking — set after each workflow step
  quote_id?: string;
  quote_number?: string;
  approved_quote_id?: string;  // tracks which quote the client approved; separate from quote_id
  deposit_request_id?: string;
  deposit_request_number?: string;
  // Set when stage moves to "Closed Lost"; cleared on move back to an active stage.
  lostReason?: string;
  // Archived leads stay in the data store but are hidden from the active board and
  // active-pipeline rollups. Delete is still the hard-remove path; archive is reversible.
  archived?: boolean;
  archivedAt?: string;
  // Lifecycle timestamps (additive; null on legacy records = "unknown", never backfilled).
  // created_at + stage_changed_at are stamped at creation (initial stage counts as a
  // stage-set); stage_changed_at re-stamps on every stage change; last_activity_at on
  // every meaningful write. All written centrally via saveLead() on the client and
  // inline on the server/Jarvis stage-write routes.
  created_at?: string;
  stage_changed_at?: string;
  last_activity_at?: string;
  // Per-action dismiss/snooze (shape only this phase; nothing writes it yet). Keyed by an
  // action key so one lead can dismiss one pending action without silencing the others.
  // until=null => dismissed permanently ("decided not to"); a date => snooze until then.
  dismissed_actions?: Record<string, { until: string | null; at: string; by: string; reason?: string }>;
  // Notes as separate pinnable entries. notes_list is the source of truth; `notes`
  // (above) is a regenerated flat mirror; notes_original is the write-once, never-read
  // undo capturing the pre-migration `notes` verbatim.
  notes_list?: NoteEntry[];
  notes_original?: string;
};

export const LOST_REASONS = [
  "Not interested",
  "Ghosted / no response",
  "Price / budget",
  "Went with competitor",
  "Bad timing",
  "Not a fit",
  "Other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export type QuestionnaireFileCategory = "logo" | "inspiration" | "pdf" | "mockup" | "other";

export type QuestionnaireFile = {
  id: string;
  name: string;
  path: string;
  size: number;
  mime_type: string;
  category: QuestionnaireFileCategory;
  visible_to_client: boolean;
  uploaded_at: string;
};

export type QuoteItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalUnitPrice?: number;
};

export type DuplicateMatchType = "likely_existing" | "possible_duplicate";

export type DuplicateMatch = {
  matchType: DuplicateMatchType;
  clientName: string;
  clientId: string;
};

export type QuestionnaireSubmissionStatus =
  | "pending"
  | "linked_to_lead"
  | "linked_to_order"
  | "flagged_for_review"
  | "dismissed";

export type QuestionnaireSubmission = {
  id: string;
  status: QuestionnaireSubmissionStatus;
  // Contact info
  company: string;
  contact: string;
  email: string;
  phone: string;
  // Questionnaire fields
  company_type?: string;
  company_description?: string;
  contact_title?: string;
  contact_method?: string;
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
  // Links — set after routing decision
  linked_lead_id?: string;
  linked_order_id?: string;
  linked_client_id?: string;
  created_at?: string;
};
