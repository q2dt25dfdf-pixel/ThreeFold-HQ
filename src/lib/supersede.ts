import type { SupabaseClient } from "@supabase/supabase-js";

// Quote-revision supersede/void helpers. Isomorphic: the caller passes a Supabase
// client, so these run server-side (getSupabaseAdmin) from the API routes AND
// client-side (the anon `supabase`) from the CRM send handler. Additive only —
// records that never hit these paths keep no superseded_by / voided_at fields.

export type VoidDepositResult =
  | { outcome: "voided"; depositNumber: string | null }
  | { outcome: "blocked"; depositNumber: string | null; status: string }
  | { outcome: "none" };

// STEP 2 — void the lead's existing deposit request when its quote is revised.
// HARD GUARD: never void a deposit whose status is 'paid' or 'pending' (in-flight);
// that is a refund/credit situation, not a stale-deposit one. Idempotent.
export async function voidDepositOnRevision(
  db: SupabaseClient,
  depositRequestId: string | null | undefined,
): Promise<VoidDepositResult> {
  if (!depositRequestId) return { outcome: "none" };

  const { data: rows } = await db
    .from("deposit_requests")
    .select("id,data")
    .eq("id", depositRequestId)
    .limit(1);
  if (!rows || rows.length === 0) return { outcome: "none" };

  const data = rows[0].data as Record<string, unknown>;
  const status = (data.status as string) ?? "";
  const depositNumber = (data.deposit_request_number as string) ?? null;

  if (status === "paid" || status === "pending") {
    return { outcome: "blocked", depositNumber, status };
  }
  // Already voided — idempotent no-op.
  if (data.voided_at) return { outcome: "voided", depositNumber };

  await db
    .from("deposit_requests")
    .update({ data: { ...data, voided_at: new Date().toISOString(), voided_reason: "quote_revised" } })
    .eq("id", depositRequestId);

  return { outcome: "voided", depositNumber };
}

// Send-time supersede: mark the PREVIOUS quote superseded by the new one. Runs only
// when a replacement is actually sent (so a preview-then-bail never lies to the client).
// Idempotent; no-op when there is no previous quote or it equals the new one.
export async function markQuoteSuperseded(
  db: SupabaseClient,
  previousQuoteId: string | null | undefined,
  newQuoteId: string,
): Promise<void> {
  if (!previousQuoteId || previousQuoteId === newQuoteId) return;

  const { data: rows } = await db
    .from("quotes")
    .select("id,data")
    .eq("id", previousQuoteId)
    .limit(1);
  if (!rows || rows.length === 0) return;

  const data = rows[0].data as Record<string, unknown>;
  if (data.superseded_by) return; // already superseded

  await db
    .from("quotes")
    .update({ data: { ...data, superseded_by: newQuoteId, superseded_at: new Date().toISOString() } })
    .eq("id", previousQuoteId);
}
