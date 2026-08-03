import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  type Transaction,
} from "plaid";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// ── Server-only Plaid client ─────────────────────────────────────────────────
// This module must NEVER be imported by client code. It reads PLAID_CLIENT_ID /
// PLAID_SECRET (SUPABASE_SERVICE_ROLE_KEY tier — server env only, not NEXT_PUBLIC)
// and talks to Plaid on behalf of the single Relay connection.
//
// SCOPE FENCE: read-only forever. We request the Transactions product ONLY — never
// auth, identity, transfer, or payment. See PLAID_PRODUCTS below.

export const PLAID_ENV = (process.env.PLAID_ENV ?? "sandbox").toLowerCase();

// Transactions product ONLY. Do not add to this array — any other product would
// breach the read-only scope fence and require an explicit product-scope decision.
export const PLAID_PRODUCTS = ["transactions"] as const;
export const PLAID_COUNTRY_CODES = ["US"] as const;

let _client: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (_client) return _client;
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID / PLAID_SECRET are not configured");
  }
  const basePath = PlaidEnvironments[PLAID_ENV] ?? PlaidEnvironments.sandbox;
  const config = new Configuration({
    basePath,
    baseOptions: {
      headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret },
    },
  });
  _client = new PlaidApi(config);
  return _client;
}

// ── Connection row (server-only secrets) ─────────────────────────────────────
// The single Relay item lives in plaid_connection under id 'relay'. Holds the
// access_token + sync cursor — never exposed to the browser.
export const PLAID_CONNECTION_ID = "relay";

export type PlaidConnection = {
  access_token: string;
  item_id: string;
  cursor?: string | null;
  institution?: string;
  account_mask?: string;
  env?: string;
  status?: "connected" | "login_required" | "disconnected";
  last_synced_at?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function loadConnection(): Promise<PlaidConnection | null> {
  const db = getSupabaseAdmin();
  const { data: rows } = await db
    .from("plaid_connection")
    .select("id, data")
    .eq("id", PLAID_CONNECTION_ID)
    .limit(1);
  return rows && rows.length ? (rows[0].data as PlaidConnection) : null;
}

export async function saveConnection(conn: PlaidConnection): Promise<void> {
  const db = getSupabaseAdmin();
  const updated = { ...conn, updated_at: new Date().toISOString() };
  await db
    .from("plaid_connection")
    .upsert({ id: PLAID_CONNECTION_ID, data: updated });
}

// A safe, browser-facing view of the connection — NEVER includes the token/cursor.
export type PlaidConnectionStatus = {
  connected: boolean;
  status: "connected" | "login_required" | "disconnected" | "not_connected";
  institution?: string;
  account_mask?: string;
  env?: string;
  last_synced_at?: string | null;
  last_error?: string | null;
};

export function publicStatus(conn: PlaidConnection | null): PlaidConnectionStatus {
  if (!conn) return { connected: false, status: "not_connected", env: PLAID_ENV };
  return {
    connected: conn.status === "connected",
    status: conn.status ?? "disconnected",
    institution: conn.institution,
    account_mask: conn.account_mask,
    env: conn.env ?? PLAID_ENV,
    last_synced_at: conn.last_synced_at ?? null,
    last_error: conn.last_error ?? null,
  };
}

// Plaid amount → cents. Plaid convention: positive amount = money LEAVING the
// account (an expense candidate); negative = money IN (deposit/income/refund).
export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

export type PlaidTxn = Transaction;
