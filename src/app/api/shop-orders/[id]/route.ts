import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import type { ShopOrderData } from "@/lib/shopOrders";

// GET /api/shop-orders/[id]     -> full order data (service role, session-gated)
// PATCH /api/shop-orders/[id]   -> mark shipped (sets data.shipped + data.shipped_at)
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
  return NextResponse.json({ id: row.id, data: row.data }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const { id } = await params;

  let body: { shipped?: boolean };
  try { body = await request.json(); } catch { body = {}; }
  if (body.shipped !== true) return NextResponse.json({ error: "Only { shipped: true } is supported." }, { status: 400 });

  const row = await loadOrder(id);
  if (!row) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const existing = (row.data ?? {}) as ShopOrderData;
  if (existing.shipped) return NextResponse.json({ ok: true, alreadyShipped: true }); // idempotent

  const db = getSupabaseAdmin();
  const updated = { ...existing, shipped: true, shipped_at: new Date().toISOString() };
  const { error } = await db.from("shop_orders").update({ data: updated }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, shipped_at: updated.shipped_at });
}
