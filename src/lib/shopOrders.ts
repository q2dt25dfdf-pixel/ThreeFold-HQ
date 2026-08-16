// Shared helpers for Shop Orders (ThreeFold Originals online orders in shop_orders).
// Pure functions — safe to import in both API routes (server) and pages (client).
//
// shop_orders.data shape (written by the website Stripe webhook):
//   payment_intent_id, email, customer_name,
//   shipping_address:{line1,line2,city,state,postal_code,country},
//   order_items (human string "Name (SIZE) xQty; ..."), amount ($ total incl tax+shipping),
//   tax_amount ($ | null), shipping_cents (int | null), ship_code_used (bool),
//   created_at (ISO), shipped (bool), shipped_at (ISO | added on mark-shipped),
//   line_items?: [{name,size,qty,unit_cents}]  <- structured, added going forward.

export const SHOP_UNIT_CENTS = 3500; // $35 flat — used only to show a per-line price for
                                     // OLD rows parsed from the summary string. Totals ALWAYS
                                     // come from the stored amount/tax/shipping, never summed.

export type ShipAddress = {
  line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string;
};
export type ShopLineItem = { name: string; size: string; qty: number; unitCents: number | null };
export type ShopOrderData = {
  payment_intent_id?: string;
  email?: string;
  customer_name?: string;
  shipping_address?: ShipAddress;
  order_items?: string;
  amount?: number;
  tax_amount?: number | null;
  shipping_cents?: number | null;
  ship_code_used?: boolean;
  created_at?: string;
  shipped?: boolean;
  shipped_at?: string | null;
  // Optional tracking number, pasted by a founder at mark-shipped (Pirate Ship USPS/UPS —
  // stored and emailed BARE, no carrier link). Blank = shipped email omits the line.
  tracking?: string;
  // Customer-email dedupe stamps (E1 confirmation via website webhook → internal endpoint;
  // E2 shipped notice via the mark-shipped PATCH). Same pattern as invoice receipt stamps.
  confirmation_email_sent_at?: string;
  confirmation_email_status?: string;
  shipped_email_sent_at?: string;
  shipped_email_status?: string;
  line_items?: { name: string; size: string; qty: number; unit_cents?: number }[];
  // Founder notes, appended newest-first order handled in UI. `at` is server-set on save.
  notes?: { text: string; author: string; at: string }[];
  // Refund awareness — set by the founder's manual "Mark refunded" toggle (v1: no
  // Stripe refund webhook). A refunded order drops out of revenue + tax (financesShop.ts).
  refunded?: boolean;
  refunded_at?: string;
  // Refund does NOT auto-restock. When set, the recorded decrement has been reversed
  // (units added back to inventory) via the one-click restock. Idempotency marker.
  restocked_at?: string;
  status?: string;
  // EasyPost label state (label routes under /api/shop-orders/[id]/label/*).
  // status choreography: "quoted" (shipment created, no money spent) →
  // "purchasing" (pre-write BEFORE the buy call — the recovery pointer that makes
  // double-purchase impossible) → "purchased". postage_cents is an integer; the
  // EasyPost label_url dies after ~180 days, label_path is our permanent copy in
  // the private shipping-labels bucket. tracking (above) gets tracking_code so the
  // E2 email needs no changes.
  // Written by the WEBSITE webhook when the customer chose a live USPS rate at
  // checkout (PaymentIntent metadata ship_shipment_id/ship_rate_id/ship_service).
  // Checkout rates are long expired by label time, so the label flow matches on
  // SERVICE NAME, never rate_id; ids are kept for audit.
  easypost_quote?: { shipment_id?: string; rate_id?: string; service?: string };
  easypost?: {
    shipment_id: string;
    status: "quoted" | "purchasing" | "purchased";
    rate_id?: string;
    carrier?: string;
    service?: string;
    postage_cents?: number;
    tracking_code?: string;
    label_url?: string;
    label_path?: string | null;
    purchased_at?: string;
    refund_status?: string | null;
    refund_requested_at?: string;
  };
};

export function money(dollars: number | null | undefined): string {
  if (dollars == null || Number.isNaN(dollars)) return "—";
  return "$" + Number(dollars).toFixed(2);
}
export function centsToDollars(c: number | null | undefined): number | null {
  return c == null ? null : c / 100;
}

// Parse "San Francisco Tee (L) x1; 3 Ball — Fire (M) x1" (also tolerates "·" / "×").
export function parseOrderItems(summary: string | undefined): { name: string; size: string; qty: number }[] {
  if (!summary) return [];
  return summary
    .split(/;|·/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/^(.*)\s*\(([^)]+)\)\s*[x×]\s*(\d+)$/i);
      if (m) return { name: m[1].trim(), size: m[2].trim(), qty: parseInt(m[3], 10) || 1 };
      return { name: chunk, size: "", qty: 1 };
    });
}

// Prefer stored structured line_items; else parse the summary (unit = flat $35). unitCents is
// null when we genuinely can't resolve a price, so the UI can omit the per-line price.
export function resolveLineItems(data: ShopOrderData): ShopLineItem[] {
  if (Array.isArray(data.line_items) && data.line_items.length) {
    return data.line_items.map((li) => ({
      name: li.name, size: (li.size || "").toUpperCase(), qty: li.qty || 1,
      unitCents: typeof li.unit_cents === "number" ? li.unit_cents : SHOP_UNIT_CENTS,
    }));
  }
  return parseOrderItems(data.order_items).map((li) => ({
    name: li.name, size: (li.size || "").toUpperCase(), qty: li.qty, unitCents: SHOP_UNIT_CENTS,
  }));
}

// Compact text thumbnail token, e.g. "San Francisco Tee" -> "SFT", "3 Ball — Fire" -> "3BF".
export function thumbAbbrev(name: string): string {
  const words = String(name).replace(/[—–-]/g, " ").split(/\s+/).filter(Boolean);
  const code = words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  return code || "TF";
}

export function shipToLine(a: ShipAddress | undefined): string {
  if (!a) return "—";
  const city = (a.city || "").trim(), state = (a.state || "").trim();
  return [city, state].filter(Boolean).join(", ") || "—";
}

// Totals straight from stored amounts (authoritative). subtotal = total - tax - shipping.
export function orderTotals(data: ShopOrderData) {
  const total = typeof data.amount === "number" ? data.amount : null;
  const tax = data.tax_amount == null ? null : Number(data.tax_amount);
  const shipping = data.shipping_cents == null ? null : data.shipping_cents / 100;
  const subtotal = total == null ? null : total - (tax || 0) - (shipping || 0);
  const freeShip = (data.shipping_cents ?? 0) === 0;
  return { subtotal, shipping, tax, total, freeShip, shipCode: !!data.ship_code_used };
}

export function isOverdueAgeless() { return false; } // (no age rule for shop orders)

// Stripe live dashboard deep link for a PaymentIntent.
export function stripePaymentUrl(pi: string | undefined): string {
  return pi ? `https://dashboard.stripe.com/payments/${pi}` : "https://dashboard.stripe.com/payments";
}
export function truncatePi(pi: string | undefined): string {
  if (!pi) return "—";
  return pi.length > 16 ? `${pi.slice(0, 10)}…${pi.slice(-4)}` : pi;
}
