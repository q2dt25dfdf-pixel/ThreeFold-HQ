/** Parse a raw value (string, number, or unknown) to a finite dollar amount. */
export function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const n = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Total invoice amount, preferring total_amount over amount. */
export function calcTotal(invoice: Record<string, unknown>): number {
  return parseAmount(invoice.total_amount ?? invoice.amount);
}

/** Deposit amount; defaults to 50% of total when no explicit deposit is stored. */
export function calcDeposit(invoice: Record<string, unknown>): number {
  const explicit = parseAmount(invoice.deposit_amount);
  return explicit > 0 ? explicit : calcTotal(invoice) * 0.5;
}

/** Balance remaining; defaults to total − deposit when no explicit balance is stored. */
export function calcBalance(invoice: Record<string, unknown>): number {
  const explicit = parseAmount(invoice.balance_remaining);
  return explicit > 0 ? explicit : Math.max(calcTotal(invoice) - calcDeposit(invoice), 0);
}

/** Amount collected so far (deposit when partially paid; total when fully paid). */
export function calcCollected(invoice: Record<string, unknown>): number {
  if (invoice.final_paid === true) return calcTotal(invoice);
  if (invoice.deposit_paid === true) return calcDeposit(invoice);
  return 0;
}

/**
 * Pre-tax subtotal. Reads ONLY the explicit subtotal field and returns 0 when absent.
 * It deliberately does NOT fall back to total_amount/amount: those are grand totals
 * (tax-inclusive, and post-discount once discounts exist), so using one as a subtotal
 * would double-count tax and leak a discounted total into a pre-tax slot.
 */
export function calcSubtotal(record: Record<string, unknown>): number {
  return parseAmount(record.subtotal);
}

/** Sales tax amount stored on record. Returns 0 for old records without tax fields. */
export function calcRecordTax(record: Record<string, unknown>): number {
  return parseAmount(record.sales_tax_amount);
}

/** Grand total (subtotal + tax). Falls back to total_amount for old records. */
export function calcGrandTotalFromRecord(record: Record<string, unknown>): number {
  const explicit = parseAmount(record.grand_total);
  return explicit > 0 ? explicit : parseAmount(record.total_amount ?? record.amount);
}
