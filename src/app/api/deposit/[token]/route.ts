import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const { data: rows, error } = await getSupabaseAdmin()
      .from("deposit_requests")
      .select("id,data")
      .eq("data->>public_token", token)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Deposit request not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(rows[0].data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
