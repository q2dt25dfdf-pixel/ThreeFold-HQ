import { NextRequest, NextResponse } from "next/server";
import { wrapInEmailTemplate } from "@/lib/emailSignature";
import { createGmailDraft, isGmailConfigured, GmailSendParams } from "@/lib/gmailSend";
import { gmailComposeUrl } from "@/lib/emailCompose";

// ── POST /api/create-email-draft ───────────────────────────────────────────────
//
// Creates a Gmail draft via the Gmail REST API with the full branded HTML body
// (including the ThreeFold HubSpot signature). The draft is saved to
// info@threefoldsupply.com Drafts. Returns a URL to open the draft.
//
// Falls back to a Gmail compose URL (plain text) when Gmail is not configured.
//
// Used by HQ modals (SendQuoteModal, SendDepositModal, SendFinalInvoiceModal,
// SendDesignModal, PortalSection) so every compose action creates a proper
// HTML draft rather than a plain-text compose window.

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { to, subject, body: emailBody } = body as Record<string, unknown>;

  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (!emailBody || typeof emailBody !== "string") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const html = wrapInEmailTemplate(emailBody);

  // ── Gmail API draft creation (preferred) ────────────────────────────────────
  if (isGmailConfigured()) {
    try {
      const params: GmailSendParams = { to, subject, html };
      const draft = await createGmailDraft(params);
      return NextResponse.json({
        created: true,
        via:     "gmail_draft",
        draftId: draft.draftId,
        openUrl: draft.openUrl,
      });
    } catch (err) {
      console.error("[create-email-draft] Gmail draft creation failed:", err);
    }
  }

  // ── Fallback: Gmail compose URL (plain text) ────────────────────────────────
  const fallbackUrl = gmailComposeUrl({ to, subject, body: emailBody });
  return NextResponse.json({
    created:     false,
    via:         "compose_url_fallback",
    openUrl:     fallbackUrl,
    warning:     "Gmail API is not configured — opening compose window with plain text body. HTML signature will not be visible until Gmail API env vars are set.",
  });
}
