import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addDaysToISODate, businessTodayISO } from "@/lib/businessDate";
import { calcGrandTotal, calcSalesTax, salesTaxRate } from "@/lib/salesTax";

type LineItem = {
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  originalUnitPrice?: number;
};

export async function POST(request: NextRequest) {
  try {
    const { leadId, clientName, clientEmail, totalAmount, lineItems, items, notes, subtotal: bodySubtotal, salesTaxRate: bodyTaxRate } =
      await request.json() as {
        leadId: string;
        clientName: string;
        clientEmail: string;
        totalAmount: number;
        lineItems?: LineItem[];
        items: string[];
        notes: string;
        subtotal?: number;
        salesTaxRate?: number;
      };

    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const year = new Date().getFullYear();
    const { count } = await db
      .from("quotes")
      .select("*", { count: "exact", head: true });

    const quoteNumber = `TF-Q-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const token = "tfq-" + randomBytes(12).toString("hex");
    const origin = request.nextUrl.origin;
    const publicLink = `${origin}/quote/${token}`;

    const expirationDateStr = addDaysToISODate(businessTodayISO(), 30);

    // Derive subtotal from line items when provided; fall back to caller-supplied value
    const computedSubtotal =
      lineItems && lineItems.length > 0
        ? lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
        : (bodySubtotal ?? totalAmount ?? 0);

    const taxRate = bodyTaxRate ?? salesTaxRate();
    const salesTaxAmount = calcSalesTax(computedSubtotal, taxRate);
    const grandTotal = calcGrandTotal(computedSubtotal, taxRate);

    const quoteId = `quote-${leadId}-${Date.now()}`;
    const quoteData = {
      id: quoteId,
      quote_number: quoteNumber,
      lead_id: leadId,
      client_name: clientName ?? "",
      client_email: clientEmail ?? "",
      items: items ?? [],
      line_items: lineItems ?? null,
      subtotal: computedSubtotal,
      sales_tax_rate: taxRate,
      sales_tax_amount: salesTaxAmount,
      grand_total: grandTotal,
      total_amount: grandTotal,
      expiration_date: expirationDateStr,
      public_token: token,
      public_link: publicLink,
      status: "draft",
      notes: notes ?? "",
      sent_date: null as string | null,
      email_status: null as string | null,
      email_message_id: null as string | null,
      created_at: new Date().toISOString(),
    };

    const { error } = await db
      .from("quotes")
      .upsert({ id: quoteId, data: quoteData });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      quoteId,
      quoteNumber,
      publicLink,
      publicToken: token,
      expirationDate: expirationDateStr,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
