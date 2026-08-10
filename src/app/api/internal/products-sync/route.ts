import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validateInternalRequest } from "@/lib/internalAuth";

// POST /api/internal/products-sync  (Bearer INTERNAL_API_SECRET)
// Called by the website (scripts/products-sync.mjs) whenever the product catalog is
// regenerated. products.csv is the source of truth; this is an AUTHORITATIVE replace:
// every row is upserted (id = slug, data = { id, slug, name, collection }) and any
// product row whose slug is no longer present is DELETED — so a removed product stops
// showing in HQ's Blank-Mapping picker instead of drifting stale.
//
// Body: { products: [{ slug, name, collection, image? }] }
// image = absolute URL of the back-print thumbnail (generated at sync time), used by
// the redesigned shop-order emails to show a per-line product image.
type IncomingProduct = { slug?: string; name?: string; collection?: string; image?: string };

export async function POST(request: Request) {
  const auth = validateInternalRequest(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });

  let body: { products?: IncomingProduct[] };
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 }); }
  if (!Array.isArray(body.products)) {
    return NextResponse.json({ ok: false, error: "products array is required." }, { status: 400 });
  }

  // Normalize + de-dupe by slug (last write wins), dropping rows with no slug/name.
  const bySlug = new Map<string, { id: string; slug: string; name: string; collection: string; image: string }>();
  for (const p of body.products) {
    const slug = (p.slug ?? "").trim();
    const name = (p.name ?? "").trim();
    if (!slug || !name) continue;
    bySlug.set(slug, { id: slug, slug, name, collection: (p.collection ?? "").trim(), image: (p.image ?? "").trim() });
  }
  const clean = [...bySlug.values()];
  if (clean.length === 0) {
    return NextResponse.json({ ok: false, error: "No valid products (each needs slug + name)." }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // Upsert every row.
  const rows = clean.map((c) => ({ id: c.id, data: c }));
  const { error: upErr } = await db.from("products").upsert(rows);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  // Delete any product no longer in the CSV (authoritative sync).
  const keepIds = clean.map((c) => c.id);
  const { data: existing, error: listErr } = await db.from("products").select("id");
  if (listErr) return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
  const stale = ((existing ?? []) as { id: string }[]).map((r) => r.id).filter((id) => !keepIds.includes(id));
  let deleted = 0;
  if (stale.length) {
    const { error: delErr } = await db.from("products").delete().in("id", stale);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    deleted = stale.length;
  }

  return NextResponse.json({ ok: true, upserted: clean.length, deleted });
}
