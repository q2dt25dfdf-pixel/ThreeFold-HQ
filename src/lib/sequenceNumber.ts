import { type SupabaseClient } from "@supabase/supabase-js";

// Single source for TF sequence numbers (quotes / deposit_requests / orders).
//
// COLLISION-SAFE ON DELETE: the next number is max(existing numeric tail) + 1, NOT
// count(*) + 1. Deleting any row — even a middle one — can therefore never make the
// next create land on a number that already exists (the old count+1 bug).
//
// The year is cosmetic: it is embedded in the returned string but the sequence itself
// is a single ever-increasing run that is NOT reset or filtered per year — this matches
// the prior behavior exactly, just collision-safe.
//
// Concurrency is intentionally OUT OF SCOPE here: this is still a read-then-write with
// no lock. The UNIQUE indexes on data->>'<field>' are the backstop — if two creates
// ever compute the same number at once, the second INSERT is rejected by the database
// rather than silently duplicating.

export interface SequenceOptions {
  table: string;   // e.g. "quotes"
  field: string;   // jsonb key holding the number, e.g. "quote_number"
  prefix: string;  // e.g. "TF-Q"
  year?: number;   // defaults to the current year
}

export async function nextSequenceNumber(
  db: SupabaseClient,
  { table, field, prefix, year }: SequenceOptions,
): Promise<string> {
  // Pull only the number string from every row (not the whole jsonb blob).
  const { data, error } = await db.from(table).select(`value:data->>${field}`);
  if (error) throw new Error(`nextSequenceNumber(${table}): ${error.message}`);

  let max = 0;
  // supabase-js can't statically type a dynamic `value:data->>${field}` alias, so it
  // infers a ParserError type — cast through unknown to the real runtime shape.
  for (const row of (data ?? []) as unknown as { value: string | null }[]) {
    const v = row.value;
    if (typeof v !== "string") continue;
    // Format is TF-<X>-YYYY-#### ; the numeric part is the segment after the last hyphen.
    // split/pop is width-agnostic, so it keeps working if the tail ever grows past 4 digits.
    const tail = v.split("-").pop();
    const n = tail ? parseInt(tail, 10) : NaN;
    if (Number.isFinite(n) && n > max) max = n;
  }

  const next = max + 1; // empty table => max stays 0 => next = 1 => "0001"
  const y = year ?? new Date().getFullYear();
  return `${prefix}-${y}-${String(next).padStart(4, "0")}`;
}
