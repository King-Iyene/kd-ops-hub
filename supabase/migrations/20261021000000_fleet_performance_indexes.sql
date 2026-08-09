-- Performance indexes for fleet queries
-- Addresses slow Fleet page loads as dataset grows

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_logs_driver_id
  ON public.trip_logs (driver_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_logs_driver_status
  ON public.trip_logs (driver_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_logs_created_at_desc
  ON public.trip_logs (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fuel_requests_driver_id
  ON public.fuel_requests (driver_id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fuel_requests_vehicle_id
  ON public.fuel_requests (vehicle_id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fuel_requests_status_created
  ON public.fuel_requests (status, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_breadcrumbs_trip_id
  ON public.trip_breadcrumbs (trip_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trip_events_trip_id
  ON public.trip_events (trip_id);
