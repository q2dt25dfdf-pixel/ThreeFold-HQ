import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import type { ShopOrderData, ShipAddress } from "@/lib/shopOrders";

// GET /api/shop-orders/export -> Pirate Ship batch-import CSV of UNSHIPPED orders.
// Generated in HQ from shop_orders (service role), session-gated. Always the "To Ship" list.
function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const HEADERS = ["Order ID", "Recipient Name", "Email", "Street1", "Street2", "City", "State", "Zipcode", "Country", "Items", "Amount"];

export async function GET(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return new Response("Unauthorized", { status: auth.status });

  const db = getSupabaseAdmin();
  const { data: rows, error } = await db.from("shop_orders").select("id, data");
  if (error) return new Response("Error: " + error.message, { status: 500 });

  const unshipped = (rows ?? []).filter((r) => !((r.data ?? {}) as ShopOrderData).shipped);
  const lines = [HEADERS.join(",")];
  for (const r of unshipped) {
    const d = (r.data ?? {}) as ShopOrderData;
    const a: ShipAddress = d.shipping_address || {};
    lines.push([
      d.payment_intent_id || r.id, d.customer_name || "", d.email || "",
      a.line1 || "", a.line2 || "", a.city || "", a.state || "", a.postal_code || "", a.country || "US",
      d.order_items || "", d.amount != null ? d.amount : "",
    ].map(cell).join(","));
  }

  return new Response(lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="shop-orders-to-ship.csv"',
      "Cache-Control": "no-store",
    },
  });
}
