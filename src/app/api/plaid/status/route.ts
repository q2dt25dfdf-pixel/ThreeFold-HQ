import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { loadConnection, publicStatus } from "@/lib/plaid";
import { findDuplicateExpense, type StagedTxn } from "@/lib/plaidClassify";

// GET /api/plaid/status  (session-gated)
// Returns the browser-safe connection status + the staged transactions for the
// review UI. NEVER returns the access_token or cursor. Each unreviewed outflow is
// annotated with possible_duplicate (an existing expense it may double-count).
//
// Query: ?filter=unreviewed|filed|dismissed|all  (default: unreviewed)
type DupExpense = { id: string; vendor_name: string; amount_cents: number; expense_date: string };

export async function GET(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "unreviewed";
  const db = getSupabaseAdmin();

  const [conn, txnRows, expenseRows] = await Promise.all([
    loadConnection(),
    db.from("plaid_transactions").select("id, data"),
    db.from("expenses").select("id, data"),
  ]);

  const all = ((txnRows.data ?? []) as { id: string; data: StagedTxn }[])
    .map((r) => r.data)
    .filter(Boolean);

  const expenses: DupExpense[] = ((expenseRows.data ?? []) as { id: string; data: DupExpense }[])
    .map((r) => r.data)
    .filter((e) => e && typeof e.amount_cents === "number");

  const unreviewedCount = all.filter((t) => t.status === "unreviewed").length;

  const visible = all
    .filter((t) => (filter === "all" ? true : t.status === filter))
    // Newest first by transaction date, then first-seen.
    .sort((a, b) => (b.txn_date || "").localeCompare(a.txn_date || "") || (b.created_at || "").localeCompare(a.created_at || ""))
    .map((t) => {
      const dup = t.status === "unreviewed" && t.direction === "out"
        ? findDuplicateExpense(t, expenses)
        : null;
      return {
        ...t,
        possible_duplicate: dup ? { id: dup.id, vendor_name: dup.vendor_name, expense_date: dup.expense_date } : null,
      };
    });

  return NextResponse.json(
    { connection: publicStatus(conn), unreviewedCount, transactions: visible },
    { headers: { "Cache-Control": "no-store" } },
  );
}
