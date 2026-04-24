-- Real-time trip clock-in / clock-out system.
--
-- Extends trip_logs with GPS, timestamps, duration, anomaly detection,
-- and a status lifecycle: in_progress → completed (default for legacy rows).
--
-- Three additions beyond the base spec:
--
--   1. numeric(10,7) coords — 7 dp ≈ 1 cm precision, appropriate for GPS.
--   2. anomaly_reason text — explains WHY a row was flagged (multiple checks).
--   3. Partial UNIQUE index on (driver_id) WHERE status = 'in_progress' —
--      prevents a driver from accidentally starting two trips at once.
--   4. Driver UPDATE policy — drivers cannot currently UPDATE their own rows,
--      which would silently fail on clock-out. Fixed here.

ALTER TABLE public.trip_logs
  ADD COLUMN IF NOT EXISTS trip_start_time  timestamptz,
  ADD COLUMN IF NOT EXISTS trip_end_time    timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS start_lat        numeric(10,7),
  ADD COLUMN IF NOT EXISTS start_lng        numeric(10,7),
  ADD COLUMN IF NOT EXISTS end_lat          numeric(10,7),
  ADD COLUMN IF NOT EXISTS end_lng          numeric(10,7),
  ADD COLUMN IF NOT EXISTS is_anomaly       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anomaly_reason   text,
  ADD COLUMN IF NOT EXISTS status           text DEFAULT 'completed';

-- Existing rows are implicitly completed — nothing to backfill.

-- Prevent double clock-in: at most one in_progress row per driver.
CREATE UNIQUE INDEX IF NOT EXISTS trip_logs_one_active_per_driver
  ON public.trip_logs (driver_id)
  WHERE (status = 'in_progress');

-- Allow drivers to UPDATE their own rows (needed for clock-out).
-- Without this, the supabase UPDATE in handleEndTrip silently returns no rows.
DROP POLICY IF EXISTS "Drivers can update own trip logs" ON public.trip_logs;
CREATE POLICY "Drivers can update own trip logs" ON public.trip_logs
  FOR UPDATE TO authenticated
  USING  (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());
