import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calcBalance, calcDeposit, calcTotal } from "@/lib/invoiceCalc";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { data: rows, error } = await getSupabaseAdmin()
      .from("finances")
      .select("id,data")
      .eq("data->>public_token", token)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const raw = rows[0].data as Record<string, unknown>;
    const clientSafe = {
      id: raw.id,
      order_name: (raw.order_name ?? raw.orderName ?? "") as string,
      client_name: (raw.client_name ?? raw.client ?? "") as string,
      total_amount: calcTotal(raw),
      deposit_amount: calcDeposit(raw),
      deposit_paid: raw.deposit_paid === true,
      deposit_paid_date: (raw.deposit_paid_date ?? null) as string | null,
      balance_remaining: calcBalance(raw),
      final_paid: raw.final_paid === true,
      final_paid_date: (raw.final_paid_date ?? null) as string | null,
      final_due_date: (raw.final_due_date ?? null) as string | null,
      status: (raw.status ?? "Draft") as string,
    };

    return NextResponse.json(clientSafe);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
