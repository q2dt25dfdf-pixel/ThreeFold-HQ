// Backfill sales tax fields onto finance rows that were created without them.
//
// Root cause (fixed in crm/page.tsx): handleApproveLead only copied subtotal /
// sales_tax_rate / sales_tax_amount / grand_total onto the invoice when the quote
// had a discount, so no-discount invoices lost their tax breakdown and the Sales
// Tax tab reported $0 collected. This script copies those fields from each
// invoice's linked deposit request.
//
// SAFETY
//   - Dry-run by default. Writes ONLY with APPLY=1.
//   - Targets ONLY the two known-affected invoices (TARGET_INVOICES below).
//   - Copies a field only when the finance row does NOT already have it — never
//     overwrites an existing value.
//   - Writes via the update_finances_fields RPC (same as the Stripe webhook), which
//     merges fields and re-attaches the row's own activity_log — a concurrent
//     activity append can never be lost.
//   - Idempotent: a re-run finds the fields populated and reports nothing to do.
//
// Usage:
//   node scripts/backfill-invoice-sales-tax.js          # dry run (no writes)
//   APPLY=1 node scripts/backfill-invoice-sales-tax.js  # apply

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const TARGET_INVOICES = ["TF-I-2026-0002", "TF-I-2026-0003"];
const TAX_FIELDS = ["subtotal", "sales_tax_rate", "sales_tax_amount", "grand_total"];

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
    const depositRequestId = fin.deposit_request_id;
    if (!depositRequestId) {
      console.log(`SKIP  ${label}: no deposit_request_id on the finance row`);
      continue;
    }

    const { data: depRows, error: depErr } = await db
      .from("deposit_requests")
      .select("id, data")
      .eq("id", depositRequestId)
      .limit(1);
    if (depErr) throw depErr;
    const dep = depRows?.[0]?.data;
    if (!dep) {
      console.log(`SKIP  ${label}: deposit request ${depositRequestId} not found`);
      continue;
    }

    const fields = {};
    for (const key of TAX_FIELDS) {
      if (fin[key] == null && dep[key] != null) fields[key] = Number(dep[key]);
    }

    if (Object.keys(fields).length === 0) {
      console.log(`OK    ${label}: nothing to backfill (all fields already present)`);
      continue;
    }

    planned++;
    console.log(`PLAN  ${label} ← ${dep.deposit_request_number ?? depositRequestId}`);
    for (const [k, v] of Object.entries(fields)) {
      console.log(`        ${k}: ${JSON.stringify(fin[k])} → ${v}`);
    }

    if (APPLY) {
      const { error: rpcErr } = await db.rpc("update_finances_fields", { p_id: row.id, p_fields: fields });
      if (rpcErr) {
        console.error(`FAIL  ${label}: ${rpcErr.message}`);
        process.exitCode = 1;
      } else {
        console.log(`WROTE ${label}`);
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
