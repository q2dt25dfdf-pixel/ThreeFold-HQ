import { NextRequest, NextResponse } from "next/server";
import { wrapInEmailTemplate } from "@/lib/emailSignature";
import { createGmailDraft, isGmailConfigured, GmailSendParams } from "@/lib/gmailSend";

// ── POST /api/create-email-draft ───────────────────────────────────────────────
//
// Creates a Gmail draft via the Gmail REST API with the full branded HTML body
// (including the ThreeFold HubSpot signature). The draft is saved to
// info@threefoldsupply.com Drafts. Returns a URL to open the draft.
//
// Returns HTTP 503 when Gmail credentials are absent.
// Returns HTTP 502 when Gmail API returns an error (invalid token, wrong scope).
// The gmail.send scope alone is insufficient — the refresh token must be created
// with https://mail.google.com/ scope (full access) for drafts.create to work.

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

  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: "Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in Vercel." },
      { status: 503 },
    );
  }

  const html = wrapInEmailTemplate(emailBody);

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
    return NextResponse.json(
      { error: `Gmail draft creation failed: ${String(err)}. Ensure the OAuth refresh token was created with https://mail.google.com/ scope (not just gmail.send).` },
      { status: 502 },
    );
  }
}
