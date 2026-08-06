import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";
import { sendEmail } from "@/lib/sendEmail";
import { buildShopShippedEmail } from "@/lib/shopOrderEmails";
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
  return NextResponse.json({ id: row.id, data: row.data }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const { id } = await params;

  let body: { shipped?: boolean; tracking?: string; addNote?: { text?: string; author?: string } };
  try { body = await request.json(); } catch { body = {}; }
  const isShip = body.shipped === true;
  const isNote = !!body.addNote;
  if (!isShip && !isNote) return NextResponse.json({ error: "Only { shipped: true } or { addNote } is supported." }, { status: 400 });

  const row = await loadOrder(id);
  if (!row) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const existing = (row.data ?? {}) as ShopOrderData;
  const db = getSupabaseAdmin();

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

  if (existing.shipped) return NextResponse.json({ ok: true, alreadyShipped: true }); // idempotent
  const tracking = (body.tracking ?? "").trim();
  const updated: ShopOrderData = {
    ...existing,
    shipped: true,
    shipped_at: new Date().toISOString(),
    ...(tracking ? { tracking } : {}),
  };
  const { error } = await db.from("shop_orders").update({ data: updated }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // E2 shipped email — AFTER the shipped write, never blocking it. The false→true guard
  // above plus the shipped_email_sent_at stamp make this single-send. Failures are
  // recorded on the row and reported in the response, but mark-shipped still succeeds.
  let emailStatus = "skipped: no customer email";
  const to = String(updated.email || "").trim();
  if (to && !updated.shipped_email_sent_at) {
    const { subject, body: emailBody } = buildShopShippedEmail(updated);
    const result = await sendEmail({ to, subject, body: emailBody });
    emailStatus = result.sent ? `sent via ${result.sentVia}` : `failed: ${result.error}`;
    const stamp = result.sent
      ? { shipped_email_sent_at: new Date().toISOString(), shipped_email_status: emailStatus }
      : { shipped_email_status: emailStatus };
    await db.from("shop_orders").update({ data: { ...updated, ...stamp } }).eq("id", id);
    if (!result.sent) console.error(`[shop-orders/${id}] shipped email failed: ${result.error}`);
  } else if (!to) {
    await db.from("shop_orders").update({ data: { ...updated, shipped_email_status: emailStatus } }).eq("id", id);
    console.warn(`[shop-orders/${id}] no customer email — shipped email skipped`);
  }

  return NextResponse.json({ ok: true, shipped_at: updated.shipped_at, ...(tracking ? { tracking } : {}), email: emailStatus });
}
