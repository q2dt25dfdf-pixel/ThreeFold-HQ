import { TF_FROM_ADDRESS, wrapInEmailTemplate } from "@/lib/emailSignature";
import { sendViaGmail, isGmailConfigured } from "@/lib/gmailSend";

// Single email-send path used by BOTH /api/send-email (manual) and server-side auto-send.
// Gmail first, Resend fallback. Wraps the plain-text body in the branded HTML template.
// Returns a result object; never throws for a delivery failure (callers decide what to do).

export type SendEmailResult =
  | { sent: true; messageId: string | null; sentVia: "gmail" | "resend"; gmailError?: string }
  | { sent: false; error: string; status: number };

export async function sendEmail(params: { to: string; subject: string; body: string }): Promise<SendEmailResult> {
  const { to, subject, body } = params;
  const html = wrapInEmailTemplate(body);

  // ── Gmail first ──────────────────────────────────────────────────────────────
  let gmailError: string | undefined;
  if (isGmailConfigured()) {
    try {
      const gmailResult = await sendViaGmail({ to, subject, html });
      return { sent: true, messageId: gmailResult.messageId, sentVia: "gmail" };
    } catch (gmailErr) {
      gmailError = String(gmailErr);
      console.error("[sendEmail] Gmail send failed, falling back to Resend:", gmailErr);
    }
  }

  // ── Resend fallback ──────────────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (resendKey) {
    if (!fromEmail) {
      return { sent: false, error: "Sender email is not configured. Set RESEND_FROM_EMAIL in Vercel.", status: 500 };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `ThreeFold Supply Co. <${fromEmail}>`,
          reply_to: [TF_FROM_ADDRESS],
          to: [to],
          subject,
          html,
        }),
      });
      if (res.ok) {
        const { id: messageId } = (await res.json()) as { id: string };
        return { sent: true, messageId, sentVia: "resend", ...(gmailError ? { gmailError } : {}) };
      }
      console.error("[sendEmail] Resend API error:", await res.text());
    } catch (emailErr) {
      console.error("[sendEmail] Resend fetch error:", emailErr);
    }
  }

  return {
    sent: false,
    error: "Email service not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in Vercel (Gmail API), or set RESEND_API_KEY as a fallback.",
    status: 503,
  };
}
