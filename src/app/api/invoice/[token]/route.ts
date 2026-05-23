import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calcDeposit, calcTotal, parseAmount } from "@/lib/invoiceCalc";

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

    // Use deposit request as authoritative source for amounts when available
    let totalAmount = calcTotal(raw);
    let depositAmount = calcDeposit(raw);

    if (raw.deposit_request_id) {
      const { data: depRows } = await getSupabaseAdmin()
        .from("deposit_requests")
        .select("data")
        .eq("id", raw.deposit_request_id as string)
        .limit(1);
      if (depRows && depRows.length > 0) {
        const dep = depRows[0].data as Record<string, unknown>;
        const t = parseAmount(dep.total_amount);
        const d = parseAmount(dep.deposit_amount);
        if (t > 0) totalAmount = t;
        if (d > 0) depositAmount = d;
      }
    }

    const balanceRemaining = Math.max(totalAmount - depositAmount, 0);

    const clientSafe = {
      id: raw.id,
      order_name: (raw.order_name ?? raw.orderName ?? "") as string,
      client_name: (raw.client_name ?? raw.client ?? "") as string,
      total_amount: totalAmount,
      deposit_amount: depositAmount,
      deposit_paid: raw.deposit_paid === true,
      deposit_paid_date: (raw.deposit_paid_date ?? null) as string | null,
      balance_remaining: balanceRemaining,
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
