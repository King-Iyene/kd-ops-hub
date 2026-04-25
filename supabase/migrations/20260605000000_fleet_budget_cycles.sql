-- Fleet weekly budget cycle log.
--
-- Backs the Monday 00:00 Lagos pg_cron reset job (see
-- supabase/functions/fleet-alerts/weekly-budget-reset-cron.sql for
-- the worker function and schedule — apply that file manually in
-- the Supabase SQL Editor).
--
-- One row per (vehicle, completed week). Records the week's budget,
-- the actual spend, and the amount carried forward into the next
-- week (capped at 50% of the weekly budget). Drives historical
-- reports and admin audits of the rollover behaviour.

CREATE TABLE IF NOT EXISTS public.fleet_budget_cycles (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id                  uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  week_start                  date NOT NULL,
  week_end                    date NOT NULL,
  budget_ngn                  numeric NOT NULL,
  amount_spent_ngn            numeric NOT NULL DEFAULT 0,
  amount_carried_forward_ngn  numeric NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup of a vehicle's cycle history, newest first.
CREATE INDEX IF NOT EXISTS idx_fleet_budget_cycles_vehicle_week
  ON public.fleet_budget_cycles(vehicle_id, week_start DESC);

-- Prevent duplicate rows if the cron job ever fires twice for the
-- same vehicle/week (e.g. manual + scheduled run on the same Monday).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fleet_budget_cycles_vehicle_week
  ON public.fleet_budget_cycles(vehicle_id, week_start);

-- Read-only for management roles. The cron worker writes via SECURITY
-- DEFINER so it bypasses RLS.
ALTER TABLE public.fleet_budget_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view budget cycles" ON public.fleet_budget_cycles;
CREATE POLICY "Managers can view budget cycles"
  ON public.fleet_budget_cycles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin', 'finance', 'operations')
    )
  );
