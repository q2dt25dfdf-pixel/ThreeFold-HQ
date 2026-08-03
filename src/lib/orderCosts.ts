// Shared production-cost helpers. The order detail page and the Plaid review route
// both derive the order-level roll-up keys from cost_lines through THIS module, so
// the two can never drift apart.

// Model-A production cost line. HQ-only — never sent to any client route.
export type CostLine = {
  id: string;                 // stable id (crypto id on the order page; plaid-derived when filed)
  label: string;              // "Blanks", "Transfers", "Shipping"
  amount_cents: number;       // integer cents, never floats
  status: "not_ordered" | "ordered" | "paid";
  paid_by: "" | "Alliyah" | "Hannah" | "Jordan" | "Company Account";
  supplier?: string;          // free text; vendors list is autocomplete-only, no vendor_id
  receipt_url?: string;       // pasted link (Drive, etc.) — HQ-only, never client-facing
  receipt_path?: string;      // uploaded file in the private order-receipts bucket
};

// Derive the order-level roll-up keys from the cost lines. These existing keys are what
// the downstream consumers (finances/page, ai/finances, ai/order, ai/openapi) read — we
// only ever change how a writer WRITES them, never how they're read.
export function deriveCostRollup(lines: CostLine[]): {
  vendor_cost_cents: number;
  vendor_payment_status: string;
  vendor_invoice_status: string;
} {
  const vendor_cost_cents = lines.reduce((s, l) => s + (Number(l.amount_cents) || 0), 0);
  const vendor_payment_status =
    lines.length > 0 && lines.every((l) => l.status === "paid") ? "paid" : "unpaid";
  const vendor_invoice_status =
    lines.some((l) => l.status === "ordered" || l.status === "paid") ? "received" : "not_received";
  return { vendor_cost_cents, vendor_payment_status, vendor_invoice_status };
}

// ── Order-cost dedupe ────────────────────────────────────────────────────────
// Catch a cost already hand-entered on an order (e.g. a $410.97 line) before a
// Plaid charge double-books it. cost_lines carry NO date, so — unlike the expense
// dedupe — we match on amount + fuzzy vendor/label only (a same-amount, same-vendor
// line on an order is a strong enough signal).
export type OrderForDedupe = {
  id: string;
  orderName?: string;
  order_name?: string;
  status?: string;
  cost_lines?: CostLine[];
  vendor_cost_cents?: number;
};

export type OrderCostDuplicate = {
  order_id: string;
  order_name: string;
  label: string;
  amount_cents: number;
};

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findDuplicateOrderCost(
  staged: { merchant_name: string; amount_cents: number },
  orders: OrderForDedupe[],
): OrderCostDuplicate | null {
  const merchant = normalize(staged.merchant_name);
  for (const o of orders) {
    if ((o.status ?? "").toLowerCase() === "cancelled") continue;
    for (const line of o.cost_lines ?? []) {
      if (line.amount_cents !== staged.amount_cents) continue;
      const hay = normalize(`${line.supplier ?? ""} ${line.label ?? ""}`);
      // Amount match alone is a candidate; tighten with a fuzzy vendor/label overlap.
      if (!merchant || !hay || hay.includes(merchant) || merchant.includes(hay) || sharesWord(merchant, hay)) {
        return {
          order_id: o.id,
          order_name: o.orderName || o.order_name || o.id,
          label: line.label,
          amount_cents: line.amount_cents,
        };
      }
    }
  }
  return null;
}

function sharesWord(a: string, b: string): boolean {
  const wb = new Set(b.split(" ").filter((w) => w.length >= 4));
  return a.split(" ").some((w) => w.length >= 4 && wb.has(w));
}
