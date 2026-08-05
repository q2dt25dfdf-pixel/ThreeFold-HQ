import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { getDepositBaseUrl } from "@/lib/publicUrl";

export async function POST(request: NextRequest) {
  try {
    const { depositToken, method } = await request.json() as {
      depositToken: string;
      method: "card" | "bank";
    };

    if (!depositToken) {
      return NextResponse.json({ error: "Deposit token required" }, { status: 400 });
    }
    if (method !== "card" && method !== "bank") {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    // Look up deposit request server-side by public token only
    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("deposit_requests")
      .select("id,data")
      .eq("data->>public_token", depositToken)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Deposit request not found" }, { status: 404 });
    }

    const row = rows[0];
    const raw = row.data as Record<string, unknown>;

    // Load-bearing guard: refuse checkout for a deposit voided by a quote revision.
    // This is what actually stops a client paying the old (pre-revision) amount.
    if (raw.voided_at) {
      return NextResponse.json(
        { error: "This deposit request is no longer current. Please contact Threefold Supply Co. for an updated payment link." },
        { status: 409 },
      );
    }

    // Guard: do not create a duplicate session if already paid or pending
    const status = raw.status as string | undefined;
    if (status === "paid") {
      return NextResponse.json({ error: "Deposit is already paid" }, { status: 409 });
    }
    if (status === "pending") {
      return NextResponse.json({ error: "Payment is already in progress" }, { status: 409 });
    }

    const depositAmount = raw.deposit_amount as number;
    if (!depositAmount || depositAmount <= 0) {
      return NextResponse.json({ error: "Invalid deposit amount" }, { status: 400 });
    }

    // Card adds a 3% processing surcharge; bank account pays the base amount
    const surcharge = method === "card" ? Math.round(depositAmount * 0.03 * 100) / 100 : 0;
    const chargeAmount = depositAmount + surcharge;
    const paymentMethodTypes = (method === "card" ? ["card"] : ["us_bank_account"]) as ("card" | "us_bank_account")[];

    const origin = getDepositBaseUrl(request.nextUrl.origin);
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Deposit — ${raw.client_name as string}`,
              description:
                method === "card"
                  ? `Deposit Request ${raw.deposit_request_number as string} (incl. 3% card processing fee)`
                  : `Deposit Request ${raw.deposit_request_number as string}`,
            },
            unit_amount: Math.round(chargeAmount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_type: "deposit",
        deposit_request_id: row.id,
        lead_id: (raw.lead_id as string) ?? "",
        deposit_token: depositToken,
        payment_method: method,
        base_amount: String(depositAmount),
        processing_fee: String(surcharge),
        total_charged: String(chargeAmount),
      },
      // Stamp the PaymentIntent too (session metadata doesn't reach the PI) so the website
      // Stripe webhook recognizes this deposit payment and skips creating a shop order.
      payment_intent_data: {
        metadata: {
          payment_type: "deposit",
          deposit_request_id: row.id,
          lead_id: (raw.lead_id as string) ?? "",
        },
      },
      success_url: `${origin}/deposit/${depositToken}?payment=success`,
      cancel_url: `${origin}/deposit/${depositToken}?payment=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
