-- Lock the core HQ tables: RLS on + authenticated-only policy. The browser client
-- runs as the logged-in `authenticated` role; the public anon key gets nothing;
-- server routes use the service role (bypasses RLS).
--
-- History: this file used to DISABLE RLS on these tables (the app pre-dated policies).
-- That reopened every table to the bundled anon key — never do that again. The old
-- `leads` and `production` lines were dropped (those tables no longer exist; the
-- current tables are crm_leads and orders, locked elsewhere).

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_rw ON vendors;
CREATE POLICY vendors_rw ON vendors FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_rw ON clients;
CREATE POLICY clients_rw ON clients FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_rw ON tasks;
CREATE POLICY tasks_rw ON tasks FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

ALTER TABLE finances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finances_rw ON finances;
CREATE POLICY finances_rw ON finances FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
