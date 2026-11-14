-- =============================================================================
-- Real IP-based geofencing for remote-work detection (task: "real
-- geofencing/GPS"). Desktops have no GPS hardware, so this is IP-based
-- geolocation (approximate, city-level) looked up by the desktop agent and
-- compared server-admin-configured office location(s) + radius. This is
-- honestly IP-based, not device GPS — labeled as such everywhere it
-- surfaces in the UI, same as TimeCamp's own IP-based "remote work
-- detection" (TimeCamp does not use device GPS for desktop either).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Admin-configured office locations. Multiple offices supported (a capture
-- is "in office" if it falls within ANY configured office's radius).
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_office_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  radius_meters integer NOT NULL DEFAULT 500 CHECK (radius_meters >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.time_office_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_office_locations_read" ON public.time_office_locations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "time_office_locations_write" ON public.time_office_locations
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

-- ---------------------------------------------------------------------------
-- Best-effort IP geolocation captured per activity-log row. Nullable — the
-- agent looks this up on a throttled cadence (not every tick, to respect
-- free geolocation API rate limits), so most rows carry the most recent
-- lookup rather than a fresh one every time.
-- ---------------------------------------------------------------------------
ALTER TABLE public.time_activity_logs
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS geo_lat double precision,
  ADD COLUMN IF NOT EXISTS geo_lon double precision,
  ADD COLUMN IF NOT EXISTS geo_city text,
  ADD COLUMN IF NOT EXISTS geo_region text,
  ADD COLUMN IF NOT EXISTS geo_country text,
  -- Computed by the agent at insert time from geo_lat/lon vs. the office
  -- locations it fetched: true = outside every configured office radius.
  -- NULL = no geo lookup available for this row (not flagged either way).
  ADD COLUMN IF NOT EXISTS is_outside_geofence boolean;

NOTIFY pgrst, 'reload schema';
