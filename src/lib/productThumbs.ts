import type { getSupabaseAdmin } from "@/lib/supabase-admin";

// Maps a shop-order line NAME → its back-print thumbnail URL, read from the `products`
// table (seeded by the website's products-sync). Keyed by normalized name because the
// order line carries the product name, not the slug. Missing/empty images are skipped,
// so a lookup miss just means "no thumbnail" and the email renders a text fallback tile.

export type ThumbMap = Record<string, string>;

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

type ProductRow = { name?: string; image?: string };

export async function loadProductThumbs(db: ReturnType<typeof getSupabaseAdmin>): Promise<ThumbMap> {
  const map: ThumbMap = {};
  try {
    const { data } = await db.from("products").select("id, data");
    for (const row of (data ?? []) as { data: ProductRow | null }[]) {
      const name = norm(row.data?.name);
      const image = (row.data?.image ?? "").trim();
      if (name && image) map[name] = image;
    }
  } catch {
    // Products table missing or unreadable → no thumbnails; emails still send with fallbacks.
  }
  return map;
}
