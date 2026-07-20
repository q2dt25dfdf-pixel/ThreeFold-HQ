import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getInvoiceBaseUrl } from "@/lib/publicUrl";
import { autoSendReceipt } from "@/lib/autoSendReceipt";

// Thin trigger for the founder (client-side) path: the browser cannot run the server-only
// send (Gmail/Resend creds), so after a founder marks a payment the finances page POSTs here
// and this runs the SAME server-side autoSendReceipt the Stripe webhook uses. Dedupe on the
// receipt-sent stamp means calling this is idempotent and safe to fire-and-forget.
export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = (await request.json()) as { invoiceId?: string };
    if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
    const db = getSupabaseAdmin();
    const result = await autoSendReceipt(db, invoiceId, getInvoiceBaseUrl(request.nextUrl.origin));
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
