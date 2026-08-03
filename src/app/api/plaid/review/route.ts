import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { findDuplicateExpense, type StagedTxn } from "@/lib/plaidClassify";

// POST /api/plaid/review  (session-gated)
// Founder actions on a staged transaction. All writes are server-side (service
// role) so filing an expense + flipping the staged row happen together.
//
// Body (discriminated by `action`):
//   { action: "file", id, category, paid_by, reimbursement_status?, notes?,
//     reviewed_by, confirm_duplicate? }
//   { action: "dismiss", id, reason?, reviewed_by }
//   { action: "undismiss", id }
type DupExpense = { id: string; vendor_name: string; amount_cents: number; expense_date: string };

async function loadStaged(db: ReturnType<typeof getSupabaseAdmin>, id: string): Promise<StagedTxn | null> {
  const { data } = await db.from("plaid_transactions").select("id, data").eq("id", id).limit(1);
  return data && data.length ? (data[0].data as StagedTxn) : null;
}

export async function POST(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  let body: {
    action?: string; id?: string; category?: string; paid_by?: string;
    reimbursement_status?: string; notes?: string; reviewed_by?: string;
    confirm_duplicate?: boolean; reason?: string;
  };
  try { body = await request.json(); } catch { body = {}; }

  const { action, id } = body;
  if (!action || !id) return NextResponse.json({ error: "action and id are required." }, { status: 400 });

  const db = getSupabaseAdmin();
  const staged = await loadStaged(db, id);
  if (!staged) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  const now = new Date().toISOString();

  if (action === "file") {
    if (staged.direction !== "out") {
      return NextResponse.json({ error: "Only outflows can be filed as an expense." }, { status: 400 });
    }
    if (!body.category || !body.paid_by) {
      return NextResponse.json({ error: "category and paid_by are required to file." }, { status: 400 });
    }

    // Duplicate guard — surface a match unless the founder confirmed to proceed.
    if (!body.confirm_duplicate) {
      const { data: expenseRows } = await db.from("expenses").select("id, data");
      const expenses: DupExpense[] = ((expenseRows ?? []) as { id: string; data: DupExpense }[])
        .map((r) => r.data)
        .filter((e) => e && typeof e.amount_cents === "number");
      const dup = findDuplicateExpense(staged, expenses);
      if (dup) {
        return NextResponse.json({
          needsConfirm: true,
          duplicate: { id: dup.id, vendor_name: dup.vendor_name, expense_date: dup.expense_date, amount_cents: dup.amount_cents },
        });
      }
    }

    // Create the expense (matches the finances page Expense shape exactly).
    const expenseId = `expense-${Date.now()}`;
    const expense = {
      id: expenseId,
      expense_date: staged.txn_date,
      vendor_name: staged.merchant_name,
      category: body.category,
      amount_cents: staged.amount_cents,
      paid_by: body.paid_by,
      payment_status: "paid" as const, // already cleared the Relay account
      reimbursement_status: (body.reimbursement_status ?? "not_needed"),
      notes: body.notes?.trim() || `Relay ••${staged.account_mask || "----"}`,
      related_order_id: "",
      receipt_url: "",
      created_at: now,
      updated_at: now,
    };
    const { error: expErr } = await db.from("expenses").upsert({ id: expenseId, data: expense });
    if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });

    const updated: StagedTxn = { ...staged, status: "filed", auto_dismissed: false, dismiss_reason: undefined, filed_expense_id: expenseId, reviewed_by: body.reviewed_by, reviewed_at: now, updated_at: now };
    const { error } = await db.from("plaid_transactions").update({ data: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, filed_expense_id: expenseId });
  }

  if (action === "dismiss") {
    const updated: StagedTxn = { ...staged, status: "dismissed", auto_dismissed: false, dismiss_reason: body.reason?.trim() || "Not an expense", reviewed_by: body.reviewed_by, reviewed_at: now, updated_at: now };
    const { error } = await db.from("plaid_transactions").update({ data: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "undismiss") {
    const updated: StagedTxn = { ...staged, status: "unreviewed", auto_dismissed: false, dismiss_reason: undefined, reviewed_by: undefined, reviewed_at: undefined, updated_at: now };
    const { error } = await db.from("plaid_transactions").update({ data: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
