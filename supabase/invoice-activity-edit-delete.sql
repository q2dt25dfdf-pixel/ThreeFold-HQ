-- ============================================================================
-- RUN THIS ONCE IN THE SUPABASE SQL EDITOR (Dashboard -> SQL Editor -> New query
-- -> paste -> Run). Companion to append_invoice_activity + update_finances_fields.
-- Together they keep data->'activity_log' written ONLY by single-statement atomic
-- operations, so no whole-blob write can ever clobber the timeline.
-- ============================================================================
--
-- Each function mutates ONE entry (matched by its id) in ONE update statement,
-- preserving array order and leaving every other entry untouched. Both no-op
-- safely when p_entry_id is not found (delete: nothing removed; edit: nothing
-- changed). Intended for manual NOTE entries only -- the app only exposes edit/
-- delete on type = 'note'; auto-logged events are never edited/deleted.

-- DELETE one entry by its id (drops it from the array; keeps the rest in order).
create or replace function delete_invoice_activity(p_id text, p_entry_id text)
returns void
language sql
as $$
  update finances
  set data = jsonb_set(
    data,
    '{activity_log}',
    coalesce(
      (select jsonb_agg(e)
         from jsonb_array_elements(data -> 'activity_log') e
        where e ->> 'id' <> p_entry_id),
      '[]'::jsonb)
  )
  where id = p_id;
$$;

-- EDIT one entry's detail (note body) by its id. author/date/type/title untouched.
create or replace function edit_invoice_activity(p_id text, p_entry_id text, p_detail text)
returns void
language sql
as $$
  update finances
  set data = jsonb_set(
    data,
    '{activity_log}',
    coalesce(
      (select jsonb_agg(
                case when e ->> 'id' = p_entry_id
                     then jsonb_set(e, '{detail}', to_jsonb(p_detail))
                     else e end)
         from jsonb_array_elements(data -> 'activity_log') e),
      '[]'::jsonb)
  )
  where id = p_id;
$$;

-- Sanity check after running:
--   select delete_invoice_activity('invoice-TESTID', 'act-...-note');
--   select edit_invoice_activity('invoice-TESTID', 'act-...-note', 'updated note text');
--   select data -> 'activity_log' from finances where id = 'invoice-TESTID';
