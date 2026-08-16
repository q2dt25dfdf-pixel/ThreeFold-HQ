// EasyPost shipping labels for shop orders (server-only — reads EASYPOST_API_KEY).
// Same lazy pattern as stripe.ts/plaid.ts: nothing throws until first use, so the
// app runs fine (with the label button disabled) when the key is absent.
//
// USPS-only is enforced HERE via filterUspsRates — never by an EasyPost dashboard
// setting. FedEx rates come back from the API and are dropped before they reach
// the UI or the order row.

import type { ShopLineItem } from "./shopOrders";

const EASYPOST_BASE = "https://api.easypost.com/v2";

// Ship-from. The founder's fulfillment address, not a warehouse.
export const FROM_ADDRESS = {
  name: "Threefold Supply Co.",
  street1: "1957 California St Apt 6",
  city: "Mountain View",
  state: "CA",
  zip: "94040",
  country: "US",
};

// ── Weights (ounces) — code constants by design, no DB column, no CSV change.
// Every product ships on the same tee blank, so weight is a function of size only.
// "3xl" is seeded even though the website's ALLOWED_SIZES stops at 2xl today.
const BLANK_OZ: Record<string, number> = {
  s: 5.0, m: 6.3, l: 7.6, xl: 8.9, "2xl": 10.2, "3xl": 11.5,
};
const PRINT_OZ = 0.35; // per printed garment
const BAG_OZ = 0.2;    // per garment bag
const MAILER_OZ = 0.6; // per order — one poly mailer

// Total order weight, or the exact line item we refuse to guess a weight for.
// Sizes arrive uppercase from resolveLineItems; the table is keyed lowercase.
export function computeOrderWeightOz(
  items: Pick<ShopLineItem, "name" | "size" | "qty">[],
): { oz: number } | { error: string } {
  if (!items.length) return { error: "Order has no line items to weigh." };
  let oz = MAILER_OZ;
  for (const it of items) {
    const size = (it.size || "").trim().toLowerCase();
    const blank = BLANK_OZ[size];
    if (blank == null) {
      return {
        error: `Can't compute weight: "${it.name}" has ${size ? `unknown size "${it.size}"` : "no size"}. Fix the line item before quoting.`,
      };
    }
    oz += (blank + PRINT_OZ + BAG_OZ) * (it.qty || 1);
  }
  return { oz: Math.ceil(oz * 10) / 10 };
}

// ── API client ────────────────────────────────────────────────────────────────

export function isEasyPostConfigured(): boolean {
  return !!process.env.EASYPOST_API_KEY;
}

export class EasyPostError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function isPaymentRequired(e: unknown): boolean {
  return e instanceof EasyPostError &&
    (e.code.includes("PAYMENT") || e.status === 402 || /insufficient/i.test(e.message));
}

async function epFetch(path: string, init?: { method?: string; body?: unknown }): Promise<Record<string, unknown>> {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new EasyPostError(503, "NOT_CONFIGURED", "EASYPOST_API_KEY is not configured");
  const res = await fetch(EASYPOST_BASE + path, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: "Basic " + Buffer.from(key + ":").toString("base64"),
      "Content-Type": "application/json",
    },
    body: init?.body != null ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } }).error;
    throw new EasyPostError(res.status, err?.code || `HTTP_${res.status}`, err?.message || `EasyPost request failed (${res.status})`);
  }
  return json as Record<string, unknown>;
}

// Raw EasyPost shapes we actually read (the API returns much more).
export type EpRate = { id: string; carrier: string; service: string; rate: string; delivery_days: number | null };
export type EpShipment = {
  id: string;
  rates?: EpRate[];
  selected_rate?: EpRate | null;
  tracking_code?: string | null;
  refund_status?: string | null;
  postage_label?: { label_url: string } | null;
  to_address?: { verifications?: { delivery?: { success?: boolean; errors?: { message?: string }[] } } };
  messages?: { message?: string }[];
};

export async function createShipment(to: {
  name?: string; street1?: string; street2?: string; city?: string; state?: string; zip?: string; country?: string;
}, weightOz: number): Promise<EpShipment> {
  const body = {
    shipment: {
      from_address: FROM_ADDRESS,
      // Soft verification: warnings surface in the rate picker, hard failures throw.
      to_address: { ...to, country: to.country || "US", verify: ["delivery"] },
      parcel: { weight: weightOz },
      options: { label_format: "PDF" },
    },
  };
  return (await epFetch("/shipments", { method: "POST", body })) as EpShipment;
}

export async function getShipment(id: string): Promise<EpShipment> {
  return (await epFetch(`/shipments/${id}`)) as EpShipment;
}

export async function buyShipment(id: string, rateId: string): Promise<EpShipment> {
  return (await epFetch(`/shipments/${id}/buy`, { method: "POST", body: { rate: { id: rateId } } })) as EpShipment;
}

// USPS refunds are asynchronous: EasyPost answers "submitted" and it settles to
// "refunded" (or "rejected") on the carrier's schedule, days later.
export async function refundShipment(id: string): Promise<EpShipment> {
  return (await epFetch(`/shipments/${id}/refund`, { method: "POST" })) as EpShipment;
}

// ── Rates ─────────────────────────────────────────────────────────────────────

// What the UI and the order row see. postage_cents keeps us on the explicit side
// of the shop_orders dollars-vs-cents mix (rate arrives as a dollar string).
export type QuotedRate = { rate_id: string; service: string; postage_cents: number; delivery_days: number | null };

export function filterUspsRates(rates: EpRate[] | undefined): QuotedRate[] {
  return (rates ?? [])
    .filter((r) => r.carrier === "USPS")
    .map((r) => ({
      rate_id: r.id,
      service: r.service,
      postage_cents: Math.round(parseFloat(r.rate) * 100),
      delivery_days: r.delivery_days ?? null,
    }))
    .filter((r) => Number.isFinite(r.postage_cents))
    .sort((a, b) => a.postage_cents - b.postage_cents);
}

// ── Signed rate quotes (checkout) ─────────────────────────────────────────────
// The website shows customers rates quoted here, then hands the chosen rate back
// to its create-intent function. A client-supplied price is never trusted: each
// rate is HMAC-signed over shipment_id|rate_id|postage_cents|expires_at|service
// with INTERNAL_API_SECRET (already shared by both deployments), and the website
// verifies the signature server-side before charging that amount. service is in
// the payload so a tampered service name can't mislead HQ's "customer paid for
// this" badge into buying a pricier label than was paid for.

import { createHmac } from "crypto";

export type SignedQuotedRate = QuotedRate & { expires_at: number; sig: string };

export function signQuotedRate(shipmentId: string, rate: QuotedRate, expiresAtEpochSec: number): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET is not configured");
  const payload = `${shipmentId}|${rate.rate_id}|${rate.postage_cents}|${expiresAtEpochSec}|${rate.service}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function verificationWarnings(shipment: EpShipment): string[] {
  const v = shipment.to_address?.verifications?.delivery;
  if (!v || v.success !== false) return [];
  const msgs = (v.errors ?? []).map((e) => e.message || "").filter(Boolean);
  return msgs.length ? msgs : ["Address failed delivery verification."];
}
