-- Geofencing: named circular zones for fleet monitoring.
-- Admins draw zones on the map and see which vehicles are inside/outside.

CREATE TABLE IF NOT EXISTS public.geofences (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text          NOT NULL,
  center_lat    numeric(10,7) NOT NULL,
  center_lng    numeric(10,7) NOT NULL,
  radius_meters integer       NOT NULL DEFAULT 500 CHECK (radius_meters > 0),
  color         text          NOT NULL DEFAULT '#3b82f6',
  description   text,
  active        boolean       NOT NULL DEFAULT true,
  created_by    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geofences_active ON public.geofences (active);

ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

-- Admin / finance / operations can fully manage geofences
CREATE POLICY "Fleet managers can manage geofences" ON public.geofences
  FOR ALL TO authenticated
  USING  (public.current_user_role() IN ('admin', 'super_admin', 'finance', 'operations'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin', 'finance', 'operations'));

-- All authenticated users can read active geofences (for display on LiveTracking)
CREATE POLICY "All users can read active geofences" ON public.geofences
  FOR SELECT TO authenticated
  USING (active = true);
