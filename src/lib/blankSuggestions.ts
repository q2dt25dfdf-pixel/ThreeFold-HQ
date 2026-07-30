// Suggestions for the free-text "Blank" (production spec) field on quote/order
// line items. The field stays free-text everywhere; these values only populate a
// native <datalist>, which suggests but never restricts. History grows itself:
// any new blank the founder types is saved onto the line item and surfaces here
// next time.
//
// Suggestion sources (unioned, deduped case-insensitively, sorted):
//   1. SEED_BLANKS below (so the dropdown is useful before any history exists)
//   2. distinct blanks pulled from existing records' data.line_items[].blank
//   3. any extra values passed in (e.g. the current product's catalog default)

// Known blanks to always offer. Append to this list as more become standard.
export const SEED_BLANKS: string[] = [
  "Jerzees 21M Dri-Power 100% Polyester T-Shirt",
];

// Minimal shape we read from: a record blob whose line_items each may carry a blank.
type BlankLineItem = { blank?: unknown };
type BlankSourceRow = { line_items?: unknown } | null | undefined;

// Builds the deduped, sorted suggestion list. `rowGroups` is any number of loaded
// table arrays (quotes, orders, deposit_requests); `extra` is additional one-off
// values (e.g. current-product default blanks). Trims whitespace, drops empties,
// dedupes case-insensitively while preserving the first occurrence's casing.
export function buildBlankSuggestions(
  rowGroups: BlankSourceRow[][],
  extra: Array<string | null | undefined> = [],
): string[] {
  const byKey = new Map<string, string>(); // lowercased key -> original casing

  const add = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, trimmed);
  };

  // Seed + extras first so they're always present regardless of history.
  SEED_BLANKS.forEach(add);
  extra.forEach(add);

  for (const rows of rowGroups) {
    for (const row of rows ?? []) {
      const items = row?.line_items;
      if (!Array.isArray(items)) continue;
      for (const li of items) add((li as BlankLineItem)?.blank);
    }
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}
