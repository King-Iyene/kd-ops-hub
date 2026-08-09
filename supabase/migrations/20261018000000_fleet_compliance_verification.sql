-- Fleet compliance & driver verification fields
-- Adds hackney permit + vehicle license expiry tracking on vehicles,
-- and driver license + verification status on profiles.

-- Vehicle compliance: hackney permit and vehicle license
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS hackney_permit_expiry date,
  ADD COLUMN IF NOT EXISTS vehicle_license_expiry date;

-- Driver verification: license details and overall status
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS driver_license_number text,
  ADD COLUMN IF NOT EXISTS driver_license_expiry date,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired'));

-- Compliance reminder log — prevents duplicate reminders for the same
-- vehicle + document + threshold (e.g. "insurance 30 days").
CREATE TABLE IF NOT EXISTS compliance_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  threshold_days int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, document_type, threshold_days)
);

ALTER TABLE compliance_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage compliance reminders"
  ON compliance_reminders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'admin')
    )
  );

-- Maintenance: track cost on each maintenance record
ALTER TABLE vehicle_maintenance
  ADD COLUMN IF NOT EXISTS cost_ngn numeric,
  ADD COLUMN IF NOT EXISTS vendor text;

-- Index for compliance queries
CREATE INDEX IF NOT EXISTS idx_vehicles_insurance_expiry ON vehicles(insurance_expiry) WHERE insurance_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_road_worthiness_expiry ON vehicles(road_worthiness_expiry) WHERE road_worthiness_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_hackney_permit_expiry ON vehicles(hackney_permit_expiry) WHERE hackney_permit_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_license_expiry ON vehicles(vehicle_license_expiry) WHERE vehicle_license_expiry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_driver_license_expiry ON profiles(driver_license_expiry) WHERE driver_license_expiry IS NOT NULL;
