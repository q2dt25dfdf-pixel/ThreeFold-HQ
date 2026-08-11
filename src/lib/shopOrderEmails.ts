import { TF_SIGNATURE_HTML } from "@/lib/emailSignature";
import { parseOrderItems, thumbAbbrev, type ShopOrderData } from "@/lib/shopOrders";
import type { ThumbMap } from "@/lib/productThumbs";

// E1 (order confirmation) + E2 (shipped notice) for STOREFRONT orders — "Option C" branded
// layout: black header band + logo, status headline, line items with back-print thumbnails,
// a totals block, shipping address, then the approved copy, closing with the handwritten
// signature. These build a FULL HTML document and are sent via sendEmail({ html }) (which
// bypasses the plain-text wrapInEmailTemplate). Copy approved 2026-08-05 — plain voice.
//
// Tracking is printed BARE (no carrier link — Pirate Ship mixes USPS/UPS and a wrong link
// is worse than no link). Blank tracking → the line is omitted entirely.
//
// Thumbnails come from the products table (name → back-print thumb URL); a lookup miss
// renders a small monogram tile so rows stay aligned. Per-line price shows ONLY when a real
// unit_cents is present; the totals block always comes from order-level amount/tax/shipping.

const LOGO_URL = "https://threefoldsupply.com/images/brand/threefold-logo.png";

// ── palette ──
const CREAM = "#F7F3EC";
const INK = "#26221C";
const MUTE = "#6F685D";
const HAIR = "#E2DCD1";
const TILE = "#EFE9DF";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

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

type ItemRow = { name: string; size: string; qty: number; unitCents: number | null };

// Structured line_items keep a real unit_cents; legacy orders parsed from the order_items
// string carry no price (unitCents null → name only), per the approved rule.
function itemRows(d: ShopOrderData): ItemRow[] {
  const li = Array.isArray(d.line_items) ? d.line_items : [];
  if (li.length > 0) {
    return li.map((i) => ({
      name: i.name,
      size: String(i.size || "").toUpperCase(),
      qty: i.qty || 1,
      unitCents: typeof i.unit_cents === "number" && i.unit_cents > 0 ? i.unit_cents : null,
    }));
  }
  return parseOrderItems(d.order_items).map((p) => ({ name: p.name, size: (p.size || "").toUpperCase(), qty: p.qty, unitCents: null }));
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

// ── shared HTML fragments ──────────────────────────────────────────────────────

function header(status: string): string {
  return `<tr><td style="background:#000;padding:18px 32px 6px;text-align:center;">
    <img src="${LOGO_URL}" width="140" alt="ThreeFold Supply Co." style="display:inline-block;width:140px;max-width:42%;height:auto;border:0;">
  </td></tr>
  <tr><td style="background:#000;padding:0 32px 16px;text-align:center;">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;color:#FFCF00;text-transform:uppercase;">${esc(status)}</div>
  </td></tr>`;
}

function intro(greeting: string, line: string): string {
  return `<tr><td style="padding:34px 32px 4px;font-size:15px;color:${INK};line-height:1.7;">${esc(greeting)}</td></tr>
  <tr><td style="padding:0 32px 8px;font-size:15px;color:${INK};line-height:1.7;">${esc(line)}</td></tr>`;
}

function itemsTable(rows: ItemRow[], thumbs: ThumbMap, showPrices: boolean): string {
  const body = rows.map((r) => {
    const thumb = thumbs[norm(r.name)];
    const tile = thumb
      ? `<img src="${esc(thumb)}" width="96" height="96" alt="${esc(r.name)}" style="display:block;width:96px;height:96px;border-radius:10px;border:1px solid ${HAIR};">`
      : `<div style="width:96px;height:96px;border-radius:10px;border:1px solid ${HAIR};background:${TILE};color:${MUTE};font-size:13px;font-weight:800;letter-spacing:0.06em;line-height:96px;text-align:center;">${esc(thumbAbbrev(r.name))}</div>`;
    const meta = `Size ${esc(r.size || "—")} &nbsp;·&nbsp; Qty ${r.qty}`;
    // Per-line prices show only in E1 (showPrices) and only when a real unit_cents exists.
    const price = showPrices && r.unitCents != null ? money((r.unitCents * r.qty) / 100) : "";
    return `<tr>
      <td width="96" style="padding:10px 14px 10px 0;vertical-align:top;">${tile}</td>
      <td style="padding:10px 0;vertical-align:top;">
        <div style="font-size:15px;font-weight:700;color:${INK};line-height:1.4;">${esc(r.name)}</div>
        <div style="font-size:12.5px;color:${MUTE};padding-top:4px;">${meta}</div>
      </td>
      <td style="padding:10px 0;vertical-align:top;text-align:right;font-size:15px;font-weight:700;color:${INK};white-space:nowrap;">${price}</td>
    </tr>`;
  }).join(`<tr><td colspan="3" style="border-top:1px solid ${HAIR};font-size:0;line-height:0;">&nbsp;</td></tr>`);
  return `<tr><td style="padding:22px 32px 4px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
  </td></tr>`;
}

function totalsBlock(d: ShopOrderData): string {
  const total = Number(d.amount) || 0;
  const tax = d.tax_amount != null ? Number(d.tax_amount) : null;
  const shipCents = d.shipping_cents != null ? Number(d.shipping_cents) : null;
  const shipDollars = shipCents != null ? shipCents / 100 : null;
  const subtotal = total - (tax ?? 0) - (shipDollars ?? 0);
  const row = (label: string, value: string, strong = false) =>
    `<tr>
      <td style="padding:5px 0;font-size:${strong ? "15px" : "13.5px"};color:${strong ? INK : MUTE};${strong ? "font-weight:800;" : ""}">${esc(label)}</td>
      <td style="padding:5px 0;text-align:right;font-size:${strong ? "15px" : "13.5px"};color:${INK};${strong ? "font-weight:800;" : "font-weight:600;"}">${esc(value)}</td>
    </tr>`;
  return `<tr><td style="padding:14px 32px 6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:2px solid ${HAIR};">
      <tr><td colspan="2" style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>
      ${row("Subtotal", money(subtotal))}
      ${row("Shipping", shipDollars ? money(shipDollars) : "Free")}
      ${tax != null ? row("Sales tax", money(tax)) : ""}
      <tr><td colspan="2" style="border-top:1px solid ${HAIR};font-size:0;line-height:0;">&nbsp;</td></tr>
      ${row("Total", money(total), true)}
    </table>
  </td></tr>`;
}

function addressBlock(d: ShopOrderData): string {
  const addr = addressLines(d);
  if (addr.length === 0) return "";
  return `<tr><td style="padding:20px 32px 4px;">
    <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;color:${MUTE};text-transform:uppercase;padding-bottom:8px;">Shipping to</div>
    <div style="font-size:14px;color:${INK};line-height:1.6;">${addr.map(esc).join("<br>")}</div>
  </td></tr>`;
}

function copyBlock(paras: string[]): string {
  return paras.map((p) =>
    `<tr><td style="padding:12px 32px 0;font-size:15px;color:${INK};line-height:1.7;">${esc(p)}</td></tr>`,
  ).join("");
}

function refBlock(d: ShopOrderData): string {
  const ref = orderRef(d);
  if (!ref) return "";
  return `<tr><td style="padding:18px 32px 0;font-size:12px;color:${MUTE};letter-spacing:0.04em;">Order ref: ${esc(ref)}</td></tr>`;
}

function signatureAndFooter(): string {
  return `<tr><td style="padding:30px 32px 8px;">
    <div style="border-top:1px solid ${HAIR};padding-top:26px;">${TF_SIGNATURE_HTML}</div>
  </td></tr>
  <tr><td style="background:#000;padding:26px 32px;text-align:center;">
    <div style="font-size:10px;font-weight:800;letter-spacing:0.22em;color:#FFFFFF;text-transform:uppercase;">ThreeFold Supply Co.</div>
    <div style="font-size:10px;letter-spacing:0.08em;color:#8C857A;padding-top:5px;">Made by three, worn by all.</div>
  </td></tr>`;
}

function doc(inner: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM};">
  <tr><td align="center" style="padding:24px 12px 40px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${CREAM};border:1px solid ${HAIR};border-radius:14px;overflow:hidden;">
      ${inner}
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ── E1: order confirmation ───────────────────────────────────────────────────────

export function buildShopConfirmationEmail(d: ShopOrderData, thumbs: ThumbMap = {}): { subject: string; html: string } {
  const rows = itemRows(d);
  const inner =
    header("Order confirmed") +
    intro(`Hi ${firstName(d)},`, "Your order is confirmed and paid. Here's what you bought:") +
    itemsTable(rows, thumbs, true) +
    totalsBlock(d) +
    addressBlock(d) +
    copyBlock([
      "Every piece is pressed to order. Your order ships within 5–7 business days, and you'll get another email with tracking when it goes out.",
      "Questions? Just reply to this email.",
    ]) +
    refBlock(d) +
    signatureAndFooter();
  return { subject: `Order confirmed — ${itemsSummary(d)}`, html: doc(inner) };
}

// ── E2: shipped notice ───────────────────────────────────────────────────────────

export function buildShopShippedEmail(d: ShopOrderData, thumbs: ThumbMap = {}): { subject: string; html: string } {
  const rows = itemRows(d);
  const tracking = String(d.tracking || "").trim();
  const trackingRow = tracking
    ? `<tr><td style="padding:16px 32px 0;">
        <div style="font-size:11px;font-weight:800;letter-spacing:0.14em;color:${MUTE};text-transform:uppercase;padding-bottom:6px;">Tracking</div>
        <div style="font-size:15px;font-weight:700;color:${INK};letter-spacing:0.02em;">${esc(tracking)}</div>
      </td></tr>`
    : "";
  const inner =
    header("Shipped") +
    intro(`Hi ${firstName(d)},`, "Your order shipped today.") +
    itemsTable(rows, thumbs, false) +
    totalsBlock(d) +
    trackingRow +
    addressBlock(d) +
    copyBlock(["Questions? Just reply to this email."]) +
    refBlock(d) +
    signatureAndFooter();
  return { subject: `Your order has shipped — ${itemsSummary(d)}`, html: doc(inner) };
}
