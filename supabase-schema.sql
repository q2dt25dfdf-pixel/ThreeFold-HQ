create table if not exists public.clients (
  id text primary key,
  data jsonb not null
);

create table if not exists public.vendors (
  id text primary key,
  data jsonb not null
);

create table if not exists public.production (
  id text primary key,
  data jsonb not null
);

create table if not exists public.finances (
  id text primary key,
  data jsonb not null
);

create table if not exists public.tasks (
  id text primary key,
  data jsonb not null
);

create table if not exists public.crm_leads (
  id text primary key,
  data jsonb not null
);

create table if not exists public.calendar_events (
  id text primary key,
  data jsonb not null
);

create table if not exists public.client_orders (
  id text primary key,
  data jsonb not null
);

create table if not exists public.client_activity (
  id text primary key,
  data jsonb not null
);

create table if not exists public.vendor_jobs (
  id text primary key,
  data jsonb not null
);

create table if not exists public.production_designs (
  id text primary key,
  data jsonb not null
);

create table if not exists public.production_vendor_info (
  id text primary key,
  data jsonb not null
);

create table if not exists public.notes (
  id text primary key,
  data jsonb not null
);

-- Smart folders for /notes. Each row is one user-defined folder that
-- auto-collects notes tagged with any of the folder's tags. Pure config
-- table; no per-note re-tagging required.
create table if not exists public.note_folders (
  id text primary key,
  data jsonb not null
);

-- Quote + Deposit workflow tables (added for Send Quote / Send Deposit Request flow)
create table if not exists public.quotes (
  id text primary key,
  data jsonb not null
);

create table if not exists public.deposit_requests (
  id text primary key,
  data jsonb not null
);

-- Recommended indexes for token lookups on public pages
create index if not exists quotes_public_token_idx on public.quotes ((data->>'public_token'));
create index if not exists deposit_requests_public_token_idx on public.deposit_requests ((data->>'public_token'));
create index if not exists deposit_requests_lead_id_idx on public.deposit_requests ((data->>'lead_id'));
