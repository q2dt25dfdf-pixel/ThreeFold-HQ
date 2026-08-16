import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { getSupabaseAdmin } from "./supabase-admin";

const INTAKE_BUCKET = "intake-files";
const DESIGNS_BUCKET = "order-designs";
// Private, HQ-only. Production-cost receipts. Deliberately separate from order-designs
// (whose URLs reach the client portal) and intake-files (client questionnaire uploads),
// so receipts can never be surfaced through any client route.
const RECEIPTS_BUCKET = "order-receipts";
// Private, HQ-only, same posture as order-receipts. Shipping-label PDFs bought via
// EasyPost — our permanent copy (EasyPost deletes its label_url after ~180 days).
const LABELS_BUCKET = "shipping-labels";

async function _getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number,
  client: SupabaseClient = supabase,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    console.error(`getSignedUrl [${bucket}] error:`, error?.message ?? "no URL returned");
    return null;
  }

  return data.signedUrl;
}

async function _getSignedUrls(
  bucket: string,
  paths: string[],
  expiresInSeconds: number,
  client: SupabaseClient = supabase,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) {
    console.error(`getSignedUrls [${bucket}] error:`, error?.message ?? "no data returned");
    return {};
  }

  return Object.fromEntries(
    data.flatMap((entry, index) => (
      entry.signedUrl ? [[entry.path || paths[index], entry.signedUrl] as const] : []
    )),
  );
}

// ── intake-files (existing — unchanged callers) ───────────────────────────────

export async function getSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  return _getSignedUrl(INTAKE_BUCKET, path, expiresInSeconds);
}

export async function getSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  return _getSignedUrls(INTAKE_BUCKET, paths, expiresInSeconds);
}

// ── order-designs ─────────────────────────────────────────────────────────────

export async function getDesignSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  return _getSignedUrl(DESIGNS_BUCKET, path, expiresInSeconds);
}

export async function getDesignSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  return _getSignedUrls(DESIGNS_BUCKET, paths, expiresInSeconds);
}

// ── order-receipts (private, HQ-only) ─────────────────────────────────────────

// Receipts mint their signed URLs with the SERVICE-ROLE client (server-only), so no
// `anon` SELECT policy is needed on order-receipts — the bucket stays strictly private.
// The only caller is the auth-gated /api/internal/receipt-signed-urls route.
export async function getReceiptSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  return _getSignedUrl(RECEIPTS_BUCKET, path, expiresInSeconds, getSupabaseAdmin());
}

export async function getReceiptSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  return _getSignedUrls(RECEIPTS_BUCKET, paths, expiresInSeconds, getSupabaseAdmin());
}

// ── shipping-labels (private, HQ-only) ────────────────────────────────────────

// Service-role only, like receipts — no anon policy exists on the bucket. Callers
// are the auth-gated label routes under /api/shop-orders/[id]/label/*.
export async function getLabelSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  return _getSignedUrl(LABELS_BUCKET, path, expiresInSeconds, getSupabaseAdmin());
}
