import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateAIRequest } from "@/lib/aiAuth";
import { okResponse, errResponse } from "@/lib/aiResponse";
import { businessTodayISO } from "@/lib/businessDate";
import { TF_FROM_ADDRESS, TF_FROM_HEADER, TF_PLAIN_CLOSING, wrapInEmailTemplate } from "@/lib/emailSignature";
import { sendViaGmail, createGmailDraft, isGmailConfigured } from "@/lib/gmailSend";
import { calcDiscountAmount, normalizeDiscount } from "@/lib/salesTax";

export const dynamic = "force-dynamic";

// ── POST /api/ai/quote-send ────────────────────────────────────────────────────
//
// JARVIS WORKFLOW (enforced by design — do not bypass):
//   1. GET /api/ai/quote-preview        → show full preview to founder
//   2. Ask: "Send this quote to [company]?"
//   3. Only after explicit "yes": POST /api/ai/quote-send with confirm: true
//
// NEVER generates a new quote. Only sends an existing one.
// NEVER sends without confirm: true.
// NEVER sends if the quote is already marked sent (409).
// Sends via Gmail API (preferred) or Resend (fallback). action: "draft" saves to Gmail Drafts.
// When action is "send" (default): email is delivered, lead stage advances to "Quote Sent".
// When action is "draft": email is saved to Gmail Drafts, stage is NOT advanced.
//
// Side effects (mirrors HQ handleQuoteSent — send only):
//   - Quote: status → "sent", sent_date, email_status, email_message_id
//   - Lead:  stage → "Quote Sent", quote_id, quote_number, value, communicationHistory
//
// NOT performed (browser-only in HQ):
//   - syncFollowUpTask (HQ re-syncs on next load)
//   - postNotification (requires Supabase browser session)

const VALID_SENDERS = new Set(["Alliyah", "Hannah", "Jordan"]);

// ── Email body builders (match HQ SendQuoteModal exactly) ──────────────────────

const SHARED_TAIL =
  "This quote is valid for 30 days.\n\n" +
  "To move forward, we require a 50% deposit before production begins. " +
  "The remaining 50% balance is due before the completed order is delivered or shipped.\n\n" +
  "If everything looks good, simply reply to this email, give us a call, or send us a text. " +
  "We'll prepare and send your deposit invoice separately and get your project into production.\n\n" +
  "If you have any questions at all, please don't hesitate to reach out.\n\n" +
  TF_PLAIN_CLOSING;

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// Pricing block for the email body: full breakdown only when a discount applies;
// otherwise just the project total, so no-discount emails are unchanged.
function buildPricingBlock(
  subtotal: number | null,
  discount: import("@/lib/salesTax").QuoteDiscount | null,
  salesTaxAmount: number | null,
  grandTotal: number | null,
): string {
  const grandTotalFormatted = grandTotal != null ? fmtCurrency(grandTotal) : "[QUOTE TOTAL]";
  if (discount && subtotal != null && salesTaxAmount != null) {
    const discountAmount = calcDiscountAmount(subtotal, discount);
    return (
      `Subtotal: ${fmtCurrency(subtotal)}\n` +
      `${discount.label}: -${fmtCurrency(discountAmount)}\n` +
      `Sales Tax: ${fmtCurrency(salesTaxAmount)}\n` +
      `Project Total: ${grandTotalFormatted}`
    );
  }
  return `Project Total: ${grandTotalFormatted}`;
}

function buildEmailBody(
  contactName: string,
  quoteNumber: string | null,
  pricingBlock: string,
  expirationDate: string | null,
  publicLink: string,
  isRevised: boolean,
): string {
  const expFormatted = expirationDate ? fmtDate(expirationDate) : "[EXPIRY DATE]";
  const qn = quoteNumber ?? "[QUOTE NUMBER]";

  if (isRevised) {
    return (
      `Hello ${contactName},\n\n` +
      `We've updated your quote based on the changes discussed and attached the revised pricing for your review.\n\n` +
      `You can view your updated quote and pricing breakdown here:\n${publicLink}\n\n` +
      `Please take a look and let us know if everything looks correct. If you'd like to make any additional adjustments, simply reply to this email and we'll be happy to update it further.\n\n` +
      `Once you're ready to move forward, you can approve the quote directly from the quote page.\n\n` +
      `Quote Number: ${qn}\n${pricingBlock}\nValid Through: ${expFormatted}\n\n` +
      SHARED_TAIL
    );
  }

  return (
    `Hi ${contactName},\n\n` +
    `Thank you for considering Threefold Supply Co.! We've prepared a custom quote for your project.\n\n` +
    `Quote Number: ${qn}\n${pricingBlock}\nValid Through: ${expFormatted}\n\n` +
    `View your full quote — including pricing breakdown — here:\n${publicLink}\n\n` +
    SHARED_TAIL
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

  const { quoteId, sender, confirm, action } = rawBody as Record<string, unknown>;
  const emailAction = (typeof action === "string" && action === "draft") ? "draft" : "send";

  // ── Hard confirmation gate ──────────────────────────────────────────────────
  if (confirm !== true) {
    return errResponse(
      "confirm must be boolean true. Show the full quote preview and ask 'Send this quote?' before calling this endpoint.",
      400,
    );
  }

  // ── Input validation ────────────────────────────────────────────────────────
  if (!quoteId || typeof quoteId !== "string") {
    return errResponse(
      "quoteId is required. Obtain it from GET /api/ai/quote-preview.",
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

    // ── Fetch quote ─────────────────────────────────────────────────────────────
    const { data: quoteRows, error: quoteErr } = await db
      .from("quotes")
      .select("id,data")
      .eq("id", quoteId)
      .limit(1);

    if (quoteErr && (quoteErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/quote-send] fetch quote: ${quoteErr.message}`);
    }
    if (!quoteRows || quoteRows.length === 0) {
      return errResponse(
        "Quote not found. Use GET /api/ai/quote-preview to find the correct quoteId.",
        404,
      );
    }

    const qd = (quoteRows[0].data ?? {}) as Record<string, unknown>;

    // ── Safety: block double-send ───────────────────────────────────────────────
    const currentStatus = (qd.status as string) ?? "draft";
    if (currentStatus === "sent") {
      const sentDate = (qd.sent_date as string) ?? "a previous date";
      return errResponse(
        `This quote was already sent (${sentDate}). To resend or revise, use the HQ SendQuoteModal.`,
        409,
      );
    }

    const publicLink     = qd.public_link as string | null;
    const publicToken    = qd.public_token as string | null;
    const quoteNumber    = (qd.quote_number as string) ?? null;
    const grandTotal     = (qd.grand_total as number | null) ?? (qd.total_amount as number | null) ?? null;
    const subtotal       = (qd.subtotal as number | null) ?? null;
    const salesTaxAmount = (qd.sales_tax_amount as number | null) ?? null;
    const discount       = normalizeDiscount(qd.discount);
    const expirationDate = (qd.expiration_date as string) ?? null;
    const leadId         = (qd.lead_id as string) ?? null;

    if (!publicLink || !publicToken) {
      return errResponse("Quote has no public link. Regenerate from HQ.", 400);
    }
    if (!leadId) {
      return errResponse("Quote has no linked lead. Cannot send via Jarvis.", 400);
    }

    // ── Fetch lead ──────────────────────────────────────────────────────────────
    const { data: leadRows, error: leadErr } = await db
      .from("crm_leads")
      .select("id,data")
      .eq("id", leadId)
      .limit(1);

    if (leadErr && (leadErr as { code?: string }).code !== "42P01") {
      throw new Error(`[ai/quote-send] fetch lead: ${leadErr.message}`);
    }
    if (!leadRows || leadRows.length === 0) {
      return errResponse("Lead linked to this quote not found.", 404);
    }

    const ld = (leadRows[0].data ?? {}) as Record<string, unknown>;
    const company          = (ld.company as string) || (ld.name as string) || null;
    const previousStage    = (ld.stage as string) || null;
    const isRevised        = previousStage === "Quote Sent";
    const contactName      = company ?? "there";
    const existingHistory  = (ld.communicationHistory as unknown[]) ?? [];

    // Resolve client email: quote record first (set by HQ), then lead record (fallback for
    // Jarvis-created quotes which store client_email as empty string by design).
    const clientEmail =
      (qd.client_email as string) || (ld.email as string) || null;

    if (!clientEmail) {
      return errResponse(
        "No client email found on the quote or lead. Add an email in HQ before sending via Jarvis.",
        400,
      );
    }

    // ── Build email ─────────────────────────────────────────────────────────────
    const emailSubject = isRevised
      ? "Updated Quote from Threefold Supply Co."
      : "Your Custom Quote from Threefold Supply Co.";

    const pricingBlock = buildPricingBlock(subtotal, discount, salesTaxAmount, grandTotal);
    const emailBodyText = buildEmailBody(
      contactName, quoteNumber, pricingBlock, expirationDate, publicLink, isRevised,
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
          id:               `comm-quote-draft-${Date.now()}`,
          type:             "Email",
          date:             businessTodayISO(),
          owner:            sender as string,
          summary:          `${isRevised ? "Revised quote" : "Quote"} draft created by ${sender as string} via Jarvis. Quote #${quoteNumber ?? quoteId}. Draft ID: ${draftResult.draftId}`,
          email_subject:    emailSubject,
          email_to:         clientEmail,
          email_html:       emailHtml,
          email_quote_link: publicLink,
          email_draft_id:   draftResult.draftId,
          email_sent_at:    draftedAt,
          email_sent_via:   "gmail_draft",
          requested_by:     sender as string,
          approved_by:      sender as string,
        };

        const { error: leadDraftErr } = await db
          .from("crm_leads")
          .update({ data: { ...ld, communicationHistory: [draftCommEntry, ...existingHistory] } })
          .eq("id", leadId);

        if (leadDraftErr) {
          console.error("[ai/quote-send] Draft created but lead history update failed:", leadDraftErr.message);
        }

        return okResponse({
          drafted:     true,
          draftId:     draftResult.draftId,
          openUrl:     draftResult.openUrl,
          quoteId,
          quoteNumber,
          publicLink,
          leadId,
          company,
          draftedAt,
          emailSubject,
          note:        "Draft saved to Gmail Drafts. Lead stage NOT advanced — send from Gmail to advance to Quote Sent.",
        });
      } catch (draftErr) {
        console.error("[ai/quote-send] Gmail draft creation failed:", draftErr);
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
        console.error("[ai/quote-send] Gmail send failed, falling back to Resend:", gmailErr);
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
        console.error("[ai/quote-send] Resend error:", resendError);
        return errResponse("Email delivery failed. Try again or send from the HQ SendQuoteModal.", 502);
      }

      const resendJson = (await resendRes.json()) as { id: string };
      messageId = resendJson.id;
    }

    const sentAt = new Date().toISOString();

    // ── Update quote record ─────────────────────────────────────────────────────
    const { error: quoteUpdateErr } = await db
      .from("quotes")
      .update({
        data: {
          ...qd,
          status: "sent",
          sent_date: sentAt,
          email_status: "sent",
          email_message_id: messageId,
          email_thread_id: threadId,
          email_sent_via: sentVia,
        },
      })
      .eq("id", quoteId);

    if (quoteUpdateErr) {
      console.error(
        "[ai/quote-send] EMAIL SENT but quote record DB update failed — manual recovery required.",
        { quoteId, leadId, clientEmail, messageId, sentAt, error: quoteUpdateErr.message },
      );
    }

    // ── Update lead record (mirrors handleQuoteSent) ────────────────────────────
    const commEntry = {
      id:      `comm-quote-${Date.now()}`,
      type:    "Email",
      date:    businessTodayISO(),
      owner:   sender,
      summary: `${isRevised ? "Revised quote" : "Quote"} sent by ${sender} via Jarvis. Quote #${quoteNumber ?? quoteId}. Portal: ${publicLink}`,
      email_subject:    emailSubject,
      email_to:         clientEmail,
      email_html:       emailHtml,
      email_quote_link: publicLink,
      email_message_id: messageId,
      email_thread_id:  threadId,
      email_sent_at:    sentAt,
      email_sent_via:   sentVia,
      requested_by:     sender,
      approved_by:      sender,
    };

    const { error: leadUpdateErr } = await db
      .from("crm_leads")
      .update({
        data: {
          ...ld,
          stage: "Quote Sent",
          quote_id: quoteId,
          quote_number: quoteNumber,
          ...(grandTotal != null && grandTotal > 0 ? { value: grandTotal } : {}),
          communicationHistory: [commEntry, ...existingHistory],
        },
      })
      .eq("id", leadId);

    if (leadUpdateErr) {
      console.error(
        "[ai/quote-send] EMAIL SENT but lead record DB update failed — manual recovery required.",
        { quoteId, leadId, clientEmail, messageId, sentAt, error: leadUpdateErr.message },
      );
    }

    // ── Return ──────────────────────────────────────────────────────────────────
    const dbSyncFailed = !!(quoteUpdateErr || leadUpdateErr);
    return okResponse({
      sent: true,
      sentVia,
      quoteId,
      quoteNumber,
      publicLink,
      leadId,
      company,
      previousStage,
      newStage: "Quote Sent",
      isRevised,
      sentAt,
      emailSubject,
      gmailThreadId: threadId,
      ...(dbSyncFailed && {
        dbSyncFailed: true,
        warning:
          `Email delivered to ${clientEmail} (message ID: ${messageId}) but the HQ database ` +
          `was not updated. Please open HQ and manually mark quote ${quoteNumber ?? quoteId} ` +
          `as Sent and set the lead stage to "Quote Sent".`,
      }),
    });

  } catch (err) {
    console.error("[ai/quote-send POST]", err);
    return errResponse("Internal server error", 500);
  }
}
