// Inventory Part 2 — auto-decrement planning. Pure, unit-testable: given a shop
// order's lines, the design→blank config, and current inventory, produce the
// per-line outcomes + the inventory updates to apply. Never mutates inputs and
// never drives a row below 0 (oversell decrements to 0 and flags "short").

import { isBlank, blankKey, type InventoryItem, type InventoryAdjustment } from "@/lib/inventory";

export type BlankIdentity = { brand: string; style: string; color: string };
export type BlankOverride = BlankIdentity & { design: string };
export type BlankMapConfig = {
  default_blank?: BlankIdentity | null;
  overrides?: BlankOverride[];
};

const norm = (s?: string) => (s ?? "").trim().toLowerCase();
const hasIdentity = (b?: BlankIdentity | null) => !!b && !!(b.brand || b.style || b.color);

// Resolve the blank identity (brand/style/color) for a design: a matching override
// wins, else the default. null when there's no override AND no default → unresolved.
export function resolveBlankIdentity(design: string, config: BlankMapConfig): BlankIdentity | null {
  const ov = (config.overrides ?? []).find((o) => norm(o.design) === norm(design));
  if (ov) return { brand: ov.brand, style: ov.style, color: ov.color };
  return hasIdentity(config.default_blank) ? (config.default_blank as BlankIdentity) : null;
}

export type LineStatus = "applied" | "short" | "unresolved" | "no_inventory";
export type LineOutcome = {
  design: string;
  size: string;
  qty: number;
  status: LineStatus;
  resolved_blank?: string; // "Brand Style Color Size" display
  inventory_id?: string;
  applied: number;         // units actually decremented
  short: number;           // units we couldn't cover (oversell / missing)
};

export type DecrementPlan = {
  lines: LineOutcome[];
  updates: { id: string; newQty: number; adjustment: InventoryAdjustment }[];
  status: "applied" | "issues"; // "issues" if ANY line is unresolved/no_inventory/short
};

function identityDisplay(b: BlankIdentity, size: string): string {
  return [b.brand, b.style, b.color, size].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

export function planDecrement(
  lines: { name: string; size: string; qty: number }[],
  config: BlankMapConfig,
  items: InventoryItem[],
  orderId: string,
  nowIso: string,
): DecrementPlan {
  // Working copy of on-hand per Blanks row + a lookup by identity key. A design can
  // appear on multiple lines and several lines can map to the same blank, so we draw
  // down sequentially against the working quantities.
  const working = new Map<string, number>();
  const byKey = new Map<string, InventoryItem>();
  for (const it of items) {
    if (!isBlank(it.category)) continue;
    working.set(it.id, Number(it.qty_on_hand) || 0);
    byKey.set(blankKey(it), it);
  }

  const outcomes: LineOutcome[] = [];
  const appliedByRow = new Map<string, number>();

  for (const line of lines) {
    const design = line.name;
    const size = line.size;
    const qty = Math.max(0, Math.floor(Number(line.qty) || 0));

    const ident = resolveBlankIdentity(design, config);
    if (!ident) {
      outcomes.push({ design, size, qty, status: "unresolved", applied: 0, short: qty });
      continue;
    }
    const disp = identityDisplay(ident, size);
    const row = byKey.get(blankKey({ brand: ident.brand, style: ident.style, color: ident.color, size }));
    if (!row) {
      outcomes.push({ design, size, qty, status: "no_inventory", resolved_blank: disp, applied: 0, short: qty });
      continue;
    }
    const avail = working.get(row.id) ?? 0;
    const applied = Math.min(avail, qty);
    const short = qty - applied;
    working.set(row.id, avail - applied);
    appliedByRow.set(row.id, (appliedByRow.get(row.id) ?? 0) + applied);
    outcomes.push({
      design, size, qty,
      status: short > 0 ? "short" : "applied",
      resolved_blank: disp,
      inventory_id: row.id,
      applied, short,
    });
  }

  const updates = [...appliedByRow.entries()]
    .filter(([, applied]) => applied > 0)
    .map(([id, applied]) => {
      const it = items.find((x) => x.id === id)!;
      const newQty = Math.max(0, (Number(it.qty_on_hand) || 0) - applied);
      const adjustment: InventoryAdjustment = {
        delta: -applied,
        reason: "Shop order",
        order_id: orderId,
        source: "shop_order",
        by: "system",
        at: nowIso,
      };
      return { id, newQty, adjustment };
    });

  const status = outcomes.some((o) => o.status !== "applied") ? "issues" : "applied";
  return { lines: outcomes, updates, status };
}
