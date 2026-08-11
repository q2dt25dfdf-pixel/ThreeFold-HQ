-- Run once in the Supabase SQL Editor. Stock-on-hand list (Part 1 of Inventory).
-- Same client-accessible JSONB pattern as expenses/orders (no RLS enabled), read
-- and written by the session-gated Inventory page via the anon client.

create table if not exists inventory (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);

-- The Inventory page reads/writes this table with the browser client, which runs as
-- the logged-in `authenticated` role; server routes use the service role (bypasses
-- RLS). RLS ON + an authenticated-only policy keeps the page working while shutting
-- out the public anon key. Do NOT DISABLE RLS — that reopens the table to anyone
-- holding the bundled anon key.
alter table inventory enable row level security;
drop policy if exists inventory_rw on inventory;
create policy inventory_rw on inventory
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Expected JSONB fields per record:
-- {
--   id:                  text    — same as row id ("inv-<timestamp>")
--   category:            text    — Blanks | Transfers | Packaging | Supplies | Other
--   name:                text    — display name; GENERATED for Blanks from
--                                  brand+style+color+size, hand-typed otherwise
--   brand:               text    — Blanks only (required)
--   style:               text    — Blanks only (required, e.g. "C1717")
--   color:               text    — Blanks only (required)
--   size:                text    — Blanks only (required, e.g. "L")
--   qty_on_hand:         number  — integer >= 0 (never negative — see the page)
--   low_stock_threshold: number  — integer >= 0; low when qty_on_hand <= threshold
--   vendor:              text    — optional free-text supplier
--   notes:               text    — optional
--   adjustments:         array   — [{ delta:int, reason?, reference?, by?, at:ISO }]
--   created_at:          text
--   updated_at:          text
-- }
--
-- Uniqueness for Blanks (brand+style+color+size) is enforced in the app (the
-- Inventory page offers to adjust the existing row instead of adding a duplicate).

-- Optional: add to realtime so the list updates live (matches enable-realtime.sql).
-- alter publication supabase_realtime add table inventory;
