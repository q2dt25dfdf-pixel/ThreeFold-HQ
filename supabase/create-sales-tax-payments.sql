-- Run this once in Supabase SQL Editor to create the sales_tax_payments table.
-- Stores manual records of tax remitted to the state (California quarterly filings).

create table if not exists sales_tax_payments (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);

-- Expected JSONB fields per record:
-- {
--   id:         text     — same as row id
--   amount:     number   — amount remitted
--   date:       text     — ISO date of payment (YYYY-MM-DD)
--   period:     text     — quarter label e.g. "2026-Q2"
--   notes:      text     — optional memo
--   created_at: text     — ISO timestamp
-- }
