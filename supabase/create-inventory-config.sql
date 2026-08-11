-- Run once in the Supabase SQL Editor. Inventory Part 2 config: the design→blank
-- mapping used to auto-decrement stock on shop orders. Single JSONB row.
-- Client-written (Inventory page) as the logged-in `authenticated` role; server routes
-- use the service role. RLS ON + authenticated-only policy. Do NOT DISABLE.

create table if not exists inventory_config (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);
alter table inventory_config enable row level security;
drop policy if exists inventory_config_rw on inventory_config;
create policy inventory_config_rw on inventory_config
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- The one config row lives at id='blank-map'. Seeded with the current default
-- (every product prints on Comfort Colors C1717 Black today). Per-design
-- exceptions go in overrides[]; size is NOT stored here — it comes from the order.
--
-- data shape:
-- {
--   default_blank: { brand, style, color } | null,
--   overrides:     [ { design, brand, style, color } ]   -- design = order display name
-- }
insert into inventory_config (id, data)
values ('blank-map', '{"default_blank":{"brand":"Comfort Colors","style":"C1717","color":"Black"},"overrides":[]}'::jsonb)
on conflict (id) do nothing;

-- Optional realtime (matches enable-realtime.sql):
-- alter publication supabase_realtime add table inventory_config;
--
-- NOTE (schemaless, no migration needed): the auto-decrement also writes to
-- existing JSONB —
--   shop_orders.data.stock_decremented_at  (ISO stamp; idempotency guard)
--   shop_orders.data.stock_decrement        ({ status, lines:[…] } outcome, enough
--                                             to reverse a future delete exactly)
--   inventory.data.adjustments[]            (+ order_id, source:"shop_order", by:"system")
