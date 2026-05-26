-- =============================================================================
-- Public "branding" storage bucket for the company logo.
--
-- The logo was uploaded to the private `documents` bucket and stored as a
-- 1-year SIGNED URL in company_settings.logo_url — so it silently expires and
-- breaks on payslips/receipts. A company logo is not sensitive, so it belongs
-- in a public bucket whose getPublicUrl() is permanent and never expires.
-- Mirrors the existing public `avatars` bucket. Admins upload; anyone reads.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Read: public (so payslips/receipts render the logo with or without a session).
DROP POLICY IF EXISTS "Anyone can read branding" ON storage.objects;
CREATE POLICY "Anyone can read branding" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'branding');

-- Write/replace/delete: admins and super_admins only.
DROP POLICY IF EXISTS "Admins upload branding" ON storage.objects;
CREATE POLICY "Admins upload branding" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Admins update branding" ON storage.objects;
CREATE POLICY "Admins update branding" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Admins delete branding" ON storage.objects;
CREATE POLICY "Admins delete branding" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'super_admin'))
  );

NOTIFY pgrst, 'reload schema';
