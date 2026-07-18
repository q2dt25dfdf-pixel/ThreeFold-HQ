import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { data: rows, error } = await getSupabaseAdmin()
      .from("quotes")
      .select("id,data")
      .eq("data->>public_token", token)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const raw = rows[0].data as Record<string, unknown>;
    const clientSafe = {
      quote_number: raw.quote_number,
      client_name: raw.client_name,
      items: raw.items,
      line_items: raw.line_items ?? null,
      subtotal: raw.subtotal ?? null,
      discount: raw.discount ?? null,
      sales_tax_rate: raw.sales_tax_rate ?? null,
      sales_tax_amount: raw.sales_tax_amount ?? null,
      grand_total: raw.grand_total ?? null,
      total_amount: raw.total_amount,
      expiration_date: raw.expiration_date,
      status: raw.status,
      created_at: raw.created_at,
    };
    return NextResponse.json(clientSafe);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json() as { acknowledgementAccepted?: boolean };

    if (!body.acknowledgementAccepted) {
      return NextResponse.json({ error: "Acknowledgement required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { data: rows, error } = await db
      .from("quotes")
      .select("id,data")
      .eq("data->>public_token", token)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const quoteRow = rows[0];
    const quoteData = quoteRow.data as Record<string, unknown>;
    const quoteId = quoteRow.id as string;
    const leadId = quoteData.lead_id as string | undefined;

    if (quoteData.status === "approved") {
      return NextResponse.json({ alreadyApproved: true });
    }

    const now = new Date().toISOString();

    const updatedQuoteData = {
      ...quoteData,
      status: "approved",
      acknowledgementAccepted: true,
      acknowledgementAcceptedAt: now,
    };

    const { error: quoteUpdateError } = await db
      .from("quotes")
      .update({ data: updatedQuoteData })
      .eq("id", quoteId);

    if (quoteUpdateError) {
      return NextResponse.json({ error: quoteUpdateError.message }, { status: 500 });
    }

    // Advance the lead to Quote Approved. Store approvedQuoteId separately —
    // never overwrite quote_id, which tracks the most recently sent quote.
    if (leadId) {
      const { data: leadRows } = await db
        .from("crm_leads")
        .select("id,data")
        .eq("id", leadId)
        .limit(1);

      if (leadRows && leadRows.length > 0) {
        const leadData = leadRows[0].data as Record<string, unknown>;
        const nowIso = new Date().toISOString();
        const updatedLeadData = {
          ...leadData,
          stage: "Quote Approved",
          approved_quote_id: quoteId,
          stage_changed_at: nowIso,
          last_activity_at: nowIso,
        };
        await db
          .from("crm_leads")
          .update({ data: updatedLeadData })
          .eq("id", leadId);

        createNotification({
          type: "quote_approved",
          title: "Quote Approved",
          message: `${String(leadData.company ?? "Client")} · Quote ${String(quoteData.quote_number ?? "")} approved by client.`,
          entity_type: "lead",
          entity_id: leadId,
        }).catch((err) => console.error("[quote approval] notification failed:", err));
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
