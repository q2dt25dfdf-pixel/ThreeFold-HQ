-- Relay expense feed via Plaid — Phase 1 tables. Run once in the Supabase SQL
-- editor (project twubgrjxnengnyotjjxd). Safe to re-run.
--
-- SECURITY: both tables are RLS-ON with NO policies, so the anon key can neither
-- read nor write them. Only HQ server routes using the service role (which bypasses
-- RLS) ever touch them — same lockdown tier as SUPABASE_SERVICE_ROLE_KEY. The
-- browser reaches this data ONLY through session-gated /api/plaid/* routes, and
-- only ever receives transaction DISPLAY data — never the access_token or cursor.

-- ── plaid_connection ─────────────────────────────────────────────────────────
-- Holds the single Relay item: the server-only access_token, the /transactions/sync
-- cursor, and connection status. One row, id = 'relay'. NEVER exposed to the browser.
create table if not exists plaid_connection (
  id             text primary key,           -- always 'relay' in Phase 1
  data           jsonb not null default '{}'::jsonb
);

alter table plaid_connection enable row level security;

-- Expected JSONB fields:
-- {
--   access_token:  text     — SECRET. Runtime token from /item/public_token/exchange
--   item_id:       text     — Plaid item id
--   cursor:        text     — /transactions/sync cursor (null until first sync)
--   institution:   text     — "Relay"
--   account_mask:  text     — e.g. "1234" (display only)
--   env:           text     — "sandbox" | "production"
--   status:        text     — "connected" | "login_required" | "disconnected"
--   last_synced_at:text     — ISO timestamp of last successful sync
--   last_error:    text     — last Plaid error code, or null
--   created_at:    text
--   updated_at:    text
-- }

-- ── plaid_transactions ───────────────────────────────────────────────────────
-- Staged, reviewable bank transactions. Synced items land here as UNREVIEWED —
-- never straight into `expenses`. RLS-on; served to the Finances tab only through
-- session-gated server routes, matching the shop_orders precedent.
create table if not exists plaid_transactions (
  id             text primary key,           -- Plaid transaction_id
  data           jsonb not null default '{}'::jsonb
);

alter table plaid_transactions enable row level security;

-- Helpful index for the review queue (status lives in JSONB).
create index if not exists plaid_transactions_status_idx
  on plaid_transactions ((data->>'status'));

-- Expected JSONB fields per record:
-- {
--   id:                     text   — same as row id (Plaid transaction_id)
--   pending_transaction_id: text   — links a posted txn back to its pending row, or null
--   account_id:             text
--   account_name:           text   — display, e.g. "Relay Checking"
--   account_mask:           text   — display, e.g. "1234"
--   merchant_name:          text   — Plaid merchant_name (preferred) or name
--   name:                   text   — raw Plaid description
--   amount_cents:           number — Math.round(plaid.amount * 100); >0 outflow, <0 inflow
--   direction:              text   — "out" (expense candidate) | "in" (deposit/income)
--   txn_date:               text   — ISO date (authorized_date || date)
--   pending:                bool
--   iso_currency_code:      text
--   pfc_primary:            text   — personal_finance_category.primary
--   pfc_detail:             text   — personal_finance_category.detailed
--   status:                 text   — "unreviewed" | "filed" | "dismissed" | "removed"
--   auto_dismissed:         bool   — dismissed by a seed rule at sync time
--   dismiss_reason:         text   — human reason when dismissed
--   filed_expense_id:       text   — id of the expense created when filed
--   reviewed_by:            text   — founder name, when filed/dismissed manually
--   reviewed_at:            text   — ISO timestamp
--   created_at:             text   — first-seen ISO timestamp
--   updated_at:             text
-- }
--
-- NOTE: deliberately NOT added to the supabase_realtime publication — this table is
-- never read by the anon client, so realtime would do nothing. The Finances tab
-- refreshes it via the session-gated /api/plaid/status route.
