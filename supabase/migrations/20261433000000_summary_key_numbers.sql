-- Ops Agent: weekly and monthly summaries lead with the numbers that matter, not raw person-days.
--
--   Tracking   how many people tracked consistently (on at least 80% of their working days), how many tracked nothing, hours against expected hours.
--   Reports    how many people reported consistently (same 80% rule), how many sent none, reports sent against expected.
--   Tasks      how many were opened and closed, the completion rate (closed of the work in play: already open at the start plus opened in the period),
--              how many were closed on time, how the open count moved, overdue now, how long a closed task took, who closed the most.
--   Compared   with the same figures for the period before (last week, last month).
-- Who is expected is the Inbox rule: the team who work each day minus placed staff; exemptions (Settings, People) are read live.
-- The daily summary keeps its day figures. The recent weekly and monthly summaries are rebuilt at the end of this file.
--
-- summaries.metrics gains:  kpis { threshold, trackers_total, trackers_consistent, trackers_none, trackers_inconsistent[{person_id,name,days,expected}],
--   reporters_*, reports_sent, reports_expected, hours, expected_hours, hours_pct, avg_hours_per_day,
--   tasks { opened, closed, open_start, open_end, workload, completion_rate, on_time_n, on_time_rate, avg_days_to_close, overdue_now, top_closers[{name,closed}] } }
--   and  previous  (the same shape for the period before).
--
-- Rollback: re-apply agent_build_summary from 20261432000000_summary_stats_match_inbox.sql and drop agent_period_kpis.

CREATE OR REPLACE FUNCTION public.agent_period_kpis(p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_tz text; v_wh numeric; v_today date; v_from timestamptz; v_to timestamptz; v_thr constant numeric := 0.8;
  v_tt integer; v_tc integer; v_tn integer; v_tl jsonb; v_rt integer; v_rc integer; v_rn integer; v_rl jsonb;
  v_texp numeric; v_tdays integer; v_mins numeric; v_rexp integer; v_rsub integer; v_ehours numeric; v_hours numeric;
  v_os integer; v_op integer; v_cl integer; v_oe integer; v_dn integer; v_dok integer; v_avg numeric; v_over integer; v_top jsonb; v_rate integer; v_work integer; v_ontime integer;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_tz := s.timezone;
  v_wh := extract(epoch FROM (s.default_work_end - s.default_work_start)) / 3600.0;
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_from := p_start::timestamp AT TIME ZONE v_tz;
  v_to := (p_end + 1)::timestamp AT TIME ZONE v_tz;

  WITH days AS (SELECT g::date AS d FROM generate_series(p_start, p_end, interval '1 day') x(g) WHERE public.agent_is_working_day(g::date)),
  exp AS (
    SELECT days.d, t.person_id, t.full_name, t.exempt_time, t.exempt_reports
      FROM days CROSS JOIN LATERAL public.agent_team_today(((days.d::timestamp + interval '12 hours') AT TIME ZONE v_tz)) t
     WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement'
  ), mins AS (
    SELECT e.employee_id AS person_id, (e.start_time AT TIME ZONE v_tz)::date AS d,
           sum(coalesce(e.duration_minutes, extract(epoch FROM (least(coalesce(e.end_time, now()), e.start_time + interval '12 hours') - e.start_time)) / 60.0)) AS m
      FROM agent_read.v_time_entries e
     WHERE (e.start_time AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end GROUP BY 1, 2
  ), per AS (
    SELECT x.d, x.person_id, x.full_name, x.exempt_time, x.exempt_reports, coalesce(m.m, 0) AS m,
           EXISTS (SELECT 1 FROM public.agent_report_submitters(x.d) sub WHERE sub = x.person_id) AS reported
      FROM exp x LEFT JOIN mins m ON m.person_id = x.person_id AND m.d = x.d
  ), ppl AS (
    SELECT person_id, full_name,
           count(*) FILTER (WHERE NOT exempt_time) AS t_exp,
           count(*) FILTER (WHERE NOT exempt_time AND m > 0) AS t_days,
           coalesce(sum(m) FILTER (WHERE NOT exempt_time), 0) AS mins,
           count(*) FILTER (WHERE NOT exempt_reports) AS r_exp,
           count(*) FILTER (WHERE NOT exempt_reports AND reported) AS r_days
      FROM per GROUP BY 1, 2
  )
  SELECT count(*) FILTER (WHERE t_exp > 0),
         count(*) FILTER (WHERE t_exp > 0 AND t_days >= v_thr * t_exp),
         count(*) FILTER (WHERE t_exp > 0 AND t_days = 0),
         coalesce((SELECT jsonb_agg(jsonb_build_object('person_id', q.person_id, 'name', q.full_name, 'days', q.t_days, 'expected', q.t_exp) ORDER BY q.t_days::numeric / q.t_exp, q.full_name)
                     FROM (SELECT * FROM ppl WHERE t_exp > 0 AND t_days < v_thr * t_exp ORDER BY t_days::numeric / t_exp, full_name LIMIT 8) q), '[]'::jsonb),
         count(*) FILTER (WHERE r_exp > 0),
         count(*) FILTER (WHERE r_exp > 0 AND r_days >= v_thr * r_exp),
         count(*) FILTER (WHERE r_exp > 0 AND r_days = 0),
         coalesce((SELECT jsonb_agg(jsonb_build_object('person_id', q.person_id, 'name', q.full_name, 'days', q.r_days, 'expected', q.r_exp) ORDER BY q.r_days::numeric / q.r_exp, q.full_name)
                     FROM (SELECT * FROM ppl WHERE r_exp > 0 AND r_days < v_thr * r_exp ORDER BY r_days::numeric / r_exp, full_name LIMIT 8) q), '[]'::jsonb),
         coalesce(sum(t_exp), 0), coalesce(sum(t_days), 0), coalesce(sum(mins), 0), coalesce(sum(r_exp), 0), coalesce(sum(r_days), 0)
    INTO v_tt, v_tc, v_tn, v_tl, v_rt, v_rc, v_rn, v_rl, v_texp, v_tdays, v_mins, v_rexp, v_rsub
    FROM ppl;

  v_ehours := round(v_texp * v_wh, 1);
  v_hours := round(v_mins / 60.0, 1);

  -- Tasks (top-level, the team's). A task counts as closed when it is done; the time it was closed falls back to its last update if none was stamped.
  WITH t AS (
    SELECT k.created_at, k.due_date, k.assignee_id,
           CASE WHEN k.status = 'done' THEN coalesce(k.completed_at, k.updated_at) END AS done_at, k.status
      FROM agent_read.v_tasks k WHERE k.parent_id IS NULL
  )
  SELECT count(*) FILTER (WHERE created_at < v_from AND (status <> 'done' OR done_at >= v_from)),
         count(*) FILTER (WHERE created_at >= v_from AND created_at < v_to),
         count(*) FILTER (WHERE done_at >= v_from AND done_at < v_to),
         count(*) FILTER (WHERE created_at < v_to AND (status <> 'done' OR done_at >= v_to)),
         count(*) FILTER (WHERE done_at >= v_from AND done_at < v_to AND due_date IS NOT NULL),
         count(*) FILTER (WHERE done_at >= v_from AND done_at < v_to AND due_date IS NOT NULL AND (done_at AT TIME ZONE v_tz)::date <= due_date),
         round((avg(extract(epoch FROM (done_at - created_at)) / 86400.0) FILTER (WHERE done_at >= v_from AND done_at < v_to))::numeric, 1),
         count(*) FILTER (WHERE status <> 'done' AND due_date < least(p_end, v_today))
    INTO v_os, v_op, v_cl, v_oe, v_dn, v_dok, v_avg, v_over
    FROM t;
  v_work := v_os + v_op;
  v_rate := CASE WHEN v_work > 0 THEN round(100.0 * v_cl / v_work)::integer END;
  v_ontime := CASE WHEN v_dn > 0 THEN round(100.0 * v_dok / v_dn)::integer END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', q.name, 'closed', q.n) ORDER BY q.n DESC, q.name), '[]'::jsonb) INTO v_top
    FROM (SELECT tm.full_name AS name, count(*) AS n
            FROM agent_read.v_tasks k JOIN public.agent_team_v tm ON tm.person_id = k.assignee_id
           WHERE k.parent_id IS NULL AND k.status = 'done' AND coalesce(k.completed_at, k.updated_at) >= v_from AND coalesce(k.completed_at, k.updated_at) < v_to
           GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 3) q;

  RETURN jsonb_build_object(
    'threshold', round(v_thr * 100),
    'trackers_total', v_tt, 'trackers_consistent', v_tc, 'trackers_none', v_tn, 'trackers_inconsistent', v_tl,
    'reporters_total', v_rt, 'reporters_consistent', v_rc, 'reporters_none', v_rn, 'reporters_inconsistent', v_rl,
    'reports_sent', v_rsub, 'reports_expected', v_rexp,
    'hours', v_hours, 'expected_hours', v_ehours, 'hours_pct', CASE WHEN v_ehours > 0 THEN round(100.0 * v_hours / v_ehours)::integer END,
    'avg_hours_per_day', CASE WHEN v_tdays > 0 THEN round(v_mins / 60.0 / v_tdays, 1) ELSE 0 END,
    'tasks', jsonb_build_object('opened', v_op, 'closed', v_cl, 'open_start', v_os, 'open_end', v_oe, 'workload', v_work, 'completion_rate', v_rate,
                                'on_time_n', v_dn, 'on_time_rate', v_ontime, 'avg_days_to_close', v_avg, 'overdue_now', v_over, 'top_closers', v_top));
END $$;

CREATE OR REPLACE FUNCTION public.agent_build_summary(p_kind text, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_tz text; v_team integer; v_days integer; v_today_local date;
  v_exp_days integer; v_trk_days integer; v_mins numeric; v_low integer; v_rep_exp integer; v_rep_sub integer; v_missing jsonb;
  v_tasks jsonb; v_flags jsonb; v_repeat jsonb; v_sites jsonb; v_today jsonb := NULL; v_headline text; v_label text; v_body text; v_hours numeric;
  v_names text; v_from timestamptz; v_to timestamptz; v_opened integer; v_high integer; v_by jsonb; v_other integer;
  v_k jsonb := NULL; v_pk jsonb := NULL; v_prev_start date; v_prev_end date; v_unit text; v_tk jsonb; v_cmp_t text; v_cmp_r text; v_cmp_k text; v_top text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_tz := s.timezone;
  v_today_local := (now() AT TIME ZONE v_tz)::date;
  v_from := p_start::timestamp AT TIME ZONE v_tz;
  v_to := (p_end + 1)::timestamp AT TIME ZONE v_tz;
  SELECT count(*) INTO v_team FROM public.agent_team_v t WHERE coalesce(t.group_name, '') <> 'placement';

  -- Who was expected each working day: the whole team who work that day (leadership included) except placed staff.
  WITH days AS (SELECT g::date AS d FROM generate_series(p_start, p_end, interval '1 day') x(g) WHERE public.agent_is_working_day(g::date)),
  exp AS (
    SELECT days.d, t.person_id, t.full_name, t.exempt_time, t.exempt_reports
      FROM days CROSS JOIN LATERAL public.agent_team_today(((days.d::timestamp + interval '12 hours') AT TIME ZONE v_tz)) t
     WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement'
  ), mins AS (
    -- a timer still running counts up to now (never more than 12 hours from its start)
    SELECT e.employee_id AS person_id, (e.start_time AT TIME ZONE v_tz)::date AS d,
           sum(coalesce(e.duration_minutes, extract(epoch FROM (least(coalesce(e.end_time, now()), e.start_time + interval '12 hours') - e.start_time)) / 60.0)) AS m
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
    'completed', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status = 'done' AND (t.completed_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    'created',   (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND (t.created_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    -- overdue the way the Inbox counts it: not done, and the due date has passed (a task due today is not overdue yet)
    'overdue',   (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status <> 'done' AND t.due_date < least(p_end, v_today_local)),
    'in_review', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status = 'in_review'),
    'blocked',   (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status = 'blocked'));

  -- The team's items (tasks, tracking, reports): the ones that are sent to Cliq and other tools. A tracking item about a site that has since
  -- been marked productive is not counted.
  WITH fl AS (
    SELECT f.rule_code, f.severity FROM public.agent_flags f
     WHERE f.item_type = 'flag' AND public.agent_is_team_rule(f.rule_code) AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end
       AND (f.rule_code <> 'TR05' OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) e
                                              WHERE public.agent_site_class(e ->> 'domain', e ->> 'category') IS DISTINCT FROM 'productive'))
  )
  SELECT count(*), count(*) FILTER (WHERE severity IN ('high', 'critical')),
         coalesce((SELECT jsonb_object_agg(q.rule_code, q.n) FROM (SELECT rule_code, count(*) AS n FROM fl GROUP BY 1) q), '{}'::jsonb)
    INTO v_opened, v_high, v_by FROM fl;
  SELECT count(*) INTO v_other FROM public.agent_flags f
   WHERE f.item_type = 'flag' AND NOT public.agent_is_team_rule(f.rule_code) AND f.rule_code <> 'SY03' AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end;

  v_flags := jsonb_build_object(
    'opened', v_opened, 'high', v_high, 'other_opened', v_other, 'by_rule', v_by,
    'resolved', (SELECT count(*) FROM public.agent_flags f WHERE f.status IN ('handled', 'auto_resolved') AND public.agent_is_team_rule(f.rule_code)
                  AND (f.updated_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end),
    'open_now', (SELECT count(*) FROM public.agent_flags f WHERE f.status = 'open'));   -- what the Inbox shows right now, the same as its tile

  v_repeat := coalesce((SELECT jsonb_agg(jsonb_build_object('person_id', r.person_id, 'name', r.name, 'rule', r.rule_code, 'count', r.n) ORDER BY r.n DESC, r.name)
                          FROM (SELECT f.person_id, p.full_name AS name, f.rule_code, count(*) AS n FROM public.agent_flags f JOIN public.profiles p ON p.id = f.person_id
                                 WHERE f.item_type = 'flag' AND public.agent_is_team_rule(f.rule_code) AND f.rule_code NOT IN ('TK14', 'TK13') AND (f.first_seen_at AT TIME ZONE v_tz)::date BETWEEN p_start AND p_end
                                 GROUP BY 1, 2, 3 HAVING count(*) >= CASE WHEN p_end - p_start >= 6 THEN 3 ELSE 2 END ORDER BY n DESC LIMIT 6) r), '[]'::jsonb);

  -- Sites, read live: unproductive ones (yours first, then Track's), and unfamiliar ones nobody has classified. Marked productive = not listed.
  WITH caps AS (
    SELECT a.employee_id, a.domain, a.productivity_category AS cat, (a.captured_at AT TIME ZONE v_tz)::date AS d
      FROM agent_read.v_activity_domains a
      JOIN public.agent_team_v t ON t.person_id = a.employee_id AND coalesce(t.group_name, '') <> 'placement'
     WHERE a.captured_at >= v_from AND a.captured_at < v_to AND a.domain IS NOT NULL
  ), per AS (
    SELECT c.d, c.employee_id, c.domain, count(*) AS captures,
           coalesce(bool_or(public.agent_site_class(c.domain, c.cat) = 'unproductive'), false) AS unprod,
           coalesce(bool_or(public.agent_site_class(c.domain, c.cat) = 'productive'), false) AS fine
      FROM caps c GROUP BY 1, 2, 3
  ), common AS (
    SELECT d, domain FROM per GROUP BY 1, 2 HAVING count(DISTINCT employee_id) >= 3
  ), shown AS (
    SELECT p.* FROM per p
     WHERE p.unprod OR (NOT p.fine AND p.captures >= 2 AND NOT EXISTS (SELECT 1 FROM common c WHERE c.d = p.d AND c.domain = p.domain))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('domain', x.domain, 'minutes', x.mins, 'people', x.people, 'category', x.category) ORDER BY x.rank, x.mins DESC, x.domain), '[]'::jsonb)
    INTO v_sites
    FROM (SELECT domain, sum(captures) AS mins, count(DISTINCT employee_id) AS people,
                 CASE WHEN bool_or(unprod) THEN 'unproductive' ELSE 'unfamiliar' END AS category,
                 CASE WHEN bool_or(unprod) THEN 0 ELSE 1 END AS rank
            FROM shown GROUP BY domain ORDER BY 5, 2 DESC, 1 LIMIT 6) x;

  -- Weekly and monthly: the numbers that matter, and the period before to compare with.
  IF p_kind IN ('week', 'month') THEN
    v_k := public.agent_period_kpis(p_start, p_end);
    IF p_kind = 'week' THEN v_prev_start := p_start - 7; v_prev_end := p_end - 7;
    ELSE v_prev_start := (p_start - interval '1 month')::date; v_prev_end := p_start - 1; END IF;
    v_pk := public.agent_period_kpis(v_prev_start, v_prev_end);
  END IF;

  IF p_kind = 'day' THEN
    v_today := jsonb_build_object(
      'due_tomorrow', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status <> 'done' AND t.due_date = p_end + 1),
      'on_leave', (SELECT count(DISTINCT l.employee_id) FROM agent_read.v_leave l WHERE p_end + 1 BETWEEN l.start_date AND l.end_date));
  END IF;

  v_label := CASE p_kind WHEN 'day' THEN to_char(p_start, 'FMDay, FMMon FMDD') WHEN 'week' THEN 'Week of ' || to_char(p_start, 'FMMon FMDD') || ' to ' || to_char(p_end, 'FMMon FMDD')
                         ELSE to_char(p_start, 'FMMonth YYYY') END;
  IF p_kind = 'day' THEN
    v_headline := format('%s: %s of %s expected person-days had time tracked (%s h in total); %s of %s daily reports were in; %s team items opened, %s high priority.',
                         v_label, v_trk_days, v_exp_days, v_hours, v_rep_sub, v_rep_exp, v_opened, v_high);
  ELSE
    v_tk := v_k -> 'tasks';
    v_headline := format('%s: %s of %s people tracked consistently, %s of %s reported consistently; %s; %s of %s expected hours tracked (%s%%).',
                         v_label, v_k ->> 'trackers_consistent', v_k ->> 'trackers_total', v_k ->> 'reporters_consistent', v_k ->> 'reporters_total',
                         CASE WHEN (v_tk ->> 'workload')::integer = 0 THEN 'no tasks in play' ELSE (v_tk ->> 'completion_rate') || '% of tasks closed (' || (v_tk ->> 'closed') || ' of ' || (v_tk ->> 'workload') || ')' END, v_k ->> 'hours', v_k ->> 'expected_hours', coalesce(v_k ->> 'hours_pct', '0'));
  END IF;

  IF p_kind = 'day' THEN
    v_body := '## ' || v_label || E'\n\n' ||
      '**Tracking.** ' || v_trk_days || ' of ' || v_exp_days || ' expected person-days had time tracked, ' || v_hours || ' hours in all'
        || CASE WHEN v_trk_days > 0 THEN ' (' || round(v_hours / v_trk_days, 1) || ' h on a tracked day)' ELSE '' END
        || CASE WHEN v_low > 0 THEN '; ' || v_low || ' tracked day' || CASE WHEN v_low = 1 THEN '' ELSE 's' END || ' were under half a work day' ELSE '' END || E'.\n\n' ||
      '**Reports.** ' || v_rep_sub || ' of ' || v_rep_exp || ' daily reports were sent'
        || CASE WHEN jsonb_array_length(v_missing) > 0 THEN '. Most missed: ' ||
             (SELECT string_agg((m ->> 'name') || ' (' || (m ->> 'days') || ')', ', ') FROM (SELECT m FROM jsonb_array_elements(v_missing) m LIMIT 5) q(m)) ELSE '' END || E'.\n\n' ||
      '**Tasks.** ' || (v_tasks ->> 'completed') || ' completed, ' || (v_tasks ->> 'created') || ' created. Right now ' || (v_tasks ->> 'overdue') || ' are overdue, '
        || (v_tasks ->> 'in_review') || ' waiting in review and ' || (v_tasks ->> 'blocked') || E' blocked.\n\n' ||
      '**Inbox.** ' || v_opened || ' team items opened (' || v_high || ' high), ' || (v_flags ->> 'resolved') || ' closed, ' || (v_flags ->> 'open_now') || ' open now'
        || CASE WHEN v_other > 0 THEN '. ' || v_other || ' other item' || CASE WHEN v_other = 1 THEN '' ELSE 's' END || ' (system, setup or finance) not counted' ELSE '' END || '.';
  ELSE
    v_unit := CASE p_kind WHEN 'week' THEN 'last week' ELSE 'last month' END;
    v_tk := v_k -> 'tasks';
    v_cmp_t := CASE WHEN (v_pk ->> 'trackers_total')::integer > 0 THEN '; ' || v_unit || ': ' || (v_pk ->> 'trackers_consistent') || ' of ' || (v_pk ->> 'trackers_total') ELSE '' END;
    v_cmp_r := CASE WHEN (v_pk ->> 'reporters_total')::integer > 0 THEN '; ' || v_unit || ': ' || (v_pk ->> 'reporters_consistent') || ' of ' || (v_pk ->> 'reporters_total') ELSE '' END;
    v_cmp_k := CASE WHEN (v_pk -> 'tasks' ->> 'workload')::integer > 0 THEN '; ' || v_unit || ': ' || coalesce(v_pk -> 'tasks' ->> 'completion_rate', '0') || '%' ELSE '' END;
    SELECT string_agg((x ->> 'name') || ' (' || (x ->> 'closed') || ')', ', ') INTO v_top FROM jsonb_array_elements(v_tk -> 'top_closers') x;
    v_body := '## ' || v_label || E'\n\n' ||
      '**Tracking.** ' || (v_k ->> 'trackers_consistent') || ' of ' || (v_k ->> 'trackers_total') || ' people tracked consistently (on at least ' || (v_k ->> 'threshold') || '% of their working days' || v_cmp_t || ')'
        || '. ' || (v_k ->> 'trackers_none') || ' tracked nothing. ' || (v_k ->> 'hours') || ' of ' || (v_k ->> 'expected_hours') || ' expected hours were tracked (' || coalesce(v_k ->> 'hours_pct', '0') || '%), '
        || (v_k ->> 'avg_hours_per_day') || E' h on a tracked day.\n\n' ||
      '**Reports.** ' || (v_k ->> 'reporters_consistent') || ' of ' || (v_k ->> 'reporters_total') || ' people reported consistently (on at least ' || (v_k ->> 'threshold') || '% of their working days' || v_cmp_r || ')'
        || '. ' || (v_k ->> 'reporters_none') || ' sent none. ' || (v_k ->> 'reports_sent') || ' of ' || (v_k ->> 'reports_expected') || E' daily reports were sent.\n\n' ||
      '**Tasks.** ' || CASE WHEN (v_tk ->> 'workload')::integer = 0 THEN 'No tasks were open or opened in this period. '
        ELSE (v_tk ->> 'opened') || ' opened and ' || (v_tk ->> 'closed') || ' closed: ' || coalesce(v_tk ->> 'completion_rate', '0') || '% of the work in play was closed ('
          || (v_tk ->> 'closed') || ' of ' || (v_tk ->> 'workload') || ', that is ' || (v_tk ->> 'open_start') || ' already open plus ' || (v_tk ->> 'opened') || ' opened' || v_cmp_k || '). '
          || CASE WHEN (v_tk ->> 'on_time_n')::integer > 0 THEN (v_tk ->> 'on_time_rate') || '% of the ' || (v_tk ->> 'on_time_n') || ' closed tasks with a due date were done on time. ' ELSE '' END
          || 'Open tasks went from ' || (v_tk ->> 'open_start') || ' to ' || (v_tk ->> 'open_end') || '. ' END
        || (v_tk ->> 'overdue_now') || ' overdue now'
        || CASE WHEN v_tk ->> 'avg_days_to_close' IS NOT NULL THEN '. A closed task took ' || (v_tk ->> 'avg_days_to_close') || ' days on average' ELSE '' END
        || CASE WHEN v_top IS NOT NULL THEN '. Most closed: ' || v_top ELSE '' END || E'.\n\n' ||
      '**Inbox.** ' || v_opened || ' team items opened (' || v_high || ' high), ' || (v_flags ->> 'resolved') || ' closed, ' || (v_flags ->> 'open_now') || ' open now'
        || CASE WHEN v_other > 0 THEN '. ' || v_other || ' other item' || CASE WHEN v_other = 1 THEN '' ELSE 's' END || ' (system, setup or finance) not counted' ELSE '' END || '.';
  END IF;

  IF jsonb_array_length(v_repeat) > 0 THEN
    SELECT string_agg((r ->> 'name') || ': ' || (r ->> 'rule') || ' x' || (r ->> 'count'), '; ') INTO v_names FROM jsonb_array_elements(v_repeat) r;
    v_body := v_body || E'\n\n**Keeps happening.** ' || v_names || '.';
  END IF;
  SELECT string_agg((x ->> 'domain') || ' (' || (x ->> 'minutes') || ' min)', ', ') INTO v_names FROM jsonb_array_elements(v_sites) x WHERE x ->> 'category' = 'unproductive';
  IF v_names IS NOT NULL THEN v_body := v_body || E'\n\n**Unproductive sites.** ' || v_names || '.'; END IF;
  SELECT string_agg((x ->> 'domain') || ' (' || (x ->> 'minutes') || ' min)', ', ') INTO v_names FROM jsonb_array_elements(v_sites) x WHERE x ->> 'category' = 'unfamiliar';
  IF v_names IS NOT NULL THEN v_body := v_body || E'\n\n**Unfamiliar sites.** ' || v_names || '.'; END IF;
  IF v_today IS NOT NULL THEN
    v_body := v_body || E'\n\n**Tomorrow.** ' || (v_today ->> 'due_tomorrow') || ' tasks are due and ' || (v_today ->> 'on_leave') || ' people are on leave.';
  END IF;

  RETURN jsonb_build_object('narrative', v_body, 'metrics', jsonb_build_object(
    'headline', v_headline, 'team_size', v_team, 'working_days', v_days,
    'tracking', jsonb_build_object('expected_days', v_exp_days, 'tracked_days', v_trk_days, 'hours', v_hours,
                                   'avg_hours_per_day', CASE WHEN v_trk_days > 0 THEN round(v_hours / v_trk_days, 1) ELSE 0 END, 'low_days', v_low),
    'tasks', v_tasks, 'reports', jsonb_build_object('expected', v_rep_exp, 'submitted', v_rep_sub, 'missing', v_missing),
    'flags', v_flags, 'repeat', v_repeat, 'sites', v_sites, 'tomorrow', v_today, 'kpis', v_k, 'previous', v_pk));
END $$;

-- ── Rebuild the recent weekly and monthly summaries with the new numbers ───
DO $$
DECLARE r record; b jsonb;
BEGIN
  IF to_regclass('public.agent_summaries') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT id, period_kind, period_start, period_end FROM public.agent_summaries
            WHERE auto AND company_id IS NULL AND period_kind IN ('week', 'month') AND period_end >= current_date - 70 LOOP
    b := public.agent_build_summary(r.period_kind, r.period_start, r.period_end);
    UPDATE public.agent_summaries SET metrics = b -> 'metrics', narrative = b ->> 'narrative' WHERE id = r.id;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.agent_period_kpis(date, date), public.agent_build_summary(text, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_period_kpis(date, date), public.agent_build_summary(text, date, date) TO service_role;
