-- Run once in Supabase SQL Editor to set up the notifications table.
-- Safe to re-run (all statements are idempotent).

-- 1. Create table
create table if not exists notifications (
  id   text  primary key,
  data jsonb not null default '{}'::jsonb
);

-- 2. Disable RLS — notifications are HQ-internal only.
--    Service role key (API routes) already bypasses RLS.
--    Anon key (browser client) needs unrestricted read access to show the bell/panel.
alter table notifications disable row level security;

-- 3. Enable realtime so open HQ tabs receive inserts without polling.
--    Wrapped in a DO block so it is safe to re-run even if the table is already
--    in the publication (plain ALTER PUBLICATION errors on duplicates).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
