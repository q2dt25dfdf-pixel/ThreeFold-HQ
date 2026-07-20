// Shared shape for an invoice's activity timeline. Mirrors the CRM lead's
// CommunicationEntry (components/crm/types.ts) but for the finances row, with a
// full ISO timestamp (time-of-day) instead of the lead's date-only string.
//
// Lives in lib/ so BOTH the client (finances/page.tsx) and the Stripe webhook
// (api/stripe/webhook — Pass 2) can import the same type. The finances row stores
// these newest-first in data.activity_log.

import type { SupabaseClient } from "@supabase/supabase-js";

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
// Returns a NEW invoice object; never mutates. NOTE: as of the atomic-append refactor,
// activity_log entries are AUTHORED only by appendInvoiceActivityRpc (below). This pure
// helper is retained for tests/shape reference and is no longer used to write entries.
export function appendInvoiceActivity<T extends { activity_log?: InvoiceActivityEntry[] }>(
  invoice: T,
  entry: InvoiceActivityEntry,
): T {
  return { ...invoice, activity_log: [entry, ...(invoice.activity_log ?? [])] };
}

// ATOMIC append — the SOLE writer of activity_log entries. Calls the Postgres RPC
// append_invoice_activity (supabase/invoice-activity-append.sql), which prepends the entry
// to data->'activity_log' in one UPDATE statement. Because the read+write happens inside a
// single statement, it can never clobber a concurrent writer (founder save vs Stripe webhook).
// Works with any Supabase client: the browser client (client-side handlers) or the
// service-role admin client (Stripe webhook). Returns whether the append succeeded; logs on
// failure rather than throwing, so a logging hiccup never breaks the payment/send flow.
export async function appendInvoiceActivityRpc(
  client: SupabaseClient,
  invoiceId: string,
  entry: InvoiceActivityEntry,
): Promise<boolean> {
  const { error } = await client.rpc("append_invoice_activity", { p_id: invoiceId, p_entry: [entry] });
  if (error) {
    console.error("[appendInvoiceActivityRpc]", invoiceId, error.message);
    return false;
  }
  return true;
}

// ATOMIC delete of ONE entry (by id) via the delete_invoice_activity RPC — single-statement,
// order-preserving, no-ops if the id isn't found. Used only for manual note entries. Logs on
// failure rather than throwing.
export async function deleteInvoiceActivityRpc(
  client: SupabaseClient,
  invoiceId: string,
  entryId: string,
): Promise<boolean> {
  const { error } = await client.rpc("delete_invoice_activity", { p_id: invoiceId, p_entry_id: entryId });
  if (error) {
    console.error("[deleteInvoiceActivityRpc]", invoiceId, entryId, error.message);
    return false;
  }
  return true;
}

// ATOMIC edit of ONE entry's detail text (by id) via the edit_invoice_activity RPC —
// single-statement; author/date/type/title stay untouched. Used only for manual note bodies.
export async function editInvoiceActivityRpc(
  client: SupabaseClient,
  invoiceId: string,
  entryId: string,
  detail: string,
): Promise<boolean> {
  const { error } = await client.rpc("edit_invoice_activity", { p_id: invoiceId, p_entry_id: entryId, p_detail: detail });
  if (error) {
    console.error("[editInvoiceActivityRpc]", invoiceId, entryId, error.message);
    return false;
  }
  return true;
}
