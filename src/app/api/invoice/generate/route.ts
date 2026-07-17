import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseAmount } from "@/lib/invoiceCalc";
import { getInvoiceBaseUrl } from "@/lib/publicUrl";

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json() as { invoiceId: string };
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("finances")
      .select("id,data")
      .eq("id", invoiceId)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const raw = rows[0].data as Record<string, unknown>;

    // Cross-reference deposit request for authoritative amounts
    let totalAmount = parseAmount(raw.total_amount ?? raw.amount);
    let depositAmount = parseAmount(raw.deposit_amount) > 0
      ? parseAmount(raw.deposit_amount)
      : totalAmount * 0.5;

    let taxFields: Record<string, unknown> = {};
    if (raw.deposit_request_id) {
      const { data: depRows } = await db
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
        if (dep.subtotal != null) taxFields.subtotal = dep.subtotal;
        if (dep.discount != null) taxFields.discount = dep.discount;
        if (dep.sales_tax_rate != null) taxFields.sales_tax_rate = dep.sales_tax_rate;
        if (dep.sales_tax_amount != null) taxFields.sales_tax_amount = dep.sales_tax_amount;
        if (dep.grand_total != null) taxFields.grand_total = dep.grand_total;
      }
    }

    const balanceRemaining = Math.max(totalAmount - depositAmount, 0);

    // Get best available client email from finance record, then lead
    let clientEmail = (raw.client_email ?? "") as string;
    if (!clientEmail && raw.lead_id) {
      const { data: leadRows } = await db
        .from("crm_leads")
        .select("data")
        .eq("id", raw.lead_id as string)
        .limit(1);
      if (leadRows && leadRows.length > 0) {
        const ld = leadRows[0].data as Record<string, unknown>;
        clientEmail = (ld.email ?? "") as string;
      }
    }

    // Return existing link if already generated
    if (typeof raw.public_token === "string" && raw.public_token) {
      return NextResponse.json({
        publicToken: raw.public_token,
        publicLink: raw.public_link,
        clientEmail,
        balanceRemaining,
      });
    }

    const token = "tfi-" + randomBytes(12).toString("hex");
    const publicLink = `${getInvoiceBaseUrl(request.nextUrl.origin)}/invoice/${token}`;

    const updatedData = { ...raw, public_token: token, public_link: publicLink, ...taxFields };
    const { error: updateError } = await db
      .from("finances")
      .upsert({ id: invoiceId, data: updatedData });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ publicToken: token, publicLink, clientEmail, balanceRemaining });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
