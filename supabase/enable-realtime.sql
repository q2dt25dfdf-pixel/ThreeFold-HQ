-- Run this once in Supabase SQL Editor to enable realtime postgres_changes
-- for all ThreeFold HQ tables. Once in the publication, the useSupabaseTable
-- hook receives live updates immediately — no browser refresh required.

alter publication supabase_realtime add table crm_leads;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table clients;
alter publication supabase_realtime add table finances;
alter publication supabase_realtime add table vendors;
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table calendar_events;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table sales_tax_payments;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table inventory;
