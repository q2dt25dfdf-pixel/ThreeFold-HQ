import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { nextSequenceNumber } from "@/lib/sequenceNumber";
import { addDaysToISODate, businessTodayISO } from "@/lib/businessDate";
import {
  calcGrandTotal,
  calcSalesTax,
  calcDiscountedSubtotal,
  normalizeDiscount,
  type QuoteDiscount,
} from "@/lib/salesTax";
import { resolveSalesTax } from "@/lib/resolveSalesTax";
import { zipFromText } from "@/lib/tax-rates";
import { getQuoteBaseUrl } from "@/lib/publicUrl";
import { voidDepositOnRevision } from "@/lib/supersede";

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
      depositMinimum,
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
        depositMinimum?: number;
        clientAddressText?: string;
        clientZip?: string;
        deliveryZip?: string;
      };

    // Deposit minimum as a decimal fraction of the total (0 < x <= 1); default 50%.
    const depositMinimumFraction =
      typeof depositMinimum === "number" && depositMinimum > 0 && depositMinimum <= 1
        ? depositMinimum
        : 0.5;

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
    // max(existing number)+1 via shared helper — collision-safe on delete.
    const quoteNumber = await nextSequenceNumber(db, { table: "quotes", field: "quote_number", prefix: "TF-Q" });
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

    // Order of operations: subtotal → discount → discountedSubtotal → tax → grand.
    // subtotal stays PRE-discount; when there is no discount, discountedSubtotal is
    // exactly computedSubtotal so tax/grand are byte-identical to the old behavior.
    const discountedSubtotal = discount
      ? calcDiscountedSubtotal(computedSubtotal, discount)
      : computedSubtotal;
    // A discount must not drive the total near zero. Stripe rejects charges under
    // ~$0.50, and a sub-dollar order is not a real order, so require at least
    // $1.00 pre-tax after the discount. This is the only path that can produce a
    // tiny total in this app, so blocking here keeps every pay surface valid.
    if (discount && discountedSubtotal < 1) {
      return NextResponse.json(
        { error: "A discount cannot reduce the total below $1.00." },
        { status: 400 },
      );
    }
    // Rate SOURCE only: Stripe Tax as an accurate rate lookup, falling back to the CA ZIP
    // table on any error/timeout. HQ still bakes this rate into its own total (calcSalesTax
    // below); automatic_tax at checkout stays OFF and the stored field shapes are unchanged.
    const taxLookup = await resolveSalesTax({
      deliveryZip,
      clientZip: resolvedClientZip,
      clientAddressText: clientAddressText ?? "",
      taxableAmountCents: Math.round(discountedSubtotal * 100),
    });
    // No resolved ZIP means the rate would be the blind 9.375% default — never bake a
    // guessed rate into a money document. zipUsed is set by BOTH the Stripe path and the
    // ZIP-table path, so this only rejects the truly unresolvable cases. Distinct
    // messages: missing address (caller must supply one) vs out-of-table ZIP while
    // Stripe is unreachable (retryable).
    if (!taxLookup.zipUsed) {
      const suppliedZip = deliveryZip || resolvedClientZip || zipFromText(clientAddressText ?? "");
      return NextResponse.json(
        {
          error: suppliedZip
            ? `Couldn't resolve a sales tax rate for ZIP ${suppliedZip} right now — please try again in a moment.`
            : "A client address with a ZIP code is required to compute sales tax.",
        },
        { status: 400 },
      );
    }

    const taxRate = taxLookup.rate;
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
      // Audit trail: Stripe calculation id + per-jurisdiction breakdown (null on the
      // ZIP-table path) so a rate discrepancy is answerable after the fact.
      tax_calculation_id: taxLookup.calculationId,
      tax_breakdown: taxLookup.breakdown,
      deposit_minimum: depositMinimumFraction,
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

    // Revision handling (STEP 2): read the lead to find the previous quote (a
    // descriptor for the send step to supersede) and the existing deposit request.
    // Void the deposit here, server-side, hard-guarded against paid/pending. The old
    // quote is NOT marked superseded here — that happens only on an actual send.
    let supersededQuoteId: string | null = null;
    let voidedDeposit: { number: string | null } | null = null;
    let blockedDeposit: { number: string | null; status: string } | null = null;
    const { data: leadRows } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", leadId)
      .limit(1);
    const leadData = leadRows?.[0]?.data as Record<string, unknown> | undefined;
    if (leadData) {
      supersededQuoteId = (leadData.quote_id as string) || null;
      const result = await voidDepositOnRevision(db, leadData.deposit_request_id as string | undefined);
      if (result.outcome === "voided") voidedDeposit = { number: result.depositNumber };
      else if (result.outcome === "blocked") blockedDeposit = { number: result.depositNumber, status: result.status };
    }

    // Address write-back: teach the system the location this quote's tax was computed
    // from, so repeat orders reuse it instead of re-entering it or falling back.
    // Empty-only — a value someone already set is never overwritten. Failures log and
    // never block quote creation (the quote row is already committed above).
    try {
      if (clientEmail) {
        const { data: cRows } = await db
          .from("clients")
          .select("id,data")
          .eq("data->>email", clientEmail)
          .limit(1);
        const cRow = cRows?.[0];
        const cData = cRow?.data as Record<string, unknown> | undefined;
        if (cRow && cData && !String(cData.zip ?? "").trim()) {
          await db.from("clients").update({ data: { ...cData, zip: taxLookup.zipUsed } }).eq("id", cRow.id);
        }
      }
      const cp = (leadData?.companyProfile ?? {}) as Record<string, unknown>;
      if (leadData && !String(cp.address ?? "").trim()) {
        // Prefer the full typed address text (richer than the bare ZIP; it's also what
        // the send-quote modal pre-fills from, unblocking its ZIP gate next time).
        const addressValue = (clientAddressText ?? "").trim() || taxLookup.zipUsed;
        await db
          .from("crm_leads")
          .update({ data: { ...leadData, companyProfile: { ...cp, address: addressValue } } })
          .eq("id", leadId);
      }
    } catch (writeBackErr) {
      console.error("[quote/generate] address write-back failed:", writeBackErr);
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
      supersededQuoteId,
      voidedDeposit,
      blockedDeposit,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
