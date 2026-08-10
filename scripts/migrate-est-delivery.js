// Migrate legacy estimatedDeliveryDate → estDelivery for orders that have the legacy
// field but no authoritative estDelivery. Sets estDeliverySource:"manual" so the
// deposit-paid suggestion cascade can never overwrite a migrated hand-entered date.
//
// SAFETY
//   - Dry-run by default. Writes ONLY with APPLY=1.
//   - Skips orders that already have estDelivery (never overwrites).
//   - Copies ONLY parseable "YYYY-MM-DD" values; free-text (e.g. "next week") is
//     SKIPPED and reported for you to handle by hand.
//   - Rewrites only data.estDelivery + data.estDeliverySource (+ updated_at); the
//     legacy field is left in place (reads prefer estDelivery; nothing destroyed).
//   - Idempotent: a re-run finds those orders now have estDelivery and skips them.
//
// Usage:
//   node scripts/migrate-est-delivery.js          # dry run (no writes)
//   APPLY=1 node scripts/migrate-est-delivery.js  # apply

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Same extraction as lib/estDelivery.toDateOnly: pull a leading YYYY-MM-DD, else null.
function toDateOnly(v) {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

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

  const { data: rows, error } = await db.from("orders").select("id, data");
  if (error) throw error;

  const toMigrate = [];   // { id, name, legacy, date }
  const skipFreeText = []; // { id, name, legacy }
  let alreadyHasEst = 0, noLegacy = 0;

  for (const r of rows) {
    const d = r.data || {};
    const name = d.orderName || d.order_name || r.id;
    const legacy = typeof d.estimatedDeliveryDate === "string" ? d.estimatedDeliveryDate.trim() : "";
    const hasEst = typeof d.estDelivery === "string" && d.estDelivery.trim() !== "";
    if (hasEst) { alreadyHasEst++; continue; }
    if (!legacy) { noLegacy++; continue; }
    const date = toDateOnly(legacy);
    if (date) toMigrate.push({ id: r.id, name, legacy, date });
    else skipFreeText.push({ id: r.id, name, legacy });
  }

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — ${rows.length} orders scanned`);
  console.log(`  already have estDelivery : ${alreadyHasEst}`);
  console.log(`  no legacy date           : ${noLegacy}`);
  console.log(`  → to migrate (parseable) : ${toMigrate.length}`);
  console.log(`  ⚠ free-text, SKIPPED     : ${skipFreeText.length}`);

  if (toMigrate.length) {
    console.log("\nPlanned migrations (estDelivery ← legacy, source=manual):");
    for (const m of toMigrate) console.log(`  ${m.id}  "${m.legacy}" → ${m.date}   (${String(m.name).slice(0, 30)})`);
  }
  if (skipFreeText.length) {
    console.log("\n⚠ FREE-TEXT legacy dates — NOT migrated, handle by hand:");
    for (const s of skipFreeText) console.log(`  ${s.id}  "${s.legacy}"   (${String(s.name).slice(0, 30)})`);
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with APPLY=1 to write.");
    return;
  }

  const now = new Date().toISOString();
  let written = 0;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.data || {}]));
  for (const m of toMigrate) {
    const updated = { ...byId[m.id], estDelivery: m.date, estDeliverySource: "manual", updated_at: now };
    const { error: upErr } = await db.from("orders").update({ data: updated }).eq("id", m.id);
    if (upErr) { console.error(`FAILED ${m.id}:`, upErr.message); process.exit(1); }
    written++;
  }
  console.log(`\nWrote ${written} orders. Skipped ${skipFreeText.length} free-text (unchanged).`);
}

main().catch((e) => { console.error("ERROR", e.message || e); process.exit(1); });
