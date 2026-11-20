-- Rollback: put back the version of agent_team_pulse from 20261430600000_reports_include_leadership.sql.
CREATE OR REPLACE FUNCTION public.agent_team_pulse()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_now timestamptz := now(); v_local timestamp; v_day date; v_start timestamptz; v_super boolean;
  v_sub uuid[]; v_exp uuid[]; v_last jsonb; v_working boolean; v_window boolean;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  v_super := public.agent_can_configure();
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := v_now AT TIME ZONE s.timezone; v_day := v_local::date; v_start := v_day::timestamp AT TIME ZONE s.timezone;
  v_working := extract(isodow FROM v_local)::integer = ANY (s.default_working_days)
               AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.holiday_date = v_day AND h.country_code = s.default_country_code AND h.is_observed IS NOT FALSE);
  v_window := v_local::time >= s.default_work_start AND v_local::time < s.default_work_end;
  SELECT coalesce(array_agg(x), '{}') INTO v_sub FROM public.agent_report_submitters(v_day) x;
  SELECT coalesce(array_agg(person_id), '{}') INTO v_exp FROM public.agent_team_today(v_now)
   WHERE expects_work AND coalesce(grp, '') <> 'placement' AND NOT exempt_reports;   -- leadership reports too, unless exempted in Agent Settings, People
  SELECT value INTO v_last FROM public.agent_monitor_state WHERE key = 'last_run';

  RETURN jsonb_build_object(
    'as_of', v_now, 'tz', s.timezone, 'day', v_day, 'working_day', v_working, 'in_work_window', v_window,
    'team_size', (SELECT count(*) FROM public.agent_team_v),
    'tracking_now', (SELECT count(DISTINCT employee_id) FROM agent_read.v_time_entries WHERE end_time IS NULL),
    'tracked_today', (SELECT count(DISTINCT employee_id) FROM agent_read.v_time_entries WHERE start_time >= v_start),
    'reports_in', (SELECT count(*) FROM unnest(v_exp) p WHERE p = ANY (v_sub)),
    'reports_expected', cardinality(v_exp),
    'reports_due_at', to_char(s.report_deadline, 'HH24:MI'),
    'overdue_tasks', (SELECT count(*) FROM agent_read.v_tasks WHERE parent_id IS NULL AND status <> 'done' AND due_date < v_day),
    'open_flags', (SELECT count(*) FROM public.agent_flags f WHERE f.status = 'open' AND (v_super OR public.agent_in_scope(f.company_id, f.module, f.person_id))),
    'high_flags', (SELECT count(*) FROM public.agent_flags f WHERE f.status = 'open' AND f.severity IN ('high', 'critical') AND (v_super OR public.agent_in_scope(f.company_id, f.module, f.person_id))),
    'last_run_at', v_last ->> 'at', 'last_run_ok', coalesce((v_last ->> 'ok')::boolean, false),
    'rules_active', (SELECT count(*) FROM public.agent_rules WHERE enabled),
    'dispatch_ready', public.agent_dispatch_ready()
  );
END $$;
