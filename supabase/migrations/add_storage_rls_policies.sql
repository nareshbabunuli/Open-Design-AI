-- Least-privilege policies for the public 'designs' bucket.
-- Public reads are retained intentionally for shareable design assets.
-- Uploads require authentication; updates/deletes are restricted to the object owner.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on designs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated and anon uploads to designs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated and anon updates to designs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated and anon deletes from designs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to designs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to designs" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from designs" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated owners upload designs" ON storage.objects;
DROP POLICY IF EXISTS "Owners update designs" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete designs" ON storage.objects;

CREATE POLICY "Allow public read access on designs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'designs');

CREATE POLICY "Authenticated owners upload designs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'designs'
  AND owner_id = (select auth.uid())::text
);

CREATE POLICY "Owners update designs"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'designs'
  AND owner_id = (select auth.uid())::text
)
WITH CHECK (
  bucket_id = 'designs'
  AND owner_id = (select auth.uid())::text
);

CREATE POLICY "Owners delete designs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'designs'
  AND owner_id = (select auth.uid())::text
);
