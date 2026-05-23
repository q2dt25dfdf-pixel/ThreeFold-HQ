import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json() as { invoiceId: string };
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("finances")
      .select("id,data")
      .eq("id", invoiceId)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const raw = rows[0].data as Record<string, unknown>;

    // Return existing link if already generated
    if (typeof raw.public_token === "string" && raw.public_token) {
      return NextResponse.json({
        publicToken: raw.public_token,
        publicLink: raw.public_link,
      });
    }

    const token = "tfi-" + randomBytes(12).toString("hex");
    const origin = request.nextUrl.origin;
    const publicLink = `${origin}/invoice/${token}`;

    const updatedData = { ...raw, public_token: token, public_link: publicLink };
    const { error: updateError } = await db
      .from("finances")
      .upsert({ id: invoiceId, data: updatedData });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ publicToken: token, publicLink });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
