import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/sendEmail";

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

    // Single shared send path (Gmail first, Resend fallback) — identical to auto-send.
    const result = await sendEmail({ to, subject, body });
    if (result.sent) {
      await updateRecordSent(recordType, recordId, sentAt, "sent", result.messageId);
      return NextResponse.json({ sent: true, messageId: result.messageId, sentVia: result.sentVia, ...(result.gmailError ? { gmailError: result.gmailError } : {}) });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
