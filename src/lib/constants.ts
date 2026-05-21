export const FOUNDERS = ["Alliyah", "Hannah", "Jordan"] as const;
export type Founder = (typeof FOUNDERS)[number];

export type InvoiceStatus =
  | "Draft"
  | "Sent"
  | "Deposit Due"
  | "Deposit Paid"
  | "In Progress"
  | "Final Payment Due"
  | "Paid in Full"
  | "Overdue"
  | "Cancelled";

export const INVOICE_STATUS_OPTIONS: InvoiceStatus[] = [
  "Draft",
  "Sent",
  "Deposit Due",
  "Deposit Paid",
  "In Progress",
  "Final Payment Due",
  "Paid in Full",
  "Overdue",
  "Cancelled",
];
