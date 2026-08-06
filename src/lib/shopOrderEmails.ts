import { TF_PLAIN_CLOSING } from "@/lib/emailSignature";
import type { ShopOrderData } from "@/lib/shopOrders";

// E1 (order confirmation) + E2 (shipped notice) for STOREFRONT orders. Copy approved
// 2026-08-05 — plain voice, no marketing. Bodies are plain text; sendEmail wraps them in
// the branded HTML template + signature (same pipeline as invoice receipts).
//
// Tracking is printed BARE (no carrier link — Pirate Ship mixes USPS/UPS and a wrong
// link is worse than no link). Blank tracking → the line is omitted entirely.

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function firstName(d: ShopOrderData): string {
  const n = String(d.customer_name || "").trim();
  return n ? n.split(/\s+/)[0] : "there";
}

// "San Francisco Tee + 2 more" — used in both subjects.
function itemsSummary(d: ShopOrderData): string {
  const li = Array.isArray(d.line_items) ? d.line_items : [];
  if (li.length > 0) {
    const more = li.length - 1;
    return li[0].name + (more > 0 ? ` + ${more} more` : "");
  }
  const chunks = String(d.order_items || "").split(/;|·/).map((s) => s.trim()).filter(Boolean);
  if (chunks.length > 0) {
    const first = chunks[0].replace(/\s*\([^)]*\)\s*[x×]\s*\d+\s*$/i, "").trim();
    return first + (chunks.length > 1 ? ` + ${chunks.length - 1} more` : "");
  }
  return "your order";
}

// One line per item. E1 shows line totals when unit_cents is known; E2 never shows prices.
function itemLines(d: ShopOrderData, withPrices: boolean): string[] {
  const li = Array.isArray(d.line_items) ? d.line_items : [];
  if (li.length > 0) {
    return li.map((i) => {
      const base = `${i.name} (${String(i.size || "").toUpperCase()}) × ${i.qty}`;
      return withPrices && typeof i.unit_cents === "number" && i.unit_cents > 0
        ? `${base} — ${money((i.unit_cents * i.qty) / 100)}`
        : base;
    });
  }
  // legacy fallback: the human summary string, one line per chunk
  return String(d.order_items || "").split(/;/).map((s) => s.trim()).filter(Boolean);
}

function addressLines(d: ShopOrderData): string[] {
  const a = d.shipping_address || ({} as NonNullable<ShopOrderData["shipping_address"]>);
  const out: string[] = [];
  const name = String(d.customer_name || "").trim();
  if (name) out.push(name);
  const street = [a.line1, a.line2].filter((s) => String(s || "").trim()).join(", ");
  if (street) out.push(street);
  const cityLine = [a.city, [a.state, a.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (cityLine) out.push(cityLine);
  return out;
}

const orderRef = (d: ShopOrderData) => String(d.payment_intent_id || "").slice(-8);

export function buildShopConfirmationEmail(d: ShopOrderData): { subject: string; body: string } {
  const lines: string[] = [];
  lines.push(`Hi ${firstName(d)},`);
  lines.push("");
  lines.push("Your order is confirmed and paid. Here's what you bought:");
  lines.push("");
  lines.push(...itemLines(d, true));
  lines.push("");
  const total = Number(d.amount) || 0;
  const tax = d.tax_amount != null ? Number(d.tax_amount) : null;
  const shipCents = d.shipping_cents != null ? Number(d.shipping_cents) : null;
  const subtotal = total - (tax ?? 0) - (shipCents ?? 0) / 100;
  lines.push(`Subtotal: ${money(subtotal)}`);
  lines.push(`Shipping: ${shipCents ? money(shipCents / 100) : "Free"}`);
  if (tax != null) lines.push(`Sales tax: ${money(tax)}`);
  lines.push(`Total: ${money(total)}`);
  const addr = addressLines(d);
  if (addr.length > 0) {
    lines.push("");
    lines.push("Shipping to:");
    lines.push(...addr);
  }
  lines.push("");
  lines.push("Every piece is pressed to order. Your order ships within 5–7 business days, and you'll get another email with tracking when it goes out.");
  lines.push("");
  lines.push("Questions? Just reply to this email.");
  const ref = orderRef(d);
  if (ref) {
    lines.push("");
    lines.push(`Order ref: ${ref}`);
  }
  lines.push("");
  lines.push(TF_PLAIN_CLOSING);
  return { subject: `Order confirmed — ${itemsSummary(d)}`, body: lines.join("\n") };
}

export function buildShopShippedEmail(d: ShopOrderData): { subject: string; body: string } {
  const lines: string[] = [];
  lines.push(`Hi ${firstName(d)},`);
  lines.push("");
  lines.push("Your order shipped today.");
  lines.push("");
  lines.push(...itemLines(d, false));
  const tracking = String(d.tracking || "").trim();
  if (tracking) {
    lines.push("");
    lines.push(`Tracking: ${tracking}`);
  }
  const addr = addressLines(d);
  if (addr.length > 0) {
    lines.push("");
    lines.push("Shipping to:");
    lines.push(...addr);
  }
  lines.push("");
  lines.push("Questions? Just reply to this email.");
  const ref = orderRef(d);
  if (ref) {
    lines.push("");
    lines.push(`Order ref: ${ref}`);
  }
  lines.push("");
  lines.push(TF_PLAIN_CLOSING);
  return { subject: `Your order has shipped — ${itemsSummary(d)}`, body: lines.join("\n") };
}
