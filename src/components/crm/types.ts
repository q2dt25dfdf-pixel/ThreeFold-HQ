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
