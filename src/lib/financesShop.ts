// Pure aggregation of shop_orders into the slices the Finances page needs. Kept out of the
// 182KB finances/page.tsx so it stays lean and this stays unit-testable. Reads only the
// minimal, no-PII fields returned by /api/finances/shop-summary.
//
// TAX HONESTY (WO decision A, Option 1): shop revenue is reported NET OF TAX everywhere it
// feeds a revenue/collected/money-in number. CA sales tax is collected on Stripe's behalf and
// is NOT revenue — it only feeds the "Sales tax to remit" figure. Custom invoices currently
// report Collected tax-inclusive; that mismatch is intentionally VISIBLE via the "net of tax"
// label until the backlog item nets custom tax out too (see BACKLOG.md).
//
// REFUND GUARD (WO decision C): an order with refunded === true (or status "refunded") is
// dropped from BOTH net revenue AND tax collected. Nothing sets those fields yet, so this is a
// no-op today — but a later manual flag or refund webhook needs ZERO Finances changes to work.
//
// FEES (WO decision B): gross-of-fees for now. QuickBooks stays the book of record. (Backlog:
// capture fee_cents in the website webhook at order time if per-order net is ever wanted.)

export type ShopFinanceRow = {
  id: string;
  amount?: number | null; // dollars — total charged (subtotal + shipping + CA tax)
  tax_amount?: number | null; // dollars — CA sales tax portion of amount
  shipping_cents?: number | null;
  created_at?: string | null; // ISO
  ship_code_used?: boolean;
  shipped?: boolean;
  refunded?: boolean;
  status?: string;
};

export type ShopFinanceSummary = {
  netRevenueAll: number; // Σ (amount − tax) over all non-refunded orders (all-time)
  taxCollectedYTD: number; // Σ tax_amount for non-refunded orders created in `year`
  byMonth: number[]; // length 12; net revenue by calendar month (Jan–Dec, years blended)
  count: number; // non-refunded order count
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function isRefunded(r: ShopFinanceRow): boolean {
  return r.refunded === true || (r.status ?? "").toLowerCase() === "refunded";
}

// Month index 0–11 from an ISO date, or -1 if unparseable.
function monthIndex(iso: string | null | undefined): number {
  if (!iso) return -1;
  const d = new Date(iso);
  const m = d.getMonth();
  return Number.isNaN(m) ? -1 : m;
}

export function aggregateShopFinances(rows: ShopFinanceRow[], year: string): ShopFinanceSummary {
  const byMonth = Array<number>(12).fill(0);
  let netRevenueAll = 0;
  let taxCollectedYTD = 0;
  let count = 0;

  for (const r of rows) {
    if (isRefunded(r)) continue; // refund guard — drops from revenue AND tax
    const amount = num(r.amount);
    const tax = num(r.tax_amount);
    const net = amount - tax; // net of tax; includes any shipping charged (real income)
    netRevenueAll += net;
    count += 1;
    const m = monthIndex(r.created_at);
    if (m >= 0) byMonth[m] += net;
    if (tax > 0 && String(r.created_at ?? "").startsWith(year)) taxCollectedYTD += tax;
  }

  return { netRevenueAll, taxCollectedYTD, byMonth, count };
}
