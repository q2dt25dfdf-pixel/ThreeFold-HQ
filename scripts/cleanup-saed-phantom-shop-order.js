#!/usr/bin/env node
'use strict';
/**
 * ThreeFold HQ — Cleanup: delete the Saed phantom shop_orders row
 * ─────────────────────────────────────────────────────────────────────────────
 * Background: before the payment-source split, the website Stripe webhook recorded
 * EVERY payment_intent.succeeded as a shop_orders row — including the custom-order
 * invoice payment for TF-ORD-2026-0003 (Saed LLC). That produced ONE blank phantom
 * card: Jul 30, $414.38, empty customer/items. This removes it. No other backfill.
 *
 * SAFETY:
 *   • Dry-run by default. Deletion requires the explicit --write flag.
 *   • Refuses to delete unless the finances row for TF-ORD-2026-0003 ALREADY reflects
 *     the payment (final_paid or paid_in_full). If it doesn't → prints and STOPS.
 *   • Refuses to delete unless EXACTLY ONE shop_orders row matches the phantom
 *     signature ($414.38, blank customer_name + blank order_items + no line_items).
 *   • Never touches the finances row or any other shop order.
 *
 * SETUP (same as scripts/phase3b-migrate.js):
 *   SUPABASE_SERVICE_ROLE_KEY in .env.local (git-ignored) — or inline:
 *     SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/cleanup-saed-phantom-shop-order.js
 *
 * USAGE:
 *   Dry run:  node scripts/cleanup-saed-phantom-shop-order.js
 *   Delete:   node scripts/cleanup-saed-phantom-shop-order.js --write
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

const ORDER_NUMBER   = 'TF-ORD-2026-0003';
const PHANTOM_AMOUNT  = 414.38;   // dollars
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

  console.log(`\nThreeFold HQ — phantom shop_orders cleanup  [${WRITE_MODE ? 'WRITE' : 'DRY-RUN'}]`);
  console.log('─'.repeat(70));

  // 1) Locate the custom order TF-ORD-2026-0003 ------------------------------------------------
  const { data: orderRows, error: oErr } = await db
    .from('orders').select('id, data').eq('data->>order_number', ORDER_NUMBER).limit(1);
  if (oErr) { console.error('✖ orders query failed:', oErr.message); process.exit(1); }
  if (!orderRows || orderRows.length === 0) {
    console.error(`✖ No order with order_number ${ORDER_NUMBER}. STOP — nothing verified, nothing deleted.`);
    process.exit(1);
  }
  const order = orderRows[0];
  console.log(`Order ${ORDER_NUMBER}: id=${order.id}  client=${str(order.data, 'client') || str(order.data, 'client_name')}`);

  // 2) Locate its finances row (id = invoice-<orderId>, else data.order_id === orderId) ---------
  let finance = null;
  {
    const byId = await db.from('finances').select('id, data').eq('id', `invoice-${order.id}`).limit(1);
    if (byId.data && byId.data.length) finance = byId.data[0];
    if (!finance) {
      const byOrder = await db.from('finances').select('id, data').eq('data->>order_id', order.id).order('id', { ascending: false }).limit(1);
      if (byOrder.data && byOrder.data.length) finance = byOrder.data[0];
    }
  }
  if (!finance) {
    console.error(`✖ No finances row linked to ${ORDER_NUMBER}. STOP — cannot confirm the payment, nothing deleted.`);
    process.exit(1);
  }
  const f = finance.data || {};
  const reflectsPayment = f.final_paid === true || f.paid_in_full === true;
  console.log(`Finances ${finance.id}: final_paid=${f.final_paid === true} paid_in_full=${f.paid_in_full === true} ` +
    `final_paid_date=${str(f, 'final_paid_date') || '—'} method=${str(f, 'final_payment_method') || '—'} ` +
    `total=${str(f, 'total_amount') || str(f, 'amount') || '—'}`);

  if (!reflectsPayment) {
    console.error('\n✖ STOP: the finances row does NOT reflect the payment (final_paid/paid_in_full both false).');
    console.error('  Record the payment in the Finances modal first, then re-run. Nothing was deleted.');
    process.exit(1);
  }
  console.log('✓ Finances row reflects the payment — safe to remove the phantom shop order.');

  // 3) Find the phantom shop_orders row: $414.38, blank customer + blank items + no line_items ---
  const { data: shopRows, error: sErr } = await db.from('shop_orders').select('id, data');
  if (sErr) { console.error('✖ shop_orders query failed:', sErr.message); process.exit(1); }

  const candidates = (shopRows || []).filter((r) => {
    const d = r.data || {};
    const amt = Number(d.amount);
    const amountMatches = Number.isFinite(amt) && Math.abs(amt - PHANTOM_AMOUNT) <= AMOUNT_EPSILON;
    const blankCustomer = !str(d, 'customer_name') && !str(d, 'email');
    const blankItems = !str(d, 'order_items') && !(Array.isArray(d.line_items) && d.line_items.length > 0);
    return amountMatches && blankCustomer && blankItems;
  });

  console.log(`\nPhantom candidates ($${PHANTOM_AMOUNT}, blank customer + items): ${candidates.length}`);
  for (const c of candidates) {
    const d = c.data || {};
    console.log(`  • id=${c.id}  amount=${str(d, 'amount')}  created_at=${str(d, 'created_at') || '—'}  ` +
      `customer="${str(d, 'customer_name')}"  items="${str(d, 'order_items')}"`);
  }

  if (candidates.length !== 1) {
    console.error(`\n✖ STOP: expected exactly 1 phantom row, found ${candidates.length}. ` +
      'Not deleting anything — inspect manually.');
    process.exit(1);
  }

  const phantom = candidates[0];

  // Extra confidence (not required): the shop_orders id is the Stripe PI id; if the finances row
  // was updated by the new webhook path it will carry the same stripe_payment_intent_id.
  if (str(f, 'stripe_payment_intent_id') && str(f, 'stripe_payment_intent_id') === String(phantom.id)) {
    console.log(`✓ Phantom PI id matches finances.stripe_payment_intent_id (${phantom.id}).`);
  }

  // 4) Delete (only with --write) ---------------------------------------------------------------
  if (!WRITE_MODE) {
    console.log(`\n[DRY-RUN] Would DELETE shop_orders row id=${phantom.id}. Re-run with --write to apply.`);
    return;
  }

  const { error: dErr } = await db.from('shop_orders').delete().eq('id', phantom.id);
  if (dErr) { console.error('✖ delete failed:', dErr.message); process.exit(1); }
  console.log(`\n✓ DELETED phantom shop_orders row id=${phantom.id}. Shop Orders should now be one lower.`);
}

main().catch((e) => { console.error('✖ unexpected error:', e && e.message ? e.message : e); process.exit(1); });
