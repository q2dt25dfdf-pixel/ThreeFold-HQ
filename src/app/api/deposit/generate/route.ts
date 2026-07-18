import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { nextSequenceNumber } from "@/lib/sequenceNumber";
import { getDepositBaseUrl } from "@/lib/publicUrl";
import { normalizeDiscount, type QuoteDiscount } from "@/lib/salesTax";

export async function POST(request: NextRequest) {
  try {
    type LineItem = {
      name: string;
      description: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      originalUnitPrice?: number;
    };

    const {
      leadId,
      quoteId,
      clientName,
      clientEmail,
      totalAmount,
      depositAmount,
      lineItems,
      paymentInstructions,
      notes,
      subtotal,
      discount,
      salesTaxRate,
      salesTaxAmount,
      grandTotal,
    } = await request.json() as {
      leadId: string;
      quoteId?: string;
      clientName: string;
      clientEmail: string;
      totalAmount: number;
      depositAmount: number;
      lineItems?: LineItem[] | null;
      paymentInstructions?: string;
      notes?: string;
      subtotal?: number;
      discount?: QuoteDiscount | null;
      salesTaxRate?: number;
      salesTaxAmount?: number;
      grandTotal?: number;
    };

    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    // max(existing number)+1 via shared helper — collision-safe on delete.
    const depositRequestNumber = await nextSequenceNumber(db, { table: "deposit_requests", field: "deposit_request_number", prefix: "TF-D" });
    const token = "tfd-" + randomBytes(12).toString("hex");
    const publicLink = `${getDepositBaseUrl(request.nextUrl.origin)}/deposit/${token}`;

    // Use grandTotal as the authoritative total when tax fields are present
    const effectiveTotal = grandTotal ?? totalAmount ?? 0;
    const balanceRemaining = Math.max(effectiveTotal - depositAmount, 0);
    const depositRequestId = `deposit-${leadId}-${Date.now()}`;

    const depositData: Record<string, unknown> = {
      id: depositRequestId,
      deposit_request_number: depositRequestNumber,
      lead_id: leadId,
      quote_id: quoteId ?? null,
      client_name: clientName ?? "",
      client_email: clientEmail ?? "",
      total_amount: effectiveTotal,
      deposit_amount: depositAmount ?? 0,
      balance_remaining: balanceRemaining,
      line_items: lineItems ?? null,
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

    if (subtotal != null) depositData.subtotal = subtotal;
    // Discount is inherited from the quote (derived math done upstream); persist the
    // object so the deposit portal/email can render it. Never recomputed here.
    const normalizedDiscount = normalizeDiscount(discount);
    if (normalizedDiscount) depositData.discount = normalizedDiscount;
    if (salesTaxRate != null) depositData.sales_tax_rate = salesTaxRate;
    if (salesTaxAmount != null) depositData.sales_tax_amount = salesTaxAmount;
    if (grandTotal != null) depositData.grand_total = grandTotal;

    const { error } = await db
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
