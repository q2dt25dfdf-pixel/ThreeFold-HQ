// Split-expense allocations. One expense can be divided into ≥2 allocations,
// each going to a specific order or to general business. Invariants:
//   • allocations sum EXACTLY to the expense amount_cents (enforced here, used
//     by both the client form and the server route)
//   • each dollar lives in exactly ONE ledger — general portions count toward
//     Total Spent (the expenses ledger); order portions become a cost_line on
//     that order (the vendor-cost ledger) so nothing is double-counted.
// An expense with no allocations behaves exactly as before: fully general.

import { deriveCostRollup, type CostLine } from "@/lib/orderCosts";

export type AllocationDestination =
  | { type: "general" }
  | { type: "order"; order_id: string; order_name?: string };

export type ExpenseAllocation = {
  amount_cents: number;
  destination: AllocationDestination;
};

// Minimal expense view the allocation helpers need (works for both the typed
// finances Expense and the raw JSONB row the AI/server routes read).
export type AllocatableExpense = {
  id: string;
  amount_cents?: number;
  category?: string;
  vendor_name?: string;
  paid_by?: string;
  payment_status?: string;
  allocations?: ExpenseAllocation[];
};

const COST_LINE_PAID_BY = ["Alliyah", "Hannah", "Jordan", "Company Account"] as const;

// ── Validation (the sum rule) ────────────────────────────────────────────────
export function validateAllocations(
  totalCents: number,
  allocations?: ExpenseAllocation[],
): { ok: true } | { ok: false; error: string } {
  if (!allocations || allocations.length === 0) return { ok: true }; // unsplit
  if (allocations.length < 2) {
    return { ok: false, error: "A split needs at least two allocations." };
  }
  let sum = 0;
  for (const a of allocations) {
    if (!Number.isInteger(a.amount_cents) || a.amount_cents <= 0) {
      return { ok: false, error: "Each allocation must be a whole-cent amount greater than $0." };
    }
    if (a.destination.type === "order" && !a.destination.order_id) {
      return { ok: false, error: "Each order allocation must name an order." };
    }
    sum += a.amount_cents;
  }
  if (sum !== totalCents) {
    return {
      ok: false,
      error: `Allocations must sum to the expense total ($${(totalCents / 100).toFixed(2)}); they currently sum to $${(sum / 100).toFixed(2)}.`,
    };
  }
  return { ok: true };
}

// ── Ledger accounting ────────────────────────────────────────────────────────
// The portion of an expense that counts as a GENERAL business cost (Total Spent).
// Unsplit → the whole amount. Split → only the general allocations.
export function expenseGeneralCents(e: AllocatableExpense): number {
  const total = Number(e.amount_cents) || 0;
  if (!e.allocations || e.allocations.length === 0) return total;
  return e.allocations
    .filter((a) => a.destination.type === "general")
    .reduce((s, a) => s + (Number(a.amount_cents) || 0), 0);
}

// order_id → cents this expense allocates to that order (collapsed if an expense
// lists the same order twice).
export function orderAllocationCents(allocations?: ExpenseAllocation[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of allocations ?? []) {
    if (a.destination.type === "order" && a.destination.order_id) {
      m.set(a.destination.order_id, (m.get(a.destination.order_id) || 0) + (Number(a.amount_cents) || 0));
    }
  }
  return m;
}

// ── Cost-line generation ─────────────────────────────────────────────────────
// One generated line per (expense, order); the id is unique within an order.
export const EXPENSE_COST_LINE_PREFIX = "cost-exp-";
export function expenseCostLineId(expenseId: string): string {
  return `${EXPENSE_COST_LINE_PREFIX}${expenseId}`;
}

function coercePaidBy(paidBy?: string): CostLine["paid_by"] {
  return (COST_LINE_PAID_BY as readonly string[]).includes(paidBy ?? "")
    ? (paidBy as CostLine["paid_by"])
    : "";
}

export function buildExpenseCostLine(e: AllocatableExpense, amountCents: number): CostLine {
  return {
    id: expenseCostLineId(e.id),
    label: e.category || "Expense",
    amount_cents: amountCents,
    status: e.payment_status === "paid" ? "paid" : "ordered",
    paid_by: coercePaidBy(e.paid_by),
    supplier: e.vendor_name || "",
    source_expense_id: e.id,
  };
}

// ── Reconcile generated cost_lines across all orders ─────────────────────────
// Pure: given the current orders and the expense's allocations, return only the
// orders whose cost_lines changed, each with its recomputed rollup. Pass
// allocations undefined/[] (or a fully-general split) to strip this expense's
// lines everywhere — used on unsplit, edit, and delete.
export type OrderRow = { id: string; data: OrderData };
export type OrderData = {
  cost_lines?: CostLine[];
  vendor_cost_cents?: number;
  vendor_invoice_status?: string;
  vendor_payment_status?: string;
  vendor_paid_by?: string;
  [k: string]: unknown;
};

export function reconcileExpenseCostLines(
  orders: OrderRow[],
  expense: AllocatableExpense,
  allocations?: ExpenseAllocation[],
): OrderRow[] {
  const lineId = expenseCostLineId(expense.id);
  const desired = orderAllocationCents(allocations);
  const changed: OrderRow[] = [];

  for (const order of orders) {
    const lines = Array.isArray(order.data.cost_lines) ? order.data.cost_lines : [];
    const hasLine = lines.some((l) => l.id === lineId);
    const wantCents = desired.get(order.id);

    let nextLines: CostLine[] | null = null;
    if (wantCents != null) {
      // add or replace our line
      nextLines = [...lines.filter((l) => l.id !== lineId), buildExpenseCostLine(expense, wantCents)];
    } else if (hasLine) {
      // order no longer targeted — remove our line
      nextLines = lines.filter((l) => l.id !== lineId);
    }
    if (!nextLines) continue; // untouched

    const rollup = deriveCostRollup(nextLines);
    changed.push({
      id: order.id,
      data: {
        ...order.data,
        cost_lines: nextLines,
        vendor_cost_cents: rollup.vendor_cost_cents,
        vendor_invoice_status: rollup.vendor_invoice_status,
        vendor_payment_status: rollup.vendor_payment_status,
        vendor_paid_by: nextLines.find((l) => l.paid_by)?.paid_by ?? "",
      },
    });
  }
  return changed;
}
