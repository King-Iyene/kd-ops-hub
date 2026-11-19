-- Ops Agent v4 (2 of 5): more things the agent watches the KD Squares team for. Each is a rule that can be switched on or off in Settings.
--
--   TR03  Low hours yesterday          a working day with less than half the expected hours tracked
--   TK04  Blocked too long             a task in Blocked for 2 days or more
--   TK05  Stalled task                 a task In Progress with no change for 3 days or more
--   TK07  Task has no description      the Operating Rules ask for a detailed description on every task
--   TK08  Waiting for review           a task in In Review for 24 hours or more
--   TK11  Due soon, not started        a task due today or tomorrow that is still To Do
--   RP03  Two missed reports in a row  no daily report today (after the deadline) and none on the previous working day
--
-- All of it reads the team only (agent_read views / agent_team_v), in the agent time zone, and honours the exemptions and groups
-- the other rules use. Thresholds live in agent_rules.params so they can change without code.
--
-- Rollback: supabase/rollbacks/20261411_agent_v4_down.sql

-- helper: a number from a rule's params, with a default
CREATE OR REPLACE FUNCTION public.agent_rule_param(p_code text, p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT nullif(r.params ->> p_key, '')::numeric FROM public.agent_rules r WHERE r.code = p_code), p_default)
$$;

-- ── TR03 Low hours yesterday ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tr03(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_local timestamp; v_yday date; v_exp numeric; v_share numeric; r record; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0; v_sev text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone;
  IF v_local::time < time '06:00' THEN RETURN jsonb_build_object('created', 0, 'resolved', 0); END IF;  -- let the night's data settle
  v_yday := v_local::date - 1;
  v_exp := extract(epoch FROM (s.default_work_end - s.default_work_start)) / 60.0;
  v_share := public.agent_rule_param('TR03', 'share', 0.5);

  FOR r IN
    SELECT y.person_id, y.full_name,
           coalesce((SELECT sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, e.start_time) - e.start_time)) / 60.0))
                       FROM agent_read.v_time_entries e
                      WHERE e.employee_id = y.person_id AND (e.start_time AT TIME ZONE s.timezone)::date = v_yday), 0) AS mins
      FROM public.agent_team_today(p_now - interval '1 day') y
     WHERE y.expects_work AND NOT y.exempt_time AND coalesce(y.grp, '') NOT IN ('placement', 'leadership')
  LOOP
    IF v_exp > 0 AND r.mins < v_exp * v_share THEN
      v_sev := CASE WHEN r.mins < v_exp * 0.2 THEN 'high' ELSE 'medium' END;
      IF public.agent_raise_flag('TR03', 'track', r.person_id, 'person', r.person_id::text, v_yday::text, v_sev, 'Low tracked hours on ' || to_char(v_yday, 'Dy Mon FMDD'),
           format('%s tracked %s of the expected %s on %s.', r.full_name, public.agent_hm(r.mins), public.agent_hm(v_exp), to_char(v_yday, 'Dy Mon FMDD')),
           jsonb_build_object('day', v_yday, 'tracked_minutes', round(r.mins), 'expected_minutes', round(v_exp), 'person_name', r.full_name),
           'Ask what got in the way and whether time was tracked elsewhere.', p_now) THEN v_created := v_created + 1; END IF;
      v_keep := v_keep || (r.person_id::text);
    ELSE
      v_resolved := v_resolved + public.agent_resolve_flags('TR03', ARRAY[r.person_id::text], v_yday::text, p_now);
    END IF;
  END LOOP;
  -- history that nobody acted on clears itself after three days
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TR03' AND status = 'open' AND first_seen_at < p_now - interval '3 days' RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- "7h 45m" for a number of minutes
CREATE OR REPLACE FUNCTION public.agent_hm(p_min numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN round(p_min) < 60 THEN round(p_min)::int || 'm'
              WHEN round(p_min)::int % 60 = 0 THEN (round(p_min)::int / 60) || 'h'
              ELSE (round(p_min)::int / 60) || 'h ' || (round(p_min)::int % 60) || 'm' END
$$;

-- ── Task rules share one shape: find tasks, raise one item each, close the ones that cleared ──
CREATE OR REPLACE FUNCTION public.agent_task_rule(
  p_code text, p_now timestamptz, p_status text, p_min_age interval, p_title text, p_why text, p_action text,
  p_low_days integer, p_med_days integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0; v_sev text; v_age numeric;
BEGIN
  FOR r IN
    SELECT t.id, t.title, t.assignee_id, tm.full_name, t.updated_at, extract(epoch FROM (p_now - t.updated_at)) / 86400.0 AS days
      FROM agent_read.v_tasks t JOIN public.agent_team_v tm ON tm.person_id = t.assignee_id
     WHERE t.parent_id IS NULL AND t.status = p_status AND t.updated_at < p_now - p_min_age
       AND t.updated_at > p_now - interval '45 days'  -- older than that is abandoned, not stalled
       AND coalesce(tm.group_name, '') NOT IN ('placement', 'leadership') AND coalesce(tm.exemptions ->> 'tasks', 'false') <> 'true'
  LOOP
    v_age := floor(r.days);
    v_sev := CASE WHEN r.days >= p_med_days THEN 'medium' ELSE 'low' END;
    IF public.agent_raise_flag(p_code, 'task', r.assignee_id, 'task', r.id::text, '', v_sev, p_title || ': ' || left(r.title, 110),
         format(p_why, r.full_name, v_age::int),
         jsonb_build_object('task_id', r.id, 'task_title', r.title, 'days', v_age::int, 'assignee_name', r.full_name),
         p_action, p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || r.id::text;
  END LOOP;
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = p_code AND status IN ('open', 'snoozed') AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

CREATE OR REPLACE FUNCTION public.agent_rule_tk04(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.agent_task_rule('TK04', p_now, 'blocked', make_interval(days => public.agent_rule_param('TK04', 'days', 2)::int),
    'Blocked too long', '%s''s task has been Blocked for %s day(s) with no change.', 'Find out what is blocking it and who can clear it.', 2, 5)
$$;

CREATE OR REPLACE FUNCTION public.agent_rule_tk05(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.agent_task_rule('TK05', p_now, 'in_progress', make_interval(days => public.agent_rule_param('TK05', 'days', 3)::int),
    'No movement', '%s''s task has been In Progress for %s day(s) with no update.', 'Ask for a short update in the task comments.', 3, 7)
$$;

CREATE OR REPLACE FUNCTION public.agent_rule_tk08(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.agent_task_rule('TK08', p_now, 'in_review', make_interval(hours => public.agent_rule_param('TK08', 'hours', 24)::int),
    'Waiting for review', '%s''s task has waited %s day(s) in review.', 'Review it, or say what is missing.', 1, 3)
$$;

-- ── TK07 Task has no description ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tk07(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0; v_min integer := public.agent_rule_param('TK07', 'min_chars', 20)::int;
BEGIN
  FOR r IN
    SELECT t.id, t.title, t.assignee_id, tm.full_name
      FROM agent_read.v_tasks t JOIN public.agent_team_v tm ON tm.person_id = t.assignee_id
     WHERE t.parent_id IS NULL AND t.status <> 'done' AND length(btrim(coalesce(t.description, ''))) < v_min
       AND t.created_at < p_now - interval '1 hour' AND t.created_at > p_now - interval '30 days'
       AND coalesce(tm.group_name, '') NOT IN ('placement', 'leadership') AND coalesce(tm.exemptions ->> 'tasks', 'false') <> 'true'
  LOOP
    IF public.agent_raise_flag('TK07', 'task', r.assignee_id, 'task', r.id::text, '', 'low', 'No description: ' || left(r.title, 110),
         format('%s''s task has no real description. The Operating Rules ask for what needs doing and what success looks like.', r.full_name),
         jsonb_build_object('task_id', r.id, 'task_title', r.title, 'assignee_name', r.full_name),
         'Ask for a description with the expected result.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || r.id::text;
  END LOOP;
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TK07' AND status IN ('open', 'snoozed') AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TK11 Due soon, not started ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tk11(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_day date; r record; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  FOR r IN
    SELECT t.id, t.title, t.assignee_id, t.due_date, tm.full_name
      FROM agent_read.v_tasks t JOIN public.agent_team_v tm ON tm.person_id = t.assignee_id
     WHERE t.parent_id IS NULL AND t.status = 'to_do' AND t.due_date BETWEEN v_day AND v_day + 1
       AND coalesce(tm.group_name, '') NOT IN ('placement', 'leadership') AND coalesce(tm.exemptions ->> 'tasks', 'false') <> 'true'
  LOOP
    IF public.agent_raise_flag('TK11', 'task', r.assignee_id, 'task', r.id::text, '', CASE WHEN r.due_date = v_day THEN 'medium' ELSE 'low' END,
         'Due ' || CASE WHEN r.due_date = v_day THEN 'today' ELSE 'tomorrow' END || ', not started: ' || left(r.title, 100),
         format('%s has not started this task and it is due %s.', r.full_name, CASE WHEN r.due_date = v_day THEN 'today' ELSE 'tomorrow' END),
         jsonb_build_object('task_id', r.id, 'task_title', r.title, 'due_date', r.due_date, 'assignee_name', r.full_name),
         'Check they have what they need to start.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || r.id::text;
  END LOOP;
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TK11' AND status IN ('open', 'snoozed') AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── RP03 Two missed reports in a row ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_rp03(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_local timestamp; v_day date; v_prev date; r record; v_sub uuid[]; v_sub_prev uuid[]; v_ok text[] := '{}';
  v_created integer := 0; v_resolved integer := 0; v_due boolean;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone;
  v_day := v_local::date;
  v_due := v_local::time >= s.report_deadline + interval '5 minutes';
  IF NOT v_due THEN RETURN jsonb_build_object('created', 0, 'resolved', 0); END IF;
  -- the previous day the person was expected to work (looks back up to 4 days, so weekends and holidays are skipped)
  SELECT coalesce(array_agg(x), '{}') INTO v_sub FROM public.agent_report_submitters(v_day) x;
  FOR r IN
    SELECT t.person_id, t.full_name FROM public.agent_team_today(p_now) t
     WHERE t.expects_work AND coalesce(t.grp, '') NOT IN ('placement', 'leadership') AND NOT t.exempt_reports
  LOOP
    IF r.person_id = ANY (v_sub) THEN v_ok := v_ok || r.person_id::text; CONTINUE; END IF;
    v_prev := NULL;
    FOR i IN 1..4 LOOP
      IF EXISTS (SELECT 1 FROM public.agent_team_today(p_now - make_interval(days => i)) y WHERE y.person_id = r.person_id AND y.expects_work) THEN
        v_prev := v_day - i; EXIT;
      END IF;
    END LOOP;
    IF v_prev IS NULL THEN v_ok := v_ok || r.person_id::text; CONTINUE; END IF;
    SELECT coalesce(array_agg(x), '{}') INTO v_sub_prev FROM public.agent_report_submitters(v_prev) x;
    IF r.person_id = ANY (v_sub_prev) THEN v_ok := v_ok || r.person_id::text; CONTINUE; END IF;
    IF public.agent_raise_flag('RP03', 'reports', r.person_id, 'person', r.person_id::text, v_day::text, 'high', 'Two missed daily reports in a row',
         format('%s has not sent a daily report for %s or %s.', r.full_name, to_char(v_prev, 'Dy Mon FMDD'), to_char(v_day, 'Dy Mon FMDD')),
         jsonb_build_object('days', jsonb_build_array(v_prev, v_day), 'person_name', r.full_name),
         'Speak to them today; this is now a pattern.', p_now) THEN v_created := v_created + 1; END IF;
  END LOOP;
  v_ok := v_ok || coalesce((SELECT array_agg(person_id::text) FROM public.agent_team_today(p_now) WHERE NOT expects_work), '{}');
  v_resolved := public.agent_resolve_flags('RP03', v_ok, v_day::text, p_now);
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── Seed ────────────────────────────────────────────────────────────────────
INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('TR03', 'track',   'Low hours yesterday',        'A working day with less than half the expected hours tracked.',              true, 'medium', '{"share": 0.5}', 'ready'),
  ('TK04', 'task',    'Blocked too long',           'A task in Blocked for 2 days or more.',                                      true, 'low',    '{"days": 2}',    'ready'),
  ('TK05', 'task',    'Stalled task',               'A task In Progress with no change for 3 days or more.',                      true, 'low',    '{"days": 3}',    'ready'),
  ('TK07', 'task',    'Task has no description',    'The Operating Rules ask for a detailed description on every task.',          true, 'low',    '{"min_chars": 20}', 'ready'),
  ('TK08', 'task',    'Waiting for review',         'A task in In Review for 24 hours or more.',                                  true, 'medium', '{"hours": 24}',  'ready'),
  ('TK11', 'task',    'Due soon, not started',      'A task due today or tomorrow that is still To Do.',                          true, 'low',    '{}',             'ready'),
  ('RP03', 'reports', 'Two missed reports in a row','No daily report today (after the deadline) and none on the previous working day.', true, 'high', '{}',          'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, module_key = EXCLUDED.module_key, status = 'ready';

REVOKE ALL ON FUNCTION public.agent_rule_param(text, text, numeric), public.agent_hm(numeric),
  public.agent_task_rule(text, timestamptz, text, interval, text, text, text, integer, integer),
  public.agent_rule_tr03(timestamptz), public.agent_rule_tk04(timestamptz), public.agent_rule_tk05(timestamptz), public.agent_rule_tk07(timestamptz),
  public.agent_rule_tk08(timestamptz), public.agent_rule_tk11(timestamptz), public.agent_rule_rp03(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_param(text, text, numeric), public.agent_hm(numeric),
  public.agent_task_rule(text, timestamptz, text, interval, text, text, text, integer, integer),
  public.agent_rule_tr03(timestamptz), public.agent_rule_tk04(timestamptz), public.agent_rule_tk05(timestamptz), public.agent_rule_tk07(timestamptz),
  public.agent_rule_tk08(timestamptz), public.agent_rule_tk11(timestamptz), public.agent_rule_rp03(timestamptz) TO service_role;
