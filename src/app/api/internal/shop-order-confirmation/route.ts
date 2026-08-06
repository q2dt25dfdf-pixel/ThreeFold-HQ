import { NextResponse } from "next/server";
import { validateInternalRequest } from "@/lib/internalAuth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/sendEmail";
import { buildShopConfirmationEmail, buildShopShippedEmail } from "@/lib/shopOrderEmails";
import type { ShopOrderData } from "@/lib/shopOrders";

// Fake order used ONLY by test mode ({ test_to }) — never reads or writes shop_orders.
const TEST_ORDER: ShopOrderData = {
  payment_intent_id: "pi_TEST00000000000000000000",
  email: "",
  customer_name: "Test Customer",
  shipping_address: { line1: "123 Test St", line2: "", city: "San Jose", state: "CA", postal_code: "95132", country: "US" },
  order_items: "San Francisco Tee (L) x1",
  line_items: [
    { name: "San Francisco Tee", size: "l", qty: 1, unit_cents: 3500 },
    { name: "Hawaii Map", size: "m", qty: 2, unit_cents: 3500 },
  ],
  amount: 114.14, tax_amount: 9.19, shipping_cents: 0,
  tracking: "TEST123456789",
};

// POST /api/internal/shop-order-confirmation  (Bearer INTERNAL_API_SECRET)
//
// Called by the WEBSITE Stripe webhook (JOB 3) after a NEW shop_orders row is inserted
// (inserted=true — the webhook's own dedupe). Sends the E1 order-confirmation email to
// the customer via the same sendEmail pipeline as invoice receipts (Gmail → Resend).
//
// Body: { payment_intent_id }
//
// Idempotent: dedupes on data.confirmation_email_sent_at, so a webhook retry or a
// double-call can never re-send. Failures are recorded on the row
// (confirmation_email_status) and return 200 — an email problem must never make
// Stripe retry the payment webhook.
export async function POST(request: Request) {
  const auth = validateInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: auth.status });

  let b: { payment_intent_id?: string; test_to?: string };
  try { b = await request.json(); } catch { return NextResponse.json({ success: false, error: "Bad JSON" }, { status: 400 }); }

  // ── Test mode: { test_to } sends E1 + E2 built from TEST_ORDER to that address.
  // Zero DB reads/writes — smoke-tests the template + Gmail/Resend path end to end.
  const testTo = (b.test_to || "").toString().trim();
  if (testTo) {
    const e1 = buildShopConfirmationEmail(TEST_ORDER);
    const r1 = await sendEmail({ to: testTo, subject: `[TEST] ${e1.subject}`, body: e1.body });
    const e2 = buildShopShippedEmail(TEST_ORDER);
    const r2 = await sendEmail({ to: testTo, subject: `[TEST] ${e2.subject}`, body: e2.body });
    console.log(`[shop-order-confirmation] TEST send to ${testTo}: E1=${r1.sent ? r1.sentVia : "FAIL " + r1.error} E2=${r2.sent ? r2.sentVia : "FAIL " + r2.error}`);
    return NextResponse.json({
      success: r1.sent && r2.sent,
      test: true,
      e1: r1.sent ? { sent: true, via: r1.sentVia } : { sent: false, error: r1.error },
      e2: r2.sent ? { sent: true, via: r2.sentVia } : { sent: false, error: r2.error },
    });
  }

  const piId = (b.payment_intent_id || "").toString().trim();
  if (!piId) return NextResponse.json({ success: false, error: "payment_intent_id required" }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: rows } = await db.from("shop_orders").select("id, data").eq("id", piId).limit(1);
  if (!rows || rows.length === 0) {
    console.error(`[shop-order-confirmation] shop_orders/${piId} not found — nothing sent`);
    return NextResponse.json({ success: true, ignored: "order not found" });
  }

  const d = rows[0].data as ShopOrderData;

  if (d.confirmation_email_sent_at) {
    console.log(`[shop-order-confirmation] ${piId} already sent ${d.confirmation_email_sent_at} — no-op`);
    return NextResponse.json({ success: true, idempotent: true });
  }

  const to = String(d.email || "").trim();
  if (!to) {
    // No customer email on the PI (receipt_email absent). Record why so it's visible.
    await db.from("shop_orders").update({ data: { ...d, confirmation_email_status: "skipped: no customer email" } }).eq("id", piId);
    console.warn(`[shop-order-confirmation] ${piId} has no customer email — skipped`);
    return NextResponse.json({ success: true, ignored: "no customer email" });
  }

  const { subject, body } = buildShopConfirmationEmail(d);
  const result = await sendEmail({ to, subject, body });

  const stamp = result.sent
    ? { confirmation_email_sent_at: new Date().toISOString(), confirmation_email_status: `sent via ${result.sentVia}` }
    : { confirmation_email_status: `failed: ${result.error}` };
  await db.from("shop_orders").update({ data: { ...d, ...stamp } }).eq("id", piId);

  if (!result.sent) {
    console.error(`[shop-order-confirmation] ${piId} send failed: ${result.error}`);
    return NextResponse.json({ success: false, error: result.error });
  }
  console.log(`[shop-order-confirmation] ${piId} → ${to} (${result.sentVia})`);
  return NextResponse.json({ success: true, sentVia: result.sentVia });
}
