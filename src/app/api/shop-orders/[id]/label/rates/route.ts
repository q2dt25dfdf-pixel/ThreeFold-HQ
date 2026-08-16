import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import {
  EasyPostError, computeOrderWeightOz, createShipment, filterUspsRates,
  getShipment, isEasyPostConfigured, verificationWarnings,
} from "@/lib/easypost";
import { resolveLineItems, type ShopOrderData } from "@/lib/shopOrders";

export const dynamic = "force-dynamic";

// POST /api/shop-orders/[id]/label/rates
// Creates an EasyPost shipment (no money spent) and returns USPS rates only.
// Persists data.easypost = { shipment_id, status: "quoted" } so the buy route
// has a shipment to purchase against.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  if (!isEasyPostConfigured()) {
    return NextResponse.json({ error: "EasyPost not configured", error_code: "NOT_CONFIGURED" }, { status: 503 });
  }
  const { id } = await params;
  const db = getSupabaseAdmin();
  const { data: rows } = await db.from("shop_orders").select("id, data").eq("id", id).limit(1);
  if (!rows?.length) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const existing = (rows[0].data ?? {}) as ShopOrderData;

  if (existing.easypost?.status === "purchased") {
    return NextResponse.json({ error: "A label was already purchased for this order.", error_code: "ALREADY_PURCHASED" }, { status: 409 });
  }
  // A "purchasing" block is the recovery pointer for a possibly-bought label. Never
  // clobber it without asking EasyPost whether the buy actually went through.
  if (existing.easypost?.status === "purchasing") {
    try {
      const shipment = await getShipment(existing.easypost.shipment_id);
      if (shipment.postage_label) {
        return NextResponse.json(
          { error: "A purchase is pending on this order — resume it instead of re-quoting.", error_code: "PURCHASE_PENDING" },
          { status: 409 },
        );
      }
      // Buy never happened — safe to quote fresh below.
    } catch (e) {
      const msg = e instanceof EasyPostError ? e.message : "EasyPost lookup failed";
      return NextResponse.json({ error: `Can't confirm the pending purchase (${msg}). Try again.` }, { status: 502 });
    }
  }

  const a = existing.shipping_address ?? {};
  const missing = (["line1", "city", "state", "postal_code"] as const).filter((k) => !(a[k] ?? "").trim());
  if (missing.length) {
    return NextResponse.json({ error: `Delivery address is missing: ${missing.join(", ")}.` }, { status: 400 });
  }

  const weight = computeOrderWeightOz(resolveLineItems(existing));
  if ("error" in weight) return NextResponse.json({ error: weight.error }, { status: 400 });

  try {
    const shipment = await createShipment(
      {
        name: existing.customer_name,
        street1: a.line1, street2: a.line2, city: a.city, state: a.state,
        zip: a.postal_code, country: a.country,
      },
      weight.oz,
    );
    const rates = filterUspsRates(shipment.rates);

    const updated: ShopOrderData = {
      ...existing,
      easypost: { shipment_id: shipment.id, status: "quoted" },
    };
    const { error } = await db.from("shop_orders").update({ data: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!rates.length) {
      const msgs = (shipment.messages ?? []).map((m) => m.message).filter(Boolean).join("; ");
      return NextResponse.json({
        shipment_id: shipment.id, rates: [], weight_oz: weight.oz,
        error: msgs ? `No USPS rates returned: ${msgs}` : "No USPS rates returned for this address.",
      });
    }
    return NextResponse.json({
      shipment_id: shipment.id,
      rates,
      weight_oz: weight.oz,
      warnings: verificationWarnings(shipment),
    });
  } catch (e) {
    if (e instanceof EasyPostError) {
      // Hard address/shipment failure — surface EasyPost's message verbatim.
      return NextResponse.json({ error: e.message, error_code: e.code }, { status: e.status >= 500 ? 502 : 422 });
    }
    console.error(`[shop-orders/${id} label/rates] failed:`, e);
    return NextResponse.json({ error: "Rate lookup failed" }, { status: 500 });
  }
}
