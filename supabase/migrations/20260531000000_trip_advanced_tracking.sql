-- Advanced trip tracking: GPS breadcrumbs + driving event log.
--
-- trip_breadcrumbs — periodic GPS pings captured by watchPosition during a trip
-- trip_events      — discrete driving events: speeding, hard braking, extended stop
--
-- Drivers write their own rows via INSERT policies.
-- Admins (admin, super_admin, operations) + the owning driver read via SELECT policies.

-- -----------------------------------------------------------------------
-- trip_breadcrumbs
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_breadcrumbs (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid          NOT NULL REFERENCES public.trip_logs(id) ON DELETE CASCADE,
  lat         numeric(10,7) NOT NULL,
  lng         numeric(10,7) NOT NULL,
  accuracy    numeric,
  speed_kmh   numeric,
  heading     numeric,
  is_speeding boolean       DEFAULT false,
  recorded_at timestamptz   DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS trip_breadcrumbs_trip_recorded
  ON public.trip_breadcrumbs (trip_id, recorded_at);

ALTER TABLE public.trip_breadcrumbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own breadcrumbs" ON public.trip_breadcrumbs
  FOR INSERT TO authenticated
  WITH CHECK (
    trip_id IN (SELECT id FROM public.trip_logs WHERE driver_id = auth.uid())
  );

CREATE POLICY "Drivers and admins can read breadcrumbs" ON public.trip_breadcrumbs
  FOR SELECT TO authenticated
  USING (
    trip_id IN (SELECT id FROM public.trip_logs WHERE driver_id = auth.uid())
    OR public.current_user_role() IN ('admin', 'super_admin', 'operations')
  );

-- -----------------------------------------------------------------------
-- trip_events
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trip_events (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid          NOT NULL REFERENCES public.trip_logs(id) ON DELETE CASCADE,
  event_type  text          NOT NULL,
  lat         numeric(10,7),
  lng         numeric(10,7),
  speed_kmh   numeric,
  details     text,
  recorded_at timestamptz   DEFAULT now() NOT NULL,
  CONSTRAINT trip_events_type_check CHECK (
    event_type IN ('speeding', 'hard_braking', 'extended_stop')
  )
);

CREATE INDEX IF NOT EXISTS trip_events_trip_recorded
  ON public.trip_events (trip_id, recorded_at);

ALTER TABLE public.trip_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert own trip events" ON public.trip_events
  FOR INSERT TO authenticated
  WITH CHECK (
    trip_id IN (SELECT id FROM public.trip_logs WHERE driver_id = auth.uid())
  );

CREATE POLICY "Drivers and admins can read trip events" ON public.trip_events
  FOR SELECT TO authenticated
  USING (
    trip_id IN (SELECT id FROM public.trip_logs WHERE driver_id = auth.uid())
    OR public.current_user_role() IN ('admin', 'super_admin', 'operations')
  );
