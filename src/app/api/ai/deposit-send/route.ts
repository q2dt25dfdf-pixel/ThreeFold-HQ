import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { nextSequenceNumber } from "@/lib/sequenceNumber";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO } from "@/lib/businessDate";
import { type QuoteRow, selectBestQuote } from "@/lib/quoteSelection";
import { getDepositBaseUrl } from "@/lib/publicUrl";
import { TF_FROM_ADDRESS, TF_FROM_HEADER, TF_PLAIN_CLOSING, wrapInEmailTemplate } from "@/lib/emailSignature";
import { sendViaGmail, createGmailDraft, isGmailConfigured } from "@/lib/gmailSend";
import { calcDiscountAmount, normalizeDiscount, type QuoteDiscount } from "@/lib/salesTax";
import { depositTerms } from "@/lib/depositTerms";

export const dynamic = "force-dynamic";

// ── POST /api/ai/deposit-send ──────────────────────────────────────────────────
//
// JARVIS WORKFLOW (enforced by design — do not bypass):
//   1. GET /api/ai/deposit-preview    → show full preview to founder
//   2. Ask: "Send this deposit request to [company]?"
//   3. Only after explicit "yes": POST /api/ai/deposit-send with confirm: true
//
// Reuse existing deposit when lead.deposit_request_id exists.
// Block double-send: 409 when deposit status === "sent".
// Only create new deposit record when no deposit_request_id exists on lead.
// Amounts for new deposits: pulled from linked quote record, then lead value.
// NEVER recomputes totals — reads what is already stored.
// Sends via Gmail API (preferred) or Resend (fallback). action: "draft" saves to Gmail Drafts.
//
// Side effects (mirrors handleDepositSent):
//   - deposit_requests: status → "sent", sent_date, email_status, email_message_id
//   - crm_leads: deposit_request_id, deposit_request_number, communicationHistory

const VALID_SENDERS = new Set(["Alliyah", "Hannah", "Jordan"]);

// ── Email body (matches deposit-preview/HQ SendDepositModal exactly) ───────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtTaxRate(rate: number | null | undefined): string {
  if (rate == null) return "";
  return (rate * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
}

type LineItem = { name: string; quantity: number; [key: string]: unknown };

function buildEmailBody(
  contactName: string,
  depositNumber: string | null,
  totalAmount: number,
  depositAmount: number,
  balanceRemaining: number,
  lineItems: LineItem[] | null,
  subtotal: number | null,
  salesTaxRate: number | null,
  salesTaxAmount: number | null,
  discount: QuoteDiscount | null,
  publicLink: string,
): string {
  const depositPct =
    totalAmount > 0 ? Math.round((depositAmount / totalAmount) * 100) : 50;
  const terms = depositTerms(depositPct);

  const itemSummary =
    lineItems && lineItems.length > 0
      ? `\n\nItems included:\n${lineItems.map((i) => `• ${i.name} (×${i.quantity})`).join("\n")}`
      : "";

  const hasTax = salesTaxAmount != null && salesTaxAmount > 0;
  const taxLine = hasTax
    ? `\nSales Tax (${fmtTaxRate(salesTaxRate)}): ${fmtCurrency(salesTaxAmount!)}`
    : "";
  const discountLine =
    discount && subtotal != null
      ? `\n${discount.label}: -${fmtCurrency(calcDiscountAmount(subtotal, discount))}`
      : "";
  const subtotalLine =
    subtotal != null && subtotal !== totalAmount
      ? `\nSubtotal: ${fmtCurrency(subtotal)}${discountLine}${taxLine}`
      : "";
  const balanceLine = terms.showBalance
    ? `\nBalance Due on Completion: ${fmtCurrency(balanceRemaining)}`
    : "";

  return (
    `Hi ${contactName},\n\n` +
    `Your project with Threefold Supply Co. is approved and ready to move into production!\n\n` +
    `To kick things off, we require ${terms.isFull ? "payment" : "a deposit"} as shown below.${itemSummary}\n\n` +
    `${terms.requestNoun} #: ${depositNumber ?? "[DEPOSIT NUMBER]"}${subtotalLine}\n` +
    `Total Project Value: ${fmtCurrency(totalAmount)}\n` +
    `${terms.dueLabelWithPct}: ${fmtCurrency(depositAmount)}${balanceLine}\n\n` +
    `Please note: Card payments include a 3% processing fee. Bank account payments and checks do not.\n\n` +
    `View your full ${terms.requestNoun.toLowerCase()} here:\n${publicLink}\n\n` +
    `${terms.oncePaidSentence} Questions? Just reply to this email.\n\n` +
    TF_PLAIN_CLOSING
  );
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const auth = validateAIRequest(request);
  if (!auth.ok) return errResponse("Unauthorized", auth.status);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errResponse("Invalid JSON body", 400);
  }

  const { leadId, sender, confirm, action } = rawBody as Record<string, unknown>;
  const emailAction = (typeof action === "string" && action === "draft") ? "draft" : "send";

  // ── Hard confirmation gate ──────────────────────────────────────────────────
  if (confirm !== true) {
    return errResponse(
      "confirm must be boolean true. Show the full deposit preview and ask 'Send this deposit request?' before calling this endpoint.",
      400,
    );
  }

  // ── Input validation ────────────────────────────────────────────────────────
  if (!leadId || typeof leadId !== "string") {
    return errResponse(
      "leadId is required. Obtain it from GET /api/ai/deposit-preview.",
      400,
    );
  }

  if (!sender || typeof sender !== "string" || !VALID_SENDERS.has(sender)) {
    return errResponse("sender must be Alliyah, Hannah, or Jordan.", 400);
  }

  // ── Email service vars (Gmail primary; Resend optional fallback) ────────────
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  try {
    const db = getSupabaseAdmin();

    // ── Fetch lead ──────────────────────────────────────────────────────────────
    const { data: leadRows, error: leadErr } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", leadId)
      .limit(1);

    if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/deposit-send] fetch lead: ${leadErr.message}`);
    }
    if (!leadRows || leadRows.length === 0) {
      return errResponse(
        "Lead not found. Obtain leadId from GET /api/ai/deposit-preview or GET /api/ai/crm.",
        404,
      );
    }

    const ld = (leadRows[0].data ?? {}) as Record<string, unknown>;
    const company = (ld.company as string) || (ld.name as string) || null;
    const clientEmail = (ld.email as string) || null;
    const existingHistory = (ld.communicationHistory as unknown[]) ?? [];

    if (!clientEmail) {
      return errResponse(
        "Lead has no email on file. Add an email in HQ before sending via Jarvis.",
        400,
      );
    }

    // ── Resolve deposit record ─────────────────────────────────────────────────
    const existingDepositId = (ld.deposit_request_id as string) || null;
    let depositId: string;
    let depositData: Record<string, unknown>;
    let isNew = false;

    if (existingDepositId) {
      // ── Reuse existing deposit — no new record, no new sequential number ───
      const { data: depRows, error: depErr } = await db
        .from("deposit_requests")
        .select("id,data")
        .eq("id", existingDepositId)
        .limit(1);

      if (depErr && (depErr as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/deposit-send] fetch deposit: ${depErr.message}`);
      }
      if (!depRows || depRows.length === 0) {
        return errResponse(
          `Deposit record ${existingDepositId} not found. Use GET /api/ai/deposit-preview to verify the deposit.`,
          404,
        );
      }

      depositId = depRows[0].id;
      depositData = (depRows[0].data ?? {}) as Record<string, unknown>;

      // Safety: block double-send
      const currentStatus = (depositData.status as string) ?? "draft";
      if (currentStatus === "sent") {
        const sentDate = (depositData.sent_date as string) ?? "a previous date";
        return errResponse(
          `This deposit request was already sent (${sentDate}). To resend, use the HQ SendDepositModal.`,
          409,
        );
      }
    } else {
      // ── No existing deposit — generate a new record ────────────────────────
      // Amounts come from the best sent quote for this lead, then fall back to
      // lead.value. Never recomputed — reads what is already stored.
      // Draft quotes are rejected; ambiguous sent quotes require the founder to
      // specify quoteNumber via GET /api/ai/quote-preview first.
      let totalAmount = 0;
      let lineItems: unknown[] | null = null;
      let subtotal: number | null = null;
      let salesTaxRate: number | null = null;
      let salesTaxAmount: number | null = null;
      let grandTotal: number | null = null;
      let discount: QuoteDiscount | null = null;
      let quoteId: string | null = null;

      // Fetch all quotes for this lead and select the best one
      const { data: allQuoteRows, error: quotesErr } = await db
        .from("quotes")
        .select("id,data");

      if (quotesErr && (quotesErr as { code?: string }).code !== "42P01") {
        throw new Error(`[ai/deposit-send] fetch quotes: ${quotesErr.message}`);
      }

      const leadQuotes = ((allQuoteRows ?? []) as QuoteRow[]).filter(
        (q) => (q.data?.lead_id as string) === leadId,
      );

      const quoteResult = selectBestQuote(leadQuotes);

      if (quoteResult.kind === "ambiguous") {
        const candidateList = quoteResult.candidates
          .map((c) => {
            const total = c.grandTotal != null ? fmtCurrency(c.grandTotal) : "no total";
            return `${c.quoteNumber ?? c.quoteId} (${c.status ?? "unknown"}, ${total})`;
          })
          .join("; ");
        return errResponse(
          `Multiple quotes exist for this lead — cannot determine which to use for the deposit. ` +
          `Preview the correct quote with GET /api/ai/quote-preview?quoteNumber=<number>, ` +
          `confirm with the founder, then retry. Candidates: ${candidateList}`,
          400,
        );
      }

      if (quoteResult.kind === "single") {
        const selectedQuote = quoteResult.quote;
        const qd = (selectedQuote.data ?? {}) as Record<string, unknown>;
        const quoteStatus = (qd.status as string) ?? null;

        if (quoteStatus !== "sent") {
          const qn = (qd.quote_number as string) ?? selectedQuote.id;
          return errResponse(
            `Quote ${qn} is a draft and has not been sent to the client. ` +
            `Send the quote first via HQ or GET /api/ai/quote-preview, then retry deposit-send.`,
            400,
          );
        }

        // Use the sent quote's amounts
        const qGrandTotal = qd.grand_total != null ? Number(qd.grand_total) : null;
        const qTotal = qd.total_amount != null ? Number(qd.total_amount) : 0;
        const effectiveTotal = qGrandTotal ?? qTotal;
        if (effectiveTotal > 0) {
          totalAmount = effectiveTotal;
          quoteId = selectedQuote.id;
          if (qd.subtotal != null) subtotal = Number(qd.subtotal);
          if (qd.sales_tax_rate != null) salesTaxRate = Number(qd.sales_tax_rate);
          if (qd.sales_tax_amount != null) salesTaxAmount = Number(qd.sales_tax_amount);
          if (qd.grand_total != null) grandTotal = Number(qd.grand_total);
          discount = normalizeDiscount(qd.discount);
          if (Array.isArray(qd.line_items)) lineItems = qd.line_items as unknown[];
        }
      }
      // quoteResult.kind === "empty" → falls through to lead.value

      // Fall back to lead value when no quote exists
      if (totalAmount <= 0) {
        const rawValue = ld.value;
        if (typeof rawValue === "number") {
          totalAmount = rawValue;
        } else if (typeof rawValue === "string") {
          const n = Number(String(rawValue).replace(/[^0-9.-]/g, ""));
          totalAmount = Number.isFinite(n) ? n : 0;
        }
        quoteId = null;
      }

      if (totalAmount <= 0) {
        return errResponse(
          "Lead has no project value or quote amount on file. Set the project value in HQ before sending via Jarvis.",
          400,
        );
      }

      const depositAmount = Math.round(totalAmount * 0.5 * 100) / 100;
      const balanceRemaining = Math.max(totalAmount - depositAmount, 0);

      // Sequential deposit request number — max(existing)+1 via shared helper
      // (collision-safe on delete). New-deposit branch only; the reuse path above is untouched.
      const depositRequestNumber = await nextSequenceNumber(db, { table: "deposit_requests", field: "deposit_request_number", prefix: "TF-D" });

      const token = "tfd-" + randomBytes(12).toString("hex");
      const publicLink = `${getDepositBaseUrl(new URL(request.url).origin)}/deposit/${token}`;

      depositId = `deposit-${leadId}-${Date.now()}`;

      const newDepositData: Record<string, unknown> = {
        id: depositId,
        deposit_request_number: depositRequestNumber,
        lead_id: leadId,
        quote_id: quoteId ?? null,
        client_name: company ?? "",
        client_email: clientEmail,
        total_amount: grandTotal ?? totalAmount,
        deposit_amount: depositAmount,
        balance_remaining: balanceRemaining,
        line_items: lineItems ?? null,
        payment_instructions: "",
        public_token: token,
        public_link: publicLink,
        status: "draft",
        notes: "",
        sent_date: null,
        email_status: null,
        email_message_id: null,
        created_at: new Date().toISOString(),
      };

      if (subtotal != null) newDepositData.subtotal = subtotal;
      if (discount != null) newDepositData.discount = discount;
      if (salesTaxRate != null) newDepositData.sales_tax_rate = salesTaxRate;
      if (salesTaxAmount != null) newDepositData.sales_tax_amount = salesTaxAmount;
      if (grandTotal != null) newDepositData.grand_total = grandTotal;

      const { error: createErr } = await db
        .from("deposit_requests")
        .upsert({ id: depositId, data: newDepositData });

      if (createErr) {
        throw new Error(`[ai/deposit-send] create deposit: ${createErr.message}`);
      }

      depositData = newDepositData;
      isNew = true;
    }

    // ── Extract fields for email ────────────────────────────────────────────────
    const depositNumber = (depositData.deposit_request_number as string) ?? null;
    const publicLink = (depositData.public_link as string) || null;
    const totalAmount = (depositData.total_amount as number) ?? 0;
    const depositAmount = (depositData.deposit_amount as number) ?? 0;
    const balanceRemaining = (depositData.balance_remaining as number) ?? 0;
    const lineItems = (depositData.line_items as LineItem[] | null) ?? null;
    const subtotal = (depositData.subtotal as number | null) ?? null;
    const salesTaxRate = (depositData.sales_tax_rate as number | null) ?? null;
    const salesTaxAmount = (depositData.sales_tax_amount as number | null) ?? null;
    const emailDiscount = normalizeDiscount(depositData.discount);

    if (!publicLink) {
      return errResponse("Deposit record has no public link. Regenerate from HQ.", 400);
    }

    // ── Build email ─────────────────────────────────────────────────────────────
    const contactName = company ?? "there";
    const subjectTerms = depositTerms(totalAmount > 0 ? Math.round((depositAmount / totalAmount) * 100) : 50);
    const emailSubject = depositNumber
      ? `${subjectTerms.subjectPrefix} ${depositNumber} | Threefold Supply Co.`
      : `${subjectTerms.subjectPrefix} | Threefold Supply Co.`;

    const emailBodyText = buildEmailBody(
      contactName,
      depositNumber,
      totalAmount,
      depositAmount,
      balanceRemaining,
      lineItems,
      subtotal,
      salesTaxRate,
      salesTaxAmount,
      emailDiscount,
      publicLink,
    );
    const emailHtml = wrapInEmailTemplate(emailBodyText);

    // ── Draft path ──────────────────────────────────────────────────────────────
    if (emailAction === "draft") {
      if (!isGmailConfigured()) {
        return errResponse(
          "Gmail API credentials are required for draft creation. Configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.",
          503,
        );
      }
      try {
        const draftResult = await createGmailDraft({ to: clientEmail, subject: emailSubject, html: emailHtml });
        const draftedAt = new Date().toISOString();

        const draftCommEntry = {
          id:                  `comm-deposit-draft-${Date.now()}`,
          type:                "Email",
          date:                businessTodayISO(),
          owner:               sender as string,
          summary:             `Deposit request draft created by ${sender as string} via Jarvis. Request #${depositNumber ?? depositId}. Draft ID: ${draftResult.draftId}`,
          email_subject:       emailSubject,
          email_to:            clientEmail,
          email_html:          emailHtml,
          email_deposit_link:  publicLink,
          email_draft_id:      draftResult.draftId,
          email_sent_at:       draftedAt,
          email_sent_via:      "gmail_draft",
          requested_by:        sender as string,
          approved_by:         sender as string,
        };

        const { error: leadDraftErr } = await db
          .from("crm_leads")
          .update({ data: { ...ld, deposit_request_id: depositId, deposit_request_number: depositNumber ?? depositId, last_activity_at: new Date().toISOString(), communicationHistory: [draftCommEntry, ...existingHistory] } })
          .eq("id", leadId);

        if (leadDraftErr) {
          console.error("[ai/deposit-send] Draft created but lead history update failed:", leadDraftErr.message);
        }

        return okResponse({
          drafted:       true,
          draftId:       draftResult.draftId,
          openUrl:       draftResult.openUrl,
          isNew,
          depositId,
          depositNumber: depositNumber ?? depositId,
          publicLink,
          leadId,
          company,
          draftedAt,
          emailSubject,
          note:          "Draft saved to Gmail Drafts. Deposit record created but NOT marked sent — send from Gmail to complete the request.",
        });
      } catch (draftErr) {
        console.error("[ai/deposit-send] Gmail draft creation failed:", draftErr);
        return errResponse("Gmail draft creation failed. Verify GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.", 502);
      }
    }

    // ── Send via Gmail (preferred) or Resend (fallback) ─────────────────────────
    let messageId: string | null = null;
    let threadId:  string | null = null;
    let sentVia:   "gmail" | "resend" = "resend";

    if (isGmailConfigured()) {
      try {
        const gmailResult = await sendViaGmail({
          to: clientEmail,
          subject: emailSubject,
          html: emailHtml,
        });
        messageId = gmailResult.messageId;
        threadId  = gmailResult.threadId;
        sentVia   = "gmail";
      } catch (gmailErr) {
        console.error("[ai/deposit-send] Gmail send failed, falling back to Resend:", gmailErr);
      }
    }

    if (sentVia !== "gmail") {
      if (!resendKey) {
        return errResponse(
          "No email service configured. Set GMAIL_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN for Gmail, or RESEND_API_KEY for Resend fallback.",
          503,
        );
      }
      if (!fromEmail) {
        return errResponse("RESEND_FROM_EMAIL is not configured. Set it in Vercel.", 500);
      }
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:     `ThreeFold Supply Co. <${fromEmail}>`,
          reply_to: [TF_FROM_ADDRESS],
          to:       [clientEmail],
          subject:  emailSubject,
          html:     emailHtml,
        }),
      });

      if (!resendRes.ok) {
        const resendError = await resendRes.text();
        console.error("[ai/deposit-send] Resend error:", resendError);
        return errResponse(
          "Email delivery failed. Try again or send from the HQ SendDepositModal.",
          502,
        );
      }

      const resendJson = (await resendRes.json()) as { id: string };
      messageId = resendJson.id;
    }

    const sentAt = new Date().toISOString();

    // ── Update deposit record ───────────────────────────────────────────────────
    const { error: depositUpdateErr } = await db
      .from("deposit_requests")
      .update({
        data: {
          ...depositData,
          status: "sent",
          sent_date: sentAt,
          email_status: "sent",
          email_message_id: messageId,
          email_thread_id: threadId,
          email_sent_via: sentVia,
        },
      })
      .eq("id", depositId);

    if (depositUpdateErr) {
      console.error(
        "[ai/deposit-send] EMAIL SENT but deposit record DB update failed — manual recovery required.",
        { depositId, leadId, clientEmail, messageId, sentAt, error: depositUpdateErr.message },
      );
    }

    // ── Update lead record (mirrors handleDepositSent) ──────────────────────────
    const depositRequestNumber = depositNumber ?? depositId;
    const commEntry = {
      id:                  `comm-deposit-${Date.now()}`,
      type:                "Email",
      date:                businessTodayISO(),
      owner:               sender,
      summary:             `Deposit request sent by ${sender} via Jarvis. Request #${depositRequestNumber}. Portal: ${publicLink}`,
      email_subject:       emailSubject,
      email_to:            clientEmail,
      email_html:          emailHtml,
      email_deposit_link:  publicLink,
      email_message_id:    messageId,
      email_thread_id:     threadId,
      email_sent_at:       sentAt,
      email_sent_via:      sentVia,
      requested_by:        sender,
      approved_by:         sender,
    };

    const { error: leadUpdateErr } = await db
      .from("crm_leads")
      .update({
        data: {
          ...ld,
          deposit_request_id: depositId,
          deposit_request_number: depositRequestNumber,
          last_activity_at: sentAt,
          communicationHistory: [commEntry, ...existingHistory],
        },
      })
      .eq("id", leadId);

    if (leadUpdateErr) {
      console.error(
        "[ai/deposit-send] EMAIL SENT but lead record DB update failed — manual recovery required.",
        { depositId, leadId, clientEmail, messageId, sentAt, error: leadUpdateErr.message },
      );
    }

    // ── Return ──────────────────────────────────────────────────────────────────
    const dbSyncFailed = !!(depositUpdateErr || leadUpdateErr);
    return okResponse({
      sent: true,
      sentVia,
      isNew,
      depositId,
      depositNumber: depositRequestNumber,
      publicLink,
      leadId,
      company,
      sentAt,
      emailSubject,
      gmailThreadId: threadId,
      ...(dbSyncFailed && {
        dbSyncFailed: true,
        warning:
          `Email delivered to ${clientEmail} (message ID: ${messageId}) but the HQ database ` +
          `was not updated. Please open HQ and manually mark deposit ${depositRequestNumber} ` +
          `as Sent and confirm the lead is linked to the deposit.`,
      }),
    });
  } catch (err) {
    console.error("[ai/deposit-send POST]", err);
    return errResponse("Internal server error", 500);
  }
}
