-- Push subscriptions table for Web Push notifications.
-- Safe to re-run (idempotent).
-- id = the push endpoint URL (unique per device/browser).
-- data = full PushSubscription JSON (keys, auth, endpoint).

create table if not exists public.push_subscriptions (
  id   text  primary key,
  data jsonb not null
);

-- Server-only: read/written exclusively by API routes on the service role (which
-- bypasses RLS). RLS ON with NO policy = deny-all to the anon/authenticated browser
-- key — the tightest correct posture for a server-only table. Do NOT DISABLE RLS;
-- that reopens the table to the public anon key. (If a future feature ever reads this
-- from the browser, add an authenticated policy then — it'll be empty until you do.)
alter table public.push_subscriptions enable row level security;
