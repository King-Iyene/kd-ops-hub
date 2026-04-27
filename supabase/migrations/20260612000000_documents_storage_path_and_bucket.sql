-- Defensive: some live DBs are missing the `storage_path` column on the
-- `documents` table and/or the `documents` storage bucket itself, so document
-- uploads fail with:
--   - "Could not find the 'storage_path' column of 'documents' in the schema cache"
--   - "Bucket not found"
--
-- This migration adds the missing column (idempotent), re-creates the bucket
-- if absent, and ensures the read/write policies on storage.objects exist.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can read documents bucket" ON storage.objects;
CREATE POLICY "Authenticated can read documents bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "Managers upload to documents bucket" ON storage.objects;
CREATE POLICY "Managers upload to documents bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'finance', 'operations', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Uploader or admin modifies documents bucket" ON storage.objects;
CREATE POLICY "Uploader or admin modifies documents bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin')
      )
    )
  );

DROP POLICY IF EXISTS "Uploader or admin deletes documents bucket" ON storage.objects;
CREATE POLICY "Uploader or admin deletes documents bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('admin', 'super_admin')
      )
    )
  );

-- Same defensive pass for the `receipts` bucket used by Expenses / Fuel
-- requests — the fuel-request preview also showed "the file may have been
-- moved or the link is no longer valid", which is what you get when the
-- bucket itself doesn't exist.
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can read receipts bucket" ON storage.objects;
CREATE POLICY "Authenticated can read receipts bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Authenticated can upload receipts" ON storage.objects;
CREATE POLICY "Authenticated can upload receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

NOTIFY pgrst, 'reload schema';
