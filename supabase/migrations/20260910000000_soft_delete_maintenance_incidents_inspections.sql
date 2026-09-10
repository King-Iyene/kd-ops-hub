-- Add deleted_at columns for soft-delete on fleet modules that lack it.
-- payment_batches already has deleted_at.

ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE fleet_incidents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE vehicle_inspections ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_deleted_at ON vehicle_maintenance (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fleet_incidents_deleted_at ON fleet_incidents (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_deleted_at ON vehicle_inspections (deleted_at) WHERE deleted_at IS NULL;
