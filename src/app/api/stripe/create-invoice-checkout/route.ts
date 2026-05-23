import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { calcBalance } from "@/lib/invoiceCalc";

export async function POST(request: NextRequest) {
  try {
    const { invoiceToken, method } = await request.json() as {
      invoiceToken: string;
      method: "card" | "bank";
    };

    if (!invoiceToken) {
      return NextResponse.json({ error: "Invoice token required" }, { status: 400 });
    }
    if (method !== "card" && method !== "bank") {
      return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("finances")
      .select("id,data")
      .eq("data->>public_token", invoiceToken)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const row = rows[0];
    const raw = row.data as Record<string, unknown>;

    if (raw.final_paid === true) {
      return NextResponse.json({ error: "Invoice is already paid in full" }, { status: 409 });
    }

    const balanceRemaining = calcBalance(raw);
    if (!balanceRemaining || balanceRemaining <= 0) {
      return NextResponse.json({ error: "No balance remaining on this invoice" }, { status: 400 });
    }

    // Card adds a 3% processing surcharge; bank account pays the base amount
    const surcharge = method === "card" ? Math.round(balanceRemaining * 0.03 * 100) / 100 : 0;
    const chargeAmount = balanceRemaining + surcharge;
    const paymentMethodTypes = (method === "card" ? ["card"] : ["us_bank_account"]) as ("card" | "us_bank_account")[];

    const clientName = (raw.client_name ?? raw.client ?? "") as string;
    const orderName = (raw.order_name ?? raw.orderName ?? "") as string;
    const origin = request.nextUrl.origin;
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethodTypes,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Final Balance — ${clientName}`,
              description:
                method === "card"
                  ? `${orderName ? orderName + " — " : ""}incl. 3% card processing fee`
                  : orderName || undefined,
            },
            unit_amount: Math.round(chargeAmount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_type: "final_invoice",
        finance_id: row.id,
        invoice_token: invoiceToken,
        order_id: (raw.order_id as string) ?? "",
        deposit_request_id: (raw.deposit_request_id as string) ?? "",
        payment_method: method,
        base_amount: String(balanceRemaining),
        processing_fee: String(surcharge),
        total_charged: String(chargeAmount),
      },
      success_url: `${origin}/invoice/${invoiceToken}?payment=success`,
      cancel_url: `${origin}/invoice/${invoiceToken}?payment=cancelled`,
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
