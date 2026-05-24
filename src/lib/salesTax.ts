export const DEFAULT_SALES_TAX_RATE = 0.0875; // California base rate

export function salesTaxRate(): number {
  const configured = Number(process.env.NEXT_PUBLIC_SALES_TAX_RATE);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SALES_TAX_RATE;
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

/** Format a rate as a display percentage string, e.g. "8.75%". */
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
