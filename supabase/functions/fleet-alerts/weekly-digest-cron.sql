-- =============================================================================
-- Fleet weekly digest — pg_cron setup
--
-- ⚠️  REFERENCE ONLY — do NOT run this file via supabase db push.
--     Apply manually in Supabase Dashboard → SQL Editor after verifying
--     that the pg_cron extension is enabled.
--
-- Prerequisites (one-time setup in Supabase Dashboard):
--   1. Database → Extensions → search "pg_cron" → Enable
--   2. Run this SQL in Dashboard → SQL Editor
--
-- What it does:
--   Every Monday at 09:00 UTC (10:00 WAT) the cron job calls
--   public.fleet_weekly_digest(), which:
--     • Queries all vehicles, their week's fuel spend, fuel level, trip count.
--     • Inserts one "Fleet Weekly Summary" notification for every
--       admin / finance / operations user.
-- =============================================================================

-- 1. Worker function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fleet_weekly_digest()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start  timestamptz;
  week_end    timestamptz;
  week_label  text;
  v           RECORD;
  digest_body text := '';
  header_line text;
  row_line    text;
  v_spent     numeric;
  v_trips     int;
  v_pct_budget text;
  v_pct_fuel   text;
  recipient   RECORD;
BEGIN
  -- This week: Monday 00:00 UTC → Sunday 23:59:59 UTC
  week_start := date_trunc('week', now() AT TIME ZONE 'UTC');  -- ISO week starts Monday
  week_end   := week_start + interval '7 days' - interval '1 second';
  week_label := to_char(week_start, 'DD Mon') || ' – ' || to_char(week_end, 'DD Mon YYYY');

  -- Build per-vehicle rows
  header_line := 'Vehicle | Spend | Budget % | Fuel % | Trips';
  digest_body := week_label || E'\n' || header_line || E'\n' || repeat('─', 60) || E'\n';

  FOR v IN
    SELECT id, plate_number, weekly_budget_ngn, tank_capacity_litres, current_fuel_litres
    FROM public.vehicles
    WHERE status = 'active'
    ORDER BY plate_number
  LOOP
    -- Weekly fuel spend
    SELECT COALESCE(SUM(fr.amount_ngn), 0)
    INTO v_spent
    FROM public.fuel_requests fr
    WHERE fr.vehicle_id = v.id
      AND fr.status IN ('approved', 'payment_sent', 'receipt_uploaded', 'completed')
      AND fr.created_at >= week_start
      AND fr.created_at <= week_end;

    -- Completed trips this week
    SELECT COUNT(*)
    INTO v_trips
    FROM public.trip_logs tl
    WHERE tl.vehicle_id = v.id
      AND tl.status = 'completed'
      AND tl.trip_end_time >= week_start
      AND tl.trip_end_time <= week_end;

    -- Budget % string
    IF v.weekly_budget_ngn > 0 THEN
      v_pct_budget := ROUND((v_spent / v.weekly_budget_ngn) * 100)::text || '%';
    ELSE
      v_pct_budget := 'N/A';
    END IF;

    -- Fuel level % string
    IF v.tank_capacity_litres > 0 THEN
      v_pct_fuel := ROUND((COALESCE(v.current_fuel_litres, 0) / v.tank_capacity_litres) * 100)::text || '%';
    ELSE
      v_pct_fuel := 'N/A';
    END IF;

    row_line := v.plate_number
      || ' | ₦' || to_char(v_spent, 'FM999,999,999')
      || ' | ' || v_pct_budget
      || ' | ' || v_pct_fuel
      || ' | ' || v_trips::text;

    digest_body := digest_body || row_line || E'\n';
  END LOOP;

  -- Insert one notification per admin / finance / operations user
  FOR recipient IN
    SELECT id FROM public.profiles
    WHERE role IN ('super_admin', 'admin', 'finance', 'operations')
      AND status = 'active'
  LOOP
    INSERT INTO public.notifications (user_id, type, module, priority, title, body)
    VALUES (
      recipient.id,
      'fleet_weekly_digest',
      'fleet',
      'normal',
      'Fleet Weekly Summary — ' || week_label,
      digest_body
    );
  END LOOP;
END;
$$;

-- Grant execute to postgres role (used by pg_cron)
GRANT EXECUTE ON FUNCTION public.fleet_weekly_digest() TO postgres;


-- 2. Schedule the cron job ────────────────────────────────────────────────────

-- Remove any existing schedule with this name before adding a new one.
SELECT cron.unschedule('fleet-weekly-digest') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fleet-weekly-digest'
);

-- Every Monday at 09:00 UTC  (cron syntax: minute hour dom month dow)
SELECT cron.schedule(
  'fleet-weekly-digest',   -- job name
  '0 9 * * 1',             -- 09:00 UTC on Monday
  $$SELECT public.fleet_weekly_digest();$$
);


-- 3. Verify (run in SQL Editor after scheduling) ──────────────────────────────
-- SELECT * FROM cron.job WHERE jobname = 'fleet-weekly-digest';
-- SELECT public.fleet_weekly_digest();  -- test run
