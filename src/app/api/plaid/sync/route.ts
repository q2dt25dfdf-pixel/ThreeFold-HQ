import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import {
  getPlaidClient,
  loadConnection,
  saveConnection,
  type PlaidConnection,
} from "@/lib/plaid";
import { mapPlaidTxn, seedAutoDismiss, type StagedTxn } from "@/lib/plaidClassify";
import type { Transaction, RemovedTransaction, AccountBase } from "plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET/POST /api/plaid/sync
// Pulls new/updated/removed Relay transactions via Plaid's /transactions/sync
// cursor API and upserts them into plaid_transactions as UNREVIEWED (or seed-
// auto-dismissed). Idempotent: re-running with the same cursor is a no-op.
//
// AUTH — accepts EITHER:
//   • the Vercel Cron secret  (Authorization: Bearer $CRON_SECRET), or
//   • a valid founder session (the "Sync now" button on Finances).
async function authorize(request: Request): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && header === `Bearer ${cronSecret}`) return true;
  const session = await validateSessionRequest(request);
  return session.ok;
}

function accountMap(accounts: AccountBase[]): Record<string, { name: string; mask: string }> {
  const m: Record<string, { name: string; mask: string }> = {};
  for (const a of accounts) {
    m[a.account_id] = { name: a.name || a.official_name || "Account", mask: a.mask || "" };
  }
  return m;
}

async function runSync(): Promise<{ added: number; modified: number; removed: number; auto_dismissed: number }> {
  const conn = await loadConnection();
  if (!conn?.access_token) throw new Error("No Plaid connection.");

  const client = getPlaidClient();
  const db = getSupabaseAdmin();

  let cursor = conn.cursor ?? undefined;
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];
  const accounts: Record<string, { name: string; mask: string }> = {};

  // Page through until Plaid reports no more updates.
  let hasMore = true;
  while (hasMore) {
    const res = await client.transactionsSync({
      access_token: conn.access_token,
      cursor,
      count: 500,
    });
    const d = res.data;
    Object.assign(accounts, accountMap(d.accounts));
    added.push(...d.added);
    modified.push(...d.modified);
    removed.push(...d.removed);
    cursor = d.next_cursor;
    hasMore = d.has_more;
  }

  const now = new Date().toISOString();

  // Load existing rows for the touched ids so we preserve founder review decisions.
  const touchedIds = [...new Set([...added, ...modified].map((t) => t.transaction_id))];
  const existingById: Record<string, StagedTxn> = {};
  if (touchedIds.length) {
    const { data } = await db.from("plaid_transactions").select("id, data").in("id", touchedIds);
    for (const r of (data ?? []) as { id: string; data: StagedTxn }[]) existingById[r.id] = r.data;
  }

  let autoDismissedCount = 0;
  const upserts: { id: string; data: StagedTxn }[] = [];

  for (const t of [...added, ...modified]) {
    const acct = accounts[t.account_id] ?? { name: "Account", mask: "" };
    const base = mapPlaidTxn(t, acct, now);
    const prior = existingById[t.transaction_id];

    if (prior && prior.status !== "unreviewed") {
      // Founder already filed/dismissed this — refresh display fields, keep decision.
      upserts.push({ id: t.transaction_id, data: { ...prior, ...base, status: prior.status, auto_dismissed: prior.auto_dismissed, dismiss_reason: prior.dismiss_reason, filed_expense_id: prior.filed_expense_id, reviewed_by: prior.reviewed_by, reviewed_at: prior.reviewed_at, created_at: prior.created_at } });
      continue;
    }

    // New, or still unreviewed → (re)apply seed auto-dismiss rules.
    const verdict = seedAutoDismiss(base);
    if (verdict.dismissed) autoDismissedCount++;
    upserts.push({
      id: t.transaction_id,
      data: {
        ...base,
        created_at: prior?.created_at ?? now,
        status: verdict.dismissed ? "dismissed" : "unreviewed",
        auto_dismissed: verdict.dismissed,
        dismiss_reason: verdict.reason,
      },
    });
  }

  if (upserts.length) await db.from("plaid_transactions").upsert(upserts);

  // Mark removed transactions (keep the row; never silently delete).
  for (const r of removed) {
    const id = r.transaction_id;
    const { data } = await db.from("plaid_transactions").select("id, data").eq("id", id).limit(1);
    const prior = data && data.length ? (data[0].data as StagedTxn) : null;
    if (prior) {
      await db.from("plaid_transactions").update({ data: { ...prior, status: "removed", updated_at: now } }).eq("id", id);
    }
  }

  // Persist the new cursor + sync status. Cursor advance is what makes this safe to re-run.
  const nextConn: PlaidConnection = { ...conn, cursor, status: "connected", last_synced_at: now, last_error: null };
  await saveConnection(nextConn);

  return { added: added.length, modified: modified.length, removed: removed.length, auto_dismissed: autoDismissedCount };
}

async function handle(request: Request) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Detect Plaid re-auth requirement and surface it on the connection status.
    const code = (err as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
    if (code === "ITEM_LOGIN_REQUIRED") {
      const conn = await loadConnection();
      if (conn) await saveConnection({ ...conn, status: "login_required", last_error: code });
      return NextResponse.json({ error: "Relay needs to be reconnected.", code }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: msg, code: code ?? null }, { status: 502 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
