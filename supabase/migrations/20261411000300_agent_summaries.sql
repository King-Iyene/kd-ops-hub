-- Ops Agent v4 (4 of 5): summaries, written by the database on a schedule (no AI needed; the numbers are the point).
--
--   Daily    every working day at 6:30 PM Eastern: that day (after the 6 PM report deadline), plus a look at tomorrow.
--   Weekly   the last working day of each week at 6:30 PM: the week so far, Monday to that day.
--   Monthly  the last working day of the month at 6:30 PM: the month so far, through that day.
--
-- agent_run_summaries() is called every 10 minutes and is idempotent: it makes whatever is due and missing, so a late or missed
-- run catches up and nothing is ever made twice. agent_generate_summary(kind) is the "Generate now" button.
--
-- agent_summaries.metrics shape (all numbers, plus a few short lists of names; Super Admin only):
--   { "headline": text, "team_size": n, "working_days": n,
--     "tracking": { "expected_days": n, "tracked_days": n, "hours": x, "avg_hours_per_day": x, "low_days": n },
--     "tasks":    { "completed": n, "created": n, "overdue": n, "in_review": n, "blocked": n },
--     "reports":  { "expected": n, "submitted": n, "missing": [ {"person_id","name","days"} ] },
--     "flags":    { "opened": n, "high": n, "resolved": n, "open_now": n, "by_rule": { "TR01": n } },
--     "repeat":   [ {"person_id","name","rule","count"} ],
--     "sites":    [ {"domain","minutes","people"} ],
--     "tomorrow": { "due_tomorrow": n, "on_leave": n } }    (daily only)
--
-- Rollback: supabase/rollbacks/20261411_agent_v4_down.sql

CREATE OR REPLACE FUNCTION public.agent_is_working_day(p_day date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT extract(isodow FROM p_day)::integer = ANY (s.default_working_days)
         AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.holiday_date = p_day AND h.country_code = s.default_country_code AND h.is_observed IS NOT FALSE)
    FROM public.agent_settings s WHERE s.id
$$;

CREATE UNIQUE INDEX IF NOT EXISTS agent_summaries_auto_unique ON public.agent_summaries (period_kind, period_start, period_end) WHERE auto AND company_id IS NULL;

CREATE OR REPLACE FUNCTION public.agent_build_summary(p_kind text, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_tz text; v_team integer; v_days integer;
  v_exp_days integer; v_trk_days integer; v_mins numeric; v_low integer; v_rep_exp integer; v_rep_sub integer; v_missing jsonb;
  v_tasks jsonb; v_flags jsonb; v_repeat jsonb; v_sites jsonb; v_today jsonb := NULL; v_headline text; v_label text; v_body text; v_hours numeric;
  v_names text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_tz := s.timezone;
  SELECT count(*) INTO v_team FROM public.agent_team_v t WHERE coalesce(t.group_name, '') NOT IN ('placement', 'leadership');

  WITH days AS (SELECT g::date AS d FROM generate_series(p_start, p_end, interval '1 day') x(g) WHERE public.agent_is_working_day(g::date)),
  exp AS (
    SELECT days.d, t.person_id, t.full_name, t.exempt_time, t.exempt_reports
      FROM days CROSS JOIN LATERAL public.agent_team_today(((days.d::timestamp + interval '12 hours') AT TIME ZONE v_tz)) t
     WHERE t.expects_work AND coalesce(t.grp, '') NOT IN ('placement', 'leadership')
  ), mins AS (
    SELECT e.employee_id AS person_id, (e.start_time AT TIME ZONE v_tz)::date AS d,
           sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, e.start_time) - e.start_time)) / 60.0)) AS m
      FROM agent_read.v_time_entries e
     WHERE (e.start_time AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end GROUP BY 1, 2
  ), per AS (
    SELECT x.d, x.person_id, x.full_name, x.exempt_time, x.exempt_reports, coalesce(m.m, 0) AS m,
           EXISTS (SELECT 1 FROM public.agent_report_submitters(x.d) sub WHERE sub = x.person_id) AS reported
      FROM exp x LEFT JOIN mins m ON m.person_id = x.person_id AND m.d = x.d
  )
  SELECT (SELECT count(*) FROM days),
         count(*) FILTER (WHERE NOT exempt_time),
         count(*) FILTER (WHERE NOT exempt_time AND m > 0),
         coalesce(sum(m) FILTER (WHERE NOT exempt_time), 0),
         count(*) FILTER (WHERE NOT exempt_time AND m > 0 AND m < 0.5 * extract(epoch FROM (s.default_work_end - s.default_work_start)) / 60.0),
         count(*) FILTER (WHERE NOT exempt_reports),
         count(*) FILTER (WHERE NOT exempt_reports AND reported),
         coalesce((SELECT jsonb_agg(jsonb_build_object('person_id', q.person_id, 'name', q.full_name, 'days', q.n) ORDER BY q.n DESC, q.full_name)
                     FROM (SELECT person_id, full_name, count(*) AS n FROM per WHERE NOT exempt_reports AND NOT reported GROUP BY 1, 2 ORDER BY 3 DESC, 2 LIMIT 8) q), '[]'::jsonb)
    INTO v_days, v_exp_days, v_trk_days, v_mins, v_low, v_rep_exp, v_rep_sub, v_missing
    FROM per;

  v_hours := round(coalesce(v_mins, 0) / 60.0, 1);

  v_tasks := jsonb_build_object(
    'completed', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND (t.completed_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    'created',   (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND (t.created_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    'overdue',   (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status <> 'done' AND t.due_date <= p_end),
    'in_review', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status = 'in_review'),
    'blocked',   (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status = 'blocked'));

  v_flags := jsonb_build_object(
    'opened',   (SELECT count(*) FROM public.agent_flags f WHERE f.item_type = 'flag' AND f.rule_code <> 'SY03' AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    'high',     (SELECT count(*) FROM public.agent_flags f WHERE f.item_type = 'flag' AND f.severity IN ('high', 'critical') AND f.rule_code <> 'SY03' AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    'resolved', (SELECT count(*) FROM public.agent_flags f WHERE f.status IN ('handled', 'auto_resolved') AND (f.updated_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    'open_now', (SELECT count(*) FROM public.agent_flags f WHERE f.status = 'open' AND f.item_type = 'flag'),
    'by_rule',  coalesce((SELECT jsonb_object_agg(rule_code, n) FROM (SELECT f.rule_code, count(*) AS n FROM public.agent_flags f
                   WHERE f.item_type = 'flag' AND f.rule_code <> 'SY03' AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end GROUP BY 1) r), '{}'::jsonb));

  v_repeat := coalesce((SELECT jsonb_agg(jsonb_build_object('person_id', r.person_id, 'name', r.name, 'rule', r.rule_code, 'count', r.n) ORDER BY r.n DESC, r.name)
                          FROM (SELECT f.person_id, p.full_name AS name, f.rule_code, count(*) AS n FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id
                                 WHERE f.item_type = 'flag' AND f.rule_code NOT IN ('SY03', 'TK14', 'TK13') AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end
                                 GROUP BY 1, 2, 3 HAVING count(*) >= CASE WHEN p_end - p_start >= 6 THEN 3 ELSE 2 END ORDER BY n DESC LIMIT 6) r), '[]'::jsonb);

  v_sites := coalesce((SELECT jsonb_agg(jsonb_build_object('domain', x.domain, 'minutes', x.mins, 'people', x.people) ORDER BY x.mins DESC)
                         FROM (SELECT e ->> 'domain' AS domain, round(sum((e ->> 'seconds')::numeric) / 60) AS mins, count(DISTINCT f.person_id) AS people
                                 FROM public.agent_flags f CROSS JOIN LATERAL jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) e
                                WHERE f.rule_code = 'TR05' AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end AND e ->> 'domain' IS NOT NULL
                                GROUP BY 1 ORDER BY 2 DESC LIMIT 6) x), '[]'::jsonb);

  IF p_kind = 'day' THEN
    v_today := jsonb_build_object(
      'due_tomorrow', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status <> 'done' AND t.due_date = p_end + 1),
      'on_leave', (SELECT count(DISTINCT l.employee_id) FROM agent_read.v_leave l WHERE p_end + 1 BETWEEN l.start_date AND l.end_date));
  END IF;

  v_label := CASE p_kind WHEN 'day' THEN to_char(p_start, 'FMDay, FMMon FMDD') WHEN 'week' THEN 'Week of ' || to_char(p_start, 'FMMon FMDD') || ' to ' || to_char(p_end, 'FMMon FMDD')
                         ELSE to_char(p_start, 'FMMonth YYYY') END;
  v_headline := format('%s: %s of %s expected person-days had time tracked (%s h in total); %s of %s daily reports were in; %s items opened, %s high priority.',
                       v_label, v_trk_days, v_exp_days, v_hours, v_rep_sub, v_rep_exp, v_flags ->> 'opened', v_flags ->> 'high');

  v_body := '## ' || v_label || E'\n\n' ||
    '**Tracking.** ' || v_trk_days || ' of ' || v_exp_days || ' expected person-days had time tracked, ' || v_hours || ' hours in all'
      || CASE WHEN v_trk_days > 0 THEN ' (' || round(v_hours / v_trk_days, 1) || ' h on a tracked day)' ELSE '' END
      || CASE WHEN v_low > 0 THEN '; ' || v_low || ' tracked day' || CASE WHEN v_low = 1 THEN '' ELSE 's' END || ' were under half a work day' ELSE '' END || E'.\n\n' ||
    '**Reports.** ' || v_rep_sub || ' of ' || v_rep_exp || ' daily reports were sent'
      || CASE WHEN jsonb_array_length(v_missing) > 0 THEN '. Most missed: ' ||
           (SELECT string_agg((m ->> 'name') || ' (' || (m ->> 'days') || ')', ', ') FROM (SELECT m FROM jsonb_array_elements(v_missing) m LIMIT 5) q(m)) ELSE '' END || E'.\n\n' ||
    '**Tasks.** ' || (v_tasks ->> 'completed') || ' completed, ' || (v_tasks ->> 'created') || ' created. Right now ' || (v_tasks ->> 'overdue') || ' are overdue, '
      || (v_tasks ->> 'in_review') || ' waiting in review and ' || (v_tasks ->> 'blocked') || E' blocked.\n\n' ||
    '**Inbox.** ' || (v_flags ->> 'opened') || ' items opened (' || (v_flags ->> 'high') || ' high), ' || (v_flags ->> 'resolved') || ' closed, ' || (v_flags ->> 'open_now') || ' open now.';

  IF jsonb_array_length(v_repeat) > 0 THEN
    SELECT string_agg((r ->> 'name') || ': ' || (r ->> 'rule') || ' x' || (r ->> 'count'), '; ') INTO v_names FROM jsonb_array_elements(v_repeat) r;
    v_body := v_body || E'\n\n**Keeps happening.** ' || v_names || '.';
  END IF;
  IF jsonb_array_length(v_sites) > 0 THEN
    SELECT string_agg((x ->> 'domain') || ' (' || (x ->> 'minutes') || ' min)', ', ') INTO v_names FROM jsonb_array_elements(v_sites) x;
    v_body := v_body || E'\n\n**Sites flagged.** ' || v_names || '.';
  END IF;
  IF v_today IS NOT NULL THEN
    v_body := v_body || E'\n\n**Tomorrow.** ' || (v_today ->> 'due_tomorrow') || ' tasks are due and ' || (v_today ->> 'on_leave') || ' people are on leave.';
  END IF;

  RETURN jsonb_build_object('narrative', v_body, 'metrics', jsonb_build_object(
    'headline', v_headline, 'team_size', v_team, 'working_days', v_days,
    'tracking', jsonb_build_object('expected_days', v_exp_days, 'tracked_days', v_trk_days, 'hours', v_hours,
                                   'avg_hours_per_day', CASE WHEN v_trk_days > 0 THEN round(v_hours / v_trk_days, 1) ELSE 0 END, 'low_days', v_low),
    'tasks', v_tasks, 'reports', jsonb_build_object('expected', v_rep_exp, 'submitted', v_rep_sub, 'missing', v_missing),
    'flags', v_flags, 'repeat', v_repeat, 'sites', v_sites, 'tomorrow', v_today));
END $$;

-- Makes one summary if it does not exist yet. Returns true when it was made.
CREATE OR REPLACE FUNCTION public.agent_make_summary(p_kind text, p_start date, p_end date, p_auto boolean DEFAULT true, p_by uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b jsonb; v_id uuid;
BEGIN
  b := public.agent_build_summary(p_kind, p_start, p_end);
  INSERT INTO public.agent_summaries (period_kind, period_start, period_end, company_id, metrics, narrative, model, auto, generated_by)
  VALUES (p_kind, p_start, p_end, NULL, b -> 'metrics', b ->> 'narrative', NULL, p_auto, p_by)
  ON CONFLICT (period_kind, period_start, period_end) WHERE auto AND company_id IS NULL
  DO UPDATE SET metrics = EXCLUDED.metrics, narrative = EXCLUDED.narrative
   WHERE p_auto AND false   -- an automatic summary is never rewritten
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END $$;

-- The scheduled part: what is due at this moment.
CREATE OR REPLACE FUNCTION public.agent_run_summaries(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_local timestamp; v_today date; v_mon date; v_made text[] := '{}'; v_i integer; v_last_week boolean := true; v_last_month boolean := true;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('agent_run_summaries')) THEN RETURN jsonb_build_object('skipped', true); END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone;
  v_today := v_local::date;
  IF v_local::time < time '18:30' OR NOT public.agent_is_working_day(v_today) THEN RETURN jsonb_build_object('made', v_made); END IF;

  -- Daily: today
  IF public.agent_make_summary('day', v_today, v_today) THEN v_made := v_made || ARRAY['day']; END IF;

  -- Weekly: the last working day of the week writes up the week so far
  v_mon := v_today - (extract(isodow FROM v_today)::integer - 1);
  FOR v_i IN 1..(7 - extract(isodow FROM v_today)::integer) LOOP
    IF public.agent_is_working_day(v_today + v_i) THEN v_last_week := false; END IF;
  END LOOP;
  IF v_last_week AND public.agent_make_summary('week', v_mon, v_today) THEN v_made := v_made || ARRAY['week']; END IF;

  -- Monthly: the last working day of the month writes up the month through today
  FOR v_i IN 1..31 LOOP
    EXIT WHEN date_trunc('month', v_today + v_i) <> date_trunc('month', v_today);
    IF public.agent_is_working_day(v_today + v_i) THEN v_last_month := false; END IF;
  END LOOP;
  IF v_last_month AND public.agent_make_summary('month', date_trunc('month', v_today)::date, v_today) THEN v_made := v_made || ARRAY['month']; END IF;

  RETURN jsonb_build_object('made', to_jsonb(v_made));
END $$;

-- "Generate now": the current period of a kind, through today, made by a person (a new one each press, marked not automatic).
CREATE OR REPLACE FUNCTION public.agent_generate_summary(p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_today date; v_start date; v_end date; b jsonb; v_id uuid;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF p_kind NOT IN ('day', 'week', 'month') THEN RAISE EXCEPTION 'bad_kind' USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_today := (now() AT TIME ZONE s.timezone)::date;
  v_end := v_today;
  IF p_kind = 'day' THEN v_start := v_today;
  ELSIF p_kind = 'week' THEN v_start := v_today - (extract(isodow FROM v_today)::integer - 1);
  ELSE v_start := date_trunc('month', v_today)::date; END IF;
  b := public.agent_build_summary(p_kind, v_start, v_end);
  INSERT INTO public.agent_summaries (period_kind, period_start, period_end, company_id, metrics, narrative, auto, generated_by)
  VALUES (p_kind, v_start, v_end, NULL, b -> 'metrics', b ->> 'narrative', false, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.agent_is_working_day(date), public.agent_build_summary(text, date, date), public.agent_make_summary(text, date, date, boolean, uuid),
  public.agent_run_summaries(timestamptz), public.agent_generate_summary(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_is_working_day(date), public.agent_build_summary(text, date, date), public.agent_make_summary(text, date, date, boolean, uuid), public.agent_run_summaries(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.agent_generate_summary(text) TO authenticated, service_role;

-- ── Every 10 minutes: make what is due ────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agent_summaries') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent_summaries');
    PERFORM cron.schedule('agent_summaries', '*/10 * * * *', 'SELECT public.agent_run_summaries()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed here: agent_summaries was not scheduled';
  END IF;
  IF to_regclass('public.cron_job_expectations') IS NOT NULL THEN
    INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes)
    VALUES ('agent_summaries', 'Ops Agent: daily 6:30 PM, weekly and monthly summaries (checks every 10 minutes)', 30)
    ON CONFLICT (job_name) DO UPDATE SET description = EXCLUDED.description, max_gap_minutes = EXCLUDED.max_gap_minutes;
  END IF;
END $$;
