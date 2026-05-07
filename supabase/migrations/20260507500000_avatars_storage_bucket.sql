-- ──────────────────────────────────────────────────────────────────────────
-- avatars storage bucket
--
-- The Employee Profile photo upload was throwing "Bucket not found" because
-- the bucket the client uses (`avatars`) had never been provisioned. This
-- migration creates a public bucket so the resulting `getPublicUrl` works
-- without needing signed URLs (avatars are not sensitive — they're shown
-- in the sidebar, header, and on every comment thread).
--
-- RLS policies:
--   • Read   — any authenticated user can fetch any avatar (we surface
--              them in lists, tables, comment authors, etc.).
--   • Insert — a user can upload to a path prefixed with their own user
--              id; admins / super_admins can upload anywhere (so an
--              admin editing someone else's profile can change their
--              photo).
--   • Update — same rule as insert.
--   • Delete — same rule as insert.
--
-- Path convention used by the client: `{user_id}/{timestamp}.{ext}` so
-- the regex on `auth.uid()` matches the first segment.
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Read: any authenticated user can read any avatar.
DROP POLICY IF EXISTS "Authenticated can read avatars" ON storage.objects;
CREATE POLICY "Authenticated can read avatars" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- Anonymous read too — the bucket is public, so PWA caches and shared
-- receipts can render the logo without a session.
DROP POLICY IF EXISTS "Anon can read avatars" ON storage.objects;
CREATE POLICY "Anon can read avatars" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'avatars');

-- Self-upload: the first path segment must equal the user's own UUID.
-- Admins / super_admins can upload anywhere in the bucket so they can
-- update other employees' photos.
DROP POLICY IF EXISTS "Self or admin upload avatars" ON storage.objects;
CREATE POLICY "Self or admin upload avatars" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
      )
    )
  );

-- Update: same rule (re-uploading replaces the existing object).
DROP POLICY IF EXISTS "Self or admin update avatars" ON storage.objects;
CREATE POLICY "Self or admin update avatars" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
      )
    )
  );

-- Delete: same rule.
DROP POLICY IF EXISTS "Self or admin delete avatars" ON storage.objects;
CREATE POLICY "Self or admin delete avatars" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
      )
    )
  );

NOTIFY pgrst, 'reload schema';
