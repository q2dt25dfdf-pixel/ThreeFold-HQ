import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const {
      leadId,
      quoteId,
      clientName,
      clientEmail,
      totalAmount,
      depositAmount,
      paymentInstructions,
      notes,
    } = await request.json() as {
      leadId: string;
      quoteId?: string;
      clientName: string;
      clientEmail: string;
      totalAmount: number;
      depositAmount: number;
      paymentInstructions?: string;
      notes?: string;
    };

    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin
      .from("deposit_requests")
      .select("*", { count: "exact", head: true });

    const depositRequestNumber = `TF-D-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const token = "tfd-" + randomBytes(12).toString("hex");
    const origin = request.nextUrl.origin;
    const publicLink = `${origin}/deposit/${token}`;

    const balanceRemaining = Math.max(totalAmount - depositAmount, 0);
    const depositRequestId = `deposit-${leadId}-${Date.now()}`;

    const depositData = {
      id: depositRequestId,
      deposit_request_number: depositRequestNumber,
      lead_id: leadId,
      quote_id: quoteId ?? null,
      client_name: clientName ?? "",
      client_email: clientEmail ?? "",
      total_amount: totalAmount ?? 0,
      deposit_amount: depositAmount ?? 0,
      balance_remaining: balanceRemaining,
      payment_instructions: paymentInstructions ?? "",
      public_token: token,
      public_link: publicLink,
      status: "draft",
      notes: notes ?? "",
      sent_date: null as string | null,
      email_status: null as string | null,
      email_message_id: null as string | null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("deposit_requests")
      .upsert({ id: depositRequestId, data: depositData });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      depositRequestId,
      depositRequestNumber,
      publicLink,
      publicToken: token,
      totalAmount,
      depositAmount,
      balanceRemaining,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
