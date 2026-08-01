import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import type { ShopOrderData } from "@/lib/shopOrders";
import type { ShopFinanceRow } from "@/lib/financesShop";

// GET /api/finances/shop-summary
// shop_orders is RLS-on (anon cannot read), and the Finances page reads all its other tables
// with the anon browser client — so the shop slice threads in HERE, server-side via the service
// role, gated to a logged-in HQ session. Returns MINIMAL, NO-PII rows (no name/email/address);
// the page runs aggregateShopFinances() over them so shop + custom share one client-side path.
export async function GET(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });

  const db = getSupabaseAdmin();
  const { data, error } = await db.from("shop_orders").select("id, data");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows: ShopFinanceRow[] = (data ?? []).map((r) => {
    const d = (r.data ?? {}) as ShopOrderData;
    return {
      id: r.id as string,
      amount: typeof d.amount === "number" ? d.amount : null,
      tax_amount: typeof d.tax_amount === "number" ? d.tax_amount : null,
      shipping_cents: typeof d.shipping_cents === "number" ? d.shipping_cents : null,
      created_at: d.created_at || null,
      ship_code_used: !!d.ship_code_used,
      shipped: !!d.shipped,
      refunded: d.refunded === true,
      status: d.status || "",
    };
  });

  return NextResponse.json({ rows }, { headers: { "Cache-Control": "no-store" } });
}
