-- Run once in Supabase SQL Editor to create the notifications table.
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS guards).

create table if not exists notifications (
  id   text  primary key,
  data jsonb not null default '{}'::jsonb
);

-- Enable realtime so all open HQ tabs receive new notifications instantly.
alter publication supabase_realtime add table notifications;
