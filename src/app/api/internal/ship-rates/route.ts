import { NextResponse } from "next/server";
import { validateInternalRequest } from "@/lib/internalAuth";
import {
  EasyPostError, computeOrderWeightOz, createShipment, filterUspsRates,
  isEasyPostConfigured, signQuotedRate,
} from "@/lib/easypost";

export const dynamic = "force-dynamic";

// POST /api/internal/ship-rates   (Bearer INTERNAL_API_SECRET — called by the
// website's checkout, functions/api/ship-quote.js)
//
// The single implementation of cart weighing + USPS rate filtering: the website
// never copies the weight constants and never holds the EasyPost key. Body:
//   { items: [{ name, size, qty }], address: { line1, line2?, city, state,
//     postal_code, country? } }
// Returns { shipment_id, weight_oz, rates: [{ rate_id, service, postage_cents,
// delivery_days, expires_at, sig }] } — each rate HMAC-signed for 30 minutes so
// the website's create-intent can trust the amount without a second call here.
// Any non-200 makes the website fall back to flat $5.95; it never blocks checkout.
const QUOTE_TTL_SEC = 30 * 60;

export async function POST(request: Request) {
  const auth = validateInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  if (!isEasyPostConfigured()) {
    return NextResponse.json({ error: "EasyPost not configured" }, { status: 503 });
  }

  let body: {
    items?: { name?: string; size?: string; qty?: number }[];
    address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string };
  };
  try { body = await request.json(); } catch { body = {}; }

  const items = (body.items ?? [])
    .map((it) => ({ name: String(it.name ?? ""), size: String(it.size ?? ""), qty: Math.max(1, Math.floor(Number(it.qty) || 1)) }))
    .filter((it) => it.name);
  const a = body.address ?? {};
  if (!items.length) return NextResponse.json({ error: "No items to quote." }, { status: 400 });
  const missing = (["line1", "city", "state", "postal_code"] as const).filter((k) => !String(a[k] ?? "").trim());
  if (missing.length) {
    return NextResponse.json({ error: `Address is missing: ${missing.join(", ")}.` }, { status: 400 });
  }

  const weight = computeOrderWeightOz(items);
  if ("error" in weight) return NextResponse.json({ error: weight.error }, { status: 400 });

  try {
    const shipment = await createShipment(
      { street1: a.line1, street2: a.line2, city: a.city, state: a.state, zip: a.postal_code, country: a.country },
      weight.oz,
    );
    const expiresAt = Math.floor(Date.now() / 1000) + QUOTE_TTL_SEC;
    const rates = filterUspsRates(shipment.rates).map((r) => ({
      ...r,
      expires_at: expiresAt,
      sig: signQuotedRate(shipment.id, r, expiresAt),
    }));
    if (!rates.length) {
      const msgs = (shipment.messages ?? []).map((m) => m.message).filter(Boolean).join("; ");
      return NextResponse.json({ error: msgs || "No USPS rates for this address." }, { status: 422 });
    }
    return NextResponse.json({ shipment_id: shipment.id, weight_oz: weight.oz, rates });
  } catch (e) {
    if (e instanceof EasyPostError) {
      return NextResponse.json({ error: e.message }, { status: e.status >= 500 ? 502 : 422 });
    }
    console.error("[internal/ship-rates] failed:", e);
    return NextResponse.json({ error: "Rate lookup failed" }, { status: 500 });
  }
}
