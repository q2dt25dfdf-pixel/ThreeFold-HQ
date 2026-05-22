import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function toHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>\n");
}

function wrapInEmailTemplate(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F3EC;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:48px 32px 64px;">
  <div style="font-size:11px;font-weight:800;letter-spacing:0.22em;color:#0a0a0a;margin-bottom:4px;">THREEFOLD SUPPLY CO.</div>
  <div style="font-size:10px;letter-spacing:0.08em;color:#6F685D;margin-bottom:32px;">Made by three, worn by all.</div>
  <div style="height:1px;background:#DDD6CB;margin-bottom:32px;"></div>
  <div style="font-size:15px;color:#332E28;line-height:1.75;">
    ${toHtml(body)}
  </div>
  <div style="height:1px;background:#DDD6CB;margin-top:40px;margin-bottom:24px;"></div>
  <div style="font-size:10px;font-weight:700;letter-spacing:0.22em;color:#756D62;margin-bottom:4px;">THREEFOLD SUPPLY CO.</div>
  <div style="font-size:10px;color:#7F776B;letter-spacing:0.06em;">Made by three, worn by all.</div>
</div>
</body>
</html>`;
}

async function updateRecordSent(
  recordType: string,
  recordId: string,
  sentAt: string,
  emailStatus: string,
  messageId: string | null,
) {
  if (!recordId || !recordType) return;
  const tableName = recordType === "quote" ? "quotes" : "deposit_requests";

  const { data: rows } = await supabaseAdmin
    .from(tableName)
    .select("id,data")
    .eq("id", recordId)
    .limit(1);

  if (!rows || rows.length === 0) return;

  await supabaseAdmin
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
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

    if (resendKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `Threefold Supply Co. <${fromEmail}>`,
            to: [to],
            subject,
            html: wrapInEmailTemplate(body),
          }),
        });

        if (res.ok) {
          const { id: messageId } = (await res.json()) as { id: string };
          await updateRecordSent(recordType, recordId, sentAt, "sent", messageId);
          return NextResponse.json({ sent: true, messageId });
        }

        const resendError = await res.text();
        console.error("Resend API error:", resendError);
      } catch (emailErr) {
        console.error("Resend fetch error:", emailErr);
      }
    }

    // Fallback: record the send and return a mailto URL the client can open
    const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await updateRecordSent(recordType, recordId, sentAt, "sent_via_client", null);

    return NextResponse.json({ sent: false, fallback: true, mailto_url: mailtoUrl });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
