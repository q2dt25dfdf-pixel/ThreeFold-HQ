import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { EasyPostError, isEasyPostConfigured, refundShipment } from "@/lib/easypost";
import type { ShopOrderData } from "@/lib/shopOrders";

export const dynamic = "force-dynamic";

// POST /api/shop-orders/[id]/label/void
// Requests a USPS refund for the purchased label. Refunds are ASYNC on the carrier
// side: EasyPost answers "submitted" and it settles to "refunded" / "rejected" days
// later. Re-clicking re-requests and stores whatever status comes back — safe.
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
  const ep = existing.easypost;

  if (ep?.status !== "purchased") {
    return NextResponse.json({ error: "No purchased label to void on this order." }, { status: 400 });
  }

  try {
    const shipment = await refundShipment(ep.shipment_id);
    const refundStatus = shipment.refund_status ?? "submitted";
    const updated: ShopOrderData = {
      ...existing,
      easypost: { ...ep, refund_status: refundStatus, refund_requested_at: ep.refund_requested_at ?? new Date().toISOString() },
    };
    const { error } = await db.from("shop_orders").update({ data: updated }).eq("id", id);
    if (error) {
      console.error(`[shop-orders/${id} label/void] refund requested (${refundStatus}) but write failed: ${error.message}`);
      return NextResponse.json({ ok: true, persisted: false, refund_status: refundStatus, error: error.message });
    }
    return NextResponse.json({ ok: true, refund_status: refundStatus });
  } catch (e) {
    if (e instanceof EasyPostError) {
      return NextResponse.json({ error: e.message, error_code: e.code }, { status: e.status >= 500 ? 502 : 422 });
    }
    console.error(`[shop-orders/${id} label/void] failed:`, e);
    return NextResponse.json({ error: "Void failed" }, { status: 500 });
  }
}
