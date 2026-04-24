-- Continuous fuel level tracking.
--
-- 1. fuel_consumption_rate_lkm on vehicles — litres per km (e.g. 0.12 = 12L/100km).
--    Parallel to avg_km_per_litre (km/L); existing code keeps using km/L.
--    New trip-end calculation uses this column when non-zero.
--
-- 2. fuel_level_logs — immutable audit log of every change to current_fuel_litres.
--    event_type: 'trip_consumed' | 'fuel_added'
--    reference_id: trip_logs.id or fuel_requests.id that caused the change.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fuel_consumption_rate_lkm numeric NOT NULL DEFAULT 0.12;

CREATE TABLE IF NOT EXISTS public.fuel_level_logs (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id             uuid         NOT NULL REFERENCES public.vehicles(id),
  event_type             text         NOT NULL CHECK (event_type IN ('trip_consumed', 'fuel_added')),
  amount_litres          numeric      NOT NULL,
  resulting_level_litres numeric      NOT NULL,
  reference_id           uuid,
  created_at             timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fuel_level_logs_vehicle_created
  ON public.fuel_level_logs (vehicle_id, created_at DESC);

ALTER TABLE public.fuel_level_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fuel level logs" ON public.fuel_level_logs
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin', 'operations'));

CREATE POLICY "Drivers can read own vehicle fuel logs" ON public.fuel_level_logs
  FOR SELECT TO authenticated
  USING (
    vehicle_id IN (
      SELECT id FROM public.vehicles WHERE assigned_driver_id = auth.uid()
    )
  );
