-- =============================================================================
-- Sprint D (slim) — probation review auto-trigger + F&F enhancements
--
-- BACKWARD COMPATIBLE: all new behavior is gated behind nullable columns or
-- toggleable settings, defaulting to OFF or zero. Nothing in the existing
-- payroll, offboarding, or performance flows changes until the operator opts
-- into the new features.
--
-- What's in this migration:
--   1. company_settings.probation_review_enabled (default FALSE) — toggle for
--      the daily probation-due scanner.
--   2. company_settings.probation_period_days (default 90) — when a review
--      is considered "due" relative to start_date.
--   3. company_settings.gratuity_months_per_year (default 0) — months of
--      salary paid per completed year of service on offboarding. 0 = no
--      gratuity, which matches current behavior.
--   4. company_settings.last_month_prorated (default TRUE) — when the
--      offboarding last_working_day falls mid-month, the F&F calc adds
--      pro-rated salary for days worked that month.
--   5. profiles.probation_review_completed_at — nullable timestamp set when
--      HR records the probation review as completed; the scanner stops
--      flagging the employee afterwards.
--   6. check_probation_reviews_due() — daily scanner that notifies managers
--      and HR roles 14 days BEFORE the review is due. Idempotent — guarded
--      by probation_review_notified_at on the profile so the same employee
--      isn't paged twice in the same window.
--   7. pg_cron schedule "probation-daily-scan" at 07:30 UTC (08:30 WAT).
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Settings + profile flags
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS probation_review_enabled    boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS probation_period_days       integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS gratuity_months_per_year    numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_month_prorated         boolean NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.company_settings.probation_review_enabled IS
  'When TRUE, the daily check_probation_reviews_due() function notifies managers 14 days before a probation review is due. Default OFF.';
COMMENT ON COLUMN public.company_settings.probation_period_days IS
  'Length of probation in days from the employee''s start_date. Common Nigerian practice: 90 (3 months) or 180 (6 months).';
COMMENT ON COLUMN public.company_settings.gratuity_months_per_year IS
  'Months of salary paid as gratuity per completed year of service on offboarding. Default 0 (no gratuity).';
COMMENT ON COLUMN public.company_settings.last_month_prorated IS
  'When TRUE, F&F calc adds pro-rated salary for the days worked in the final month before last_working_day.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS probation_review_notified_at   timestamptz,
  ADD COLUMN IF NOT EXISTS probation_review_completed_at  timestamptz;

COMMENT ON COLUMN public.profiles.probation_review_notified_at IS
  'Set by check_probation_reviews_due() to prevent re-notifying the same employee within the 14-day window.';
COMMENT ON COLUMN public.profiles.probation_review_completed_at IS
  'Set by HR when the probation review is recorded. The scanner stops flagging the employee afterwards. Clearing this re-arms the scanner.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Probation review scanner — runs daily, notifies T-14d
-- ──────────────────────────────────────────────────────────────────────────
-- An employee qualifies for a probation reminder when:
--   employment_type = 'probation' (or its mixed-case variants)
--   status          = 'active'
--   start_date      IS NOT NULL
--   probation_review_completed_at IS NULL
--   today >= start_date + (probation_period_days - 14)
--   probation_review_notified_at IS NULL
--                  OR < start_date + (probation_period_days - 14)
--
-- Sends an in-app notification to the employee's reporting_manager_id (if
-- any) and to all super_admin / admin / operations users. Both layers so an
-- unassigned manager doesn't silently miss it.

CREATE OR REPLACE FUNCTION public.check_probation_reviews_due()
RETURNS TABLE (employees_notified integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled        boolean;
  v_probation_days integer;
  v_count          integer := 0;
BEGIN
  SELECT probation_review_enabled, probation_period_days
    INTO v_enabled, v_probation_days
    FROM public.company_settings
   WHERE id = '00000000-0000-0000-0000-000000000001';

  IF NOT COALESCE(v_enabled, FALSE) THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  -- Capture the set of employees to notify in one CTE so we can both
  -- write the notification rows and update probation_review_notified_at
  -- in a single transaction.
  WITH due AS (
    SELECT p.id            AS employee_id,
           p.full_name,
           p.email,
           p.reporting_manager_id,
           (p.start_date::date + (v_probation_days || ' days')::interval)::date AS review_due_date
      FROM public.profiles p
     WHERE p.status = 'active'
       AND p.employment_type ILIKE 'probation%'
       AND p.start_date IS NOT NULL
       AND p.probation_review_completed_at IS NULL
       AND (CURRENT_DATE >= (p.start_date::date + ((v_probation_days - 14) || ' days')::interval)::date)
       AND (
         p.probation_review_notified_at IS NULL
         OR p.probation_review_notified_at < (p.start_date::date + ((v_probation_days - 14) || ' days')::interval)::timestamptz
       )
  ),
  -- Notify the reporting manager (if set).
  ins_manager AS (
    INSERT INTO public.notifications (user_id, type, module, priority, title, body)
    SELECT due.reporting_manager_id,
           'probation_review_due',
           'hr',
           'high',
           'Probation review due — ' || COALESCE(due.full_name, due.email),
           'Probation period ends on ' || to_char(due.review_due_date, 'DD Mon YYYY')
             || '. Please complete the review and either confirm the role or extend probation.'
      FROM due
     WHERE due.reporting_manager_id IS NOT NULL
    RETURNING 1
  ),
  -- Belt-and-braces: also notify all super_admins / admins / operations
  -- so a missing manager assignment doesn't silently swallow the alert.
  ins_admins AS (
    INSERT INTO public.notifications (user_id, type, module, priority, title, body)
    SELECT a.id,
           'probation_review_due',
           'hr',
           'normal',
           'Probation review due — ' || COALESCE(d.full_name, d.email),
           'Probation period ends on ' || to_char(d.review_due_date, 'DD Mon YYYY') || '.'
      FROM due d
      JOIN public.profiles a ON a.role IN ('super_admin','admin','operations') AND a.status = 'active'
    RETURNING 1
  ),
  -- Stamp the profile so we don't re-page the same person.
  stamp AS (
    UPDATE public.profiles p
       SET probation_review_notified_at = now()
      FROM due
     WHERE p.id = due.employee_id
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_count FROM due;

  RETURN QUERY SELECT v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_probation_reviews_due() TO authenticated;

COMMENT ON FUNCTION public.check_probation_reviews_due IS
  'Daily probation review scanner. Honours probation_review_enabled toggle. Idempotent via probation_review_notified_at watermark. Notifies the reporting manager and admin roles 14 days before the probation period ends.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. View: employees currently on probation
-- ──────────────────────────────────────────────────────────────────────────
-- Powers an optional dashboard card so HR can see who's on probation, when
-- their review is due, and whether they've been notified yet.
CREATE OR REPLACE VIEW public.probation_employees_v AS
SELECT
  p.id                                  AS employee_id,
  p.full_name                           AS employee_name,
  p.email                               AS employee_email,
  p.job_title,
  p.department_id,
  d.name                                AS department_name,
  p.reporting_manager_id,
  m.full_name                           AS manager_name,
  p.start_date,
  (p.start_date::date + (COALESCE(cs.probation_period_days, 90) || ' days')::interval)::date AS review_due_date,
  p.probation_review_notified_at,
  p.probation_review_completed_at,
  CASE
    WHEN p.probation_review_completed_at IS NOT NULL THEN 'completed'
    WHEN CURRENT_DATE > (p.start_date::date + (COALESCE(cs.probation_period_days, 90) || ' days')::interval)::date THEN 'overdue'
    WHEN CURRENT_DATE >= (p.start_date::date + ((COALESCE(cs.probation_period_days, 90) - 14) || ' days')::interval)::date THEN 'due_soon'
    ELSE 'on_probation'
  END                                   AS state
FROM public.profiles p
LEFT JOIN public.profiles m         ON m.id = p.reporting_manager_id
LEFT JOIN public.departments d      ON d.id = p.department_id
CROSS JOIN LATERAL (
  SELECT probation_period_days
    FROM public.company_settings
   WHERE id = '00000000-0000-0000-0000-000000000001'
) cs
WHERE p.status = 'active'
  AND p.employment_type ILIKE 'probation%'
  AND p.start_date IS NOT NULL;

GRANT SELECT ON public.probation_employees_v TO authenticated;

COMMENT ON VIEW public.probation_employees_v IS
  'All active employees on probation, with their computed review_due_date and state (on_probation / due_soon / overdue / completed). Powers HR dashboards and the Probation Review widget.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Schedule the daily scan
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'probation-daily-scan') THEN
    PERFORM cron.unschedule('probation-daily-scan');
  END IF;
  PERFORM cron.schedule(
    'probation-daily-scan',
    '30 7 * * *', -- 07:30 UTC = 08:30 WAT
    $job$ SELECT public.check_probation_reviews_due(); $job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule the probation scan manually if you need it.';
END $$;
