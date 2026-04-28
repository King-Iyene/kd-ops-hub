-- Enable Supabase Realtime broadcasting on the trip tables.
--
-- The Live Tracking admin page subscribes to:
--   * trip_logs           — INSERT (new trip starts), UPDATE (status → completed)
--   * trip_breadcrumbs    — INSERT (live GPS pings, polyline trail)
--
-- RLS policies still apply: managers (admin / super_admin / operations) and
-- the driver themselves are the only roles that can read these rows, so the
-- realtime stream is automatically filtered per-recipient.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trip_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'trip_breadcrumbs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_breadcrumbs;
  END IF;
END $$;

-- REPLICA IDENTITY FULL on trip_logs so UPDATE events carry the previous row
-- (we need to detect status transitions reliably).
ALTER TABLE public.trip_logs REPLICA IDENTITY FULL;

-- Breadcrumbs are insert-only; default identity is enough.
