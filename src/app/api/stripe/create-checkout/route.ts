import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  try {
    const { depositToken } = await request.json() as { depositToken: string };

    if (!depositToken) {
      return NextResponse.json({ error: "Deposit token required" }, { status: 400 });
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

    const origin = request.nextUrl.origin;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Deposit — ${raw.client_name as string}`,
              description: `Deposit Request ${raw.deposit_request_number as string}`,
            },
            unit_amount: Math.round(depositAmount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        deposit_request_id: row.id,
        lead_id: (raw.lead_id as string) ?? "",
        deposit_token: depositToken,
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
