import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createNotification } from "@/lib/notifications";
import { getDepositBaseUrl } from "@/lib/publicUrl";
import { buildDepositEmailBody, buildDepositEmailSubject } from "@/lib/depositEmail";
import type { QuoteDiscount } from "@/lib/salesTax";

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
      deposit_minimum: (raw.deposit_minimum ?? null) as number | null,
      expiration_date: raw.expiration_date,
      status: raw.status,
      created_at: raw.created_at,
      superseded_by: (raw.superseded_by ?? null) as string | null,
      superseded_at: (raw.superseded_at ?? null) as string | null,
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

    // A superseded quote is no longer an offer — the client must not approve a
    // price we no longer stand behind.
    if (quoteData.superseded_by) {
      return NextResponse.json(
        { error: "An updated quote has been sent. Please review the current version before approving." },
        { status: 409 },
      );
    }

    // An expired quote is no longer valid — cannot approve, must not create a deposit.
    // Same expiry semantics the portal uses to disable the approve button.
    const expirationDate = quoteData.expiration_date as string | undefined;
    if (expirationDate && new Date(expirationDate + "T23:59:59") < new Date()) {
      return NextResponse.json(
        { error: "This quote has expired. Please contact Threefold Supply Co. for an updated quote." },
        { status: 409 },
      );
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

    // Advance the lead to Quote Approved (approved_quote_id kept separate from quote_id),
    // then ensure a deposit request exists so the client can pay on the same page.
    let depositToken: string | null = null;   // returned to the page for the pay card (Piece 3)
    let depositLink: string | null = null;
    let depositStatus: string | null = null;  // "paid" | "pending" when an existing one blocks

    if (leadId) {
      const { data: leadRows } = await db
        .from("crm_leads")
        .select("id,data")
        .eq("id", leadId)
        .limit(1);
      const leadData = (leadRows?.[0]?.data ?? null) as Record<string, unknown> | null;

      // Deposit seeded at the quote's minimum (default 50%). balance_remaining is written
      // too — the portal renders the stored balance.
      const grandTotal = Number(quoteData.grand_total ?? quoteData.total_amount ?? 0);
      const minFraction =
        typeof quoteData.deposit_minimum === "number" && quoteData.deposit_minimum > 0 && quoteData.deposit_minimum <= 1
          ? quoteData.deposit_minimum
          : 0.5;
      const depositAmount = Math.round(grandTotal * minFraction * 100) / 100;
      const balanceRemaining = Math.max(Math.round((grandTotal - depositAmount) * 100) / 100, 0);

      // Reuse the lead's existing deposit if any (a voided one does not count) — never
      // create a second row.
      const existingDepId = (leadData?.deposit_request_id as string) || null;
      let existing: { id: string; data: Record<string, unknown> } | null = null;
      if (existingDepId) {
        const { data: depRows } = await db.from("deposit_requests").select("id,data").eq("id", existingDepId).limit(1);
        const r = depRows?.[0];
        if (r) existing = { id: r.id as string, data: (r.data ?? {}) as Record<string, unknown> };
      }
      const usable = existing && !existing.data.voided_at ? existing : null;

      let finalDep: Record<string, unknown> | null = null; // the row the email describes
      let emailRecordId: string | null = null;
      let sendEmail = false;
      let newDepositId: string | null = null;
      let newDepositNumber: string | null = null;

      if (usable && (usable.data.status === "paid" || usable.data.status === "pending")) {
        // Already paid or in-flight — do not touch, do not create, do not email.
        depositToken = (usable.data.public_token as string) ?? null;
        depositLink = (usable.data.public_link as string) ?? null;
        depositStatus = usable.data.status as string;
      } else if (usable) {
        // Reuse the existing (draft/sent) row as-is — no second row, no amount clobber.
        depositToken = (usable.data.public_token as string) ?? null;
        depositLink = (usable.data.public_link as string) ?? null;
        finalDep = usable.data;
        emailRecordId = usable.id;
        sendEmail = usable.data.status !== "sent"; // don't re-email an already-sent one
      } else if (grandTotal > 0) {
        // Create a fresh deposit request seeded at the minimum. Mirrors /api/deposit/generate.
        const year = new Date().getFullYear();
        const { count } = await db.from("deposit_requests").select("*", { count: "exact", head: true });
        newDepositNumber = `TF-D-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
        const token = "tfd-" + randomBytes(12).toString("hex");
        const link = `${getDepositBaseUrl(request.nextUrl.origin)}/deposit/${token}`;
        newDepositId = `deposit-${leadId}-${Date.now()}`;

        const depositData: Record<string, unknown> = {
          id: newDepositId,
          deposit_request_number: newDepositNumber,
          lead_id: leadId,
          quote_id: quoteId,
          client_name: (quoteData.client_name ?? leadData?.company ?? "") as string,
          client_email: (quoteData.client_email || leadData?.email || "") as string,
          total_amount: grandTotal,
          deposit_amount: depositAmount,
          balance_remaining: balanceRemaining,
          line_items: quoteData.line_items ?? null,
          payment_instructions: "",
          public_token: token,
          public_link: link,
          status: "draft",
          notes: "",
          sent_date: null,
          email_status: null,
          email_message_id: null,
          created_at: now,
        };
        if (quoteData.subtotal != null) depositData.subtotal = quoteData.subtotal;
        if (quoteData.discount != null) depositData.discount = quoteData.discount;
        if (quoteData.sales_tax_rate != null) depositData.sales_tax_rate = quoteData.sales_tax_rate;
        if (quoteData.sales_tax_amount != null) depositData.sales_tax_amount = quoteData.sales_tax_amount;
        if (quoteData.grand_total != null) depositData.grand_total = quoteData.grand_total;

        await db.from("deposit_requests").upsert({ id: newDepositId, data: depositData });
        depositToken = token;
        depositLink = link;
        finalDep = depositData;
        emailRecordId = newDepositId;
        sendEmail = true;
      }

      // Update the lead: stage + approval, and repoint deposit_request_id only when we
      // created a new one (never repoint to a reused/existing row it already points at).
      if (leadData) {
        const nowIso = new Date().toISOString();
        const updatedLeadData: Record<string, unknown> = {
          ...leadData,
          stage: "Quote Approved",
          approved_quote_id: quoteId,
          stage_changed_at: nowIso,
          last_activity_at: nowIso,
          ...(newDepositId ? { deposit_request_id: newDepositId, deposit_request_number: newDepositNumber } : {}),
        };
        await db.from("crm_leads").update({ data: updatedLeadData }).eq("id", leadId);

        createNotification({
          type: "quote_approved",
          title: "Quote Approved",
          message: `${String(leadData.company ?? "Client")} · Quote ${String(quoteData.quote_number ?? "")} approved by client.`,
          entity_type: "lead",
          entity_id: leadId,
        }).catch((err) => console.error("[quote approval] notification failed:", err));
      }

      // Send the deposit email via the shared sender (marks the deposit "sent"). Reuses the
      // single deposit-email builder. A send failure must NOT fail approval — the deposit
      // exists and is payable on the page regardless.
      if (sendEmail && finalDep && emailRecordId) {
        const recipient = (finalDep.client_email as string) || (leadData?.email as string) || "";
        if (recipient) {
          const emTotal = Number(finalDep.total_amount ?? finalDep.grand_total ?? 0);
          const emDeposit = Number(finalDep.deposit_amount ?? 0);
          const emBalance = Number(finalDep.balance_remaining ?? Math.max(emTotal - emDeposit, 0));
          const emNumber = (finalDep.deposit_request_number as string) ?? null;
          const contactName = (leadData?.contact as string) || (finalDep.client_name as string) || "there";
          const subject = buildDepositEmailSubject(emNumber, emTotal, emDeposit);
          const body = buildDepositEmailBody(
            contactName, emNumber, emTotal, emDeposit, emBalance,
            (finalDep.line_items as { name: string; quantity: number }[] | null) ?? null,
            (finalDep.subtotal as number | null) ?? null,
            (finalDep.sales_tax_rate as number | null) ?? null,
            (finalDep.sales_tax_amount as number | null) ?? null,
            (finalDep.discount as QuoteDiscount | null) ?? null,
            (finalDep.public_link as string | null) ?? null,
          );
          try {
            await fetch(new URL("/api/send-email", request.nextUrl.origin), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: recipient, subject, body, recordId: emailRecordId, recordType: "deposit" }),
            });
          } catch (err) {
            console.error("[quote approval] deposit email failed:", err);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...(depositToken ? { depositToken, depositLink } : {}),
      ...(depositStatus ? { depositStatus } : {}),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
