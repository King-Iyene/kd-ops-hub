-- Heal vehicle_maintenance — two migrations both tried to create this table:
--
--   20260420100000_phase_4_world_class_v1.sql   (ran first, won)
--     columns: id, vehicle_id, service_date (NOT NULL), service_type,
--              odometer, cost_ngn, next_service_due, notes, logged_by
--
--   20260606000000_vehicle_maintenance.sql       (ran second)
--     used CREATE TABLE IF NOT EXISTS — since the table already existed
--     from the first migration, this was a silent no-op. Its columns
--     (due_date, due_mileage_km, recurrence, last_done_date,
--      last_done_mileage_km, status, created_by) were NEVER added.
--
-- VehicleMaintenanceDialog.handleAdd() (src/pages/Fleet.tsx) inserts using
-- the second migration's schema, so "Add Service Item" has been failing
-- with "column does not exist" (and would additionally violate the
-- service_date NOT NULL constraint, which the UI never populates).
--
-- Fix: add the missing columns for real via ALTER TABLE, and relax
-- service_date since the current UI has no field for it.

ALTER TABLE public.vehicle_maintenance
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS due_mileage_km integer,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'one_time',
  ADD COLUMN IF NOT EXISTS last_done_date date,
  ADD COLUMN IF NOT EXISTS last_done_mileage_km integer,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_maintenance_recurrence_check'
  ) THEN
    ALTER TABLE public.vehicle_maintenance
      ADD CONSTRAINT vehicle_maintenance_recurrence_check
      CHECK (recurrence IN ('one_time', 'every_3_months', 'every_6_months', 'every_10000_km', 'custom'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_maintenance_status_check'
  ) THEN
    ALTER TABLE public.vehicle_maintenance
      ADD CONSTRAINT vehicle_maintenance_status_check
      CHECK (status IN ('pending', 'upcoming', 'overdue', 'done'));
  END IF;
END $$;

-- service_date was NOT NULL in the original (unused) schema; the app has
-- never populated it (it tracks due_date / last_done_date instead).
ALTER TABLE public.vehicle_maintenance ALTER COLUMN service_date DROP NOT NULL;

CREATE INDEX IF NOT EXISTS vehicle_maintenance_due_date_idx
  ON public.vehicle_maintenance(due_date) WHERE due_date IS NOT NULL;
