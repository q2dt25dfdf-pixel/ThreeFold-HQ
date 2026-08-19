#!/usr/bin/env node
'use strict';
/**
 * ThreeFold HQ — Cleanup: delete the Nancy Villagran phantom shop_orders row
 * ─────────────────────────────────────────────────────────────────────────────
 * Background: Nancy's $49.50 deposit on TF-ORD-2026-0004 (deposit request
 * TF-D-2026-0008, bank ACH, initiated Aug 12 / settled Aug 18 2026) reached the
 * website Stripe webhook as a PaymentIntent without its payment_type stamp, so the
 * webhook recorded a blank phantom shop_orders row keyed on the PI id. The payment
 * itself is correctly recorded on the custom-invoice side (finances/deposit_requests);
 * this deletes ONLY the phantom shop_orders row. No other backfill.
 *
 * SAFETY — deletes only if ALL five checks pass, else prints the failures and STOPS:
 *   1. order_items blank AND shipping_address.line1 blank (the phantom fingerprint)
 *   2. amount equals $49.50
 *   3. row id matches deposit_requests TF-D-2026-0008 stripe_payment_intent_id
 *   4. that deposit_request status is "paid" (money already recorded on the custom side)
 *   5. no stock_decremented_at on the row (nothing to reverse in inventory)
 *   • Dry-run by default. Deletion requires the explicit --write flag.
 *   • Never touches deposit_requests, finances, inventory, or any other shop order.
 *
 * SETUP (same as scripts/cleanup-saed-phantom-shop-order.js):
 *   SUPABASE_SERVICE_ROLE_KEY in .env.local (git-ignored) — or inline:
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/cleanup-nancy-phantom-shop-order.js
 *
 * USAGE:
 *   Dry run:  node scripts/cleanup-nancy-phantom-shop-order.js
 *   Delete:   node scripts/cleanup-nancy-phantom-shop-order.js --write
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ─── Load .env.local if present (no dotenv dep) ───────────────────────────────
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (!process.env[key]) process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2');
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────
const WRITE_MODE   = process.argv.includes('--write');
const SUPABASE_URL = 'https://frfpmsjfjsiffkuhgvri.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PHANTOM_ID      = 'pi_3U3h1oCg2TkYQBjU16M0NF6K';
const DEPOSIT_NUMBER  = 'TF-D-2026-0008';
const PHANTOM_AMOUNT  = 49.50;   // dollars
const AMOUNT_EPSILON  = 0.005;

function str(obj, key) {
  const v = obj && obj[key];
  return (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';
}

async function main() {
  if (!SERVICE_KEY) {
    console.error('✖ SUPABASE_SERVICE_ROLE_KEY not set. Add it to .env.local or pass inline.');
    process.exit(1);
  }
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  console.log(`\nThreeFold HQ — Nancy phantom shop_orders cleanup  [${WRITE_MODE ? 'WRITE' : 'DRY-RUN'}]`);
  console.log('─'.repeat(70));

  // 1) Load the target shop_orders row by its exact id ------------------------------------------
  const { data: shopRows, error: sErr } = await db
    .from('shop_orders').select('id, data').eq('id', PHANTOM_ID).limit(1);
  if (sErr) { console.error('✖ shop_orders query failed:', sErr.message); process.exit(1); }
  if (!shopRows || shopRows.length === 0) {
    console.error(`✖ No shop_orders row with id ${PHANTOM_ID}. STOP — nothing to delete (already cleaned up?).`);
    process.exit(1);
  }
  const phantom = shopRows[0];
  const d = phantom.data || {};
  const addr = (d.shipping_address && typeof d.shipping_address === 'object') ? d.shipping_address : {};
  console.log(`shop_orders ${phantom.id}: amount=${str(d, 'amount')}  created_at=${str(d, 'created_at') || '—'}  ` +
    `email=${str(d, 'email') || '—'}  items="${str(d, 'order_items')}"  line1="${str(addr, 'line1')}"`);

  // 2) Load deposit request TF-D-2026-0008 ------------------------------------------------------
  const { data: depRows, error: dErr } = await db
    .from('deposit_requests').select('id, data')
    .eq('data->>deposit_request_number', DEPOSIT_NUMBER).limit(1);
  if (dErr) { console.error('✖ deposit_requests query failed:', dErr.message); process.exit(1); }
  if (!depRows || depRows.length === 0) {
    console.error(`✖ No deposit_request ${DEPOSIT_NUMBER}. STOP — cannot verify the payment, nothing deleted.`);
    process.exit(1);
  }
  const dep = depRows[0].data || {};
  console.log(`deposit_request ${DEPOSIT_NUMBER}: id=${depRows[0].id}  status=${str(dep, 'status') || '—'}  ` +
    `client=${str(dep, 'client_name') || '—'}  pi=${str(dep, 'stripe_payment_intent_id') || '—'}`);

  // 3) The five safety checks — ALL must pass ---------------------------------------------------
  const amt = Number(d.amount);
  const checks = [
    {
      name: 'order_items blank AND shipping_address.line1 blank',
      pass: !str(d, 'order_items') && !str(addr, 'line1'),
    },
    {
      name: `amount equals $${PHANTOM_AMOUNT.toFixed(2)}`,
      pass: Number.isFinite(amt) && Math.abs(amt - PHANTOM_AMOUNT) <= AMOUNT_EPSILON,
    },
    {
      name: `row id matches ${DEPOSIT_NUMBER} stripe_payment_intent_id`,
      pass: str(dep, 'stripe_payment_intent_id') === String(phantom.id),
    },
    {
      name: `deposit_request ${DEPOSIT_NUMBER} status is "paid"`,
      pass: str(dep, 'status') === 'paid',
    },
    {
      name: 'no stock_decremented_at on the row',
      pass: !str(d, 'stock_decremented_at'),
    },
  ];

  console.log('\nSafety checks:');
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✖'} ${c.name}`);

  const failed = checks.filter((c) => !c.pass);
  if (failed.length) {
    console.error(`\n✖ STOP: ${failed.length} of ${checks.length} checks failed. Nothing was deleted — inspect manually.`);
    process.exit(1);
  }
  console.log(`\n✓ All ${checks.length} checks passed. The payment lives on the custom-invoice side; ` +
    'the shop_orders row is a pure phantom.');

  // 4) Delete (only with --write) ---------------------------------------------------------------
  if (!WRITE_MODE) {
    console.log(`\n[DRY-RUN] Would DELETE shop_orders row id=${phantom.id}. Re-run with --write to apply.`);
    return;
  }

  const { error: delErr } = await db.from('shop_orders').delete().eq('id', phantom.id);
  if (delErr) { console.error('✖ delete failed:', delErr.message); process.exit(1); }
  console.log(`\n✓ DELETED phantom shop_orders row id=${phantom.id}. Shop Orders count should now read 4.`);
}

main().catch((e) => { console.error('✖ unexpected error:', e && e.message ? e.message : e); process.exit(1); });
