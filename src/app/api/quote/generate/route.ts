import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  try {
    const { leadId, clientName, clientEmail, totalAmount, items, notes } =
      await request.json() as {
        leadId: string;
        clientName: string;
        clientEmail: string;
        totalAmount: number;
        items: string[];
        notes: string;
      };

    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin
      .from("quotes")
      .select("*", { count: "exact", head: true });

    const quoteNumber = `TF-Q-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    const token = "tfq-" + randomBytes(12).toString("hex");
    const origin = request.nextUrl.origin;
    const publicLink = `${origin}/quote/${token}`;

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);
    const expirationDateStr = expirationDate.toISOString().split("T")[0]!;

    const quoteId = `quote-${leadId}-${Date.now()}`;
    const quoteData = {
      id: quoteId,
      quote_number: quoteNumber,
      lead_id: leadId,
      client_name: clientName ?? "",
      client_email: clientEmail ?? "",
      items: items ?? [],
      total_amount: totalAmount ?? 0,
      expiration_date: expirationDateStr,
      public_token: token,
      public_link: publicLink,
      status: "draft",
      notes: notes ?? "",
      sent_date: null as string | null,
      email_status: null as string | null,
      email_message_id: null as string | null,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("quotes")
      .upsert({ id: quoteId, data: quoteData });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      quoteId,
      quoteNumber,
      publicLink,
      publicToken: token,
      expirationDate: expirationDateStr,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
