-- Scheduled jobs: say WHY a job failed, and let an admin read the current errors.
--
--   * check_cron_health: the alert for a failed job now carries the database's own error text (first 240 characters), so the
--     Inbox item and the notification explain the failure instead of only saying that it failed.
--   * cron_last_errors(): the latest run of every job whose latest run failed, with the error text. Super Admin or Admin only.
--     Read only. (cron.job_run_details is not reachable from the app; this is the one safe window onto it.)
--
-- Rollback: re-apply check_cron_health from 20261003000500_cron_reliability_and_monitoring.sql and DROP FUNCTION public.cron_last_errors().

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
       ORDER BY start_time DESC
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
    JOIN LATERAL (SELECT r.* FROM cron.job_run_details r WHERE r.jobid = j.jobid ORDER BY r.start_time DESC LIMIT 1) d ON true
   WHERE d.status = 'failed'
   ORDER BY j.jobname;
END $$;
REVOKE ALL ON FUNCTION public.cron_last_errors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cron_last_errors() TO authenticated, service_role;
