-- guide-videos storage bucket — public, read-only for all authenticated users.
-- Admin/super_admin can upload walkthrough videos; everyone else can watch.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('guide-videos', 'guide-videos', true, 524288000)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "Anyone can read guide videos" ON storage.objects;
CREATE POLICY "Anyone can read guide videos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'guide-videos');

DROP POLICY IF EXISTS "Anon can read guide videos" ON storage.objects;
CREATE POLICY "Anon can read guide videos" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'guide-videos');

DROP POLICY IF EXISTS "Admin upload guide videos" ON storage.objects;
CREATE POLICY "Admin upload guide videos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guide-videos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Admin delete guide videos" ON storage.objects;
CREATE POLICY "Admin delete guide videos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'guide-videos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
