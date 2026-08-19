import { NextResponse } from "next/server";
import { validateInternalRequest } from "@/lib/internalAuth";
import { createNotification } from "@/lib/notifications";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// POST /api/internal/shop-order-created  (Bearer INTERNAL_API_SECRET)
// Called by the website Stripe webhook on EVERY payment_intent.succeeded delivery for a
// storefront order (the webhook no longer gates jobs on first-insert), so HQ fires the same
// bell + web push as "New Lead". Body: { customer_name, first_item, more_count, total,
// payment_intent_id }. Message: "Name · First item +N more · $total".
//
// Idempotent the same way as shop-order-confirmation/-stock: a shop_orders row with
// data.notified_at set is a no-op, so a Stripe retry can't ring the bell twice. A missing
// row (this delivery's insert failed) is also a no-op — the next delivery re-inserts and
// notifies then. Notify-then-stamp, matching the other two: a rare double beats a silent none.
export async function POST(request: Request) {
  const auth = validateInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: auth.status });

  let b: { customer_name?: string; first_item?: string; more_count?: number; total?: number | string; payment_intent_id?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ success: false, error: "Bad JSON" }, { status: 400 }); }

  const piId = (b.payment_intent_id || "").toString().trim();
  if (!piId) return NextResponse.json({ success: false, error: "payment_intent_id is required." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: rows, error: loadErr } = await db.from("shop_orders").select("id, data").eq("id", piId).limit(1);
  if (loadErr) return NextResponse.json({ success: false, error: loadErr.message }, { status: 500 });
  if (!rows || !rows.length) return NextResponse.json({ success: true, deferred: true });
  const order = rows[0].data as Record<string, unknown> & { notified_at?: string };

  // Idempotency guard.
  if (order.notified_at) {
    return NextResponse.json({ success: true, alreadyNotified: true });
  }

  const name = (b.customer_name || "New order").toString().trim();
  const first = (b.first_item || "").toString().trim();
  const more = Number(b.more_count || 0);
  const totalNum = Number(b.total);
  const totalStr = Number.isFinite(totalNum) ? `$${totalNum.toFixed(2)}` : "";

  const parts = [name];
  if (first) parts.push(more > 0 ? `${first} +${more} more` : first);
  if (totalStr) parts.push(totalStr);

  await createNotification({
    type: "shop_order_created",
    title: "New Order",
    message: parts.join(" · "),
    entity_type: "shop_order",
    entity_id: piId,
  });

  const { error: stampErr } = await db
    .from("shop_orders")
    .update({ data: { ...order, notified_at: new Date().toISOString() } })
    .eq("id", piId);
  if (stampErr) return NextResponse.json({ success: false, error: stampErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
