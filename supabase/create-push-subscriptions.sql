-- Push subscriptions table for Web Push notifications.
-- Safe to re-run (idempotent).
-- id = the push endpoint URL (unique per device/browser).
-- data = full PushSubscription JSON (keys, auth, endpoint).

create table if not exists public.push_subscriptions (
  id   text  primary key,
  data jsonb not null
);

-- No RLS needed — only the service role key writes here (API routes).
alter table public.push_subscriptions disable row level security;
