import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateSessionRequest } from "@/lib/sessionAuth";

// Sidebar "new" badges (SHARED across founders). Backed by hq_section_views(section,
// last_viewed_at). shop_orders is RLS-on so this must be server-side (service role).
//
// GET  /api/badges          -> { shopOrders, orders }  (counts of rows created since seen)
// POST /api/badges {section} -> mark a section viewed now (clears its badge for everyone)
const SECTIONS = ["shop-orders", "orders"] as const;
type Section = (typeof SECTIONS)[number];

async function lastViewedMap(db: ReturnType<typeof getSupabaseAdmin>) {
  const { data } = await db.from("hq_section_views").select("section, last_viewed_at");
  const m: Record<string, string> = {};
  (data ?? []).forEach((r) => { m[r.section as string] = r.last_viewed_at as string; });
  return m;
}
async function countSince(db: ReturnType<typeof getSupabaseAdmin>, table: string, since: string) {
  const { count } = await db
    .from(table)
    .select("id", { count: "exact", head: true })
    .gt("data->>created_at", since);
  return count ?? 0;
}

export async function GET(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const db = getSupabaseAdmin();
  const seen = await lastViewedMap(db);
  const epoch = "1970-01-01T00:00:00Z";
  const [shopOrders, orders] = await Promise.all([
    countSince(db, "shop_orders", seen["shop-orders"] || epoch),
    countSince(db, "orders", seen["orders"] || epoch),
  ]);
  return NextResponse.json({ shopOrders, orders }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await validateSessionRequest(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  let body: { section?: string };
  try { body = await request.json(); } catch { body = {}; }
  const section = body.section as Section;
  if (!SECTIONS.includes(section)) return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("hq_section_views")
    .upsert({ section, last_viewed_at: new Date().toISOString() }, { onConflict: "section" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
