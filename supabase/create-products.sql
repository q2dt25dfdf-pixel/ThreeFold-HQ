-- Run once in the Supabase SQL Editor. Catalog of ThreeFold Originals products,
-- seeded by the WEBSITE (source of truth = threefold-website/scripts/products.csv).
-- Same client-accessible JSONB pattern as inventory/orders (no RLS), read by the
-- session-gated Blank Mapping picker so the mapping table can never drift from the
-- live shop catalog.

create table if not exists products (
  id   text primary key,          -- the product slug (e.g. "san-francisco-tee")
  data jsonb not null default '{}'::jsonb
);

-- Read by the Inventory Blank-Mapping modal with the browser client (logged-in
-- `authenticated` role); written by the website via the HQ internal API (service role,
-- bypasses RLS). RLS ON + authenticated-only policy keeps the picker working while
-- shutting out the public anon key. Do NOT DISABLE RLS.
alter table products enable row level security;
drop policy if exists products_rw on products;
create policy products_rw on products
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Expected JSONB fields per record (written by scripts/products-sync.mjs → the HQ
-- internal endpoint /api/internal/products-sync, which owns the write):
-- {
--   id:         text  — same as row id (the slug)
--   slug:       text  — product slug
--   name:       text  — display name, MUST match the shop-order line name
--   collection: text  — collection label (e.g. "Bay Area")
-- }
--
-- The sync is authoritative: it upserts every row from products.csv and DELETES
-- rows whose slug is no longer in the CSV, so a removed product disappears here too.

-- Optional: add to realtime so the picker updates live (matches enable-realtime.sql).
-- alter publication supabase_realtime add table products;
