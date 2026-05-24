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
    };
    return NextResponse.json(clientSafe);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
