-- Ops Agent: a 7 AM briefing for the Super Admin, and a Monday scorecard for managers. Both are written by the database (no AI needed:
-- the numbers are the point), appear in Summaries, and are sent to connections that ticked them.
--
--   BR01 Morning briefing   Every working day at 7:00 AM Eastern (made once; a late run catches up until 5 PM): the five things that matter
--                           most today, ranked by money, then clients and deadlines, then severity and age, each with an owner, the next
--                           step and a time. Then the day in numbers (tasks due, people on leave, reports due) and what changed since yesterday.
--   SC01 Weekly scorecard   On the first working day of the week at 8:00 AM Eastern: last week per person, grouped by their manager: hours tracked
--                           against expected, tasks done, overdue now, daily reports on time. A person whose tracked time fell three weeks
--                           in a row, and is under 80% of expected, is marked. In Cliq and Slack each manager is tagged on their own section.
--
-- Both are rules like any other: Settings can switch them off, and a failure shows as "Rule failed". Summaries gets two new kinds,
-- 'briefing' and 'scorecard', and connections two new events, summary_briefing and summary_scorecard.
--
-- Rollback: supabase/rollbacks/20261423_agent_briefing_scorecard_down.sql

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.agent_summaries'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%period_kind%' LOOP
    EXECUTE format('ALTER TABLE public.agent_summaries DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.agent_summaries ADD CONSTRAINT agent_summaries_period_kind_check CHECK (period_kind IN ('day', 'week', 'month', 'custom', 'briefing', 'scorecard'));

CREATE OR REPLACE FUNCTION public.agent_outbox_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT NEW.auto OR NEW.period_kind NOT IN ('day', 'week', 'month', 'briefing', 'scorecard') THEN RETURN NEW; END IF;
  INSERT INTO public.agent_outbox (connection_id, kind, ref_id)
  SELECT c.id, 'summary', NEW.id FROM public.agent_connections c
   WHERE coalesce(c.config -> 'events', '[]'::jsonb) ? ('summary_' || NEW.period_kind)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.agent_outbox_summary() FROM PUBLIC, anon, authenticated;

-- ── BR01 the morning briefing ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_build_briefing(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; r record; v_i integer := 0; v_top jsonb := '[]'::jsonb; v_lines text := ''; v_deadline timestamptz; v_by text;
  v_owner text; v_next text; v_open integer; v_high integer; v_new integer; v_cleared integer; v_due integer; v_leave integer; v_reports integer; v_narr text; v_head text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;

  FOR r IN
    SELECT f.id, f.rule_code, f.severity, f.title, f.why, f.suggested_action, f.person_id, f.first_seen_at,
           coalesce(p.full_name, f.evidence ->> 'person_name') AS person_name, public.agent_manager_of(f.person_id) AS mgr,
           ( public.agent_sev_rank(f.severity) * 10
             + CASE WHEN f.rule_code LIKE 'PY%' OR f.rule_code LIKE 'BK%' OR f.rule_code LIKE 'LN%' THEN 20   -- money first: a medium payroll item outranks a high task
                    WHEN f.rule_code IN ('RP01', 'RP03', 'TK01', 'TK02', 'TK11') THEN 6 ELSE 0 END           -- then clients and deadlines
             + least(greatest(floor(extract(epoch FROM (p_now - f.first_seen_at)) / 86400)::integer, 0), 5)
             + CASE WHEN f.occurrence_count > 1 THEN 2 ELSE 0 END ) AS score
      FROM public.agent_flags f LEFT JOIN public.profiles p ON p.id = f.person_id
     WHERE f.status = 'open' AND f.item_type IN ('flag', 'human_action') AND f.rule_code NOT IN ('TK13', 'TK14', 'SU01')
     ORDER BY score DESC, f.first_seen_at LIMIT 5
  LOOP
    v_i := v_i + 1;
    SELECT full_name INTO v_owner FROM public.profiles WHERE id = r.mgr;
    v_owner := coalesce(v_owner, 'Super Admin');
    v_next := coalesce(nullif(btrim(split_part(coalesce(r.suggested_action, ''), E'\n', 1)), ''), 'Open it in the Inbox and decide the next step.');
    v_deadline := CASE WHEN public.agent_sev_rank(r.severity) >= 4 THEN (v_day::timestamp + time '12:00') AT TIME ZONE s.timezone
                       WHEN public.agent_sev_rank(r.severity) = 3 THEN (v_day::timestamp + time '17:00') AT TIME ZONE s.timezone ELSE NULL END;
    v_by := CASE WHEN v_deadline IS NULL THEN 'this week' WHEN v_deadline < p_now THEN 'today' ELSE 'by ' || public.agent_fmt_ts(v_deadline, s.timezone) END;
    v_top := v_top || jsonb_build_array(jsonb_build_object('rank', v_i, 'flag_id', r.id, 'rule', r.rule_code, 'severity', r.severity, 'title', r.title,
                       'person', r.person_name, 'owner', v_owner, 'next_step', v_next, 'by', v_by, 'days_open', greatest(floor(extract(epoch FROM (p_now - r.first_seen_at)) / 86400)::integer, 0)));
    v_lines := v_lines || format(E'%s. **%s**%s. %s Owner: %s. Next: %s %s.\n', v_i, r.title, CASE WHEN r.person_name IS NOT NULL THEN ' (' || r.person_name || ')' ELSE '' END,
                                 left(btrim(r.why), 220), v_owner, v_next, v_by);
  END LOOP;

  SELECT count(*), count(*) FILTER (WHERE public.agent_sev_rank(severity) >= 4), count(*) FILTER (WHERE first_seen_at > p_now - interval '24 hours')
    INTO v_open, v_high, v_new FROM public.agent_flags WHERE status = 'open' AND item_type IN ('flag', 'human_action') AND rule_code NOT IN ('TK14', 'SU01');
  SELECT count(*) INTO v_cleared FROM public.agent_flags WHERE status IN ('auto_resolved', 'handled') AND updated_at > p_now - interval '24 hours' AND rule_code NOT IN ('TK14', 'SU01');
  SELECT count(*) INTO v_due FROM agent_read.v_tasks WHERE parent_id IS NULL AND status <> 'done' AND due_date = v_day;
  SELECT count(DISTINCT l.employee_id) INTO v_leave FROM agent_read.v_leave l JOIN public.agent_team_v t ON t.person_id = l.employee_id WHERE v_day BETWEEN l.start_date AND l.end_date;
  SELECT count(*) INTO v_reports FROM public.agent_team_today(p_now) t WHERE t.expects_work AND NOT t.exempt_reports AND coalesce(t.grp, '') NOT IN ('placement', 'leadership');

  v_head := CASE WHEN v_i = 0 THEN 'Nothing needs attention first thing.' ELSE format('%s item%s need attention today%s.', v_open, CASE WHEN v_open = 1 THEN '' ELSE 's' END,
                    CASE WHEN v_high > 0 THEN ', ' || v_high || ' high priority' ELSE '' END) END;
  v_narr := format(E'## Good morning, %s\n\n**%s**\n\n', to_char(v_day, 'FMDay, FMMon FMDD'), v_head)
            || CASE WHEN v_i = 0 THEN E'Nothing is open that needs a decision.\n\n' ELSE E'**What matters most today**\n' || v_lines || E'\n' END
            || format(E'**Today.** %s task%s due, %s on leave, %s daily report%s due by %s.\n\n**Since yesterday.** %s new, %s cleared, %s open.',
                      v_due, CASE WHEN v_due = 1 THEN '' ELSE 's' END, v_leave, v_reports, CASE WHEN v_reports = 1 THEN '' ELSE 's' END,
                      public.agent_fmt_ts(((v_day::timestamp + time '18:00') AT TIME ZONE s.timezone), s.timezone), v_new, v_cleared, v_open);
  RETURN jsonb_build_object('metrics', jsonb_build_object('headline', v_head, 'top', v_top, 'open_now', v_open, 'high', v_high, 'new', v_new, 'cleared', v_cleared,
                                                          'due_today', v_due, 'on_leave', v_leave, 'reports_due', v_reports), 'narrative', v_narr);
END $$;

CREATE OR REPLACE FUNCTION public.agent_rule_br01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_local timestamp; v_day date; b jsonb; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone; v_day := v_local::date;
  IF v_local::time < time '07:00' OR v_local::time >= time '17:00' OR NOT public.agent_is_working_day(v_day) THEN RETURN jsonb_build_object('created', 0, 'resolved', 0); END IF;
  IF EXISTS (SELECT 1 FROM public.agent_summaries WHERE period_kind = 'briefing' AND period_start = v_day AND period_end = v_day AND auto AND company_id IS NULL) THEN
    RETURN jsonb_build_object('created', 0, 'resolved', 0);
  END IF;
  b := public.agent_build_briefing(p_now);
  INSERT INTO public.agent_summaries (period_kind, period_start, period_end, company_id, metrics, narrative, auto)
  VALUES ('briefing', v_day, v_day, NULL, b -> 'metrics', b ->> 'narrative', true)
  ON CONFLICT (period_kind, period_start, period_end) WHERE auto AND company_id IS NULL DO NOTHING RETURNING id INTO v_id;
  RETURN jsonb_build_object('created', CASE WHEN v_id IS NULL THEN 0 ELSE 1 END, 'resolved', 0);
END $$;

-- ── SC01 the weekly scorecard ──────────────────────────────────────────────
-- One row per person for the week starting p_mon (Monday to Sunday): what was expected and what happened.
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
     WHERE t.expects_work AND coalesce(t.grp, '') NOT IN ('placement', 'leadership')
  ), mins AS (
    SELECT e.employee_id AS pid, sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, e.start_time) - e.start_time)) / 60.0)) AS m
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

CREATE OR REPLACE FUNCTION public.agent_build_scorecard(p_mon date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_end date := p_mon + 6; v_today date; r record; m record; v_text text := ''; v_managers jsonb := '[]'::jsonb; v_decline jsonb := '[]'::jsonb;
  v_people jsonb; v_flag text; v_n integer; v_tracked numeric := 0; v_expected numeric := 0; v_done integer := 0; v_overdue integer := 0; v_rexp integer := 0; v_rsub integer := 0;
  v_pct integer; v_head text; v_att text := ''; v_narr text; v_ov integer; v_w1 numeric; v_w2 numeric; v_e1 numeric; v_e2 numeric;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_today := (now() AT TIME ZONE s.timezone)::date;

  FOR m IN
    SELECT w.manager_id, coalesce(mp.full_name, 'No manager set') AS mname, count(*) AS n
      FROM public.agent_week_stats(p_mon) w LEFT JOIN public.profiles mp ON mp.id = w.manager_id
     WHERE w.expected_days > 0 GROUP BY 1, 2 ORDER BY (w.manager_id IS NULL), 2
  LOOP
    v_people := '[]'::jsonb;
    v_text := v_text || format(E'\n### %s%s (%s %s)\n', CASE WHEN m.manager_id IS NULL THEN '' ELSE '@' END, m.mname, m.n, CASE WHEN m.n = 1 THEN 'person' ELSE 'people' END);
    FOR r IN SELECT * FROM public.agent_week_stats(p_mon) w WHERE w.expected_days > 0 AND w.manager_id IS NOT DISTINCT FROM m.manager_id ORDER BY w.full_name LOOP
      SELECT count(*) INTO v_ov FROM agent_read.v_tasks k WHERE k.assignee_id = r.person_id AND k.parent_id IS NULL AND k.status <> 'done' AND k.due_date < v_today;
      -- three weeks in a row going down, and under 80% of what was expected
      SELECT tracked_hours, expected_hours INTO v_w1, v_e1 FROM public.agent_week_stats(p_mon - 7) w WHERE w.person_id = r.person_id;
      SELECT tracked_hours, expected_hours INTO v_w2, v_e2 FROM public.agent_week_stats(p_mon - 14) w WHERE w.person_id = r.person_id;
      v_flag := '';
      IF v_w1 IS NOT NULL AND v_w2 IS NOT NULL AND coalesce(v_e1, 0) > 0 AND coalesce(v_e2, 0) > 0 AND r.expected_hours > 0
         AND (v_w2 / v_e2) > (v_w1 / v_e1) AND (v_w1 / v_e1) > (r.tracked_hours / r.expected_hours) AND (r.tracked_hours / r.expected_hours) < 0.8 THEN
        v_flag := ' (down three weeks in a row)';
        v_decline := v_decline || jsonb_build_array(jsonb_build_object('person_id', r.person_id, 'name', r.full_name, 'hours', jsonb_build_array(v_w2, v_w1, r.tracked_hours), 'expected', jsonb_build_array(v_e2, v_e1, r.expected_hours)));
        v_att := v_att || format('%s: %s h, %s h, then %s h of %s h expected. ', r.full_name, trim_scale(v_w2), trim_scale(v_w1), trim_scale(r.tracked_hours), trim_scale(r.expected_hours));
      END IF;
      v_text := v_text || format(E'- %s: %s of %s h tracked, %s task%s done, %s overdue now, %s of %s daily reports%s\n', r.full_name, trim_scale(r.tracked_hours), trim_scale(r.expected_hours),
                                 r.tasks_done, CASE WHEN r.tasks_done = 1 THEN '' ELSE 's' END, v_ov, r.reports_submitted, r.reports_expected, v_flag);
      v_people := v_people || jsonb_build_array(jsonb_build_object('person_id', r.person_id, 'name', r.full_name, 'tracked_hours', r.tracked_hours, 'expected_hours', r.expected_hours,
                       'tasks_done', r.tasks_done, 'overdue', v_ov, 'reports', r.reports_submitted, 'reports_expected', r.reports_expected, 'declining', v_flag <> ''));
      v_tracked := v_tracked + r.tracked_hours; v_expected := v_expected + r.expected_hours; v_done := v_done + r.tasks_done; v_overdue := v_overdue + v_ov;
      v_rexp := v_rexp + r.reports_expected; v_rsub := v_rsub + r.reports_submitted;
    END LOOP;
    v_managers := v_managers || jsonb_build_array(jsonb_build_object('manager_id', m.manager_id, 'name', m.mname, 'people', v_people));
  END LOOP;

  v_pct := CASE WHEN v_expected > 0 THEN round(100 * v_tracked / v_expected)::integer ELSE 0 END;
  SELECT count(*) INTO v_n FROM public.agent_week_stats(p_mon) w WHERE w.expected_days > 0;
  v_head := format('%s people tracked %s of %s hours (%s%%), %s tasks done, %s of %s daily reports.', v_n, round(v_tracked), round(v_expected), v_pct, v_done, v_rsub, v_rexp);
  v_narr := format(E'## Weekly scorecard, %s to %s\n\n**Team.** %s%s%s', to_char(p_mon, 'FMMon FMDD'), to_char(v_end, 'FMMon FMDD'), v_head,
                   CASE WHEN v_att <> '' THEN E'\n\n**Needs attention.** ' || btrim(v_att) ELSE '' END, v_text);
  RETURN jsonb_build_object('metrics', jsonb_build_object('headline', v_head, 'people', v_n, 'tracked_hours', round(v_tracked, 1), 'expected_hours', round(v_expected, 1),
            'tasks_done', v_done, 'overdue_now', v_overdue, 'reports', v_rsub, 'reports_expected', v_rexp, 'managers', v_managers, 'decline', v_decline), 'narrative', v_narr);
END $$;

CREATE OR REPLACE FUNCTION public.agent_rule_sc01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_local timestamp; v_day date; v_mon date; v_prev date; v_i integer; v_first boolean := true; b jsonb; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone; v_day := v_local::date;
  IF v_local::time < time '08:00' OR NOT public.agent_is_working_day(v_day) THEN RETURN jsonb_build_object('created', 0, 'resolved', 0); END IF;
  -- only on the first working day of the week
  v_mon := v_day - (extract(isodow FROM v_day)::integer - 1);
  FOR v_i IN 0..(extract(isodow FROM v_day)::integer - 2) LOOP
    IF public.agent_is_working_day(v_mon + v_i) THEN v_first := false; END IF;
  END LOOP;
  IF NOT v_first THEN RETURN jsonb_build_object('created', 0, 'resolved', 0); END IF;
  v_prev := v_mon - 7;
  IF EXISTS (SELECT 1 FROM public.agent_summaries WHERE period_kind = 'scorecard' AND period_start = v_prev AND period_end = v_prev + 6 AND auto AND company_id IS NULL) THEN
    RETURN jsonb_build_object('created', 0, 'resolved', 0);
  END IF;
  b := public.agent_build_scorecard(v_prev);
  INSERT INTO public.agent_summaries (period_kind, period_start, period_end, company_id, metrics, narrative, auto)
  VALUES ('scorecard', v_prev, v_prev + 6, NULL, b -> 'metrics', b ->> 'narrative', true)
  ON CONFLICT (period_kind, period_start, period_end) WHERE auto AND company_id IS NULL DO NOTHING RETURNING id INTO v_id;
  RETURN jsonb_build_object('created', CASE WHEN v_id IS NULL THEN 0 ELSE 1 END, 'resolved', 0);
END $$;

REVOKE ALL ON FUNCTION public.agent_build_briefing(timestamptz), public.agent_rule_br01(timestamptz), public.agent_week_stats(date),
  public.agent_build_scorecard(date), public.agent_rule_sc01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_build_briefing(timestamptz), public.agent_rule_br01(timestamptz), public.agent_week_stats(date),
  public.agent_build_scorecard(date), public.agent_rule_sc01(timestamptz) TO service_role;

INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('BR01', NULL, 'Morning briefing', 'Every working day at 7:00 AM Eastern: the five things that matter most today (money first, then clients and deadlines), each with an owner, the next step and a time, plus the day in numbers and what changed since yesterday.', true, 'info', '{}', 'ready'),
  ('SC01', NULL, 'Weekly scorecard', 'On the first working day of the week at 8:00 AM Eastern: last week per person grouped by manager (hours tracked against expected, tasks done, overdue, daily reports), and anyone whose tracked time fell three weeks in a row.', true, 'info', '{}', 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'ready';
