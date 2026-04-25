-- =============================================================================
-- Fleet weekly budget auto-reset — pg_cron setup
--
-- ⚠️  REFERENCE ONLY — do NOT run this file via supabase db push.
--     Apply manually in Supabase Dashboard → SQL Editor after verifying
--     that the pg_cron extension is enabled.
--
-- Prerequisites (one-time setup in Supabase Dashboard):
--   1. Database → Extensions → search "pg_cron" → Enable
--   2. Apply the regular migration 20260605000000_fleet_budget_cycles.sql
--      so the fleet_budget_cycles table exists.
--   3. Run this SQL in Dashboard → SQL Editor.
--
-- What it does:
--   Every Monday at 00:00 Africa/Lagos (= Sunday 23:00 UTC) the cron job
--   calls public.fleet_weekly_budget_reset(), which for each active vehicle:
--     1. Sums approved fuel spend for the week that just ended (Mon 00:00
--        → Sun 23:59:59 Lagos time).
--     2. Calculates unspent = max(0, weekly_budget_ngn - amount_spent).
--     3. Writes carry_forward = MIN(unspent, weekly_budget_ngn * 0.50)
--        to vehicles.carry_forward_ngn.
--     4. Inserts a row into fleet_budget_cycles for the week that ended.
--     5. Notifies admin / finance / operations users with a summary.
-- =============================================================================

-- 1. Worker function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fleet_weekly_budget_reset()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- The week that just ended (Lagos time): Mon 00:00 → Sun 23:59:59.
  -- The cron fires at Mon 00:00 Lagos, so now() is exactly the start of
  -- the *new* week. The previous week is the 7 days immediately before.
  week_start_ts        timestamptz := now() - interval '7 days';
  week_end_ts          timestamptz := now() - interval '1 microsecond';
  week_start_date      date := (now() AT TIME ZONE 'Africa/Lagos' - interval '7 days')::date;
  week_end_date        date := (now() AT TIME ZONE 'Africa/Lagos' - interval '1 second')::date;
  v                    RECORD;
  v_spent              numeric;
  v_unspent            numeric;
  v_carry_forward      numeric;
  v_summary_lines      text := '';
  v_total_carried      numeric := 0;
  v_vehicles_processed int := 0;
  recipient            RECORD;
BEGIN
  FOR v IN
    SELECT id, plate_number, weekly_budget_ngn
    FROM public.vehicles
    WHERE status = 'active'
    ORDER BY plate_number
  LOOP
    -- 1. Sum approved spend for the closed week
    SELECT COALESCE(SUM(amount_ngn), 0)
    INTO v_spent
    FROM public.fuel_requests
    WHERE vehicle_id = v.id
      AND status IN ('approved', 'payment_sent', 'receipt_uploaded', 'completed')
      AND created_at >= week_start_ts
      AND created_at <  now();

    -- 2/3. Unspent and carry-forward (capped at 50% of weekly budget)
    v_unspent := GREATEST(0, COALESCE(v.weekly_budget_ngn, 0) - v_spent);
    v_carry_forward := LEAST(v_unspent, COALESCE(v.weekly_budget_ngn, 0) * 0.50);

    -- 4. Insert the cycle log row (idempotent via uq_fleet_budget_cycles_vehicle_week)
    INSERT INTO public.fleet_budget_cycles (
      vehicle_id, week_start, week_end, budget_ngn,
      amount_spent_ngn, amount_carried_forward_ngn
    )
    VALUES (
      v.id, week_start_date, week_end_date, COALESCE(v.weekly_budget_ngn, 0),
      v_spent, v_carry_forward
    )
    ON CONFLICT (vehicle_id, week_start) DO UPDATE
      SET amount_spent_ngn           = EXCLUDED.amount_spent_ngn,
          amount_carried_forward_ngn = EXCLUDED.amount_carried_forward_ngn,
          budget_ngn                 = EXCLUDED.budget_ngn;

    -- 5. Update the vehicle's rolling carry-forward balance
    UPDATE public.vehicles
       SET carry_forward_ngn = v_carry_forward
     WHERE id = v.id;

    v_vehicles_processed := v_vehicles_processed + 1;
    v_total_carried := v_total_carried + v_carry_forward;
    v_summary_lines := v_summary_lines
      || v.plate_number
      || ' | spent ₦' || to_char(v_spent, 'FM999,999,999')
      || ' | carried ₦' || to_char(v_carry_forward, 'FM999,999,999')
      || E'\n';
  END LOOP;

  -- 6. Notify admin / finance / operations users
  FOR recipient IN
    SELECT id FROM public.profiles
    WHERE role IN ('super_admin', 'admin', 'finance', 'operations')
      AND status = 'active'
  LOOP
    INSERT INTO public.notifications (user_id, type, module, priority, title, body)
    VALUES (
      recipient.id,
      'fleet_budget_reset',
      'fleet',
      'normal',
      'Fleet weekly budget reset — '
        || to_char(week_start_date, 'DD Mon') || ' – ' || to_char(week_end_date, 'DD Mon YYYY'),
      'Reset complete for ' || v_vehicles_processed::text || ' vehicle(s). '
        || 'Total carried forward: ₦' || to_char(v_total_carried, 'FM999,999,999')
        || E'.\n\n' || v_summary_lines
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fleet_weekly_budget_reset() TO postgres;


-- 2. Schedule the cron job ────────────────────────────────────────────────────

-- Remove any existing schedule with this name before adding a new one.
SELECT cron.unschedule('weekly-fleet-budget-reset') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'weekly-fleet-budget-reset'
);

-- Sunday 23:00 UTC = Monday 00:00 Africa/Lagos (UTC+1, no DST).
-- Cron fields: minute hour day-of-month month day-of-week
-- (day-of-week 0 = Sunday)
SELECT cron.schedule(
  'weekly-fleet-budget-reset',
  '0 23 * * 0',
  $$SELECT public.fleet_weekly_budget_reset();$$
);


-- 3. Verify (run in SQL Editor after scheduling) ──────────────────────────────
-- SELECT * FROM cron.job WHERE jobname = 'weekly-fleet-budget-reset';
-- SELECT public.fleet_weekly_budget_reset();  -- manual test run
-- SELECT * FROM public.fleet_budget_cycles ORDER BY created_at DESC LIMIT 10;
