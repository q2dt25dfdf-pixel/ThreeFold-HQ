import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { TF_FROM_ADDRESS, TF_FROM_HEADER, wrapInEmailTemplate } from "@/lib/emailSignature";
import { sendViaGmail, isGmailConfigured } from "@/lib/gmailSend";

async function updateRecordSent(
  recordType: string,
  recordId: string,
  sentAt: string,
  emailStatus: string,
  messageId: string | null,
) {
  if (!recordId || !recordType) return;
  const tableName = recordType === "quote" ? "quotes" : "deposit_requests";
  const db = getSupabaseAdmin();

  const { data: rows } = await db
    .from(tableName)
    .select("id,data")
    .eq("id", recordId)
    .limit(1);

  if (!rows || rows.length === 0) return;

  await db
    .from(tableName)
    .update({
      data: {
        ...(rows[0].data as Record<string, unknown>),
        status: "sent",
        sent_date: sentAt,
        email_status: emailStatus,
        email_message_id: messageId,
      },
    })
    .eq("id", recordId);
}

export async function POST(request: NextRequest) {
  try {
    const { to, subject, body, recordId, recordType } =
      await request.json() as {
        to: string;
        subject: string;
        body: string;
        recordId: string;
        recordType: "quote" | "deposit";
      };

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, body" },
        { status: 400 },
      );
    }

    const sentAt = new Date().toISOString();
    const html = wrapInEmailTemplate(body);

    // ── Try Gmail first ──────────────────────────────────────────────────────────
    if (isGmailConfigured()) {
      try {
        const gmailResult = await sendViaGmail({ to, subject, html });
        await updateRecordSent(recordType, recordId, sentAt, "sent", gmailResult.messageId);
        return NextResponse.json({ sent: true, messageId: gmailResult.messageId, sentVia: "gmail" });
      } catch (gmailErr) {
        console.error("[send-email] Gmail send failed, falling back to Resend:", gmailErr);
      }
    }

    // ── Try Resend ───────────────────────────────────────────────────────────────
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (resendKey) {
      if (!fromEmail) {
        return NextResponse.json(
          { error: "Sender email is not configured. Set RESEND_FROM_EMAIL in Vercel." },
          { status: 500 },
        );
      }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:     `ThreeFold Supply Co. <${fromEmail}>`,
            reply_to: [TF_FROM_ADDRESS],
            to:       [to],
            subject,
            html,
          }),
        });

        if (res.ok) {
          const { id: messageId } = (await res.json()) as { id: string };
          await updateRecordSent(recordType, recordId, sentAt, "sent", messageId);
          return NextResponse.json({ sent: true, messageId, sentVia: "resend" });
        }

        const resendError = await res.text();
        console.error("[send-email] Resend API error:", resendError);
      } catch (emailErr) {
        console.error("[send-email] Resend fetch error:", emailErr);
      }
    }

    // ── Fallback: return mailto URL the client can open ──────────────────────────
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await updateRecordSent(recordType, recordId, sentAt, "sent_via_client", null);
    return NextResponse.json({ sent: false, fallback: true, mailto_url: mailtoUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
