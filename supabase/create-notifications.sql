-- Run once in Supabase SQL Editor to set up the notifications table.
-- Safe to re-run (all statements are idempotent).

-- 1. Create table
create table if not exists notifications (
  id   text  primary key,
  data jsonb not null default '{}'::jsonb
);

-- 2. RLS on, authenticated-only. The bell/panel reads this from the browser, which
--    runs as the logged-in `authenticated` role (NOT anonymous — the anon key carries
--    the user's session after login). Server routes write via the service role
--    (bypasses RLS). Do NOT DISABLE — that reopens the table to the public anon key.
alter table notifications enable row level security;
drop policy if exists notifications_rw on notifications;
create policy notifications_rw on notifications
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

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
