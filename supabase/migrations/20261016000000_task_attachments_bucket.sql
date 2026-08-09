-- ──────────────────────────────────────────────────────────────────────────
-- task-attachments storage bucket
--
-- Stores file attachments uploaded to tasks. Files are stored under the
-- path convention `{taskId}/{filename}`. The bucket is public so that
-- getPublicUrl works for image previews and downloads without signed URLs.
--
-- RLS policies allow any authenticated user to read, upload, and delete
-- attachments. Application-level logic enforces further access control.
-- ──────────────────────────────────────────────────────────────────────────

-- Create storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "auth_upload_task_attachments" ON storage.objects;
CREATE POLICY "auth_upload_task_attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments');

-- Allow authenticated users to read
DROP POLICY IF EXISTS "auth_read_task_attachments" ON storage.objects;
CREATE POLICY "auth_read_task_attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments');

-- Allow authenticated users to delete their uploads
DROP POLICY IF EXISTS "auth_delete_task_attachments" ON storage.objects;
CREATE POLICY "auth_delete_task_attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments');

NOTIFY pgrst, 'reload schema';
