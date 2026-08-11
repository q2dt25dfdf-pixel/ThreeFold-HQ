CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY,
  data jsonb NOT NULL
);
-- RLS on, authenticated-only (matches every HQ client table). The browser client
-- runs as the logged-in `authenticated` role; the public anon key gets nothing;
-- server routes use the service role (bypasses RLS). Do NOT DISABLE — that reopens
-- the table to anyone holding the bundled anon key.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_rw ON orders;
CREATE POLICY orders_rw ON orders
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
