import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import {
  validateAllocations,
  reconcileExpenseCostLines,
  type ExpenseAllocation,
  type OrderRow,
} from "@/lib/expenseAllocations";

// POST /api/expenses/save  (session-gated)
// The single write path for expenses so split allocations and their generated
// order cost_lines stay consistent and the sum rule is enforced server-side.
//
// Body:
//   { action: "save", expense: { id, expense_date, vendor_name, category,
//       amount_cents, paid_by, payment_status, reimbursement_status, notes?,
//       receipt_url?, allocations?, created_at? } }
//   { action: "delete", id }
//
// On save: validate → upsert the expense → reconcile this expense's generated
// cost_lines across every order (add/replace on targeted orders, remove on
// dropped/unsplit). On delete: strip the generated cost_lines everywhere, then
// delete the expense.

type ExpensePayload = {
  id?: string;
  expense_date?: string;
  vendor_name?: string;
  category?: string;
  amount_cents?: number;
  paid_by?: string;
  payment_status?: "paid" | "unpaid";
  reimbursement_status?: string;
  notes?: string;
  receipt_url?: string;
  allocations?: ExpenseAllocation[];
  created_at?: string;
  updated_at?: string;
};

async function applyOrderReconcile(
  db: ReturnType<typeof getSupabaseAdmin>,
  expense: { id: string; amount_cents?: number; category?: string; vendor_name?: string; paid_by?: string; payment_status?: string },
  allocations: ExpenseAllocation[] | undefined,
): Promise<{ error?: string }> {
  const { data: orderRows, error } = await db.from("orders").select("id, data");
  if (error) return { error: error.message };
  const orders = ((orderRows ?? []) as { id: string; data: OrderRow["data"] }[]).map((r) => ({
    id: r.id,
    data: r.data ?? {},
  }));
  const changed = reconcileExpenseCostLines(orders, expense, allocations);
  for (const o of changed) {
    const { error: upErr } = await db.from("orders").update({ data: o.data }).eq("id", o.id);
    if (upErr) return { error: upErr.message };
  }
  return {};
}

export async function POST(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  let body: { action?: string; expense?: ExpensePayload; id?: string };
  try { body = await request.json(); } catch { body = {}; }

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (body.action === "delete") {
    const id = body.id;
    if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
    // Strip generated cost_lines from every order first, then delete the row.
    const r = await applyOrderReconcile(db, { id }, undefined);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });
    const { error } = await db.from("expenses").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── SAVE (create or update) ────────────────────────────────────────────────
  if (body.action === "save") {
    const e = body.expense;
    if (!e) return NextResponse.json({ error: "expense is required." }, { status: 400 });
    if (!e.expense_date) return NextResponse.json({ error: "Date is required." }, { status: 400 });
    if (!e.vendor_name?.trim()) return NextResponse.json({ error: "Vendor / source is required." }, { status: 400 });
    if (!e.category) return NextResponse.json({ error: "Category is required." }, { status: 400 });
    if (!Number.isInteger(e.amount_cents) || (e.amount_cents ?? 0) <= 0) {
      return NextResponse.json({ error: "Amount must be greater than $0." }, { status: 400 });
    }
    if (!e.paid_by) return NextResponse.json({ error: "Paid by is required." }, { status: 400 });

    // The sum rule — same check the client runs, enforced here as the authority.
    const allocations = e.allocations && e.allocations.length ? e.allocations : undefined;
    const check = validateAllocations(e.amount_cents as number, allocations);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const id = e.id || `expense-${Date.now()}`;
    const expense = {
      id,
      expense_date: e.expense_date,
      vendor_name: e.vendor_name.trim(),
      category: e.category,
      amount_cents: e.amount_cents as number,
      paid_by: e.paid_by,
      payment_status: e.payment_status ?? "unpaid",
      reimbursement_status: e.reimbursement_status ?? "not_needed",
      notes: e.notes ?? "",
      receipt_url: e.receipt_url ?? "",
      ...(allocations ? { allocations } : {}),
      created_at: e.created_at ?? now,
      updated_at: now,
    };

    const { error: upErr } = await db.from("expenses").upsert({ id, data: expense });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const r = await applyOrderReconcile(db, expense, allocations);
    if (r.error) return NextResponse.json({ error: r.error }, { status: 500 });

    return NextResponse.json({ ok: true, id });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
