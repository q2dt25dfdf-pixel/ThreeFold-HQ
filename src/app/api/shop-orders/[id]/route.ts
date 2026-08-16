import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { markShipped } from "@/lib/markShipped";
import { isEasyPostConfigured } from "@/lib/easypost";
import { createNotification } from "@/lib/notifications";
import { planRestock, type RecordedDecrementLine } from "@/lib/inventoryDecrement";
import type { InventoryItem } from "@/lib/inventory";
import type { ShopOrderData } from "@/lib/shopOrders";

// GET /api/shop-orders/[id]     -> full order data (service role, session-gated)
// PATCH /api/shop-orders/[id]   -> mark shipped ({ shipped: true, tracking? } — sets
//                                  data.shipped + shipped_at + optional tracking, then sends
//                                  the E2 shipped email to the customer; tracking printed bare)
//                                  or add a note ({ addNote: { text, author } }; `at` server-set)
async function loadOrder(id: string) {
  const db = getSupabaseAdmin();
  const { data: rows } = await db.from("shop_orders").select("id, data").eq("id", id).limit(1);
  return rows && rows.length ? rows[0] : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const { id } = await params;
  const row = await loadOrder(id);
  if (!row) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  // easypost_configured lets the detail page disable the label button up front
  // (the key lives only in Vercel env — local dev renders the degraded state).
  return NextResponse.json(
    { id: row.id, data: row.data, easypost_configured: isEasyPostConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const { id } = await params;

  let body: {
    shipped?: boolean; tracking?: string; addNote?: { text?: string; author?: string };
    refunded?: boolean; restock?: boolean; actor?: string;
  };
  try { body = await request.json(); } catch { body = {}; }
  const isShip = body.shipped === true;
  const isNote = !!body.addNote;
  const isRefund = typeof body.refunded === "boolean";
  const isRestock = body.restock === true;
  if (!isShip && !isNote && !isRefund && !isRestock) {
    return NextResponse.json({ error: "Only { shipped }, { addNote }, { refunded } or { restock } is supported." }, { status: 400 });
  }

  const row = await loadOrder(id);
  if (!row) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const existing = (row.data ?? {}) as ShopOrderData & {
    stock_decrement?: { status?: string; lines?: RecordedDecrementLine[] };
  };
  const db = getSupabaseAdmin();

  // ── Manual refund toggle (v1 — no Stripe refund webhook). Flips data.refunded so
  // finances drops the order from revenue + tax. Refund does NOT auto-restock; when
  // turning ON, we surface a notification offering one-click restock of the recorded
  // blanks (only if there's an applied decrement not already reversed). ────────────
  if (isRefund) {
    const nowIso = new Date().toISOString();
    const turningOn = body.refunded === true && existing.refunded !== true;
    const updated: ShopOrderData = {
      ...existing,
      refunded: body.refunded,
      ...(body.refunded ? { refunded_at: nowIso } : { refunded_at: undefined }),
    };
    const { error } = await db.from("shop_orders").update({ data: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (turningOn) {
      const recorded = existing.stock_decrement?.lines ?? [];
      const restockable = recorded.reduce((s, l) => s + Math.max(0, Math.floor(Number(l.applied) || 0)), 0);
      const canRestock = restockable > 0 && !existing.restocked_at;
      const who = (body.actor || "").trim();
      await createNotification({
        type: "shop_order_refunded",
        title: "Shop order refunded",
        message: canRestock
          ? `${existing.customer_name || id} refunded${who ? ` by ${who}` : ""}. Open to restock ${restockable} blank${restockable === 1 ? "" : "s"}.`.slice(0, 300)
          : `${existing.customer_name || id} refunded${who ? ` by ${who}` : ""}. No blanks to restock.`.slice(0, 300),
        entity_type: "shop_order",
        entity_id: id,
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, refunded: body.refunded });
  }

  // ── One-click restock: reverse the recorded decrement, adding each line's applied
  // units back to the exact inventory rows they came from. Idempotent via restocked_at. ─
  if (isRestock) {
    if (existing.restocked_at) return NextResponse.json({ ok: true, alreadyRestocked: true });
    const recorded = existing.stock_decrement?.lines ?? [];
    const nowIso = new Date().toISOString();

    const { data: invRows, error: invErr } = await db.from("inventory").select("id, data");
    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
    const items = ((invRows ?? []) as { id: string; data: InventoryItem }[]).map((r) => r.data).filter(Boolean);

    const plan = planRestock(recorded, items, id, nowIso);
    const byId = new Map(items.map((it) => [it.id, it]));
    for (const u of plan.updates) {
      const it = byId.get(u.id);
      if (!it) continue;
      const updatedItem: InventoryItem = {
        ...it,
        qty_on_hand: u.newQty,
        adjustments: [...(it.adjustments ?? []), u.adjustment],
        updated_at: nowIso,
      };
      const { error: upErr } = await db.from("inventory").update({ data: updatedItem }).eq("id", u.id);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const stamped = { ...existing, restocked_at: nowIso };
    const { error: stampErr } = await db.from("shop_orders").update({ data: stamped }).eq("id", id);
    if (stampErr) return NextResponse.json({ error: stampErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, restocked: plan.restocked, missing: plan.missing });
  }

  if (isNote) {
    const text = (body.addNote?.text ?? "").trim();
    const author = (body.addNote?.author ?? "").trim();
    if (!text || !author) return NextResponse.json({ error: "A note needs text and an author." }, { status: 400 });
    const note = { text, author, at: new Date().toISOString() };
    const updated = { ...existing, notes: [...(existing.notes ?? []), note] };
    const { error } = await db.from("shop_orders").update({ data: updated }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, note });
  }

  // Shipped write + E2 email live in lib/markShipped.ts — shared with the label-buy
  // route, which merges its easypost block into the same single update.
  const tracking = (body.tracking ?? "").trim();
  const result = await markShipped(db, id, existing, { tracking: tracking || undefined });
  if (result.alreadyShipped) return NextResponse.json({ ok: true, alreadyShipped: true }); // idempotent
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true, shipped_at: result.updated.shipped_at, ...(tracking ? { tracking } : {}), email: result.emailStatus });
}
