import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateInternalRequest } from "@/lib/internalAuth";
import { createNotification } from "@/lib/notifications";
import { resolveLineItems, type ShopOrderData } from "@/lib/shopOrders";
import { planDecrement, type BlankMapConfig } from "@/lib/inventoryDecrement";
import type { InventoryItem } from "@/lib/inventory";

// POST /api/internal/shop-order-stock  (Bearer INTERNAL_API_SECRET)
// Called by the website Stripe webhook after a NEW shop order is recorded. Decrements
// the blanks that order consumed, per the inventory_config blank-map (default + per-
// design overrides). HQ owns inventory + the mapping, so the decrement lives here.
//
// Body: { id } or { payment_intent_id } — the shop_orders row id (the PI id).
// Idempotent: a shop_orders row with data.stock_decremented_at set is a no-op, so a
// webhook retry (or a double-fire) decrements exactly once.
export async function POST(request: Request) {
  const auth = validateInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  let body: { id?: string; payment_intent_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 }); }
  const id = (body.id || body.payment_intent_id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });

  const db = getSupabaseAdmin();

  const { data: rows, error: loadErr } = await db.from("shop_orders").select("id, data").eq("id", id).limit(1);
  if (loadErr) return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  if (!rows || !rows.length) return NextResponse.json({ ok: false, error: "Shop order not found." }, { status: 404 });
  const order = rows[0].data as ShopOrderData & { stock_decremented_at?: string; stock_decrement?: unknown };

  // Idempotency guard.
  if (order.stock_decremented_at) {
    return NextResponse.json({ ok: true, alreadyDecremented: true });
  }

  const now = new Date().toISOString();
  const lines = resolveLineItems(order).map((li) => ({ name: li.name, size: li.size, qty: li.qty }));

  // Load the config (single row) + current inventory.
  const [{ data: cfgRows }, { data: invRows, error: invErr }] = await Promise.all([
    db.from("inventory_config").select("id, data").eq("id", "blank-map").limit(1),
    db.from("inventory").select("id, data"),
  ]);
  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
  const config = ((cfgRows && cfgRows.length ? cfgRows[0].data : {}) ?? {}) as BlankMapConfig;
  const items = ((invRows ?? []) as { id: string; data: InventoryItem }[]).map((r) => r.data).filter(Boolean);

  const plan = planDecrement(lines, config, items, id, now);

  // Apply inventory updates (decrement qty + append the order-tagged adjustment).
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const u of plan.updates) {
    const it = byId.get(u.id);
    if (!it) continue;
    const updated: InventoryItem = {
      ...it,
      qty_on_hand: u.newQty,
      adjustments: [...(it.adjustments ?? []), u.adjustment],
      updated_at: now,
    };
    const { error: upErr } = await db.from("inventory").update({ data: updated }).eq("id", u.id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  // Stamp the order: idempotency marker + the full outcome (enough to reverse a future
  // delete exactly — each line records its inventory_id and applied units).
  const stampedOrder = {
    ...order,
    stock_decremented_at: now,
    stock_decrement: { status: plan.status, lines: plan.lines },
  };
  const { error: stampErr } = await db.from("shop_orders").update({ data: stampedOrder }).eq("id", id);
  if (stampErr) return NextResponse.json({ ok: false, error: stampErr.message }, { status: 500 });

  // Surface issues — never silent. One bell notification summarizing what didn't apply.
  if (plan.status === "issues") {
    const problems = plan.lines.filter((l) => l.status !== "applied");
    const summary = problems
      .map((l) => `${l.design} (${l.size}) ${l.status}${l.short ? ` short ${l.short}` : ""}`)
      .join("; ");
    await createNotification({
      type: "inventory_stock_alert",
      title: "Stock alert",
      message: `Order ${id}: ${summary}`.slice(0, 300),
      entity_type: "shop_order",
      entity_id: id,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, status: plan.status, lines: plan.lines });
}
