-- ============================================================================
-- RUN THIS ONCE IN THE SUPABASE SQL EDITOR (Dashboard -> SQL Editor -> New query
-- -> paste -> Run). Companion to append_invoice_activity
-- (supabase/invoice-activity-append.sql). Together they make the atomic-append RPC
-- the SOLE writer of data->'activity_log'.
-- ============================================================================
--
-- Applies FIELD changes to a finances row WITHOUT ever touching activity_log: it
-- drops activity_log, merges the caller's fields, then re-attaches the row's OWN
-- current activity_log. Because the read+write happens in one UPDATE statement, a
-- field-write (founder save, or the Stripe webhook's money/status write) can never
-- overwrite an entry that append_invoice_activity added concurrently.
--
-- p_fields is the JSONB of field changes (a partial object for the webhook, or the
-- whole invoice minus activity_log for HQ). Any activity_log inside p_fields is
-- ignored -- the final clause always restores the DB's own activity_log.

create or replace function update_finances_fields(p_id text, p_fields jsonb)
returns void
language sql
as $$
  update finances
  set data =
    (data - 'activity_log')
    || p_fields
    || case
         when data ? 'activity_log'
           then jsonb_build_object('activity_log', data -> 'activity_log')
         else '{}'::jsonb
       end
  where id = p_id;
$$;

-- Sanity check after running (field change must NOT alter activity_log):
--   select append_invoice_activity('invoice-TESTID',
--     '[{"id":"a1","type":"note","title":"before","at":"2026-07-19T00:00:00.000Z"}]'::jsonb);
--   select update_finances_fields('invoice-TESTID', '{"status":"Paid"}'::jsonb);
--   select data->'status', data->'activity_log' from finances where id = 'invoice-TESTID';
--   -- expect: status = "Paid" AND activity_log still has the "before" entry.
