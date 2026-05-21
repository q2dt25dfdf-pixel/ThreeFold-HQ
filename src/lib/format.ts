/**
 * Formats a number or numeric string as USD with no decimal places.
 * Matches the display standard used across the dashboard and finance summaries.
 */
export function formatCurrency(value: number | string): string {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
