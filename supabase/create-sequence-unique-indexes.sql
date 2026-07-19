-- Run this once in the Supabase SQL Editor.
--
-- Backstop for sequence-number generation (quotes / deposit_requests / orders).
-- The number lives in the JSONB `data` column as a string, e.g. "TF-Q-2026-0006".
-- These UNIQUE expression indexes make a duplicate number a HARD database error
-- instead of a silent second row that shadows the first in number-based lookups.
--
-- SAFE TO RUN: verified 2026-07-18 that ZERO duplicate numbers exist in any of the
-- three tables (quotes: 6 rows / 6 distinct, deposit_requests: 2 / 2, orders: 0 / 0),
-- so every CREATE below succeeds without cleanup.
--
-- Note: a UNIQUE expression index treats SQL NULL as distinct, so rows that have no
-- number yet (data->>'...' IS NULL) never collide with each other — only two rows
-- carrying the SAME non-null number are rejected.

create unique index if not exists quotes_quote_number_key
  on quotes ((data->>'quote_number'));

create unique index if not exists deposit_requests_deposit_request_number_key
  on deposit_requests ((data->>'deposit_request_number'));

create unique index if not exists orders_order_number_key
  on orders ((data->>'order_number'));

-- Final-invoice number (TF-I-) minted on the finances row by /api/invoice/generate. Same
-- backstop as the three above so max(tail)+1 can never silently duplicate under a race.
create unique index if not exists finances_invoice_number_key
  on finances ((data->>'invoice_number'));

-- Verify the four indexes exist after running:
--   select indexname, indexdef
--   from pg_indexes
--   where indexname in (
--     'quotes_quote_number_key',
--     'deposit_requests_deposit_request_number_key',
--     'orders_order_number_key',
--     'finances_invoice_number_key'
--   );
