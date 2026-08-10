// Inventory (stock-on-hand) — Part 1. Pure helpers shared by the page and any
// future server/AI reader. See supabase/create-inventory.sql for the row shape.

export const INVENTORY_CATEGORIES = ["Blanks", "Transfers", "Packaging", "Supplies", "Other"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export type InventoryAdjustment = {
  delta: number;        // signed integer; + received, − consumed/corrected
  reason?: string;      // free text, e.g. "counted", "damaged"
  reference?: string;   // optional free-text link (e.g. an expense id or PO)
  by?: string;          // founder name, or "system" for auto-decrements
  at: string;           // ISO timestamp
  order_id?: string;    // set for shop-order auto-decrements (provenance + reversal)
  source?: "shop_order" | "shop_order_refund" | "manual";
};

export type InventoryItem = {
  id: string;
  category: InventoryCategory | string;
  name: string;                 // generated for Blanks, hand-typed otherwise
  brand?: string;               // Blanks: required structured identity…
  style?: string;
  color?: string;
  size?: string;
  qty_on_hand: number;          // integer >= 0 (never negative)
  low_stock_threshold: number;  // integer >= 0
  vendor?: string;
  notes?: string;
  adjustments?: InventoryAdjustment[];
  created_at?: string;
  updated_at?: string;
};

// Blanks carry structured identity + a generated name; all other categories are a
// plain hand-typed name with no required structure.
export function isBlank(category: string | undefined): boolean {
  return category === "Blanks";
}

type BlankFields = { brand?: string; style?: string; color?: string; size?: string };

// "Comfort Colors C1717 Black L" from its parts (skips blanks, single-spaced).
export function blankDisplayName(f: BlankFields): string {
  return [f.brand, f.style, f.color, f.size].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

// Canonical identity key for duplicate detection (case-insensitive, trimmed).
export function blankKey(f: BlankFields): string {
  return [f.brand, f.style, f.color, f.size].map((s) => (s ?? "").trim().toLowerCase()).join("|");
}

// The stored name: generated for Blanks, the typed name otherwise.
export function resolveInventoryName(f: { category?: string; name?: string } & BlankFields): string {
  return isBlank(f.category) ? blankDisplayName(f) : (f.name ?? "").trim();
}

export function isLowStock(it: { qty_on_hand?: number; low_stock_threshold?: number }): boolean {
  return (Number(it.qty_on_hand) || 0) <= (Number(it.low_stock_threshold) || 0);
}

// Validate a would-be item. Returns an error string, or null when valid.
export function validateInventoryItem(f: {
  category?: string; name?: string; qty_on_hand?: number; low_stock_threshold?: number;
} & BlankFields): string | null {
  if (!f.category || !(INVENTORY_CATEGORIES as readonly string[]).includes(f.category)) {
    return "Category is required.";
  }
  if (isBlank(f.category)) {
    const missing = (["brand", "style", "color", "size"] as const).filter((k) => !String(f[k] ?? "").trim());
    if (missing.length) return `Blanks require ${missing.join(", ")}.`;
  } else if (!String(f.name ?? "").trim()) {
    return "Name is required.";
  }
  if (!Number.isInteger(f.qty_on_hand) || (f.qty_on_hand as number) < 0) {
    return "Quantity on hand must be a whole number of 0 or more.";
  }
  if (!Number.isInteger(f.low_stock_threshold) || (f.low_stock_threshold as number) < 0) {
    return "Low-stock threshold must be a whole number of 0 or more.";
  }
  return null;
}

// Distinct suggestion values for one Blanks field, narrowed by the values already
// chosen for the fields that come before it (brand → style → color → size). If a
// constraint matches nothing, it's skipped so the list falls back to the wider set
// (a brand-new value never blanks the suggestions). Case-insensitive. Pure — reads
// only existing inventory rows, no hardcoded catalogue.
export function suggestBlankValues(
  items: InventoryItem[],
  field: "brand" | "style" | "color" | "size",
  constraints: Partial<Record<"brand" | "style" | "color" | "size", string>>,
): string[] {
  const n = (s?: string) => (s ?? "").trim().toLowerCase();
  let pool = items.filter((it) => isBlank(it.category));
  for (const key of ["brand", "style", "color", "size"] as const) {
    if (key === field) break; // only narrow by fields BEFORE the target field
    const v = constraints[key];
    if (!n(v)) continue;
    const filtered = pool.filter((x) => n(x[key]) === n(v));
    if (filtered.length) pool = filtered;
  }
  return [...new Set(pool.map((x) => (x[field] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// ── Grouped view for the desktop layout ──────────────────────────────────────
// Blanks nest brand+style → colour → size (keying the top on brand+style keeps two
// styles of one brand from colliding). Non-blanks group flat by category. Totals on
// each level are the sum of their children. Derived purely from existing rows.
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL"];
export function sizeRank(size?: string): number {
  const i = SIZE_ORDER.indexOf((size ?? "").trim().toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}
function sumUnits(rows: InventoryItem[]): number {
  return rows.reduce((s, it) => s + (Number(it.qty_on_hand) || 0), 0);
}

export type InventoryColorGroup = { color: string; sizes: InventoryItem[]; units: number; low: number };
export type InventoryBrandGroup = { key: string; brand: string; style: string; colors: InventoryColorGroup[]; colorCount: number; units: number; low: number };
export type InventoryCategoryGroup = { category: string; rows: InventoryItem[] };

export function groupInventory(items: InventoryItem[]): { blankGroups: InventoryBrandGroup[]; nonBlankGroups: InventoryCategoryGroup[] } {
  const blanks = items.filter((it) => isBlank(it.category));
  const others = items.filter((it) => !isBlank(it.category));

  const brandMap = new Map<string, { brand: string; style: string; colors: Map<string, InventoryItem[]> }>();
  for (const it of blanks) {
    const key = `${it.brand ?? ""}||${it.style ?? ""}`;
    let g = brandMap.get(key);
    if (!g) { g = { brand: it.brand ?? "", style: it.style ?? "", colors: new Map() }; brandMap.set(key, g); }
    const color = it.color ?? "";
    const arr = g.colors.get(color) ?? [];
    arr.push(it);
    g.colors.set(color, arr);
  }
  const blankGroups: InventoryBrandGroup[] = [...brandMap.entries()].map(([key, g]) => {
    const colors = [...g.colors.entries()].map(([color, sizes]) => {
      const sorted = [...sizes].sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || (a.size ?? "").localeCompare(b.size ?? ""));
      return { color, sizes: sorted, units: sumUnits(sorted), low: sorted.filter(isLowStock).length };
    }).sort((a, b) => a.color.localeCompare(b.color));
    return {
      key, brand: g.brand, style: g.style, colors,
      colorCount: colors.length, units: colors.reduce((s, c) => s + c.units, 0), low: colors.reduce((s, c) => s + c.low, 0),
    };
  }).sort((a, b) => a.brand.localeCompare(b.brand) || a.style.localeCompare(b.style));

  const catMap = new Map<string, InventoryItem[]>();
  for (const it of others) { const arr = catMap.get(it.category) ?? []; arr.push(it); catMap.set(it.category, arr); }
  const nonBlankGroups: InventoryCategoryGroup[] = [...catMap.entries()]
    .map(([category, rows]) => ({ category, rows: [...rows].sort((a, b) => (a.name || "").localeCompare(b.name || "")) }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return { blankGroups, nonBlankGroups };
}

// Find an existing Blank with the same identity (case-insensitive), excluding a
// given id (used when editing). Returns the duplicate item, or null.
export function findDuplicateBlank(
  items: InventoryItem[],
  fields: BlankFields,
  excludeId?: string,
): InventoryItem | null {
  const key = blankKey(fields);
  return items.find((it) => isBlank(it.category) && it.id !== excludeId && blankKey(it) === key) ?? null;
}
