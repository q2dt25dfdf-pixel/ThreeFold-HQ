import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Quote ID required" }, { status: 400 });
  }

  try {
    const { data: rows, error } = await getSupabaseAdmin()
      .from("quotes")
      .select("id,data")
      .eq("id", id)
      .limit(1);

    if (error || !rows || rows.length === 0) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    const raw = rows[0].data as Record<string, unknown>;
    return NextResponse.json({
      quoteId: raw.id,
      quoteNumber: raw.quote_number,
      lineItems: raw.line_items ?? null,
      totalAmount: raw.total_amount,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
