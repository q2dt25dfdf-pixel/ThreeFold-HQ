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
