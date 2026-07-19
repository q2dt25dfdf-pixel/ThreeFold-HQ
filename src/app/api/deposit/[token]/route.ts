import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { data: rows, error } = await getSupabaseAdmin()
      .from("deposit_requests")
      .select("id,data")
      .eq("data->>public_token", token)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Deposit request not found" },
        { status: 404 },
      );
    }

    const raw = rows[0].data as Record<string, unknown>;
    const clientSafe = {
      deposit_request_number: raw.deposit_request_number,
      client_name: raw.client_name,
      subtotal: raw.subtotal ?? null,
      discount: raw.discount ?? null,
      sales_tax_rate: raw.sales_tax_rate ?? null,
      sales_tax_amount: raw.sales_tax_amount ?? null,
      grand_total: raw.grand_total ?? null,
      total_amount: raw.total_amount,
      deposit_amount: raw.deposit_amount,
      balance_remaining: raw.balance_remaining,
      line_items: raw.line_items ?? null,
      payment_instructions: raw.payment_instructions,
      notes: raw.notes,
      status: raw.status,
      created_at: raw.created_at,
      voided_at: (raw.voided_at ?? null) as string | null,
      voided_reason: (raw.voided_reason ?? null) as string | null,
    };
    return NextResponse.json(clientSafe);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST: record the client's intended payment method (deposit-token side) ──────
// Mirrors /api/quote/[token]/deposit POST, but keyed by the DEPOSIT public_token.
// A DECLARATION, not a payment. Writes only the same two fields onto this
// deposit_requests row — never marks paid, never touches Stripe/finances/order.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = (await request.json()) as { method?: unknown };
    const method = body.method;
    if (method !== "card" && method !== "bank" && method !== "check") {
      return NextResponse.json({ error: "Invalid method" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("deposit_requests")
      .select("id,data")
      .eq("data->>public_token", token)
      .limit(1);
    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Deposit request not found" }, { status: 404 });
    }

    const row = rows[0];
    const dep = row.data as Record<string, unknown>;
    if (dep.voided_at) {
      return NextResponse.json({ error: "This request is no longer current." }, { status: 409 });
    }
    if (dep.status === "paid") {
      return NextResponse.json({ error: "This deposit is already paid." }, { status: 409 });
    }

    const updated = {
      ...dep,
      client_payment_method_intent: method,
      payment_method_intent_declared_at: new Date().toISOString(),
    };
    const { error: upErr } = await db
      .from("deposit_requests")
      .update({ data: updated })
      .eq("id", row.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ success: true, intent: method });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
