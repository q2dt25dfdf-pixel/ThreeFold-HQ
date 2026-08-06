-- hq_section_views — SHARED "last viewed" timestamps that drive the sidebar "new" badges
-- (Shop Orders, Orders). Shared across founders per the approved decision: any founder
-- viewing a section clears its badge for everyone. Run once in the Supabase SQL editor
-- (project frfpmsjfjsiffkuhgvri — the live HQ project). Safe to re-run.
--
-- Only HQ server routes (service role) touch this table; keep RLS on so the anon key can't
-- write it. Service role bypasses RLS.
create table if not exists hq_section_views (
  section         text primary key,          -- 'shop-orders' | 'orders'
  last_viewed_at  timestamptz not null default now()
);

alter table hq_section_views enable row level security;

-- Seed the two sections so first-load badge math has a baseline (now = nothing "new" yet).
insert into hq_section_views (section, last_viewed_at)
values ('shop-orders', now()), ('orders', now())
on conflict (section) do nothing;
