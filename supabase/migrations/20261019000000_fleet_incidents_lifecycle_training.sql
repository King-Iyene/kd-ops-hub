-- Fleet Phase 2: Incident reporting, vehicle lifecycle, driver training,
-- fuel type tracking, insurance management, and driver assignment history.

-- ── fleet_incidents ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fleet_incidents (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id             uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id              uuid        REFERENCES public.profiles(id),
  incident_date          date        NOT NULL,
  incident_time          time,
  incident_type          text        NOT NULL DEFAULT 'accident'
    CHECK (incident_type IN ('accident','breakdown','theft','vandalism','fire','traffic_violation','other')),
  severity               text        NOT NULL DEFAULT 'minor'
    CHECK (severity IN ('minor','moderate','major','critical')),
  location_description   text,
  lat                    numeric(10,7),
  lng                    numeric(10,7),
  description            text,
  police_report_number   text,
  police_station         text,
  insurance_claim_number text,
  insurance_claim_status text        NOT NULL DEFAULT 'not_filed'
    CHECK (insurance_claim_status IN ('not_filed','filed','processing','approved','rejected','settled')),
  estimated_repair_cost_ngn numeric,
  actual_repair_cost_ngn    numeric,
  photo_urls             text[]      DEFAULT '{}',
  witness_names          text,
  third_party_involved   boolean     NOT NULL DEFAULT false,
  third_party_details    text,
  vehicle_driveable      boolean     NOT NULL DEFAULT true,
  injuries_reported      boolean     NOT NULL DEFAULT false,
  injury_details         text,
  resolution_status      text        NOT NULL DEFAULT 'open'
    CHECK (resolution_status IN ('open','investigating','resolved','closed')),
  resolution_notes       text,
  resolved_by            uuid        REFERENCES public.profiles(id),
  resolved_at            timestamptz,
  created_by             uuid        REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fleet_incidents_vehicle   ON public.fleet_incidents(vehicle_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_incidents_driver    ON public.fleet_incidents(driver_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_fleet_incidents_status    ON public.fleet_incidents(resolution_status) WHERE resolution_status != 'closed';

ALTER TABLE public.fleet_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view incidents" ON public.fleet_incidents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can report incidents" ON public.fleet_incidents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can manage incidents" ON public.fleet_incidents
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND role IN ('admin','super_admin','finance','operations')
  ));

-- ── Vehicle lifecycle / acquisition columns ───────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS purchase_price_ngn numeric;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS purchase_date date;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS depreciation_method text DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line','declining_balance'));
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS salvage_value_ngn numeric DEFAULT 0;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS useful_life_years integer DEFAULT 5;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS financing_type text DEFAULT 'owned'
    CHECK (financing_type IN ('owned','leased','financed'));
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS lease_monthly_ngn numeric;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS lease_end_date date;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS fuel_type text DEFAULT 'pms'
    CHECK (fuel_type IN ('pms','ago','lpg'));
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_policy_number text;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_provider text;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_premium_ngn numeric;
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS insurance_type text DEFAULT 'third_party'
    CHECK (insurance_type IN ('third_party','comprehensive'));
  ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS speed_limiter_cert_expiry date;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Driver training records ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_training_records (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  training_type   text        NOT NULL
    CHECK (training_type IN ('defensive_driving','first_aid','fire_safety','hazmat',
      'vehicle_handling','customer_service','road_safety','speed_limiter','custom')),
  custom_type     text,
  provider        text,
  certificate_url text,
  training_date   date        NOT NULL,
  expiry_date     date,
  status          text        NOT NULL DEFAULT 'valid'
    CHECK (status IN ('valid','expired','pending')),
  notes           text,
  created_by      uuid        REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_training_driver ON public.driver_training_records(driver_id, training_date DESC);

ALTER TABLE public.driver_training_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view training" ON public.driver_training_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage training" ON public.driver_training_records
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND role IN ('admin','super_admin','operations')
  ));
CREATE POLICY "Drivers can insert own training" ON public.driver_training_records
  FOR INSERT TO authenticated WITH CHECK (driver_id = auth.uid());

-- ── Medical fitness on profiles ───────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS medical_fitness_expiry date;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS medical_fitness_cert_url text;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guarantor_name text;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guarantor_phone text;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guarantor_address text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Driver assignment history ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.driver_assignments (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  driver_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  reason        text,
  assigned_by   uuid        REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_driver_assignments_vehicle ON public.driver_assignments(vehicle_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_assignments_driver  ON public.driver_assignments(driver_id, assigned_at DESC);

ALTER TABLE public.driver_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view assignments" ON public.driver_assignments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage assignments" ON public.driver_assignments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
      AND role IN ('admin','super_admin','operations')
  ));

-- ── Fuel type on fuel requests ────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.fuel_requests ADD COLUMN IF NOT EXISTS fuel_type text DEFAULT 'pms'
    CHECK (fuel_type IN ('pms','ago','lpg'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Documents linked to vehicles ──────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_vehicle ON public.documents(vehicle_id) WHERE vehicle_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
