-- Storage policies for the order-designs bucket.
-- Run in the Supabase dashboard: Storage > Policies, or paste into the SQL editor.
--
-- Context: the server-side API routes (/api/internal/design-signed-urls and
-- /api/portal/[token]) use the anon-key Supabase client (NEXT_PUBLIC_SUPABASE_ANON_KEY).
-- That client is subject to Row-Level Security on storage.objects.

-- SELECT: lets the anon client call createSignedUrl / createSignedUrls.
-- Without this, the signed-URL API returns {} and no thumbnail is shown.
CREATE POLICY "anon can read order-designs"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'order-designs');

-- ── Authenticated-user policies (browser upload path) ────────────────────────

-- DELETE: required for upsert (Replace Image) to work.
--
-- Supabase Storage v2 upsert (upload with x-upsert: true) does DELETE + INSERT,
-- not UPDATE. Without a DELETE policy the server's DELETE of the old object row
-- is silently blocked by RLS. The old row stays in the DB. The subsequent INSERT
-- tries to write a duplicate (bucket_id, name) key. PostgreSQL sees the
-- conflicting row as invisible to the current user and raises
-- "new row violates row-level security policy" instead of the usual
-- "duplicate key value violates unique constraint".
--
-- The authenticated UPDATE policy already present is correct but irrelevant:
-- Storage v2 never issues a DB-level UPDATE on storage.objects for upserts.
CREATE POLICY "authenticated can delete order-designs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'order-designs');
