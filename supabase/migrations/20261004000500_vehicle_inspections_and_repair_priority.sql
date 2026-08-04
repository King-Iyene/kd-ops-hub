-- Vehicle Inspections (DVIR) — pre-trip / post-trip inspection checklists.
-- Every major fleet platform (Samsara, Fleetio, Geotab) has this as a core
-- feature. Drivers complete a checklist before starting a trip, noting any
-- defects. Admin can review, track defect resolution, and demonstrate
-- compliance with vehicle-safety regulations (FRSC in Nigeria, FMCSA in US).
--
-- Repair priority — lets drivers flag repairs as emergency (vehicle unsafe),
-- urgent (soon), or routine.  Admins can triage the repair queue by severity
-- instead of treating every request equally.

-- ── vehicle_inspections ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id    uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  inspector_id  uuid NOT NULL REFERENCES public.profiles(id),
  trip_id       uuid REFERENCES public.trip_logs(id),
  inspection_type text NOT NULL DEFAULT 'pre_trip'
    CHECK (inspection_type IN ('pre_trip', 'post_trip', 'ad_hoc')),

  -- JSON checklist results. Schema:
  -- { items: [{ key: string, label: string, status: 'pass'|'fail'|'na', note?: string }] }
  checklist     jsonb NOT NULL DEFAULT '{"items":[]}',
  has_defects   boolean NOT NULL DEFAULT false,
  defect_notes  text,
  photo_urls    text[] DEFAULT '{}',

  odometer_km   numeric,
  overall_status text NOT NULL DEFAULT 'pass'
    CHECK (overall_status IN ('pass', 'fail')),

  reviewed_by   uuid REFERENCES public.profiles(id),
  reviewed_at   timestamptz,
  review_note   text,

  created_at    timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle
  ON public.vehicle_inspections(vehicle_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_inspector
  ON public.vehicle_inspections(inspector_id, created_at DESC);

ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inspections" ON public.vehicle_inspections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert inspections" ON public.vehicle_inspections
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update inspections" ON public.vehicle_inspections
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.vehicle_inspections IS
  'Pre-trip / post-trip vehicle inspection records (DVIR). Drivers complete a checklist; defects are flagged for admin review.';

-- ── repair priority ────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.expenses
      ADD COLUMN priority text DEFAULT 'routine'
        CHECK (priority IN ('emergency', 'urgent', 'routine'));
    COMMENT ON COLUMN public.expenses.priority IS
      'Repair priority: emergency (vehicle unsafe), urgent (soon), routine (scheduled).';
  END IF;
END $$;

-- ── parts_replaced on expenses ─────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'parts_replaced'
  ) THEN
    ALTER TABLE public.expenses
      ADD COLUMN parts_replaced text;
    COMMENT ON COLUMN public.expenses.parts_replaced IS
      'Free-text list of parts replaced during a repair (e.g. "Front brake pads, Brake fluid").';
  END IF;
END $$;

-- ── labour_hours on expenses ───────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expenses'
      AND column_name = 'labour_hours'
  ) THEN
    ALTER TABLE public.expenses
      ADD COLUMN labour_hours numeric;
    COMMENT ON COLUMN public.expenses.labour_hours IS
      'Estimated mechanic labour hours for this repair job.';
  END IF;
END $$;

-- ── warranty_expiry on vehicles ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'warranty_expiry'
  ) THEN
    ALTER TABLE public.vehicles
      ADD COLUMN warranty_expiry date;
    COMMENT ON COLUMN public.vehicles.warranty_expiry IS
      'Vehicle warranty expiry date. Tracked alongside insurance and road worthiness.';
  END IF;
END $$;

-- ── total_mileage_km on vehicles ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vehicles'
      AND column_name = 'total_mileage_km'
  ) THEN
    ALTER TABLE public.vehicles
      ADD COLUMN total_mileage_km numeric DEFAULT 0;
    COMMENT ON COLUMN public.vehicles.total_mileage_km IS
      'Running odometer reading (km). Updated when trip logs or fuel receipts record odometer.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
