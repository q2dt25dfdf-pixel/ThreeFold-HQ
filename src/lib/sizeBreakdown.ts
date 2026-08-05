// Size breakdown per order line item. Stored EMBEDDED on each line item inside the
// order's JSONB (line_items[].sizes) — this app has no relational line-item table, so
// the breakdown rides along with the item it describes. Additive detail only: the line
// item's `quantity` stays the source of truth and is never derived from sizes.
//
// Shared by the internal order editor, the client portal, and the invoice page so the
// summary / total math is identical everywhere.

export type SizeQty = { size: string; qty: number };

// Adult presets offered as fixed inputs in the editor (S–4XL). Youth/other codes
// (YS, YM, YL, OS, …) are added as free-text custom rows, so they aren't listed here.
export const PRESET_SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;

// Coerce whatever is stored on a line item into a clean, display-ready size list:
// trimmed non-empty codes, non-negative integer qtys, zero-qty rows dropped.
export function normalizeSizes(raw: unknown): SizeQty[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as { size?: unknown; qty?: unknown };
      return {
        size: String(o.size ?? "").trim(),
        qty: Math.max(0, Math.round(Number(o.qty) || 0)),
      };
    })
    .filter((s) => s.size && s.qty > 0);
}

export function sizesTotal(sizes: SizeQty[]): number {
  return sizes.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
}

// Compact one-line summary, e.g. "S 10 · M 30 · L 35 · XL 20 · 2XL 5".
export function sizesSummary(sizes: SizeQty[]): string {
  return sizes.map((s) => `${s.size} ${s.qty}`).join(" · ");
}
