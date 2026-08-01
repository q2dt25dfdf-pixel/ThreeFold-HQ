import { NextResponse } from "next/server";
import { validateInternalRequest } from "@/lib/internalAuth";
import { createNotification } from "@/lib/notifications";

// POST /api/internal/shop-order-created  (Bearer INTERNAL_API_SECRET)
// Called by the website Stripe webhook after a shop order is recorded, so HQ fires the same
// bell + web push as "New Lead". Body: { customer_name, first_item, more_count, total,
// payment_intent_id }. Message: "Name · First item +N more · $total".
export async function POST(request: Request) {
  const auth = validateInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: auth.status });

  let b: { customer_name?: string; first_item?: string; more_count?: number; total?: number | string; payment_intent_id?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ success: false, error: "Bad JSON" }, { status: 400 }); }

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
    entity_id: (b.payment_intent_id || "").toString(),
  });

  return NextResponse.json({ success: true });
}
