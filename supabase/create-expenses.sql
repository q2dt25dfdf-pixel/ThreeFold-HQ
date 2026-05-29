-- Run this once in Supabase SQL Editor to create the expenses table.
-- Tracks non-order business expenses (materials, packaging, software, etc.)
-- that are not tied to a specific client order vendor cost.

create table if not exists expenses (
  id   text primary key,
  data jsonb not null default '{}'::jsonb
);

-- Expected JSONB fields per record:
-- {
--   id:                   text     — same as row id
--   expense_date:         text     — ISO date (YYYY-MM-DD), required
--   vendor_name:          text     — vendor / source name, required
--   category:             text     — Materials | Packaging | Tools | Software | Samples | Supplies | Shipping | Other
--   amount_cents:         number   — amount in cents (integer), required, > 0
--   paid_by:              text     — Alliyah | Hannah | Jordan | Company Account
--   payment_status:       text     — "paid" | "unpaid"
--   reimbursement_status: text     — "not_needed" | "needs_reimbursement" | "reimbursed"
--   notes:                text     — optional memo
--   related_order_id:     text     — optional link to an order id
--   receipt_url:          text     — optional URL to receipt
--   created_at:           text     — ISO timestamp
--   updated_at:           text     — ISO timestamp
-- }
