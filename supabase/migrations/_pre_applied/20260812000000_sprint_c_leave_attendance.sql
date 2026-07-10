-- =============================================================================
-- Sprint C — Leave & attendance improvements
--
-- ADDITIVE, BACKWARD-COMPATIBLE. Every existing leave request and balance
-- row continues working exactly as today. New features are gated behind
-- toggles or only apply when newly added fields are set.
--
-- What's in this migration:
--   1. Extend leave_type CHECK to include 'maternity' and 'paternity'
--      (Labour Act compliant: 12 weeks maternity, 5–14 days paternity).
--   2. Add maternity_used / paternity_used counters to leave_balances.
--   3. Company-wide carryover rules in company_settings:
--        leave_carryover_max_days     — default 5
--        leave_carryover_enabled      — default FALSE (no auto-carryover)
--   4. AWOL detection — daily scheduled function that flags any active
--      employee with no clock-in AND no approved leave for yesterday.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Extend the leave_type CHECK constraint
-- ──────────────────────────────────────────────────────────────────────────
-- The original constraint only allowed annual/sick/unpaid. Drop it (by its
-- generated name pattern) and recreate with the expanded set. Idempotent —
-- safe to re-run.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'public.leave_requests'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%leave_type%annual%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leave_requests DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN ('annual','sick','unpaid','maternity','paternity'));

-- ──────────────────────────────────────────────────────────────────────────
-- 2. New counters on leave_balances
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS maternity_used numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paternity_used numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carryover_days numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.leave_balances.maternity_used IS
  'Days of maternity leave taken in `year`. Labour Act baseline is 12 weeks = 60 working days.';
COMMENT ON COLUMN public.leave_balances.paternity_used IS
  'Days of paternity leave taken in `year`. Common Nigerian practice: 5–14 days, company-defined.';
COMMENT ON COLUMN public.leave_balances.carryover_days IS
  'Annual days carried over from the prior year, after applying the company cap. Adds to the year''s effective quota.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Carryover rules + AWOL toggle on company_settings
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS leave_carryover_enabled    boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS leave_carryover_max_days   integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS awol_auto_flag_enabled     boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maternity_leave_days       integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS paternity_leave_days       integer NOT NULL DEFAULT 5;

COMMENT ON COLUMN public.company_settings.leave_carryover_enabled IS
  'When TRUE, unused annual leave at year-end rolls over up to leave_carryover_max_days.';
COMMENT ON COLUMN public.company_settings.awol_auto_flag_enabled IS
  'When TRUE, the daily flag_awol_yesterday() function records attendance.status=absent for any employee with no clock-in and no approved leave for yesterday.';
COMMENT ON COLUMN public.company_settings.maternity_leave_days IS
  'Working-day cap for maternity leave per year. Nigerian Labour Act baseline 60 (12 weeks).';
COMMENT ON COLUMN public.company_settings.paternity_leave_days IS
  'Working-day cap for paternity leave per year. Company-defined; common range 5–14.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. AWOL detection — daily function
-- ──────────────────────────────────────────────────────────────────────────
-- For each active employee:
--   if no attendance row exists for yesterday AND no approved leave
--   covering yesterday → insert attendance row with status='absent'
--   and notify their reporting manager (in-app notification).
--
-- Idempotent: ON CONFLICT (employee_id, work_date) DO NOTHING means
-- re-running the function doesn't duplicate attendance rows.
-- Operator can run on-demand: SELECT public.flag_awol_yesterday();

CREATE OR REPLACE FUNCTION public.flag_awol_yesterday()
RETURNS TABLE (employees_flagged integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_yesterday date := (CURRENT_DATE - INTERVAL '1 day')::date;
  v_count     integer := 0;
  v_enabled   boolean;
BEGIN
  SELECT awol_auto_flag_enabled INTO v_enabled
    FROM public.company_settings
   WHERE id = '00000000-0000-0000-0000-000000000001';
  IF NOT COALESCE(v_enabled, FALSE) THEN
    -- Feature off; no-op. Return 0 so callers can chart "0 flagged today".
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  WITH employees_missing_yesterday AS (
    SELECT p.id, p.reporting_manager_id, p.full_name
      FROM public.profiles p
     WHERE p.status = 'active'
       AND p.role  != 'driver'
       AND NOT EXISTS (
         SELECT 1 FROM public.attendance_records ar
          WHERE ar.employee_id = p.id AND ar.work_date = v_yesterday
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.leave_requests lr
          WHERE lr.employee_id = p.id
            AND lr.status = 'approved'
            AND v_yesterday BETWEEN lr.start_date AND lr.end_date
       )
  ), inserted AS (
    INSERT INTO public.attendance_records (employee_id, work_date, status, notes)
    SELECT id, v_yesterday, 'absent', 'Auto-flagged AWOL by daily scan'
      FROM employees_missing_yesterday
    ON CONFLICT (employee_id, work_date) DO NOTHING
    RETURNING employee_id
  )
  SELECT count(*)::integer INTO v_count FROM inserted;

  -- Notify each affected employee's manager (if any).
  INSERT INTO public.notifications (user_id, type, module, priority, title, body)
  SELECT p.reporting_manager_id,
         'awol_flag',
         'attendance',
         'high',
         'AWOL flag — ' || COALESCE(p.full_name, p.email),
         'No clock-in and no approved leave on ' || to_char(v_yesterday, 'DD Mon YYYY') || '. Please follow up.'
    FROM public.profiles p
   WHERE p.reporting_manager_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.attendance_records ar
        WHERE ar.employee_id = p.id
          AND ar.work_date   = v_yesterday
          AND ar.status      = 'absent'
          AND ar.notes       = 'Auto-flagged AWOL by daily scan'
     );

  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_awol_yesterday() TO authenticated;

COMMENT ON FUNCTION public.flag_awol_yesterday IS
  'Daily AWOL scanner. Honours the awol_auto_flag_enabled toggle. Idempotent on (employee_id, work_date). Notifies the reporting manager.';

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Schedule the AWOL scan to run every day at 09:00 WAT (08:00 UTC)
-- ──────────────────────────────────────────────────────────────────────────
-- Uses pg_cron. The schedule is registered unconditionally; the function
-- internally checks the company toggle, so flipping the toggle is enough
-- to enable/disable without touching cron.
DO $$
BEGIN
  -- Drop prior version if it exists, then schedule fresh.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'awol-daily-scan') THEN
    PERFORM cron.unschedule('awol-daily-scan');
  END IF;
  PERFORM cron.schedule(
    'awol-daily-scan',
    '0 8 * * *', -- 08:00 UTC = 09:00 WAT, weekdays included so Mon flags Sun
    $job$ SELECT public.flag_awol_yesterday(); $job$
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may not be available in local dev; non-fatal.
  RAISE NOTICE 'pg_cron not available — schedule the awol scan manually if you need it.';
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Helper view — currently-on-leave (for the leave calendar)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.leave_calendar_v AS
SELECT
  lr.id              AS leave_id,
  lr.employee_id,
  p.full_name        AS employee_name,
  p.email            AS employee_email,
  p.department_id,
  d.name             AS department_name,
  lr.leave_type,
  lr.start_date,
  lr.end_date,
  lr.days_requested,
  lr.status,
  lr.reason
FROM public.leave_requests lr
JOIN public.profiles p     ON p.id = lr.employee_id
LEFT JOIN public.departments d ON d.id = p.department_id
WHERE lr.status IN ('approved','pending');

GRANT SELECT ON public.leave_calendar_v TO authenticated;

COMMENT ON VIEW public.leave_calendar_v IS
  'Source for the team leave calendar. Includes approved + pending requests so managers can see who is OUT or about to be OUT.';
