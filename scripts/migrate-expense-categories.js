// Migrate existing expenses from the old category set (Materials, Tools,
// Supplies, ...) to the new set (Blanks, Transfers, Packaging, Equipment,
// Software, Marketing, Shipping, Other).
//
// SAFETY
//   - Dry-run by default. Prints every planned change and validates. Writes ONLY
//     when run with APPLY=1.
//   - Refuses to run while any row is unmapped (null) — no partial migration.
//   - Refuses if the table contains an expense id not listed here (so no row is
//     silently left on a retired category).
//   - Rewrites ONLY data.category (+ updated_at); every other field is preserved.
//   - Asserts the grand total of amount_cents is identical before and after.
//   - Idempotent: re-running sets the same categories.
//
// Usage:
//   node scripts/migrate-expense-categories.js          # dry run (no writes)
//   APPLY=1 node scripts/migrate-expense-categories.js  # apply

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Valid new categories — keep in sync with src/lib/expenseCategories.ts.
const VALID = ["Blanks", "Transfers", "Packaging", "Equipment", "Software", "Marketing", "Shipping", "Supplies", "Other"];

// ── 11 CONFIRMED (approved in Step 0) ────────────────────────────────────────
const CONFIRMED = {
  "expense-1786304714976": "Blanks",     // Ninja Transfers $176.73 — "Comfort Color Blanks"
  "expense-1786304848398": "Blanks",     // Panthera        $27.65  — "Threefold Shirt + Totes"
  "expense-1786304772926": "Blanks",     // Ninja Transfers $36.13  — "XL Blanks"
  "expense-1786304799648": "Transfers",  // Ninja Transfers $67.69  — "Personal Designs Print"
  "expense-1786304873854": "Transfers",  // Ink And Toner   $90.31  — "DTGPro Sheet + Spray"
  "expense-1786304893725": "Transfers",  // Ink And Toner   $49.96  — "DTGPro White Sheet"
  "expense-1786308481017": "Packaging",  // Zazzle          $58.07  — "Thank you cards, envelopes + stickers"
  "expense-1786308493115": "Packaging",  // Office Depot     $50.18  — "Boxes"
  "expense-1786304903436": "Marketing",  // GotPrint         $73.71  — "Fliers"
  "expense-1786305637137": "Equipment",  // Vevor           $236.28  — "Heat Press"
  "expense-1786305705637": "Other",      // CA Sec of State  $25.00  — "Statement of Information"
};

// ── 8 formerly-placeholder rows — identified from receipts (Step 2 amendment) ──
const PLACEHOLDERS = {
  "expense-1786308653905": "Packaging",  // Amazon   $52.61 — size stickers, packaging bags, shipping bags
  "expense-1786308535278": "Supplies",   // Amazon   $37.38 — paper cutter
  "expense-1786308629577": "Supplies",   // Target   $35.98 — storage bins, lint roller, rubber bands
  "expense-1786308530258": "Supplies",   // Amazon   $35.47 — heat tape + dispenser, shirt rulers
  "expense-1786308575337": "Supplies",   // Amazon   $32.91 — office lamp
  "expense-1786308539414": "Supplies",   // Amazon   $18.65 — transfer paper (reusable press sheet, not DTF)
  "expense-1786308571105": "Supplies",   // Amazon   $13.71 — folding board
  "expense-1786308635414": "Blanks",     // Michaels  $3.28 — Gildan t-shirt
};

const MAPPING = { ...CONFIRMED, ...PLACEHOLDERS };

function loadEnv() {
  const env = {};
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
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

  const { data: rows, error } = await db.from("expenses").select("id, data");
  if (error) throw error;

  // ── Guard 1: no unmapped placeholders ──
  const unmapped = Object.entries(MAPPING).filter(([, v]) => v == null).map(([k]) => k);
  if (unmapped.length) {
    console.error(`REFUSING: ${unmapped.length} row(s) still unmapped (null). Fill PLACEHOLDERS first:`);
    unmapped.forEach((id) => console.error("   " + id));
    process.exit(1);
  }

  // ── Guard 2: every target category is valid ──
  const bad = Object.entries(MAPPING).filter(([, v]) => !VALID.includes(v));
  if (bad.length) {
    console.error("REFUSING: invalid target categor(ies):", bad);
    process.exit(1);
  }

  // ── Guard 3: mapping ids and table ids match exactly ──
  const tableIds = new Set(rows.map((r) => r.id));
  const mapIds = new Set(Object.keys(MAPPING));
  const missingFromMap = [...tableIds].filter((id) => !mapIds.has(id));
  const missingFromTable = [...mapIds].filter((id) => !tableIds.has(id));
  if (missingFromMap.length) {
    console.error("REFUSING: expenses in the table are NOT covered by this mapping (would be left on old categories):");
    missingFromMap.forEach((id) => console.error("   " + id));
    process.exit(1);
  }
  if (missingFromTable.length) {
    console.error("WARNING: mapping lists ids not present in the table (will be skipped):");
    missingFromTable.forEach((id) => console.error("   " + id));
  }

  // ── Plan + totals ──
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  let totalBefore = 0;
  const plan = [];
  for (const id of Object.keys(MAPPING)) {
    const row = byId[id];
    if (!row) continue;
    const oldCat = row.data.category;
    const newCat = MAPPING[id];
    totalBefore += Number(row.data.amount_cents) || 0;
    plan.push({ id, oldCat, newCat, changed: oldCat !== newCat, amt: (Number(row.data.amount_cents) || 0) / 100 });
  }

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"} — ${plan.length} rows\n`);
  for (const p of plan) {
    console.log(`  ${p.changed ? "→" : "="} ${p.id}  ${String(p.oldCat).padEnd(10)} → ${p.newCat.padEnd(10)} $${p.amt.toFixed(2)}`);
  }
  const newTotals = {};
  for (const p of plan) newTotals[p.newCat] = (newTotals[p.newCat] || 0) + p.amt;
  console.log("\nNew-category totals:");
  for (const [c, t] of Object.entries(newTotals).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(10)} $${t.toFixed(2)}`);
  console.log(`\nGrand total (unchanged by design): $${(totalBefore / 100).toFixed(2)}`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with APPLY=1 to write.");
    return;
  }

  // ── Apply: rewrite ONLY data.category (+ updated_at) ──
  const now = new Date().toISOString();
  let written = 0;
  for (const id of Object.keys(MAPPING)) {
    const row = byId[id];
    if (!row) continue;
    const updated = { ...row.data, category: MAPPING[id], updated_at: now };
    const { error: upErr } = await db.from("expenses").update({ data: updated }).eq("id", id);
    if (upErr) { console.error(`FAILED ${id}:`, upErr.message); process.exit(1); }
    written++;
  }

  // ── Verify: re-read, assert total unchanged + all categories valid ──
  const { data: after } = await db.from("expenses").select("id, data");
  let totalAfter = 0;
  const orphans = [];
  for (const r of after) {
    totalAfter += Number(r.data.amount_cents) || 0;
    if (!VALID.includes(r.data.category)) orphans.push({ id: r.id, category: r.data.category });
  }
  console.log(`\nWrote ${written} rows.`);
  console.log(`Total before: $${(totalBefore / 100).toFixed(2)}  after: $${(totalAfter / 100).toFixed(2)}  ${totalBefore === totalAfter ? "✓ unchanged" : "✗ MISMATCH"}`);
  if (orphans.length) { console.error("✗ rows on invalid categories:", orphans); process.exit(1); }
  console.log("✓ every expense is on a valid new category.");
}

main().catch((e) => { console.error("ERROR", e.message || e); process.exit(1); });
