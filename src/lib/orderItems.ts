// Derive an order's legacy `items` (string[] of names) and `quantity` (sum) from its
// structured line_items. ONE implementation, shared by the approve flow, the Stripe
// webhook, and the manual order line-item editor — so the derivation can never drift.
type LineItemLike = { name?: unknown; quantity?: unknown };

export function deriveItemsAndQuantity(lineItems: unknown): { items: string[]; quantity: number } {
  const arr = Array.isArray(lineItems) ? lineItems : [];
  const items = arr
    .map((li) => String((li as LineItemLike).name ?? "").trim())
    .filter(Boolean);
  const quantity = arr.reduce((s: number, li) => s + (Number((li as LineItemLike).quantity) || 0), 0);
  return { items, quantity };
}
