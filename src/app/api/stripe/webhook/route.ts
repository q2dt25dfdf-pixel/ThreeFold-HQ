import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";

// Disable body parsing — Stripe signature verification requires the raw body
export const config = { api: { bodyParser: false } };

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event;
  try {
    const rawBody = await request.text();
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    await handleSessionCompleted(event.data.object as unknown as CheckoutSession);
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    await handleAsyncPaymentSucceeded(event.data.object as unknown as CheckoutSession);
  }

  if (event.type === "checkout.session.async_payment_failed") {
    await handleAsyncPaymentFailed(event.data.object as unknown as CheckoutSession);
  }

  return NextResponse.json({ received: true });
}

type CheckoutSession = {
  id: string;
  payment_status: string;
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
};

async function updateDepositRequest(
  depositRequestId: string,
  fields: Record<string, unknown>,
) {
  const db = getSupabaseAdmin();
  const { data: rows } = await db
    .from("deposit_requests")
    .select("id,data")
    .eq("id", depositRequestId)
    .limit(1);

  if (!rows || rows.length === 0) return;

  const existing = rows[0].data as Record<string, unknown>;
  const updated = { ...existing, ...fields };

  await db
    .from("deposit_requests")
    .update({ data: updated })
    .eq("id", depositRequestId);
}

async function updateFinanceRecord(
  financeId: string,
  fields: Record<string, unknown>,
) {
  const db = getSupabaseAdmin();
  const { data: rows } = await db
    .from("finances")
    .select("id,data")
    .eq("id", financeId)
    .limit(1);

  if (!rows || rows.length === 0) return;

  const existing = rows[0].data as Record<string, unknown>;
  const updated = { ...existing, ...fields };

  await db
    .from("finances")
    .update({ data: updated })
    .eq("id", financeId);
}

async function handleSessionCompleted(session: CheckoutSession) {
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : null;

  const financeId = session.metadata?.finance_id;
  if (financeId) {
    const paidAt = new Date().toISOString();
    if (session.payment_status === "paid") {
      await updateFinanceRecord(financeId, {
        final_paid: true,
        final_paid_date: paidAt.slice(0, 10),
        balance_remaining: 0,
        status: "Paid",
        stripe_final_session_id: session.id,
        stripe_final_payment_intent_id: paymentIntentId,
        final_paid_at: paidAt,
      });
    } else {
      await updateFinanceRecord(financeId, {
        stripe_final_session_id: session.id,
        stripe_final_payment_intent_id: paymentIntentId,
        final_payment_initiated_at: paidAt,
      });
    }
    return;
  }

  const depositRequestId = session.metadata?.deposit_request_id;
  if (!depositRequestId) return;

  if (session.payment_status === "paid") {
    // Card payment — confirmed immediately
    await updateDepositRequest(depositRequestId, {
      status: "paid",
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    });
  } else {
    // ACH/bank — payment initiated, awaiting settlement (async)
    await updateDepositRequest(depositRequestId, {
      status: "pending",
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      payment_initiated_at: new Date().toISOString(),
    });
  }
}

async function handleAsyncPaymentSucceeded(session: CheckoutSession) {
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : null;

  const financeId = session.metadata?.finance_id;
  if (financeId) {
    const paidAt = new Date().toISOString();
    await updateFinanceRecord(financeId, {
      final_paid: true,
      final_paid_date: paidAt.slice(0, 10),
      balance_remaining: 0,
      status: "Paid",
      stripe_final_payment_intent_id: paymentIntentId,
      final_paid_at: paidAt,
    });
    return;
  }

  const depositRequestId = session.metadata?.deposit_request_id;
  if (!depositRequestId) return;

  await updateDepositRequest(depositRequestId, {
    status: "paid",
    stripe_payment_intent_id: paymentIntentId,
    paid_at: new Date().toISOString(),
  });
}

async function handleAsyncPaymentFailed(session: CheckoutSession) {
  const financeId = session.metadata?.finance_id;
  if (financeId) {
    await updateFinanceRecord(financeId, {
      final_payment_failed_at: new Date().toISOString(),
    });
    return;
  }

  const depositRequestId = session.metadata?.deposit_request_id;
  if (!depositRequestId) return;

  await updateDepositRequest(depositRequestId, {
    status: "payment_failed",
    payment_failed_at: new Date().toISOString(),
  });
}
