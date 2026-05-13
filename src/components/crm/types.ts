export const pipelineStages = [
  "New Lead",
  "Contacted",
  "Quote Sent",
  "Approved",
  "In Production",
  "Completed",
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
  location: string;
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
  value: string;
  notes: string;
  owner: string;
  stage: PipelineStage;
  followUpDate: string;
  status: LeadStatus;
  communicationHistory: CommunicationEntry[];
};
