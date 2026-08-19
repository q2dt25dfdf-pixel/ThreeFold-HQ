// Backfill delivery_address / delivery_zip onto custom orders created before
// quote→order conversion started copying them (fix/quote-address-carry).
//
// Sources, in order (same as src/lib/orderDelivery.ts):
//   address: quote.delivery_address_text → lead.companyProfile.address
//   zip:     quote.tax_zip_used          → 5-digit ZIP parsed from the address text
//
// SAFETY
//   - Dry-run by default. Writes ONLY with --write.
//   - Empty-only: a field is set only when the order does not already have a
//     value for it; existing values are never overwritten. Orders with any
//     delivery_* field already populated are left entirely alone.
//   - An order whose sources resolve nothing is skipped, never guessed.
//   - Idempotent: a re-run finds the fields populated and reports nothing to do.
//
// Usage:
//   node scripts/backfill-order-delivery-address.js          # dry run (no writes)
//   node scripts/backfill-order-delivery-address.js --write  # apply

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ADDRESS_FIELDS = ["delivery_address", "delivery_city", "delivery_state", "delivery_zip", "delivery_country"];

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// Mirrors zipFromText in src/lib/tax-rates.ts
function zipFromText(text) {
  const match = String(text ?? "").match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

async function main() {
  const WRITE = process.argv.includes("--write");
  const env = loadEnv();
  const db = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/rest\/v1\/?$/, ""),
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: orderRows, error } = await db.from("orders").select("id, data");
  if (error) throw error;

  let planned = 0;
  for (const row of orderRows ?? []) {
    const order = row.data ?? {};
    const label = `${order.order_number ?? row.id} (${order.client_name ?? order.client ?? "?"})`;

    const hasAny = ADDRESS_FIELDS.some((f) => String(order[f] ?? "").trim());
    if (hasAny) {
      console.log(`OK    ${label}: delivery address already present — untouched`);
      continue;
    }

    let quote = null;
    if (order.quote_id) {
      const { data: qRows, error: qErr } = await db
        .from("quotes").select("id, data").eq("id", order.quote_id).limit(1);
      if (qErr) throw qErr;
      quote = qRows?.[0]?.data ?? null;
    }

    let lead = null;
    if (order.lead_id) {
      const { data: lRows, error: lErr } = await db
        .from("crm_leads").select("id, data").eq("id", order.lead_id).limit(1);
      if (lErr) throw lErr;
      lead = lRows?.[0]?.data ?? null;
    }

    const address =
      String(quote?.delivery_address_text ?? "").trim() ||
      String(lead?.companyProfile?.address ?? "").trim();
    const zip = String(quote?.tax_zip_used ?? "").trim() || zipFromText(address) || "";

    const fields = {};
    if (address) fields.delivery_address = address;
    if (zip) fields.delivery_zip = zip;

    if (Object.keys(fields).length === 0) {
      console.log(`SKIP  ${label}: no address on quote ${quote?.quote_number ?? order.quote_id ?? "(none)"} or lead — nothing to backfill`);
      continue;
    }

    planned++;
    console.log(`PLAN  ${label} ← quote ${quote?.quote_number ?? "(none)"}, lead ${order.lead_id ?? "(none)"}`);
    for (const [k, v] of Object.entries(fields)) {
      console.log(`        ${k}: ${JSON.stringify(order[k] ?? null)} → ${JSON.stringify(v)}`);
    }

    if (WRITE) {
      // Re-read immediately before writing to shrink the read-merge-write window
      // (orders have no field-merge RPC; this is the same pattern the app uses).
      const { data: freshRows, error: freshErr } = await db
        .from("orders").select("id, data").eq("id", row.id).limit(1);
      if (freshErr) throw freshErr;
      const fresh = freshRows?.[0]?.data ?? order;
      if (ADDRESS_FIELDS.some((f) => String(fresh[f] ?? "").trim())) {
        console.log(`SKIP  ${label}: delivery address appeared since the scan — untouched`);
        planned--;
        continue;
      }
      const { error: upErr } = await db
        .from("orders").update({ data: { ...fresh, ...fields } }).eq("id", row.id);
      if (upErr) {
        console.error(`FAIL  ${label}: ${upErr.message}`);
        process.exitCode = 1;
      } else {
        console.log(`WROTE ${label}`);
      }
    }
  }

  console.log(WRITE
    ? `\nDone — ${planned} order(s) written.`
    : `\nDry run — ${planned} order(s) would be written. Re-run with --write to apply.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
