// Remove the retired tax_collected_amount / tax_collected_at keys from finance rows.
//
// The fields were written by the Stripe webhook as a running cash-tax ledger that no
// surface ever read; the writes were deleted from the webhook on 2026-08-11. This
// scrubs the one row that still carries stale values (TF-I-2026-0003 / Saed LLC).
//
// WHY A WHOLE-BLOB WRITE: update_finances_fields merges with jsonb `||`, which can
// only add/replace keys — it cannot remove them. So this script does a read-modify-
// write of the full data blob, changing NOTHING except deleting the two keys, then
// re-reads the row and fails loudly if activity_log lost entries (the race the RPC
// normally protects against; the window here is milliseconds on an idle table).
//
// SAFETY
//   - Dry-run by default. Writes ONLY with APPLY=1.
//   - Targets only rows in TARGET_INVOICES that actually have one of the keys.
//   - Post-write verification: keys gone, activity_log entry count unchanged,
//     public_token unchanged, all other keys identical.
//   - Idempotent: a re-run finds no stale keys and reports nothing to do.
//
// Usage:
//   node scripts/scrub-tax-collected-fields.js          # dry run (no writes)
//   APPLY=1 node scripts/scrub-tax-collected-fields.js  # apply

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const TARGET_INVOICES = ["TF-I-2026-0002", "TF-I-2026-0003"];
const STALE_KEYS = ["tax_collected_amount", "tax_collected_at"];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function main() {
  const APPLY = process.env.APPLY === "1";
  const env = loadEnv();
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/, ""),
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: finRows, error } = await db.from("finances").select("id, data");
  if (error) throw error;

  let planned = 0;
  for (const row of finRows ?? []) {
    const fin = row.data ?? {};
    if (!TARGET_INVOICES.includes(fin.invoice_number)) continue;
    const label = `${fin.invoice_number} (${fin.client_name ?? fin.client ?? "?"})`;

    const staleHere = STALE_KEYS.filter((k) => k in fin);
    if (staleHere.length === 0) {
      console.log(`OK    ${label}: no stale keys`);
      continue;
    }

    planned++;
    console.log(`PLAN  ${label}: delete ${staleHere.map((k) => `${k}=${JSON.stringify(fin[k])}`).join(", ")}`);

    if (APPLY) {
      const next = { ...fin };
      for (const k of staleHere) delete next[k];
      const beforeLog = (fin.activity_log ?? []).length;

      const { error: upErr } = await db.from("finances").update({ data: next }).eq("id", row.id);
      if (upErr) {
        console.error(`FAIL  ${label}: ${upErr.message}`);
        process.exitCode = 1;
        continue;
      }

      // Verify: keys gone, nothing else changed.
      const { data: checkRows, error: chkErr } = await db.from("finances").select("data").eq("id", row.id).limit(1);
      if (chkErr) throw chkErr;
      const after = checkRows?.[0]?.data ?? {};
      const keysGone = STALE_KEYS.every((k) => !(k in after));
      const logIntact = (after.activity_log ?? []).length === beforeLog;
      const restIntact = Object.keys(next).every((k) => JSON.stringify(after[k]) === JSON.stringify(next[k]));
      if (keysGone && logIntact && restIntact) {
        console.log(`WROTE ${label}: keys removed; activity_log ${beforeLog} entr${beforeLog === 1 ? "y" : "ies"} intact; all other fields identical`);
      } else {
        console.error(`WARN  ${label}: post-write check failed (keysGone=${keysGone} logIntact=${logIntact} restIntact=${restIntact}) — inspect the row`);
        process.exitCode = 1;
      }
    }
  }

  console.log(APPLY
    ? `\nDone — ${planned} row(s) written.`
    : `\nDry run — ${planned} row(s) would be written. Re-run with APPLY=1 to apply.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
