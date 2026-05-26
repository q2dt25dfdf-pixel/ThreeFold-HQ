-- Push subscriptions for web push notifications (iOS Home Screen + other browsers)
create table if not exists push_subscriptions (
  id           text primary key,
  user_id      text,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Prevent duplicate subscriptions for the same browser/device
create unique index if not exists push_subscriptions_endpoint_idx
  on push_subscriptions (endpoint);

-- RLS: users can only manage their own subscriptions
-- (API routes use the service-role admin client which bypasses RLS)
alter table push_subscriptions enable row level security;

create policy "Users manage own push subscriptions"
  on push_subscriptions
  for all
  using (auth.uid()::text = user_id);
