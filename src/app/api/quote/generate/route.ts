import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { addDaysToISODate, businessTodayISO } from "@/lib/businessDate";
import {
  calcGrandTotal,
  calcSalesTax,
  calcDiscountedSubtotal,
  normalizeDiscount,
  type QuoteDiscount,
} from "@/lib/salesTax";
import { getSalesTaxRateForAddress } from "@/lib/tax-rates";
import { getQuoteBaseUrl } from "@/lib/publicUrl";

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
    const {
      leadId, clientName, clientEmail, totalAmount, lineItems, items, notes,
      subtotal: bodySubtotal,
      discount: bodyDiscount,
      clientAddressText, clientZip, deliveryZip,
    } =
      await request.json() as {
        leadId: string;
        clientName: string;
        clientEmail: string;
        totalAmount: number;
        lineItems?: LineItem[];
        items: string[];
        notes: string;
        subtotal?: number;
        discount?: QuoteDiscount | null;
        clientAddressText?: string;
        clientZip?: string;
        deliveryZip?: string;
      };

    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    // A discount can only apply to a quote built from explicit line items (which
    // carry a real pre-tax subtotal). Reject a discount on the legacy total-only
    // path, where subtotal would fall back to a grand total.
    const hasLineItems = Array.isArray(lineItems) && lineItems.length > 0;
    const discount = normalizeDiscount(bodyDiscount);
    if (discount && !hasLineItems) {
      return NextResponse.json(
        { error: "A discount requires line items and an explicit subtotal." },
        { status: 400 },
      );
    }
    if (discount && !discount.label) {
      return NextResponse.json(
        { error: "A discount requires a label." },
        { status: 400 },
      );
    }

    const db = getSupabaseAdmin();
    const year = new Date().getFullYear();
    const { count } = await db
      .from("quotes")
      .select("*", { count: "exact", head: true });

    const quoteNumber = `TF-Q-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const token = "tfq-" + randomBytes(12).toString("hex");
    const publicLink = `${getQuoteBaseUrl(request.nextUrl.origin)}/quote/${token}`;

    const expirationDateStr = addDaysToISODate(businessTodayISO(), 30);

    // Derive subtotal from line items when provided; fall back to caller-supplied value
    const computedSubtotal =
      lineItems && lineItems.length > 0
        ? lineItems.reduce((sum, item) => sum + item.lineTotal, 0)
        : (bodySubtotal ?? totalAmount ?? 0);

    // Supplement caller-supplied clientZip from the stored client record if missing
    let resolvedClientZip = clientZip;
    if (clientEmail && !resolvedClientZip) {
      const { data: clientRows } = await db
        .from("clients")
        .select("data")
        .filter("data->>email", "eq", clientEmail)
        .limit(1);
      if (clientRows?.[0]) {
        const c = clientRows[0].data as Record<string, unknown>;
        resolvedClientZip = c.zip as string | undefined;
      }
    }

    const taxLookup = getSalesTaxRateForAddress({
      deliveryZip,
      clientZip: resolvedClientZip,
      clientAddressText: clientAddressText ?? "",
    });

    // Order of operations: subtotal → discount → discountedSubtotal → tax → grand.
    // subtotal stays PRE-discount; when there is no discount, discountedSubtotal is
    // exactly computedSubtotal so tax/grand are byte-identical to the old behavior.
    const taxRate = taxLookup.rate;
    const discountedSubtotal = discount
      ? calcDiscountedSubtotal(computedSubtotal, discount)
      : computedSubtotal;
    const salesTaxAmount = calcSalesTax(discountedSubtotal, taxRate);
    const grandTotal = calcGrandTotal(discountedSubtotal, taxRate);

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
      discount: discount,
      sales_tax_rate: taxRate,
      sales_tax_amount: salesTaxAmount,
      grand_total: grandTotal,
      total_amount: grandTotal,
      // Tax rate metadata — stored for audit/display; does not affect downstream math
      tax_rate_percent: taxRate,
      tax_rate_source: taxLookup.source,
      tax_zip_used: taxLookup.zipUsed ?? null,
      tax_jurisdiction_label: taxLookup.jurisdictionLabel,
      tax_rate_warning: taxLookup.warning ?? null,
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
      grandTotal,
      salesTaxRate: taxRate,
      salesTaxAmount,
      taxJurisdictionLabel: taxLookup.jurisdictionLabel,
      taxRateWarning: taxLookup.warning ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
