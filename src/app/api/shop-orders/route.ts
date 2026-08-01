import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { shipToLine, type ShopOrderData } from "@/lib/shopOrders";

// GET /api/shop-orders?filter=to-ship|shipped|all  (default to-ship)
// shop_orders is RLS-on (anon cannot read) — so this route reads via the service role and is
// gated to a logged-in HQ session. Returns { stats, orders }.
export async function GET(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const filter = new URL(request.url).searchParams.get("filter") || "to-ship";
  const db = getSupabaseAdmin();
  const { data: rows, error } = await db.from("shop_orders").select("id, data");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = Date.now();
  const WEEK = 7 * 864e5, MONTH = 30 * 864e5;
  let toShipCount = 0, toShipCents = 0, shippedWeek = 0, revenue30 = 0;

  const all = (rows ?? []).map((r) => {
    const d = (r.data ?? {}) as ShopOrderData;
    const created = d.created_at ? Date.parse(d.created_at) : 0;
    const shippedAt = d.shipped_at ? Date.parse(d.shipped_at) : 0;
    const total = typeof d.amount === "number" ? d.amount : 0;
    if (!d.shipped) { toShipCount++; toShipCents += Math.round(total * 100); }
    if (d.shipped && shippedAt && now - shippedAt <= WEEK) shippedWeek++;
    if (created && now - created <= MONTH) revenue30 += total;
    return {
      id: r.id as string,
      name: d.customer_name || "—",
      email: d.email || "",
      created_at: d.created_at || null,
      items: d.order_items || "",
      total,
      shipTo: shipToLine(d.shipping_address),
      shipped: !!d.shipped,
      shipped_at: d.shipped_at || null,
    };
  });

  all.sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0));

  const orders = all.filter((o) =>
    filter === "all" ? true : filter === "shipped" ? o.shipped : !o.shipped
  );

  return NextResponse.json({
    stats: {
      toShipCount,
      toShipCollected: toShipCents / 100,
      shippedThisWeek: shippedWeek,
      revenue30Days: Math.round(revenue30 * 100) / 100,
    },
    orders,
  }, { headers: { "Cache-Control": "no-store" } });
}
