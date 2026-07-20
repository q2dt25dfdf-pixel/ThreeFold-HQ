// Shared shape for an invoice's activity timeline. Mirrors the CRM lead's
// CommunicationEntry (components/crm/types.ts) but for the finances row, with a
// full ISO timestamp (time-of-day) instead of the lead's date-only string.
//
// Lives in lib/ so BOTH the client (finances/page.tsx) and the Stripe webhook
// (api/stripe/webhook — Pass 2) can import the same type. The finances row stores
// these newest-first in data.activity_log.

export type InvoiceActivityType = "payment" | "send" | "status" | "edit" | "note";

export interface InvoiceActivityEntry {
  id: string;
  type: InvoiceActivityType;
  title: string; // e.g. "Final invoice sent", "Deposit received", "Note"
  detail?: string; // secondary line: amount+method, or "TF-I-… · to email", or note text
  at: string; // full ISO timestamp (we want time-of-day, unlike the lead's date-only)
  author?: string; // "Alliyah"/"Hannah"/"Jordan" for founder actions; "system" for webhook; undefined for old events
}

// Pure, newest-first prepend — mirrors the lead's [entry, ...history] convention.
// Returns a NEW invoice object; never mutates. Used in Pass 2 (auto-logging); defined
// now so the shape is settled. `T` is loosely constrained so it accepts the finances
// Invoice type and the webhook's raw row alike.
export function appendInvoiceActivity<T extends { activity_log?: InvoiceActivityEntry[] }>(
  invoice: T,
  entry: InvoiceActivityEntry,
): T {
  return { ...invoice, activity_log: [entry, ...(invoice.activity_log ?? [])] };
}
