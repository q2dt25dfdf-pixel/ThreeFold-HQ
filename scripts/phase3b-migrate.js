#!/usr/bin/env node
'use strict';
/**
 * ThreeFold HQ — Phase 3b Data Migration
 * ─────────────────────────────────────────────────────────────────────────────
 * Normalises existing Supabase data. Rules:
 *   • NEVER deletes old fields (preserves fallback reads in the app).
 *   • NEVER overwrites a field that already has a conflicting value — skips it
 *     and reports it for manual review.
 *   • Each database write touches exactly one field per record.
 *   • Dry-run by default. Write mode requires the explicit --write flag.
 *
 * Passes:
 *   1. finances   — copy amount → total_amount  (where total_amount absent)
 *   2. finances   — legacy status values → canonical InvoiceStatus
 *   3. crm_leads  — stage "Approved" → "Deposit Paid"
 *   4. crm_leads  — followUpDate → follow_up_date  (snake_case copy, no delete)
 *   5. tasks      — done-variant statuses → canonical "completed"
 *
 * ─── Setup ────────────────────────────────────────────────────────────────────
 * 1. Find your service role key:
 *      Supabase dashboard → Settings → API → service_role (secret key)
 *    ⚠ This key bypasses RLS. Never commit it. Never share it.
 *
 * 2. Add it to .env.local (already in .gitignore via ".env*"):
 *      SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *    — OR — pass it inline (prefix space prevents zsh history):
 *       SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/phase3b-migrate.js
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *   Dry run:    node scripts/phase3b-migrate.js
 *   Write mode: node scripts/phase3b-migrate.js --write
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ─── Load .env.local if present (no dotenv dep needed) ─────────────────────

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (!process.env[key]) {
      process.env[key] = raw.replace(/^(['"])(.*)\1$/, '$2'); // strip optional quotes
    }
  }
}

// ─── Config ─────────────────────────────────────────────────────────────────

const WRITE_MODE   = process.argv.includes('--write');
const SUPABASE_URL = 'https://frfpmsjfjsiffkuhgvri.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── Canonical values — must stay in sync with src/lib/constants.ts ─────────

const CANONICAL_INVOICE_STATUSES = new Set([
  'Draft', 'Sent', 'Deposit Due', 'Deposit Paid', 'In Progress',
  'Final Payment Due', 'Paid in Full', 'Overdue', 'Cancelled',
]);

// Known legacy status → canonical mapping.
// "Due" is intentionally absent: ambiguous between "Deposit Due" and
// "Final Payment Due" — those records will be skipped and flagged.
const INVOICE_STATUS_LEGACY_MAP = {
  'paid': 'Paid in Full',
};

const TASK_DONE_CANONICAL = 'completed';

// Every done-variant that should be normalised to TASK_DONE_CANONICAL.
// The canonical value itself is excluded (it already matches).
const TASK_DONE_VARIANTS = new Set([
  'done',      'Done',      'DONE',
  'complete',  'Complete',  'COMPLETE',
               'Completed', 'COMPLETED',  // 'completed' is canonical — excluded
]);

// ─── Field helpers ───────────────────────────────────────────────────────────

function strField(obj, key) {
  const v = obj[key];
  return (typeof v === 'string' || typeof v === 'number') ? String(v).trim() : '';
}

function numField(obj, key) {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// ─── Change / skip tracking ──────────────────────────────────────────────────
//
// A "change" is a single-field update that is safe to apply.
// A "skip"   is a record that needs manual review (ambiguous data).

const changes = []; // { table, id, field, from, to, reason }
const skips   = []; // { table, id, reason }

function recordChange(table, id, field, from, to, reason = '') {
  changes.push({ table, id, field, from, to, reason });
  const tag = reason ? ` [${reason}]` : '';
  console.log(`  CHANGE  ${table}/${id}`);
  console.log(`          ${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}${tag}`);
}

function recordSkip(table, id, reason) {
  skips.push({ table, id, reason });
  console.log(`  SKIP    ${table}/${id}`);
  console.log(`          ${reason}`);
}

// ─── Write helper ────────────────────────────────────────────────────────────
//
// Re-fetches the record immediately before writing to prevent stale-data
// overwrites when multiple passes touch the same record.

async function applyChange(supabase, { table, id, field, to }) {
  const { data: current, error: fetchErr } = await supabase
    .from(table).select('data').eq('id', id).single();
  if (fetchErr) throw new Error(`fetch ${table}/${id}: ${fetchErr.message}`);

  const newData = { ...(current?.data ?? {}), [field]: to };

  const { error: updateErr } = await supabase
    .from(table).update({ data: newData }).eq('id', id);
  if (updateErr) throw new Error(`update ${table}/${id}: ${updateErr.message}`);
}

// ─── Audit passes ────────────────────────────────────────────────────────────

async function passFinancesAmount(supabase) {
  const HR = '─'.repeat(56);
  console.log(`\n\n[Pass 1] finances — amount → total_amount\n${HR}`);

  const { data: rows, error } = await supabase
    .from('finances').select('id, data').order('id', { ascending: true });
  if (error) throw new Error(`finances read failed: ${error.message}`);
  console.log(`  ${rows.length} records loaded\n`);

  for (const row of rows) {
    const d = row.data ?? {};
    const amount = numField(d, 'amount');
    if (amount === undefined || amount === null) continue; // no amount — nothing to copy

    const existingTotal = numField(d, 'total_amount');

    if (d.total_amount !== undefined && d.total_amount !== null && existingTotal !== null) {
      // total_amount already present
      if (Math.abs((existingTotal ?? 0) - (amount ?? 0)) < 0.01) {
        continue; // already in sync — silent skip
      }
      recordSkip('finances', row.id,
        `amount=${amount} and total_amount=${existingTotal} both present but differ`);
    } else {
      recordChange('finances', row.id, 'total_amount', d.total_amount ?? '(absent)', amount,
        'copy from amount');
    }
  }
}

async function passFinancesStatus(supabase) {
  const HR = '─'.repeat(56);
  console.log(`\n\n[Pass 2] finances — legacy status → canonical\n${HR}`);

  const { data: rows, error } = await supabase
    .from('finances').select('id, data').order('id', { ascending: true });
  if (error) throw new Error(`finances read failed: ${error.message}`);
  console.log(`  ${rows.length} records loaded\n`);

  for (const row of rows) {
    const d = row.data ?? {};
    const status = strField(d, 'status');
    if (!status) continue;
    if (CANONICAL_INVOICE_STATUSES.has(status)) continue; // already canonical

    const lc = status.toLowerCase();

    if (lc === 'due') {
      recordSkip('finances', row.id,
        `status "due" is ambiguous — could be "Deposit Due" or "Final Payment Due"`);
    } else if (INVOICE_STATUS_LEGACY_MAP[lc]) {
      recordChange('finances', row.id, 'status', status, INVOICE_STATUS_LEGACY_MAP[lc],
        'legacy → canonical');
    } else {
      recordSkip('finances', row.id,
        `status "${status}" is unrecognised — manual review needed`);
    }
  }
}

async function passCrmStage(supabase) {
  const HR = '─'.repeat(56);
  console.log(`\n\n[Pass 3] crm_leads — stage "Approved" → "Deposit Paid"\n${HR}`);

  const { data: rows, error } = await supabase
    .from('crm_leads').select('id, data').order('id', { ascending: true });
  if (error) throw new Error(`crm_leads read failed: ${error.message}`);
  console.log(`  ${rows.length} records loaded\n`);

  for (const row of rows) {
    const d = row.data ?? {};
    const stage = strField(d, 'stage');
    if (stage === 'Approved') {
      recordChange('crm_leads', row.id, 'stage', 'Approved', 'Deposit Paid');
    }
  }
}

async function passCrmFollowUp(supabase) {
  const HR = '─'.repeat(56);
  console.log(`\n\n[Pass 4] crm_leads — followUpDate → follow_up_date\n${HR}`);

  const { data: rows, error } = await supabase
    .from('crm_leads').select('id, data').order('id', { ascending: true });
  if (error) throw new Error(`crm_leads read failed: ${error.message}`);
  console.log(`  ${rows.length} records loaded\n`);

  for (const row of rows) {
    const d = row.data ?? {};
    const camel = strField(d, 'followUpDate');
    if (!camel) continue; // no camelCase date — nothing to migrate

    const snake = strField(d, 'follow_up_date');

    if (snake) {
      if (snake !== camel) {
        recordSkip('crm_leads', row.id,
          `followUpDate="${camel}" and follow_up_date="${snake}" both present but differ`);
      }
      // else: already in sync — silent skip
    } else {
      recordChange('crm_leads', row.id, 'follow_up_date', '(absent)', camel,
        'copy from followUpDate');
    }
  }
}

async function passTasksStatus(supabase) {
  const HR = '─'.repeat(56);
  console.log(`\n\n[Pass 5] tasks — done-variants → "${TASK_DONE_CANONICAL}"\n${HR}`);

  const { data: rows, error } = await supabase
    .from('tasks').select('id, data').order('id', { ascending: true });
  if (error) throw new Error(`tasks read failed: ${error.message}`);
  console.log(`  ${rows.length} records loaded\n`);

  for (const row of rows) {
    const d = row.data ?? {};
    const status = strField(d, 'status');
    if (!status) continue;
    if (status === TASK_DONE_CANONICAL) continue; // already canonical

    if (TASK_DONE_VARIANTS.has(status)) {
      recordChange('tasks', row.id, 'status', status, TASK_DONE_CANONICAL,
        'normalize done-variant');
    }
    // Active statuses (In Progress, Pending, etc.) — untouched
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

function printSummary() {
  const HR = '═'.repeat(64);
  console.log(`\n\n${HR}`);
  console.log('  SUMMARY');
  console.log(HR);
  console.log(`  Changes identified:  ${changes.length}`);
  console.log(`  Records skipped:     ${skips.length}`);

  if (skips.length > 0) {
    console.log('\n  Skipped records — require manual review:');
    for (const s of skips) {
      console.log(`    • ${s.table}/${s.id}`);
      console.log(`      ${s.reason}`);
    }
  }

  if (!WRITE_MODE) {
    console.log('\n  ✓ DRY RUN — no data was modified.');
    if (changes.length > 0) {
      console.log('\n  When ready to apply, run with --write:');
      console.log('    node scripts/phase3b-migrate.js --write');
      console.log('    (SUPABASE_SERVICE_ROLE_KEY must be set in .env.local or shell)');
    } else {
      console.log('\n  Nothing to migrate — all data is already normalised.');
    }
  }
  console.log(`${HR}\n`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SERVICE_KEY) {
    console.error(`
  ✗  SUPABASE_SERVICE_ROLE_KEY is not set.

  Where to find it:
    Supabase dashboard → Settings → API → "service_role" (secret key section)

  How to set it (two options):

  Option A — add to .env.local (already gitignored by .env* rule):
    SUPABASE_SERVICE_ROLE_KEY=eyJ...

  Option B — set inline (leading space prevents zsh history entry):
     SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/phase3b-migrate.js

  ⚠  This key has full database access. Never commit or share it.
`);
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const HR = '═'.repeat(64);
  console.log(`\n${HR}`);
  console.log('  ThreeFold HQ — Phase 3b Migration');
  console.log(`  ${WRITE_MODE
    ? '⚠️  WRITE MODE — changes will be written to the database'
    : '✓  DRY RUN — no data will be modified'}`);
  console.log(HR);

  // ── Run all audit passes ────────────────────────────────────────────────

  await passFinancesAmount(supabase);
  await passFinancesStatus(supabase);
  await passCrmStage(supabase);
  await passCrmFollowUp(supabase);
  await passTasksStatus(supabase);

  // ── Print summary ───────────────────────────────────────────────────────

  printSummary();

  if (!WRITE_MODE || changes.length === 0) return;

  // ── Apply changes ───────────────────────────────────────────────────────

  console.log(`  Applying ${changes.length} changes...\n`);

  let written = 0;
  let errors  = 0;

  for (const c of changes) {
    process.stdout.write(`  ${c.table}/${c.id}  (${c.field})... `);
    try {
      await applyChange(supabase, c);
      console.log('✓');
      written++;
    } catch (err) {
      console.log(`✗  ${err.message}`);
      errors++;
    }
  }

  console.log(`\n  Written: ${written}   Errors: ${errors}`);

  if (errors > 0) {
    console.error('\n  Some writes failed — review errors above before retrying.');
    process.exit(1);
  }

  console.log('\n  All changes applied successfully.');
  console.log('  Recommended next step:  npx tsc --noEmit && npm run build\n');
}

main().catch((err) => {
  console.error(`\n  Fatal: ${err.message}\n`);
  process.exit(1);
});
