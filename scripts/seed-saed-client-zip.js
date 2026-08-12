// Seed the Saed LLC client record with the ZIP its quote's tax was computed from.
//
// Quote TF-Q-2026-0006 resolved sales tax via Stripe for ZIP 94066, but the typed
// address was never persisted (the modal's blur-save didn't fire), so the client
// record has no zip and repeat orders would re-ask. This copies the quote's
// tax_zip_used onto the client so /api/quote/generate's client-zip lookup reuses it.
// POPS is deliberately NOT seeded — no address exists anywhere for POPS; the founder
// is asking the client directly.
//
// SAFETY
//   - Dry-run by default. Writes ONLY with APPLY=1.
//   - Empty-only: skips if the client already has a zip (never overwrites).
//   - The ZIP is read from the quote row, not hard-coded blindly — if the quote's
//     tax_zip_used ever changes, the script follows it.
//   - Idempotent: a re-run finds the zip set and reports nothing to do.
//
// Usage:
//   node scripts/seed-saed-client-zip.js          # dry run (no writes)
//   APPLY=1 node scripts/seed-saed-client-zip.js  # apply

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const CLIENT_NAME = "Saed LLC";
const SOURCE_QUOTE = "TF-Q-2026-0006";

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

  const { data: quoteRows, error: qErr } = await db
    .from("quotes")
    .select("id, data")
    .eq("data->>quote_number", SOURCE_QUOTE)
    .limit(1);
  if (qErr) throw qErr;
  const zip = quoteRows?.[0]?.data?.tax_zip_used;
  if (!zip) {
    console.error(`ABORT: quote ${SOURCE_QUOTE} has no tax_zip_used`);
    process.exit(1);
  }

  const { data: clientRows, error: cErr } = await db
    .from("clients")
    .select("id, data")
    .eq("data->>name", CLIENT_NAME)
    .limit(1);
  if (cErr) throw cErr;
  const row = clientRows?.[0];
  if (!row) {
    console.error(`ABORT: no client record named "${CLIENT_NAME}"`);
    process.exit(1);
  }
  const cData = row.data ?? {};

  if (String(cData.zip ?? "").trim()) {
    console.log(`OK    ${CLIENT_NAME}: zip already set (${cData.zip}) — nothing to do`);
    return;
  }

  console.log(`PLAN  ${CLIENT_NAME} (${row.id}): zip ${JSON.stringify(cData.zip)} → "${zip}" (from ${SOURCE_QUOTE})`);
  if (APPLY) {
    const { error: upErr } = await db.from("clients").update({ data: { ...cData, zip } }).eq("id", row.id);
    if (upErr) {
      console.error(`FAIL  ${upErr.message}`);
      process.exit(1);
    }
    const { data: check } = await db.from("clients").select("data").eq("id", row.id).limit(1);
    console.log(`WROTE ${CLIENT_NAME}: zip = ${JSON.stringify(check?.[0]?.data?.zip)}`);
  } else {
    console.log(`\nDry run — re-run with APPLY=1 to apply.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
