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

/** Order statuses that are considered inactive / complete for dashboard filtering. */
export const INACTIVE_ORDER_STATUSES = new Set([
  "delivered",
  "cancelled",
  "fulfilled",
  "completed",
  "done",
]);

/** Invoice statuses excluded from outstanding-balance calculations. */
export const INACTIVE_FINANCE_STATUSES = new Set([
  "draft",
  "cancelled",
]);

/** Task status strings (lowercased) that mean the task is done. */
export const TASK_DONE_STATUSES = new Set([
  "done",
  "complete",
  "completed",
]);
