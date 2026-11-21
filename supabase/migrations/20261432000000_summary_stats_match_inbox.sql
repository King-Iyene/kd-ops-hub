-- Ops Agent: the summaries (daily, weekly, monthly) and the Monday scorecard count the same people, the same way, as the Inbox tiles.
--
-- What was wrong
--   * The summaries left out the whole Leadership group, so "of 8" where the Inbox tile said 13, and a report from Ebere or Denzel did not count.
--   * Someone whose timer was still running when the summary was written counted as zero minutes, so they were "not tracked".
--   * "Overdue" counted tasks due today; the Inbox does not (a task is overdue the day after its due date).
--   * "Items opened" counted everything in the Inbox, including system, scheduled-job and finance items, not just the team's. It now counts the
--     team's items (tasks, tracking, reports), the same ones that are sent to Cliq and other tools, and says how many other items there were.
--   * "Sites flagged" was copied from the flag as it was raised, so a site you had since marked productive was still listed. It is now read live:
--     your assignments in Agent (Settings, Sites) decide first, then Track's own category. A site marked productive is never flagged.
--   * Automatic summaries are never rewritten, so wrong ones stayed wrong. The recent ones are rebuilt below.
--
-- The same rule now applies to who is expected: the KD Squares team who work that day, minus placed staff; tracking skips anyone exempt from time
-- tracking, reports skip anyone exempt from reports (Settings, People). It is read live, so a change there shows in the next summary.
--
-- Rollback: re-apply agent_build_summary (20261411000300_agent_summaries.sql), agent_week_stats (20261423000000_agent_briefing_scorecard.sql) and
-- agent_rule_tr05 (20261410000100_agent_monitor.sql); drop agent_site_class. Stored summaries keep the rebuilt numbers.

-- A site's class, from the person's own assignments first: an entry on the Agent site list (most specific, company first) wins; otherwise
-- the category Track recorded for the capture. Returns 'productive', 'unproductive' or NULL (not classified).
CREATE OR REPLACE FUNCTION public.agent_site_class(p_domain text, p_cat text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    (SELECT CASE d.category WHEN 'approved' THEN 'productive' ELSE 'unproductive' END
       FROM public.agent_domain_list d
      WHERE d.category IN ('approved', 'unproductive') AND (p_domain = d.domain OR p_domain LIKE '%.' || d.domain)
      ORDER BY (d.company_id IS NULL), length(d.domain) DESC LIMIT 1),
    CASE p_cat WHEN 'unproductive' THEN 'unproductive' WHEN 'productive' THEN 'productive' ELSE NULL END)
$$;
REVOKE ALL ON FUNCTION public.agent_site_class(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_site_class(text, text) TO authenticated, service_role;

-- TR05 now uses the same classification, so a site you mark productive stops being flagged on the next look.
CREATE OR REPLACE FUNCTION public.agent_rule_tr05(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_start timestamptz; r record; v_sev text; v_title text; v_why text;
  v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0; v_n integer;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  v_start := v_day::timestamp AT TIME ZONE s.timezone;

  FOR r IN
    WITH caps AS (
      SELECT a.employee_id, a.domain, a.productivity_category AS cat
        FROM agent_read.v_activity_domains a
        JOIN public.agent_team_v t ON t.person_id = a.employee_id AND coalesce(t.group_name, '') <> 'placement'
       WHERE a.captured_at >= v_start AND a.captured_at <= p_now AND a.domain IS NOT NULL
    ), per AS (
      SELECT c.employee_id, c.domain, count(*) AS captures,
             coalesce(bool_or(public.agent_site_class(c.domain, c.cat) = 'unproductive'), false) AS unprod,
             coalesce(bool_or(public.agent_site_class(c.domain, c.cat) = 'productive'), false) AS fine
        FROM caps c
       GROUP BY c.employee_id, c.domain
    ), common AS (
      SELECT domain FROM per GROUP BY domain HAVING count(DISTINCT employee_id) >= 3
    ), shown AS (
      SELECT p.employee_id, p.domain, p.captures, CASE WHEN p.unprod THEN 'unproductive' ELSE 'unknown' END AS category,
             row_number() OVER (PARTITION BY p.employee_id ORDER BY p.unprod DESC, p.captures DESC, p.domain) AS rn
        FROM per p
       WHERE (p.unprod OR (NOT p.fine AND p.captures >= 2 AND p.domain NOT IN (SELECT domain FROM common)))
    )
    SELECT employee_id,
           jsonb_agg(jsonb_build_object('domain', domain, 'seconds', captures * 60, 'category', category) ORDER BY rn) FILTER (WHERE rn <= 8) AS sites,
           sum(captures * 60)::integer AS total_seconds,
           coalesce(sum(captures * 60) FILTER (WHERE category = 'unproductive'), 0)::integer AS unprod_seconds,
           count(*) FILTER (WHERE category = 'unproductive')::integer AS unprod_sites,
           count(*)::integer AS site_count,
           (array_agg(domain ORDER BY rn))[1] AS top_domain,
           string_agg(domain || ' ' || ceil(captures / 1.0)::text || ' min', ', ' ORDER BY rn) FILTER (WHERE rn <= 3) AS top_list
      FROM shown GROUP BY employee_id
  LOOP
    v_sev := CASE WHEN r.unprod_seconds >= 900 THEN 'high' WHEN r.unprod_seconds > 0 THEN 'medium' WHEN r.total_seconds >= 1800 THEN 'medium' ELSE 'low' END;
    v_title := CASE WHEN r.unprod_sites = 1 THEN 'Unproductive site: ' || r.top_domain
                    WHEN r.unprod_sites > 1 THEN 'Unproductive sites (' || r.unprod_sites || ')'
                    ELSE 'Unfamiliar sites (' || r.site_count || ')' END;
    v_why := 'Today: ' || r.top_list || CASE WHEN r.site_count > 3 THEN format(' and %s more', r.site_count - 3) ELSE '' END || '.';
    IF public.agent_raise_flag('TR05', 'track', r.employee_id, 'person', r.employee_id::text, v_day::text, v_sev, v_title, v_why,
         jsonb_build_object('sites', r.sites, 'total_seconds', r.total_seconds, 'unproductive_seconds', r.unprod_seconds, 'day', v_day),
         'Check the sites and talk to them if it is not work.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || r.employee_id::text;
  END LOOP;

  -- Nothing left to show for these people today (the sites turned out to be common, or were approved): close it.
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TR05' AND status IN ('open', 'snoozed') AND period_key = v_day::text AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_resolved := v_n;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

CREATE OR REPLACE FUNCTION public.agent_build_summary(p_kind text, p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_tz text; v_team integer; v_days integer; v_today_local date;
  v_exp_days integer; v_trk_days integer; v_mins numeric; v_low integer; v_rep_exp integer; v_rep_sub integer; v_missing jsonb;
  v_tasks jsonb; v_flags jsonb; v_repeat jsonb; v_sites jsonb; v_today jsonb := NULL; v_headline text; v_label text; v_body text; v_hours numeric;
  v_names text; v_from timestamptz; v_to timestamptz; v_opened integer; v_high integer; v_by jsonb; v_other integer;
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

  IF p_kind = 'day' THEN
    v_today := jsonb_build_object(
      'due_tomorrow', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.parent_id IS NULL AND t.status <> 'done' AND t.due_date = p_end + 1),
      'on_leave', (SELECT count(DISTINCT l.employee_id) FROM agent_read.v_leave l WHERE p_end + 1 BETWEEN l.start_date AND l.end_date));
  END IF;

  v_label := CASE p_kind WHEN 'day' THEN to_char(p_start, 'FMDay, FMMon FMDD') WHEN 'week' THEN 'Week of ' || to_char(p_start, 'FMMon FMDD') || ' to ' || to_char(p_end, 'FMMon FMDD')
                         ELSE to_char(p_start, 'FMMonth YYYY') END;
  v_headline := format('%s: %s of %s expected person-days had time tracked (%s h in total); %s of %s daily reports were in; %s team items opened, %s high priority.',
                       v_label, v_trk_days, v_exp_days, v_hours, v_rep_sub, v_rep_exp, v_opened, v_high);

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
    'flags', v_flags, 'repeat', v_repeat, 'sites', v_sites, 'tomorrow', v_today));
END $$;

-- ── The Monday scorecard: the same team rule, and a running timer counts ───
CREATE OR REPLACE FUNCTION public.agent_week_stats(p_mon date)
RETURNS TABLE (person_id uuid, full_name text, manager_id uuid, expected_days integer, expected_hours numeric, tracked_hours numeric,
               tasks_done integer, reports_expected integer, reports_submitted integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_hours numeric; v_end date := p_mon + 6;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_hours := extract(epoch FROM (s.default_work_end - s.default_work_start)) / 3600.0;
  RETURN QUERY
  WITH days AS (SELECT g::date AS d FROM generate_series(p_mon, v_end, interval '1 day') x(g) WHERE public.agent_is_working_day(g::date)),
  exp AS (
    SELECT days.d, t.person_id AS pid, t.full_name AS pname, t.manager_id AS mid, t.exempt_time, t.exempt_reports
      FROM days CROSS JOIN LATERAL public.agent_team_today(((days.d::timestamp + interval '12 hours') AT TIME ZONE s.timezone)) t
     WHERE t.expects_work AND coalesce(t.grp, '') <> 'placement'
  ), mins AS (
    SELECT e.employee_id AS pid,
           sum(coalesce(e.duration_minutes, extract(epoch FROM (least(coalesce(e.end_time, now()), e.start_time + interval '12 hours') - e.start_time)) / 60.0)) AS m
      FROM agent_read.v_time_entries e WHERE (e.start_time AT TIME ZONE s.timezone)::date BETWEEN p_mon AND v_end GROUP BY 1
  ), done AS (
    SELECT k.assignee_id AS pid, count(*)::integer AS n FROM agent_read.v_tasks k
     WHERE k.parent_id IS NULL AND k.status = 'done' AND (k.completed_at AT TIME ZONE s.timezone)::date BETWEEN p_mon AND v_end GROUP BY 1
  ), rep AS (
    SELECT x.pid, count(*) FILTER (WHERE NOT x.exempt_reports)::integer AS rexp,
           count(*) FILTER (WHERE NOT x.exempt_reports AND EXISTS (SELECT 1 FROM public.agent_report_submitters(x.d) sub WHERE sub = x.pid))::integer AS rsub
      FROM exp x GROUP BY x.pid
  )
  SELECT x.pid, max(x.pname), max(x.mid::text)::uuid,
         count(*) FILTER (WHERE NOT x.exempt_time)::integer, round(count(*) FILTER (WHERE NOT x.exempt_time) * v_hours, 1),
         round(coalesce(max(m.m), 0) / 60.0, 1), coalesce(max(d.n), 0), coalesce(max(r.rexp), 0), coalesce(max(r.rsub), 0)
    FROM exp x LEFT JOIN mins m ON m.pid = x.pid LEFT JOIN done d ON d.pid = x.pid LEFT JOIN rep r ON r.pid = x.pid
   GROUP BY x.pid;
END $$;

-- ── Rebuild the recent automatic summaries, which are never rewritten otherwise ─────────────────────────────────
-- Daily, weekly and monthly ones from the last 35 days, and the last 5 scorecards. Rebuilt from the same data with the rule above.
DO $$
DECLARE r record; b jsonb;
BEGIN
  IF to_regclass('public.agent_summaries') IS NULL THEN RETURN; END IF;
  FOR r IN SELECT id, period_kind, period_start, period_end FROM public.agent_summaries
            WHERE auto AND company_id IS NULL AND period_kind IN ('day', 'week', 'month') AND period_end >= current_date - 35 LOOP
    b := public.agent_build_summary(r.period_kind, r.period_start, r.period_end);
    UPDATE public.agent_summaries SET metrics = b -> 'metrics', narrative = b ->> 'narrative' WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, period_start FROM public.agent_summaries WHERE auto AND company_id IS NULL AND period_kind = 'scorecard' ORDER BY period_start DESC LIMIT 5 LOOP
    b := public.agent_build_scorecard(r.period_start);
    UPDATE public.agent_summaries SET metrics = b -> 'metrics', narrative = b ->> 'narrative' WHERE id = r.id;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.agent_build_summary(text, date, date), public.agent_week_stats(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_build_summary(text, date, date), public.agent_week_stats(date) TO service_role;
