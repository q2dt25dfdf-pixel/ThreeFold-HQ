-- ============================================================================
-- RUN THIS ONCE IN THE SUPABASE SQL EDITOR (Dashboard -> SQL Editor -> New query
-- -> paste -> Run). The invoice activity timeline will not record new entries
-- until this function exists, because the app appends activity via this RPC.
-- ============================================================================
--
-- Atomic, append-only prepend of ONE entry to a finances row's
-- data -> 'activity_log' array, in a SINGLE UPDATE statement. Because it reads
-- and writes the array in one statement, two concurrent callers (e.g. a founder
-- marking paid in HQ and the Stripe webhook recording a payment) can never drop
-- each other's entry -- unlike a read-then-write from the app, which replaces the
-- whole `data` blob and can clobber a concurrent writer.
--
-- p_entry is a single-element JSONB ARRAY, e.g. [{"id":"...","type":"payment",...}].
-- `p_entry || existing` prepends it -> NEWEST-FIRST, matching appendInvoiceActivity.
-- coalesce handles the case where activity_log is absent/null (treated as []).
-- jsonb_set (create_missing = true by default) creates activity_log if absent.

create or replace function append_invoice_activity(p_id text, p_entry jsonb)
returns void
language sql
as $$
  update finances
  set data = jsonb_set(
    data,
    '{activity_log}',
    p_entry || coalesce(data -> 'activity_log', '[]'::jsonb)
  )
  where id = p_id;
$$;

-- Optional sanity check after running (should append one entry to that row):
--   select append_invoice_activity(
--     'invoice-...your-test-id...',
--     '[{"id":"act-test","type":"note","title":"RPC test","at":"2026-07-19T00:00:00.000Z","author":"system"}]'::jsonb
--   );
--   select data -> 'activity_log' from finances where id = 'invoice-...your-test-id...';
