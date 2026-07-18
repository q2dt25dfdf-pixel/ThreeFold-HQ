import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { calcDeposit, calcTotal, parseAmount } from "@/lib/invoiceCalc";
import { normalizeDiscount, type QuoteDiscount } from "@/lib/salesTax";

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

    // Use deposit request as authoritative source for amounts and line items when available
    let totalAmount = calcTotal(raw);
    let depositAmount = calcDeposit(raw);
    type RawLineItem = { name?: unknown; description?: unknown; quantity?: unknown; unitPrice?: unknown; lineTotal?: unknown; originalUnitPrice?: unknown };
    let lineItems: { name: string; description: string; quantity: number; unitPrice: number; lineTotal: number; originalUnitPrice?: number }[] = [];

    let subtotalVal: number | null = null;
    let salesTaxRateVal: number | null = null;
    let salesTaxAmountVal: number | null = null;
    let grandTotalVal: number | null = null;
    let discountVal: QuoteDiscount | null = null;

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
        if (dep.subtotal != null) subtotalVal = parseAmount(dep.subtotal);
        if (dep.sales_tax_rate != null) salesTaxRateVal = Number(dep.sales_tax_rate);
        if (dep.sales_tax_amount != null) salesTaxAmountVal = parseAmount(dep.sales_tax_amount);
        if (dep.grand_total != null) grandTotalVal = parseAmount(dep.grand_total);
        if (dep.discount != null) discountVal = normalizeDiscount(dep.discount);
        if (Array.isArray(dep.line_items)) {
          lineItems = (dep.line_items as RawLineItem[]).map((li) => ({
            name: String(li.name ?? ""),
            description: String(li.description ?? ""),
            quantity: Number(li.quantity ?? 0),
            unitPrice: Number(li.unitPrice ?? 0),
            lineTotal: Number(li.lineTotal ?? 0),
            ...(li.originalUnitPrice != null ? { originalUnitPrice: Number(li.originalUnitPrice) } : {}),
          }));
        }
      }
    }

    // Also read tax fields stored directly on the finance record (populated by invoice/generate)
    if (subtotalVal === null && raw.subtotal != null) subtotalVal = parseAmount(raw.subtotal);
    if (salesTaxRateVal === null && raw.sales_tax_rate != null) salesTaxRateVal = Number(raw.sales_tax_rate);
    if (salesTaxAmountVal === null && raw.sales_tax_amount != null) salesTaxAmountVal = parseAmount(raw.sales_tax_amount);
    if (grandTotalVal === null && raw.grand_total != null) grandTotalVal = parseAmount(raw.grand_total);
    if (discountVal === null && raw.discount != null) discountVal = normalizeDiscount(raw.discount);

    // Fall back to line items stored directly on the finance record
    if (lineItems.length === 0 && Array.isArray(raw.line_items)) {
      lineItems = (raw.line_items as RawLineItem[]).map((li) => ({
        name: String(li.name ?? ""),
        description: String(li.description ?? ""),
        quantity: Number(li.quantity ?? 0),
        unitPrice: Number(li.unitPrice ?? 0),
        lineTotal: Number(li.lineTotal ?? 0),
        ...(li.originalUnitPrice != null ? { originalUnitPrice: Number(li.originalUnitPrice) } : {}),
      }));
    }

    const balanceRemaining = Math.max(totalAmount - depositAmount, 0);

    // Resolve the contact person from the lead so the page can greet the person
    // (company stays the fallback). The finance row stores no contact of its own.
    let contactName: string | null = null;
    const leadIdForContact = (raw.lead_id ?? "") as string;
    if (leadIdForContact) {
      const { data: leadRows } = await getSupabaseAdmin()
        .from("crm_leads")
        .select("data")
        .eq("id", leadIdForContact)
        .limit(1);
      const ld = leadRows?.[0]?.data as Record<string, unknown> | undefined;
      const c = ((ld?.contact ?? "") as string).trim();
      if (c) contactName = c;
    }

    const clientSafe = {
      id: raw.id,
      order_name: (raw.order_name ?? raw.orderName ?? "") as string,
      client_name: (raw.client_name ?? raw.client ?? "") as string,
      contact_name: contactName,
      subtotal: subtotalVal,
      discount: discountVal,
      sales_tax_rate: salesTaxRateVal,
      sales_tax_amount: salesTaxAmountVal,
      grand_total: grandTotalVal,
      total_amount: totalAmount,
      deposit_amount: depositAmount,
      deposit_paid: raw.deposit_paid === true,
      deposit_paid_date: (raw.deposit_paid_date ?? null) as string | null,
      balance_remaining: balanceRemaining,
      final_paid: raw.final_paid === true,
      final_paid_date: (raw.final_paid_date ?? null) as string | null,
      final_due_date: (raw.final_due_date ?? null) as string | null,
      deposit_payment_method: (raw.deposit_payment_method ?? null) as string | null,
      final_payment_method: (raw.final_payment_method ?? null) as string | null,
      status: (raw.status ?? "Draft") as string,
      line_items: lineItems,
    };

    return NextResponse.json(clientSafe);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
