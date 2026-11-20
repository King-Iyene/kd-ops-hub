-- Scheduled jobs that were really failing (found from the error text the health check now carries):
--   * notify_expiring_overrides: EXTRACT(DAY FROM date - date) fails because that subtraction is already a whole number of days.
--     It now uses the number directly. (Failed every morning since the function was written.)
--   * flag_awol_yesterday: a profile with no sign-in account made the whole scan fail on the attendance foreign key.
--     Those profiles are skipped; everyone else is scanned.
--   * check_cron_health / cron_last_errors: a run row with no start time ("server restarted") sorted first, so batch-worker-tick showed as
--     failed forever, whatever it did afterwards. Runs without a start time are now sorted last.
-- Not touched (needs a person): webhook-retry-tick (pg_net rejects the request: check the Vault secret webhook_retry_worker_url for a stray
-- space, newline or quote) and weekly-fleet-budget-reset (public.fleet_budget_cycles does not exist in production).
--
-- Rollback: re-apply the functions from 20260814000000_transfer_auth_b3_b5_m1_m5.sql, _pre_applied/20260812000000_sprint_c_leave_attendance.sql
-- and 20261427000000_cron_failure_reasons.sql.

CREATE OR REPLACE FUNCTION public.notify_expiring_overrides()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec         record;
  v_sa          record;
  v_notif_count integer := 0;
  v_body        text;
  v_title       text;
  v_days_left   int;
  v_today       date := CURRENT_DATE;
BEGIN
  -- Iterate over user-level overrides expiring in 7 days, 1 day, or today.
  FOR v_rec IN
    SELECT
      tl.id,
      tl.user_id,
      tl.expires_at,
      tl.granted_reason,
      COALESCE(p.full_name, p.email, tl.user_id::text) AS target_name,
      (tl.expires_at::date - v_today)::int AS days_left
    FROM public.transfer_limits tl
    LEFT JOIN public.profiles p ON p.id = tl.user_id
    WHERE tl.user_id IS NOT NULL
      AND tl.expires_at IS NOT NULL
      AND tl.expires_at::date IN (
        v_today + interval '7 days',
        v_today + interval '1 day',
        v_today
      )
  LOOP
    v_days_left := v_rec.days_left;

    v_title := format('Transfer override expiring %s',
      CASE v_days_left
        WHEN 0 THEN 'today'
        WHEN 1 THEN 'tomorrow'
        ELSE format('in %s days', v_days_left)
      END
    );

    v_body := format('The transfer limit override for %s%s expires %s.',
      v_rec.target_name,
      CASE
        WHEN v_rec.granted_reason IS NOT NULL
        THEN format(' (reason: %s)', left(v_rec.granted_reason, 80))
        ELSE ''
      END,
      CASE v_days_left
        WHEN 0 THEN 'today'
        WHEN 1 THEN 'tomorrow'
        ELSE format('in %s days', v_days_left)
      END
    );

    -- Notify each active super_admin once per check — skip if we already
    -- inserted the same (type, title, user_id) within the last 23 hours
    -- to avoid duplicate noise on hourly re-runs.
    FOR v_sa IN
      SELECT id FROM public.profiles
       WHERE role = 'super_admin'
         AND COALESCE(status, 'active') = 'active'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = v_sa.id
           AND type    = 'transfer_limit_expiry'
           AND title   = v_title
           AND created_at >= now() - interval '23 hours'
      ) THEN
        INSERT INTO public.notifications (
          user_id, type, module, priority, title, body, link
        ) VALUES (
          v_sa.id,
          'transfer_limit_expiry',
          'settings',
          'high',
          v_title,
          v_body,
          '/settings/transfer-authorization'
        );
        v_notif_count := v_notif_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_notif_count;
END;
$$;

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
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)   -- a profile with no sign-in account cannot have attendance (foreign key)
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

CREATE OR REPLACE FUNCTION public.check_cron_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  exp        RECORD;
  v_job      RECORD;
  v_last_run RECORD;
  v_issue    text;
  v_detail   text;
  v_open_cnt int;
  admin_user RECORD;
BEGIN
  FOR exp IN SELECT * FROM public.cron_job_expectations LOOP
    v_issue := NULL;
    v_detail := NULL;

    SELECT jobid, active INTO v_job FROM cron.job WHERE jobname = exp.job_name;

    IF NOT FOUND THEN
      v_issue := 'missing';
      v_detail := 'No cron.job row for this job name — it is not registered at all.';
    ELSIF NOT v_job.active THEN
      v_issue := 'inactive';
      v_detail := 'cron.job.active = false — registered but disabled.';
    ELSE
      SELECT status, start_time, return_message INTO v_last_run
        FROM cron.job_run_details
       WHERE jobid = v_job.jobid
       ORDER BY start_time DESC NULLS LAST
       LIMIT 1;

      IF FOUND AND v_last_run.status = 'failed' THEN
        v_issue := 'failed';
        v_detail := 'Last run at ' || v_last_run.start_time || ' failed.' || coalesce(' Error: ' || nullif(left(regexp_replace(v_last_run.return_message, '\s+', ' ', 'g'), 240), ''), '');
      ELSIF FOUND AND v_last_run.start_time < now() - (exp.max_gap_minutes || ' minutes')::interval THEN
        v_issue := 'stale';
        v_detail := 'Last run at ' || v_last_run.start_time || ', expected within ' || exp.max_gap_minutes || ' minutes.';
      ELSIF NOT FOUND THEN
        -- Registered but cron.job_run_details has no history yet — only
        -- flag once the job is old enough that it should have run by now.
        IF exp.created_at < now() - (exp.max_gap_minutes || ' minutes')::interval THEN
          v_issue := 'stale';
          v_detail := 'Registered but has never run.';
        END IF;
      END IF;
    END IF;

    IF v_issue IS NOT NULL THEN
      -- De-dupe: only insert if there isn't already an open (unresolved)
      -- alert of the same kind for this job.
      SELECT count(*) INTO v_open_cnt
        FROM public.cron_job_alerts
       WHERE job_name = exp.job_name AND issue = v_issue AND resolved_at IS NULL;

      IF v_open_cnt = 0 THEN
        INSERT INTO public.cron_job_alerts (job_name, issue, detail)
        VALUES (exp.job_name, v_issue, v_detail);

        FOR admin_user IN
          SELECT id FROM public.profiles
          WHERE role IN ('super_admin', 'admin')
            AND COALESCE(status, 'active') = 'active'
        LOOP
          INSERT INTO public.notifications (user_id, type, module, priority, title, body)
          VALUES (
            admin_user.id,
            'cron_job_alert',
            'ops',
            'high',
            'Scheduled job "' || exp.job_name || '" is ' || v_issue,
            COALESCE(v_detail, exp.description)
          );
        END LOOP;
      END IF;
    ELSE
      -- Healthy now — auto-resolve any previously open alerts for this job.
      UPDATE public.cron_job_alerts
         SET resolved_at = now()
       WHERE job_name = exp.job_name AND resolved_at IS NULL;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cron_last_errors()
RETURNS TABLE (job_name text, started_at timestamptz, status text, error text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('super_admin', 'admin')) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT j.jobname::text, d.start_time, d.status::text, left(regexp_replace(coalesce(d.return_message, ''), '\s+', ' ', 'g'), 400)
    FROM cron.job j
    JOIN LATERAL (SELECT r.* FROM cron.job_run_details r WHERE r.jobid = j.jobid ORDER BY r.start_time DESC NULLS LAST LIMIT 1) d ON true
   WHERE d.status = 'failed'
   ORDER BY j.jobname;
END $$;
