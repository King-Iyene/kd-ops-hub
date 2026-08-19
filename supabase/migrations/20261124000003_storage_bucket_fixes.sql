-- CRITICAL/HIGH: Fix storage bucket security
--
-- 1. task-attachments: flip from public to private, scope policies
-- 2. receipts: already private in DB but confirm, scope DELETE policy
-- 3. fleet-photos: create bucket privately with proper RLS (was created ad-hoc)

-- ============================================================================
-- 1. task-attachments — flip to private
-- ============================================================================
UPDATE storage.buckets SET public = false WHERE id = 'task-attachments';

-- Drop overly permissive policies if they exist
DROP POLICY IF EXISTS "Allow authenticated read task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated upload task attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete task attachments" ON storage.objects;
DROP POLICY IF EXISTS "task_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "task_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "task_attachments_delete" ON storage.objects;

CREATE POLICY task_attachments_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'task-attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY task_attachments_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'task-attachments'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY task_attachments_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'task-attachments'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- 2. receipts — ensure private, scope delete to owner or admin
-- ============================================================================
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- Drop any overly broad DELETE policy on receipts
DROP POLICY IF EXISTS "Allow authenticated delete receipts" ON storage.objects;
DROP POLICY IF EXISTS "receipts_delete" ON storage.objects;

CREATE POLICY receipts_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'finance')
    )
  );

-- ============================================================================
-- 3. fleet-photos — create bucket properly with RLS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fleet-photos', 'fleet-photos', false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "fleet_photos_select" ON storage.objects;
DROP POLICY IF EXISTS "fleet_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "fleet_photos_delete" ON storage.objects;

CREATE POLICY fleet_photos_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'fleet-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY fleet_photos_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'fleet-photos'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY fleet_photos_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'fleet-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'admin', 'operations')
    )
  );
