// Estimated delivery date for an order. Lives on the order JSONB as:
//   estDelivery:       ISO date string "YYYY-MM-DD" | null
//   estDeliverySource: 'suggested' | 'manual' | null
// No migration — orders are schemaless JSONB. `estimatedDeliveryDate` (a legacy free
// string) is left untouched and used only as a display fallback.
//
// Smart suggestion: 21 days after BOTH the order exists AND its deposit is paid. The
// anchor is the later of the order's created date and the deposit-paid date. If the
// deposit isn't paid, there is no suggestion (caller shows "TBD").

export const SUGGESTION_OFFSET_DAYS = 21;

export type EstDeliverySource = "suggested" | "manual";

// Pull a clean "YYYY-MM-DD" out of an ISO datetime or a bare date string; null if absent.
export function toDateOnly(v?: string | null): string | null {
  if (!v) return null;
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// Add whole days to a "YYYY-MM-DD" using UTC so there's no timezone drift.
export function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Later of two date-only strings (lexicographic compare is correct for YYYY-MM-DD).
export function laterDateOnly(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

// The suggested delivery date, or null when it isn't computable (deposit unpaid /
// no anchor date available).
export function computeSuggestedDelivery(opts: {
  depositPaid: boolean;
  createdAt?: string | null;
  depositPaidDate?: string | null;
}): string | null {
  if (!opts.depositPaid) return null;
  const anchor = laterDateOnly(toDateOnly(opts.createdAt), toDateOnly(opts.depositPaidDate));
  if (!anchor) return null;
  return addDays(anchor, SUGGESTION_OFFSET_DAYS);
}

// Human date for display, e.g. "Aug 17, 2026". Empty string when there's no date.
export function fmtDeliveryDate(v?: string | null): string {
  const d = toDateOnly(v);
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type OrderEstFields = {
  estDelivery?: string | null;
  estDeliverySource?: EstDeliverySource | null;
};

// Guarded suggestion for the deposit-paid write paths (cascade / webhook / finances sync).
// Returns the est fields to persist, or null to leave the order unchanged. NEVER overwrites
// a manual date: only fills when estDelivery is empty or was itself a suggestion.
export function estDeliverySuggestionUpdate(
  order: OrderEstFields,
  opts: { depositPaid: boolean; createdAt?: string | null; depositPaidDate?: string | null },
): { estDelivery: string; estDeliverySource: "suggested" } | null {
  const isManual = order.estDeliverySource === "manual" && !!order.estDelivery;
  if (isManual) return null;
  const suggested = computeSuggestedDelivery(opts);
  if (!suggested) return null;
  if (order.estDelivery === suggested && order.estDeliverySource === "suggested") return null; // no-op
  return { estDelivery: suggested, estDeliverySource: "suggested" };
}

// Resolve what to DISPLAY for an order (read-time; never writes). Prefers a stored
// estDelivery, else a live suggestion (shown tagged), else the legacy string, else null.
export function resolveEstDeliveryDisplay(
  order: OrderEstFields & { estimatedDeliveryDate?: string | null },
  opts: { depositPaid: boolean; createdAt?: string | null; depositPaidDate?: string | null },
): { date: string | null; source: EstDeliverySource | null; suggestion: string | null } {
  const suggestion = computeSuggestedDelivery(opts);
  const stored = toDateOnly(order.estDelivery);
  if (stored) {
    return { date: stored, source: order.estDeliverySource === "manual" ? "manual" : "suggested", suggestion };
  }
  if (suggestion) {
    return { date: suggestion, source: "suggested", suggestion };
  }
  const legacy = (order.estimatedDeliveryDate ?? "").trim();
  if (legacy) return { date: legacy, source: "manual", suggestion };
  return { date: null, source: null, suggestion };
}
