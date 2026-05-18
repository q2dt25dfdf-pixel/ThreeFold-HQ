export const pipelineStages = [
  "New Lead",
  "Contacted",
  "Quote Sent",
  "Approved",
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
  // Website questionnaire fields
  contact_title?: string;
  contact_method?: string;
  company_description?: string;
  quantity?: string;
  target_date?: string;
  budget?: string;
  apparel_types?: string;
  audience?: string;
  station_code?: string;
  meaning?: string;
  style?: string;
  colors?: string;
};
