import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Quote ID required" }, { status: 400 });
  }

  try {
    const { data: rows, error } = await getSupabaseAdmin()
      .from("quotes")
      .select("id,data")
      .eq("id", id)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const raw = rows[0].data as Record<string, unknown>;
    return NextResponse.json({
      quoteId: raw.id,
      quoteNumber: raw.quote_number,
      lineItems: raw.line_items ?? null,
      // subtotal is PRE-tax and must never fall back to total_amount (grand total).
      // Reading grand total as a subtotal double-counts tax and, once discounts
      // exist, would leak a post-discount grand total into a pre-tax slot.
      subtotal: raw.subtotal ?? null,
      discount: raw.discount ?? null,
      salesTaxRate: raw.sales_tax_rate ?? null,
      salesTaxAmount: raw.sales_tax_amount ?? null,
      // Founder-facing tax provenance (LeadDetailModal shows the warning).
      taxRateWarning: raw.tax_rate_warning ?? null,
      taxJurisdictionLabel: raw.tax_jurisdiction_label ?? null,
      grandTotal: raw.grand_total ?? raw.total_amount,
      totalAmount: raw.grand_total ?? raw.total_amount,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
