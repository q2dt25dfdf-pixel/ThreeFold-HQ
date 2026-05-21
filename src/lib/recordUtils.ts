/**
 * Shared helpers for reading fields from loosely-typed Supabase JSONB blobs.
 * All functions accept plain Record<string, unknown> so they work with any
 * locally-defined StorageRecord / Row alias without requiring a shared type.
 */

/** Returns the field value as a string, or `fallback` if missing/non-scalar. */
export function stringField(
  record: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = record[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

/** Returns the lowercased, trimmed `status` field — safe to use in Set lookups. */
export function statusText(record: Record<string, unknown>): string {
  return stringField(record, "status").trim().toLowerCase();
}

/**
 * Reads a field that may be stored under either a camelCase or snake_case key.
 * Tries `camelKey` first, then `snakeKey`, then `fallback`.
 *
 * Example:
 *   readField(lead, "followUpDate", "follow_up_date")
 */
export function readField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback = "",
): string {
  return stringField(record, camelKey) || stringField(record, snakeKey, fallback);
}
