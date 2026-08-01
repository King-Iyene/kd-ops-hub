-- Geo + selfie clock-in for attendance_records.
--
-- Additive: adds four nullable columns capturing GPS coordinates + a
-- storage path to the clock-in selfie. Old rows remain untouched.
--
-- Storage bucket 'attendance-selfies' is created (idempotent) so
-- the PWA clock-in flow has a destination for the captured PNGs.
-- Bucket is private; UI generates signed URLs on read.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS clock_in_lat        numeric,
  ADD COLUMN IF NOT EXISTS clock_in_lng        numeric,
  ADD COLUMN IF NOT EXISTS clock_in_accuracy_m numeric,
  ADD COLUMN IF NOT EXISTS clock_in_selfie_path text,
  ADD COLUMN IF NOT EXISTS clock_out_lat        numeric,
  ADD COLUMN IF NOT EXISTS clock_out_lng        numeric,
  ADD COLUMN IF NOT EXISTS clock_out_accuracy_m numeric,
  ADD COLUMN IF NOT EXISTS clock_in_via         text,  -- 'web','pwa','manual'
  ADD COLUMN IF NOT EXISTS clock_out_via        text;

COMMENT ON COLUMN public.attendance_records.clock_in_lat IS
  'Latitude captured at clock-in (browser Geolocation API). Nullable — user may deny.';
COMMENT ON COLUMN public.attendance_records.clock_in_selfie_path IS
  'Storage path under the attendance-selfies bucket for the clock-in selfie.';

-- Storage bucket (idempotent). Public = false: everything served via
-- signed URLs so photos aren't world-readable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance-selfies', 'attendance-selfies', false)
ON CONFLICT (id) DO NOTHING;

-- Bucket policies: employees can upload their OWN selfies (path prefixed
-- with their user id), and HR/finance/admin can read every selfie.
DROP POLICY IF EXISTS "att_selfie_own_insert" ON storage.objects;
CREATE POLICY "att_selfie_own_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-selfies'
    AND (auth.uid()::text = split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS "att_selfie_own_read" ON storage.objects;
CREATE POLICY "att_selfie_own_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attendance-selfies'
    AND (
      auth.uid()::text = split_part(name, '/', 1)
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role IN ('super_admin', 'admin', 'finance', 'operations')
      )
    )
  );

NOTIFY pgrst, 'reload schema';
