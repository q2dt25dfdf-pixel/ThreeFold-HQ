import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { findDuplicateExpense, type StagedTxn } from "@/lib/plaidClassify";
import {
  deriveCostRollup,
  findDuplicateOrderCost,
  type CostLine,
  type OrderForDedupe,
} from "@/lib/orderCosts";

// POST /api/plaid/review  (session-gated)
// Founder actions on a staged transaction. All writes are server-side (service
// role) so filing + flipping the staged row happen together.
//
// Body (discriminated by `action`):
//   { action: "file", target?: "expense" | "order_cost", id, reviewed_by,
//     confirm_duplicate?,
//     // target "expense":    category, paid_by, reimbursement_status?, notes?
//     // target "order_cost": order_id, label, supplier?, paid_by? }
//   { action: "dismiss", id, reason?, reviewed_by }
//   { action: "undismiss", id }
type DupExpense = { id: string; vendor_name: string; amount_cents: number; expense_date: string };

async function loadStaged(db: ReturnType<typeof getSupabaseAdmin>, id: string): Promise<StagedTxn | null> {
  const { data } = await db.from("plaid_transactions").select("id, data").eq("id", id).limit(1);
  return data && data.length ? (data[0].data as StagedTxn) : null;
}

// Cross-mode duplicate scan: a Plaid outflow can double-book against either an
// existing expense OR a cost line already hand-entered on an order. Return the
// first match (whichever kind) so the review UI can warn before committing.
type DupMatch =
  | { kind: "expense"; vendor_name: string; expense_date: string; amount_cents: number }
  | { kind: "order_cost"; order_id: string; order_name: string; label: string; amount_cents: number };

async function findDuplicate(
  db: ReturnType<typeof getSupabaseAdmin>,
  staged: StagedTxn,
): Promise<DupMatch | null> {
  const [expenseRows, orderRows] = await Promise.all([
    db.from("expenses").select("id, data"),
    db.from("orders").select("id, data"),
  ]);

  // Exclude this txn's OWN prior filings so re-filing never flags itself.
  const selfCostLineId = `cost-plaid-${staged.id}`;
  const expenses: DupExpense[] = ((expenseRows.data ?? []) as { id: string; data: DupExpense }[])
    .map((r) => r.data)
    .filter((e) => e && typeof e.amount_cents === "number" && e.id !== staged.filed_expense_id);
  const expDup = findDuplicateExpense(staged, expenses);
  if (expDup) return { kind: "expense", vendor_name: expDup.vendor_name, expense_date: expDup.expense_date, amount_cents: expDup.amount_cents };

  const orders: OrderForDedupe[] = ((orderRows.data ?? []) as { id: string; data: OrderForDedupe }[])
    .map((r) => {
      const o = { ...r.data, id: r.data?.id ?? "" };
      if (Array.isArray(o.cost_lines)) o.cost_lines = o.cost_lines.filter((l) => l.id !== selfCostLineId);
      return o;
    })
    .filter((o) => o.id);
  const costDup = findDuplicateOrderCost(staged, orders);
  if (costDup) return { kind: "order_cost", ...costDup };

  return null;
}

// Move-not-duplicate: reverse whatever this staged txn was previously filed as,
// so a re-file (or a dismiss after filing) can never leave a stale ledger entry.
// Idempotent — safe to call when nothing was filed.
async function unfilePrior(
  db: ReturnType<typeof getSupabaseAdmin>,
  staged: StagedTxn,
): Promise<{ error?: string }> {
  // Prior EXPENSE filing → delete the expenses row.
  if (staged.filed_expense_id) {
    const { error } = await db.from("expenses").delete().eq("id", staged.filed_expense_id);
    if (error) return { error: error.message };
  }

  // Prior ORDER-COST filing → strip the generated cost_line and recompute rollup.
  if (staged.filed_order_id && staged.filed_cost_line_id) {
    const { data: orderRows } = await db.from("orders").select("id, data").eq("id", staged.filed_order_id).limit(1);
    if (orderRows && orderRows.length) {
      const order = orderRows[0].data as { cost_lines?: CostLine[] } & Record<string, unknown>;
      const existing = Array.isArray(order.cost_lines) ? order.cost_lines : [];
      const lines = existing.filter((l) => l.id !== staged.filed_cost_line_id);
      if (lines.length !== existing.length) {
        const rollup = deriveCostRollup(lines);
        const updatedOrder = {
          ...order,
          cost_lines: lines,
          vendor_cost_cents: rollup.vendor_cost_cents,
          vendor_invoice_status: rollup.vendor_invoice_status,
          vendor_payment_status: rollup.vendor_payment_status,
          vendor_paid_by: lines.find((l) => l.paid_by)?.paid_by ?? "",
        };
        const { error } = await db.from("orders").update({ data: updatedOrder }).eq("id", staged.filed_order_id);
        if (error) return { error: error.message };
      }
    }
  }

  return {};
}

export async function POST(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  let body: {
    action?: string; target?: string; id?: string; category?: string; paid_by?: string;
    reimbursement_status?: string; notes?: string; reviewed_by?: string;
    confirm_duplicate?: boolean; reason?: string;
    order_id?: string; label?: string; supplier?: string;
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
      return NextResponse.json({ error: "Only outflows can be filed." }, { status: 400 });
    }
    const target = body.target === "order_cost" ? "order_cost" : "expense";

    // Duplicate guard (both modes) — surface a match unless the founder confirmed.
    if (!body.confirm_duplicate) {
      const dup = await findDuplicate(db, staged);
      if (dup) return NextResponse.json({ needsConfirm: true, duplicate: dup });
    }

    // Move-not-duplicate: undo any prior filing of THIS txn before filing anew, so
    // re-filing (incl. switching expense↔order) never leaves two ledger entries.
    const unfiled = await unfilePrior(db, staged);
    if (unfiled.error) return NextResponse.json({ error: unfiled.error }, { status: 500 });

    // ── File as an ORDER COST (append a cost_line; never an expenses row) ──────
    if (target === "order_cost") {
      if (!body.order_id || !body.label?.trim()) {
        return NextResponse.json({ error: "order_id and label are required to file as an order cost." }, { status: 400 });
      }
      const { data: orderRows } = await db.from("orders").select("id, data").eq("id", body.order_id).limit(1);
      if (!orderRows || !orderRows.length) return NextResponse.json({ error: "Order not found." }, { status: 404 });
      const order = orderRows[0].data as { cost_lines?: CostLine[]; status?: string } & Record<string, unknown>;

      const costLineId = `cost-plaid-${staged.id}`;
      const line: CostLine = {
        id: costLineId,
        label: body.label.trim(),
        amount_cents: staged.amount_cents,
        status: "paid", // the charge already cleared Relay
        paid_by: (body.paid_by as CostLine["paid_by"]) || "Company Account",
        supplier: (body.supplier || staged.merchant_name || "").trim(),
      };
      const existingLines = Array.isArray(order.cost_lines) ? order.cost_lines : [];
      // Replace if re-filing the same staged txn; else append.
      const lines = [...existingLines.filter((l) => l.id !== costLineId), line];
      const rollup = deriveCostRollup(lines);
      const updatedOrder = {
        ...order,
        cost_lines: lines,
        vendor_cost_cents: rollup.vendor_cost_cents,
        vendor_invoice_status: rollup.vendor_invoice_status,
        vendor_payment_status: rollup.vendor_payment_status,
        vendor_paid_by: lines.find((l) => l.paid_by)?.paid_by ?? "",
      };
      const { error: ordErr } = await db.from("orders").update({ data: updatedOrder }).eq("id", body.order_id);
      if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 });

      const updated: StagedTxn = { ...staged, status: "filed", auto_dismissed: false, dismiss_reason: undefined, filed_expense_id: undefined, filed_order_id: body.order_id, filed_cost_line_id: costLineId, filed_label: line.label, reviewed_by: body.reviewed_by, reviewed_at: now, updated_at: now };
      const { error } = await db.from("plaid_transactions").update({ data: updated }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, filed_order_id: body.order_id, filed_cost_line_id: costLineId });
    }

    // ── File as a GENERAL EXPENSE (matches the finances page Expense shape) ────
    if (!body.category || !body.paid_by) {
      return NextResponse.json({ error: "category and paid_by are required to file." }, { status: 400 });
    }
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
      receipt_url: "",
      created_at: now,
      updated_at: now,
    };
    const { error: expErr } = await db.from("expenses").upsert({ id: expenseId, data: expense });
    if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });

    const updated: StagedTxn = { ...staged, status: "filed", auto_dismissed: false, dismiss_reason: undefined, filed_expense_id: expenseId, filed_order_id: undefined, filed_cost_line_id: undefined, filed_label: undefined, reviewed_by: body.reviewed_by, reviewed_at: now, updated_at: now };
    const { error } = await db.from("plaid_transactions").update({ data: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, filed_expense_id: expenseId });
  }

  if (action === "dismiss") {
    // Dismissing a previously-filed txn must also unwind its ledger entry.
    const unfiled = await unfilePrior(db, staged);
    if (unfiled.error) return NextResponse.json({ error: unfiled.error }, { status: 500 });
    const updated: StagedTxn = { ...staged, status: "dismissed", auto_dismissed: false, dismiss_reason: body.reason?.trim() || "Not an expense", filed_expense_id: undefined, filed_order_id: undefined, filed_cost_line_id: undefined, filed_label: undefined, reviewed_by: body.reviewed_by, reviewed_at: now, updated_at: now };
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
