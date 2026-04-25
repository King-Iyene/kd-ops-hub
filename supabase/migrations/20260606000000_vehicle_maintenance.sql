-- Vehicle maintenance schedule + out-of-service downtime tracking.

-- -----------------------------------------------------------------------
-- out_of_service_until on vehicles
-- -----------------------------------------------------------------------

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS out_of_service_until date;

-- -----------------------------------------------------------------------
-- vehicle_maintenance — one row per scheduled service item per vehicle
-- -----------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vehicle_maintenance (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  service_type          text        NOT NULL,
  due_date              date,
  due_mileage_km        integer,
  recurrence            text        NOT NULL DEFAULT 'one_time'
                                    CHECK (recurrence IN (
                                      'one_time',
                                      'every_3_months',
                                      'every_6_months',
                                      'every_10000_km',
                                      'custom'
                                    )),
  last_done_date        date,
  last_done_mileage_km  integer,
  status                text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'upcoming', 'overdue', 'done')),
  notes                 text,
  created_by            uuid        REFERENCES public.profiles(id),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicle_maintenance_vehicle_id_idx
  ON public.vehicle_maintenance(vehicle_id);

ALTER TABLE public.vehicle_maintenance ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read maintenance records
CREATE POLICY "Authenticated users can view maintenance"
  ON public.vehicle_maintenance FOR SELECT TO authenticated
  USING (true);

-- Only admins/managers can insert / update / delete
CREATE POLICY "Admins can manage maintenance"
  ON public.vehicle_maintenance FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'finance', 'operations')
    )
  );
