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

export const VENDOR_PRODUCT_CATEGORIES = [
  "T-Shirts",
  "Hats",
  "Tumblers",
  "Socks",
  "Embroidery",
  "Screen Print",
  "DTF",
  "Promotional Products",
  "Other",
] as const;
export type VendorProductCategory = (typeof VENDOR_PRODUCT_CATEGORIES)[number];

export const VENDOR_SAMPLE_STATUSES = [
  "Not Requested",
  "Requested",
  "Ordered",
  "Received",
  "Approved",
  "Rejected",
] as const;
export type VendorSampleStatus = (typeof VENDOR_SAMPLE_STATUSES)[number];
