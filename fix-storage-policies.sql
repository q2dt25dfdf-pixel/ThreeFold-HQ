-- Storage policies for the order-designs bucket.
-- Run in the Supabase dashboard: Storage > Policies, or paste into the SQL editor.
--
-- Context: the server-side API routes (/api/internal/design-signed-urls and
-- /api/portal/[token]) use the anon-key Supabase client (NEXT_PUBLIC_SUPABASE_ANON_KEY).
-- That client is subject to Row-Level Security on storage.objects.
-- The INSERT policy was already added (uploads work). These two are also required:

-- SELECT: lets the anon client call createSignedUrl / createSignedUrls.
-- Without this, the signed-URL API returns {} and no thumbnail is shown.
CREATE POLICY "anon can read order-designs"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'order-designs');

-- UPDATE: lets the anon client replace an existing file when upsert: true is used.
-- Without this, re-uploading to the same version path (replacing a design) fails.
CREATE POLICY "anon can update order-designs"
ON storage.objects FOR UPDATE
TO anon
USING (bucket_id = 'order-designs')
WITH CHECK (bucket_id = 'order-designs');
