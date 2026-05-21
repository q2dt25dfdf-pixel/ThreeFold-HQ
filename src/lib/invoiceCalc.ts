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

/** Amount collected so far (deposit + final payment, when paid). */
export function calcCollected(invoice: Record<string, unknown>): number {
  return (
    (invoice.deposit_paid === true ? calcDeposit(invoice) : 0) +
    (invoice.final_paid === true ? calcTotal(invoice) : 0)
  );
}
