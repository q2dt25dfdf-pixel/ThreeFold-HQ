import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { markShipped } from "@/lib/markShipped";
import { getLabelSignedUrl } from "@/lib/getSignedUrl";
import {
  EasyPostError, buyShipment, getShipment, isEasyPostConfigured, isPaymentRequired,
  type EpShipment,
} from "@/lib/easypost";
import type { ShopOrderData } from "@/lib/shopOrders";

export const dynamic = "force-dynamic";

const LABELS_BUCKET = "shipping-labels";

// POST /api/shop-orders/[id]/label/buy   body: { rate_id? }
//
// Money-safety choreography (never spend money we can't find again):
//   1. Pre-write easypost = { shipment_id, rate_id, status: "purchasing" } BEFORE
//      the buy call. If that write fails, abort — nothing spent.
//   2. On entry, an existing "purchasing" block means a buy may have happened:
//      GET the shipment; if postage_label exists, SKIP the buy and only resume
//      persistence. Double-purchase is impossible.
//   3. If post-buy persistence fails after retries, still return tracking + the
//      EasyPost label URL so the label is in hand, and log loudly.
//
// An already-"purchased" order returns its label with a fresh signed URL — this is
// also the Reprint path, and it re-uploads the PDF if the original upload failed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  if (!isEasyPostConfigured()) {
    return NextResponse.json({ error: "EasyPost not configured", error_code: "NOT_CONFIGURED" }, { status: 503 });
  }
  const { id } = await params;
  let body: { rate_id?: string };
  try { body = await request.json(); } catch { body = {}; }

  const db = getSupabaseAdmin();
  const { data: rows } = await db.from("shop_orders").select("id, data").eq("id", id).limit(1);
  if (!rows?.length) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const existing = (rows[0].data ?? {}) as ShopOrderData;
  const ep = existing.easypost;

  // ── Reprint / idempotent re-entry on a completed purchase ──────────────────
  if (ep?.status === "purchased") {
    let labelPath = ep.label_path ?? null;
    if (!labelPath && ep.shipment_id) {
      // Heal an earlier failed PDF upload.
      try {
        const shipment = await getShipment(ep.shipment_id);
        if (shipment.postage_label?.label_url) {
          labelPath = await storeLabelPdf(db, id, shipment.postage_label.label_url);
          if (labelPath) {
            await db.from("shop_orders")
              .update({ data: { ...existing, easypost: { ...ep, label_path: labelPath } } })
              .eq("id", id);
          }
        }
      } catch (e) {
        console.error(`[shop-orders/${id} label/buy] reprint re-upload failed:`, e);
      }
    }
    const signed = labelPath ? await getLabelSignedUrl(labelPath) : null;
    return NextResponse.json({
      ok: true, already_purchased: true,
      tracking: ep.tracking_code, service: ep.service, postage_cents: ep.postage_cents,
      label_signed_url: signed, label_url: ep.label_url ?? null,
    });
  }

  // ── Resume check: a "purchasing" block may point at a bought label ─────────
  let boughtShipment: EpShipment | null = null;
  if (ep?.status === "purchasing" && ep.shipment_id) {
    try {
      const shipment = await getShipment(ep.shipment_id);
      if (shipment.postage_label) boughtShipment = shipment; // bought — resume persistence only
    } catch (e) {
      const msg = e instanceof EasyPostError ? e.message : "EasyPost lookup failed";
      return NextResponse.json({ error: `Can't confirm the pending purchase (${msg}). Try again.` }, { status: 502 });
    }
  }

  let current = existing;

  if (!boughtShipment) {
    const shipmentId = ep?.shipment_id;
    const rateId = (body.rate_id ?? "").trim() || ep?.rate_id;
    if (!shipmentId) return NextResponse.json({ error: "Fetch rates first." }, { status: 400 });
    if (!rateId) return NextResponse.json({ error: "Pick a rate first." }, { status: 400 });

    // 1. Pre-write the recovery pointer. Fails → abort with no money spent.
    current = { ...existing, easypost: { ...ep, shipment_id: shipmentId, rate_id: rateId, status: "purchasing" } };
    const { error: preErr } = await db.from("shop_orders").update({ data: current }).eq("id", id);
    if (preErr) {
      return NextResponse.json({ error: `Aborted before purchase — couldn't record intent: ${preErr.message}` }, { status: 500 });
    }

    // 2. Buy.
    try {
      boughtShipment = await buyShipment(shipmentId, rateId);
    } catch (e) {
      if (e instanceof EasyPostError && e.status < 500) {
        // Definitive rejection — no money moved. Put the order back to "quoted" so
        // retry is clean.
        const reverted: ShopOrderData = { ...current, easypost: { shipment_id: shipmentId, rate_id: rateId, status: "quoted" } };
        await db.from("shop_orders").update({ data: reverted }).eq("id", id);
        if (isPaymentRequired(e)) {
          return NextResponse.json(
            { error: "EasyPost balance too low — add funds in the EasyPost dashboard, then retry.", error_code: "PAYMENT_REQUIRED" },
            { status: 402 },
          );
        }
        return NextResponse.json({ error: e.message, error_code: e.code }, { status: 422 });
      }
      // Ambiguous (network / EasyPost 5xx): the buy MAY have gone through. Leave the
      // "purchasing" pointer in place — the next click resumes safely.
      console.error(`[shop-orders/${id} label/buy] ambiguous buy failure — left in "purchasing":`, e);
      return NextResponse.json(
        { error: "The purchase may or may not have completed. Click Buy again to resume safely.", error_code: "BUY_AMBIGUOUS" },
        { status: 502 },
      );
    }
  }

  // ── 3. Persist: PDF to storage, easypost block + shipped + E2 in one path ──
  const trackingCode = boughtShipment.tracking_code ?? "";
  const epLabelUrl = boughtShipment.postage_label?.label_url ?? null;
  const selected = boughtShipment.selected_rate ?? null;

  let labelPath: string | null = null;
  if (epLabelUrl) {
    labelPath = await storeLabelPdf(db, id, epLabelUrl);
    if (!labelPath) console.error(`[shop-orders/${id} label/buy] label PDF upload failed — EasyPost URL still valid ~180 days`);
  }

  const block: NonNullable<ShopOrderData["easypost"]> = {
    shipment_id: boughtShipment.id,
    status: "purchased",
    rate_id: selected?.id ?? current.easypost?.rate_id,
    carrier: selected?.carrier ?? "USPS",
    service: selected?.service,
    postage_cents: selected ? Math.round(parseFloat(selected.rate) * 100) : undefined,
    tracking_code: trackingCode || undefined,
    label_url: epLabelUrl ?? undefined,
    label_path: labelPath,
    purchased_at: new Date().toISOString(),
    refund_status: boughtShipment.refund_status ?? null,
  };

  let emailStatus: string | undefined;
  let persistError: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    persistError = null;
    if (current.shipped) {
      // Order was already hand-marked shipped — just record the purchase (and the
      // tracking number if none was typed in). No second E2 email: markShipped's
      // stamp guard aside, we never re-enter the email path here.
      const upd: ShopOrderData = { ...current, easypost: block, ...(current.tracking ? {} : trackingCode ? { tracking: trackingCode } : {}) };
      const { error } = await db.from("shop_orders").update({ data: upd }).eq("id", id);
      if (!error) break;
      persistError = error.message;
    } else {
      const r = await markShipped(db, id, current, { tracking: trackingCode, merge: { easypost: block } });
      if (r.alreadyShipped) { current = { ...current, shipped: true }; attempt--; continue; } // raced — redo as direct update
      if (r.ok) { emailStatus = r.emailStatus; break; }
      persistError = r.error;
    }
    if (attempt < 3) await new Promise((res) => setTimeout(res, 400 * attempt));
  }

  const signed = labelPath ? await getLabelSignedUrl(labelPath) : null;

  if (persistError) {
    // LOUD: money spent, DB write failing. The "purchasing" pointer from step 1 is
    // still on the row, so a later Buy click resumes persistence — nothing is lost.
    console.error(
      `[shop-orders/${id} label/buy] LABEL BOUGHT BUT PERSISTENCE FAILED after retries — ` +
      `shipment ${boughtShipment.id}, tracking ${trackingCode}, label ${epLabelUrl}. Error: ${persistError}`,
    );
    return NextResponse.json({
      ok: true, persisted: false,
      tracking: trackingCode, label_url: epLabelUrl, label_signed_url: signed,
      service: block.service, postage_cents: block.postage_cents,
      error: `Label purchased but saving to the order failed (${persistError}). Click Buy again to finish saving.`,
    });
  }

  return NextResponse.json({
    ok: true, persisted: true,
    tracking: trackingCode, label_signed_url: signed, label_url: epLabelUrl,
    service: block.service, postage_cents: block.postage_cents,
    ...(emailStatus ? { email: emailStatus } : {}),
  });
}

// Download the label PDF from EasyPost and store our permanent copy. Returns the
// storage path, or null on any failure (non-fatal — the EasyPost URL keeps working
// for ~180 days and Reprint retries the upload).
async function storeLabelPdf(db: SupabaseClient, orderId: string, labelUrl: string): Promise<string | null> {
  try {
    const res = await fetch(labelUrl);
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    const path = `orders/${orderId}/label.pdf`;
    const { error } = await db.storage
      .from(LABELS_BUCKET)
      .upload(path, bytes, { upsert: true, contentType: "application/pdf" });
    return error ? null : path;
  } catch {
    return null;
  }
}
