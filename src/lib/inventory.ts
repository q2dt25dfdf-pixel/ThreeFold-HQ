// Inventory (stock-on-hand) — Part 1. Pure helpers shared by the page and any
// future server/AI reader. See supabase/create-inventory.sql for the row shape.

export const INVENTORY_CATEGORIES = ["Blanks", "Transfers", "Packaging", "Supplies", "Other"] as const;
export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number];

export type InventoryAdjustment = {
  delta: number;        // signed integer; + received, − consumed/corrected
  reason?: string;      // free text, e.g. "counted", "damaged"
  reference?: string;   // optional free-text link (e.g. an expense id or PO)
  by?: string;          // founder name
  at: string;           // ISO timestamp
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
