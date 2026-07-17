export const DEFAULT_SALES_TAX_RATE = 0.09375; // Milpitas/Bay Area rate

export function salesTaxRate(): number {
  const configured = Number(process.env.NEXT_PUBLIC_SALES_TAX_RATE);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SALES_TAX_RATE;
}

/** A named discount applied to a quote before tax. */
export type QuoteDiscount = {
  type: "percent" | "fixed";
  value: number;
  label: string;
};

/**
 * Dollar amount a discount removes from the pre-tax subtotal.
 * Returns 0 when discount is null. Clamped to [0, subtotal] and rounded to cents.
 * `percent` uses value as a percentage (15 → 15%); `fixed` uses value as dollars.
 */
export function calcDiscountAmount(
  subtotal: number,
  discount: QuoteDiscount | null | undefined,
): number {
  if (!discount) return 0;
  const raw =
    discount.type === "percent"
      ? subtotal * (discount.value / 100)
      : discount.value;
  const clamped = Math.min(Math.max(raw, 0), Math.max(subtotal, 0));
  return Math.round(clamped * 100) / 100;
}

/** Pre-tax subtotal after the discount is removed (subtotal − discountAmount). */
export function calcDiscountedSubtotal(
  subtotal: number,
  discount: QuoteDiscount | null | undefined,
): number {
  return Math.round((subtotal - calcDiscountAmount(subtotal, discount)) * 100) / 100;
}

/**
 * Coerce untrusted input (request body, stored jsonb) into a QuoteDiscount or null.
 * Returns null when there is effectively no discount (missing, wrong shape, or
 * value ≤ 0). A returned object may still have an empty label — callers that
 * require a label (e.g. the quote writers) must validate that separately.
 */
export function normalizeDiscount(input: unknown): QuoteDiscount | null {
  if (!input || typeof input !== "object") return null;
  const d = input as Record<string, unknown>;
  const type = d.type === "fixed" ? "fixed" : d.type === "percent" ? "percent" : null;
  const value = Number(d.value);
  const label = typeof d.label === "string" ? d.label.trim() : "";
  if (!type || !Number.isFinite(value) || value <= 0) return null;
  return { type, value, label };
}

/** Sales tax on a subtotal at the given rate (defaults to configured rate). */
export function calcSalesTax(subtotal: number, rate?: number): number {
  const r = rate ?? salesTaxRate();
  return Math.round(subtotal * r * 100) / 100;
}

/** Grand total = subtotal + sales tax. */
export function calcGrandTotal(subtotal: number, rate?: number): number {
  return subtotal + calcSalesTax(subtotal, rate);
}

/** Tax portion collected with a deposit payment (proportional to deposit share). */
export function calcDepositTax(
  salesTaxAmount: number,
  depositAmount: number,
  grandTotal: number,
): number {
  if (grandTotal <= 0 || salesTaxAmount <= 0) return 0;
  return Math.round((depositAmount / grandTotal) * salesTaxAmount * 100) / 100;
}

/** Remaining tax collected with the final payment. */
export function calcFinalTax(salesTaxAmount: number, depositTaxCollected: number): number {
  return Math.max(Math.round((salesTaxAmount - depositTaxCollected) * 100) / 100, 0);
}

/** Format a rate as a display percentage string, e.g. "9.375%". */
export function fmtTaxRate(rate?: number): string {
  const r = (rate ?? salesTaxRate()) * 100;
  return r % 1 === 0 ? `${r}%` : `${r.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Next CA quarterly due date from a given ISO date string. */
export function nextQuarterlyDueDate(fromISO?: string): string {
  const from = fromISO ? new Date(fromISO + "T12:00:00") : new Date();
  const year = from.getFullYear();
  const month = from.getMonth(); // 0-based
  // Q1 (Jan-Mar) → due Apr 15; Q2 (Apr-Jun) → due Jul 15; Q3 (Jul-Sep) → due Oct 15; Q4 (Oct-Dec) → due Jan 15 next year
  const dueDates = [
    new Date(year, 3, 15, 12),   // Apr 15
    new Date(year, 6, 15, 12),   // Jul 15
    new Date(year, 9, 15, 12),   // Oct 15
    new Date(year + 1, 0, 15, 12), // Jan 15 next year
  ];
  for (const d of dueDates) {
    if (d > from) return d.toISOString().slice(0, 10);
  }
  return dueDates[dueDates.length - 1].toISOString().slice(0, 10);
}
