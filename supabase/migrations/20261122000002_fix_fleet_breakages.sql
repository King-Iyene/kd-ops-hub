-- Fix multiple Fleet page breakages:
--
-- 1. receipts storage bucket was private → getPublicUrl returned 404 "Bucket
--    not found". Made it public so receipt images load. RLS policies still
--    restrict uploads/deletes to authenticated users.
--
-- 2. vehicle_maintenance was missing completed_at and priority columns that
--    FleetInsightsPanel.tsx selects. Added them and backfilled completed_at
--    from status for existing completed records.
--
-- 3. vehicle_inspections had overall_status but code selected overall_result.
--    Added overall_result as a generated column mirroring overall_status.
--
-- 4. FleetBudgetForecaster queried nonexistent maintenance_records table —
--    fixed in code to use vehicle_maintenance with correct column names.

-- 1. Make receipts bucket publicly readable
UPDATE storage.buckets SET public = true WHERE id = 'receipts';

-- 2. Add missing columns to vehicle_maintenance
ALTER TABLE public.vehicle_maintenance
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical'));

UPDATE public.vehicle_maintenance
SET completed_at = COALESCE(last_done_date::timestamptz, created_at)
WHERE status = 'completed' AND completed_at IS NULL;

-- 3. Add overall_result generated column to vehicle_inspections
ALTER TABLE public.vehicle_inspections
  ADD COLUMN IF NOT EXISTS overall_result text GENERATED ALWAYS AS (overall_status) STORED;
