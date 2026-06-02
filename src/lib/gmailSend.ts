/**
 * Gmail API sender — Google Workspace integration for ThreeFold Supply Co.
 *
 * Sends email through info@threefoldsupply.com via the Gmail REST API using
 * OAuth2 refresh-token flow. No external packages required — uses native fetch.
 *
 * Required Vercel environment variables:
 *   GMAIL_CLIENT_ID       — Google OAuth2 client ID
 *   GMAIL_CLIENT_SECRET   — Google OAuth2 client secret
 *   GMAIL_REFRESH_TOKEN   — long-lived refresh token for info@threefoldsupply.com
 *
 * Setup:
 *   1. Go to Google Cloud Console → APIs & Services → Credentials
 *   2. Create OAuth2 client (type: Web application)
 *   3. Add authorized redirect URI: https://developers.google.com/oauthplayground
 *   4. In OAuth Playground (https://developers.google.com/oauthplayground):
 *      - Click gear → check "Use your own OAuth credentials"
 *      - Enter Client ID and Client Secret
 *      - Authorize scope: https://mail.google.com/
 *        (full access required — gmail.send alone blocks draft creation)
 *      - Exchange auth code for tokens → copy refresh_token
 *   5. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in Vercel
 *
 * Fallback:
 *   When env vars are absent, isGmailConfigured() returns false and callers
 *   fall back to Resend. Existing send routes continue to work unchanged.
 */

import { TF_FROM_ADDRESS, TF_FROM_HEADER } from "@/lib/emailSignature";

export interface GmailSendParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface GmailSendResult {
  messageId: string;
  threadId:  string;
  sentVia:   "gmail";
}

export function isGmailConfigured(): boolean {
  return !!(
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type:    "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; error?: string };
  if (data.error) throw new Error(`Gmail token error: ${data.error}`);
  return data.access_token;
}

function buildRfc2822(params: GmailSendParams): string {
  const replyTo = params.replyTo ?? TF_FROM_ADDRESS;
  // Encode subject for RFC 2822 (handles non-ASCII)
  const subject = params.subject.includes("=?")
    ? params.subject
    : `=?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`;

  return [
    `From: ${TF_FROM_HEADER}`,
    `To: ${params.to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    params.html,
  ].join("\r\n");
}

function base64url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface GmailDraftResult {
  draftId:   string;
  messageId: string;
  /** URL to open Gmail Drafts folder — the new draft will be at the top. */
  openUrl:   string;
}

/**
 * Creates a Gmail draft with the full HTML body via the Gmail REST API.
 * The draft is saved in the info@threefoldsupply.com Drafts folder.
 * Returns a URL to open the Drafts folder so the founder can review + send.
 */
export async function createGmailDraft(params: GmailSendParams): Promise<GmailDraftResult> {
  const accessToken = await getAccessToken();
  const raw = base64url(buildRfc2822(params));

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API draft creation failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    id: string;
    message: { id: string; threadId: string };
  };

  return {
    draftId:   data.id,
    messageId: data.message.id,
    openUrl:   "https://mail.google.com/mail/#drafts",
  };
}

export async function sendViaGmail(params: GmailSendParams): Promise<GmailSendResult> {
  const accessToken = await getAccessToken();
  const raw = base64url(buildRfc2822(params));

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API send failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { id: string; threadId: string };
  return {
    messageId: data.id,
    threadId:  data.threadId,
    sentVia:   "gmail",
  };
}
