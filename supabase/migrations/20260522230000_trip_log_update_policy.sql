-- Allow admin and super_admin to UPDATE trip logs.
-- The original "Admins can manage trip logs" FOR ALL policy only matched role='admin'.
-- Replace it with one that uses current_user_role() to also cover super_admin.

DROP POLICY IF EXISTS "Admins can manage trip logs" ON public.trip_logs;

CREATE POLICY "Admins can manage trip logs" ON public.trip_logs
  FOR ALL TO authenticated USING (
    public.current_user_role() IN ('admin', 'super_admin', 'operations')
  );
