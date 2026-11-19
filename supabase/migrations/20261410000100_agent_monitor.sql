-- Ops Agent v3 (2 of 2): the always-on monitor.
--
-- pg_cron runs agent_run_rules() every minute. Each rule looks at the KD Squares team (agent_team_v), in Eastern time
-- (settings.timezone), raises an Inbox item the moment a condition is true, and closes it by itself the moment the
-- condition clears. No AI, no API key and no edge function is involved, so it cannot be down because of one.
--
--   TR01  Not tracking time        in the work window, no timer running for 30 min (never started) or 45 min (stopped)
--   TR02  Forgotten timer          a timer running more than 10 hours
--   TR05  Unexpected sites         a site visited that is unproductive, or unfamiliar (see below). Flags on the first sighting.
--   TK01  Overdue                  open task past its due date; severity rises with the days late
--   TK02  Due date changed         a due date moved after it was first set (never first-set)
--   TK06  No open tasks            a person with nothing assigned during the work day
--   TK13  Ready for review         a task moved to In Review (clears when it leaves In Review)
--   TK14  Task completed           a task moved to Complete (clears after 24 hours)
--   RP01  Missing daily report     not submitted 5 minutes after the deadline
--
-- An "unfamiliar" site is one that is not on the approved list, not marked productive by Track, and not visited by
-- three or more team members today (a site the whole team uses is normal). Unproductive sites are flagged at once.
-- Time on a site is estimated from captures (about one a minute) because Track does not store active seconds.
--
-- Rollback: supabase/rollbacks/20261410_agent_v3_down.sql

-- ── State ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_monitor_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_monitor_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_monitor_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_monitor_state TO service_role;

-- ── Helpers ────────────────────────────────────────────────────────────────
-- "10:42 AM EST" for a moment, in the agent time zone.
CREATE OR REPLACE FUNCTION public.agent_fmt_ts(p_ts timestamptz, p_tz text)
RETURNS text LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT to_char(p_ts AT TIME ZONE p_tz, 'FMHH12:MI AM') || ' ' || coalesce((SELECT abbrev FROM pg_timezone_names WHERE name = p_tz), 'ET')
$$;

-- Each team member today: do we expect work from them, are they inside their work window, and how long since it opened.
CREATE OR REPLACE FUNCTION public.agent_team_today(p_now timestamptz DEFAULT now())
RETURNS TABLE (person_id uuid, full_name text, company_id uuid, manager_id uuid, grp text, expects_work boolean, in_window boolean,
               mins_since_start numeric, exempt_time boolean, exempt_reports boolean, exempt_tasks boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH c AS (SELECT s.*, (p_now AT TIME ZONE s.timezone) AS lnow FROM public.agent_settings s WHERE s.id)
  SELECT t.person_id, t.full_name, t.company_id, t.manager_id, t.group_name,
         ( extract(isodow FROM c.lnow)::integer = ANY (coalesce(t.working_days, c.default_working_days))
           AND NOT EXISTS (SELECT 1 FROM public.public_holidays h WHERE h.holiday_date = c.lnow::date
                            AND h.country_code = coalesce(t.country_code, c.default_country_code) AND h.is_observed IS NOT FALSE)
           AND NOT EXISTS (SELECT 1 FROM agent_read.v_leave l WHERE l.employee_id = t.person_id AND c.lnow::date BETWEEN l.start_date AND l.end_date) ),
         ( c.lnow::time >= coalesce(t.work_start, c.default_work_start) AND c.lnow::time < coalesce(t.work_end, c.default_work_end) ),
         extract(epoch FROM (c.lnow::time - coalesce(t.work_start, c.default_work_start))) / 60.0,
         coalesce(t.exemptions ->> 'time', 'false') = 'true',
         coalesce(t.exemptions ->> 'reports', 'false') = 'true',
         coalesce(t.exemptions ->> 'tasks', 'false') = 'true'
    FROM public.agent_team_v t CROSS JOIN c
$$;

-- Who has a daily report for a day: rows of the report table, dated by its Report Date field (or the day added).
CREATE OR REPLACE FUNCTION public.agent_report_submitters(p_day date)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_setting text; v_person text; v_date text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  IF s.report_table_id IS NULL THEN RETURN; END IF;
  SELECT t.report_date_field INTO v_setting FROM public.tm_tables t WHERE t.id = s.report_table_id;
  SELECT f.id::text INTO v_person FROM agent_read.v_report_fields f WHERE f.type = 'person' ORDER BY f.position LIMIT 1;
  IF v_setting IS DISTINCT FROM 'created_at' THEN
    SELECT f.id::text INTO v_date FROM agent_read.v_report_fields f
     WHERE f.type = 'date' AND (v_setting IS NULL OR f.id::text = v_setting) ORDER BY f.position LIMIT 1;
    IF v_date IS NULL AND v_setting IS NOT NULL THEN
      SELECT f.id::text INTO v_date FROM agent_read.v_report_fields f WHERE f.type = 'date' ORDER BY f.position LIMIT 1;
    END IF;
  END IF;
  RETURN QUERY
  WITH day_rows AS (
    SELECT r.data, r.created_by FROM agent_read.v_report_rows r
     WHERE coalesce(public.agent_safe_date(left(r.data ->> v_date, 10)), (r.created_at AT TIME ZONE s.timezone)::date) = p_day
  )
  SELECT DISTINCT e::uuid
    FROM day_rows d
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN v_person IS NULL THEN jsonb_build_array(d.created_by)
           WHEN jsonb_typeof(d.data -> v_person) = 'array' THEN d.data -> v_person
           WHEN jsonb_typeof(d.data -> v_person) = 'string' THEN jsonb_build_array(d.data -> v_person)
           ELSE '[]'::jsonb END) AS e
   WHERE e ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
END $$;

-- Raises an Inbox item, or refreshes the one that already exists for the same rule, subject and period.
-- Returns true when the item is new, or was closed by the agent and has come back. Items a person handled or dismissed stay that way.
CREATE OR REPLACE FUNCTION public.agent_raise_flag(
  p_rule text, p_module text, p_person uuid, p_subject_type text, p_subject_id text, p_period text, p_severity text,
  p_title text, p_why text, p_evidence jsonb, p_action text DEFAULT NULL, p_now timestamptz DEFAULT now()
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_company uuid; v_manager uuid; v_id uuid; v_inserted boolean; v_prev text;
BEGIN
  IF p_person IS NOT NULL THEN SELECT company_id, manager_id INTO v_company, v_manager FROM public.agent_team_v WHERE person_id = p_person; END IF;
  SELECT status INTO v_prev FROM public.agent_flags
   WHERE rule_code = p_rule AND subject_type = p_subject_type AND subject_id = p_subject_id AND period_key = p_period;

  INSERT INTO public.agent_flags AS f (company_id, module, rule_code, severity, subject_type, subject_id, person_id, manager_id, title, why,
                                       evidence, suggested_action, period_key, first_seen_at, last_seen_at, item_type)
  VALUES (v_company, p_module, p_rule, p_severity, p_subject_type, p_subject_id, p_person, v_manager, left(p_title, 200), left(coalesce(p_why, ''), 1000),
          coalesce(p_evidence, '{}'::jsonb), p_action, p_period, p_now, p_now, 'flag')
  ON CONFLICT ON CONSTRAINT agent_flags_dedupe DO UPDATE SET
    severity = EXCLUDED.severity, title = EXCLUDED.title, why = EXCLUDED.why, evidence = EXCLUDED.evidence,
    suggested_action = EXCLUDED.suggested_action, last_seen_at = p_now, updated_at = p_now,
    status = CASE WHEN f.status = 'auto_resolved' OR (f.status = 'snoozed' AND f.snoozed_until < p_now) THEN 'open' ELSE f.status END,
    snoozed_until = CASE WHEN f.status = 'snoozed' AND f.snoozed_until < p_now THEN NULL ELSE f.snoozed_until END,
    occurrence_count = CASE WHEN f.status = 'auto_resolved' THEN f.occurrence_count + 1 ELSE f.occurrence_count END
  RETURNING f.id, (xmax = 0) INTO v_id, v_inserted;

  IF v_inserted THEN
    INSERT INTO public.agent_flag_events (flag_id, kind, detail) VALUES (v_id, 'created', jsonb_build_object('rule', p_rule));
  ELSIF v_prev = 'auto_resolved' THEN
    INSERT INTO public.agent_flag_events (flag_id, kind, detail) VALUES (v_id, 'reopened', jsonb_build_object('rule', p_rule));
  END IF;
  RETURN v_inserted OR v_prev = 'auto_resolved';
END $$;

-- Closes the open items of a rule for these subjects (the condition cleared).
CREATE OR REPLACE FUNCTION public.agent_resolve_flags(p_rule text, p_subject_ids text[], p_period text DEFAULT NULL, p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer;
BEGIN
  IF p_subject_ids IS NULL OR cardinality(p_subject_ids) = 0 THEN RETURN 0; END IF;
  WITH r AS (
    UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
     WHERE rule_code = p_rule AND status IN ('open', 'snoozed') AND subject_id = ANY (p_subject_ids)
       AND (p_period IS NULL OR period_key = p_period)
    RETURNING id
  )
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM r;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ── TR01 Not tracking time ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tr01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_start timestamptz; r record; v_idle numeric; v_sev text; v_why text;
  v_ok text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  v_start := v_day::timestamp AT TIME ZONE s.timezone;

  FOR r IN
    SELECT t.person_id, t.full_name, t.mins_since_start,
           EXISTS (SELECT 1 FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.end_time IS NULL) AS running,
           (SELECT coalesce(sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, p_now) - e.start_time)) / 60.0)), 0)
              FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.start_time >= v_start) AS tracked_min,
           (SELECT max(coalesce(e.end_time, p_now)) FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.start_time >= v_start) AS last_at
      FROM public.agent_team_today(p_now) t
     WHERE t.expects_work AND t.in_window AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time
  LOOP
    v_idle := CASE WHEN r.last_at IS NULL THEN r.mins_since_start ELSE extract(epoch FROM (p_now - r.last_at)) / 60.0 END;
    IF NOT r.running AND v_idle >= (CASE WHEN r.last_at IS NULL THEN 30 ELSE 45 END) THEN
      v_sev := CASE WHEN v_idle >= 120 THEN 'high' ELSE 'medium' END;
      v_why := CASE WHEN r.last_at IS NULL
                    THEN format('Nothing tracked today. The work day opened %s minutes ago.', round(r.mins_since_start))
                    ELSE format('Stopped tracking at %s, %s minutes ago. %s tracked today.', public.agent_fmt_ts(r.last_at, s.timezone), round(v_idle),
                                CASE WHEN r.tracked_min >= 60 THEN round(r.tracked_min / 60.0, 1) || ' hours' ELSE round(r.tracked_min) || ' minutes' END) END;
      IF public.agent_raise_flag('TR01', 'track', r.person_id, 'person', r.person_id::text, v_day::text, v_sev, 'Not tracking time', v_why,
           jsonb_build_object('tracked_minutes_today', round(r.tracked_min), 'last_tracked_at', r.last_at, 'idle_minutes', round(v_idle),
                              'window', to_char(s.default_work_start, 'HH24:MI') || '–' || to_char(s.default_work_end, 'HH24:MI') || ' ET'),
           'Ask them to start their timer in Track.', p_now) THEN v_created := v_created + 1; END IF;
    ELSE
      v_ok := v_ok || r.person_id::text;
    END IF;
  END LOOP;

  -- Closed by the agent: they started tracking, or they are on leave, or it is a day off.
  v_ok := v_ok || coalesce((SELECT array_agg(person_id::text) FROM public.agent_team_today(p_now) WHERE NOT expects_work), '{}');
  v_resolved := public.agent_resolve_flags('TR01', v_ok, v_day::text, p_now);
  -- Yesterday's "not tracking" no longer matters.
  WITH st AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
               WHERE rule_code = 'TR01' AND status IN ('open', 'snoozed') AND period_key < v_day::text RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM st;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TR02 Forgotten timer ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tr02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; r record; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  FOR r IN
    SELECT e.id, e.employee_id, e.start_time, t.full_name FROM agent_read.v_time_entries e
      JOIN public.agent_team_v t ON t.person_id = e.employee_id
     WHERE e.end_time IS NULL AND e.start_time < p_now - interval '10 hours'
  LOOP
    IF public.agent_raise_flag('TR02', 'track', r.employee_id, 'time_entry', r.id::text, '', 'low', 'Timer left running',
         format('A timer started at %s has been running for %s hours.', public.agent_fmt_ts(r.start_time, s.timezone), round(extract(epoch FROM (p_now - r.start_time)) / 3600.0)),
         jsonb_build_object('running_hours', round(extract(epoch FROM (p_now - r.start_time)) / 3600.0), 'started_at', r.start_time),
         'Ask them to stop the timer and fix the entry.', p_now) THEN v_created := v_created + 1; END IF;
  END LOOP;
  WITH x AS (UPDATE public.agent_flags f SET status = 'auto_resolved', updated_at = p_now
              WHERE f.rule_code = 'TR02' AND f.status IN ('open', 'snoozed')
                AND NOT EXISTS (SELECT 1 FROM agent_read.v_time_entries e WHERE e.id::text = f.subject_id AND e.end_time IS NULL AND e.start_time < p_now - interval '10 hours')
              RETURNING f.id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TR05 Unexpected sites ──────────────────────────────────────────────────
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
             coalesce(bool_or(coalesce(c.cat = 'unproductive', false) OR coalesce(l.category = 'unproductive', false)), false) AS unprod,
             coalesce(bool_or(coalesce(c.cat = 'productive', false) OR coalesce(l.category = 'approved', false)), false) AS fine
        FROM caps c
        LEFT JOIN LATERAL (SELECT d.category FROM public.agent_domain_list d
                            WHERE d.category IN ('approved', 'unproductive') AND (c.domain = d.domain OR c.domain LIKE '%.' || d.domain)
                            ORDER BY (d.company_id IS NULL), length(d.domain) DESC LIMIT 1) l ON true
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

-- ── TK01 Overdue, TK02 Due date changed, TK06 No open tasks ───────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tk01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_day date; r record; v_sev text; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  FOR r IN
    SELECT t.id, t.title, t.due_date, t.assignee_id, tm.full_name, (v_day - t.due_date) AS days
      FROM agent_read.v_tasks t JOIN public.agent_team_v tm ON tm.person_id = t.assignee_id
     WHERE t.parent_id IS NULL AND t.status <> 'done' AND t.due_date < v_day
       AND coalesce(tm.group_name, '') NOT IN ('placement', 'leadership') AND coalesce(tm.exemptions ->> 'tasks', 'false') <> 'true'
  LOOP
    v_sev := CASE WHEN r.days >= 7 THEN 'high' WHEN r.days >= 3 THEN 'medium' ELSE 'low' END;
    IF public.agent_raise_flag('TK01', 'task', r.assignee_id, 'task', r.id::text, '', v_sev, 'Overdue: ' || left(r.title, 120),
         format('Due %s, %s %s late. Assigned to %s.', to_char(r.due_date, 'Mon FMDD'), r.days, CASE WHEN r.days = 1 THEN 'day' ELSE 'days' END, r.full_name),
         jsonb_build_object('task_id', r.id, 'task_title', r.title, 'due_date', r.due_date, 'days_overdue', r.days, 'assignee_name', r.full_name),
         'Ask for an update in the task comments. Due dates are not moved.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || r.id::text;
  END LOOP;
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TK01' AND status IN ('open', 'snoozed') AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

CREATE OR REPLACE FUNCTION public.agent_rule_tk02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_created integer := 0;
BEGIN
  FOR r IN
    SELECT a.id, a.task_id, a.detail, a.created_at, t.title, t.assignee_id, tm.full_name,
           (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = a.actor_id) AS by_name
      FROM agent_read.v_task_activity a
      JOIN agent_read.v_tasks t ON t.id = a.task_id
      JOIN public.agent_team_v tm ON tm.person_id = t.assignee_id
     WHERE a.kind = 'due_date' AND a.detail ->> 'from' IS NOT NULL AND a.detail ->> 'from' <> coalesce(a.detail ->> 'to', '')
       AND a.created_at >= p_now - interval '6 hours' AND a.created_at <= p_now AND t.parent_id IS NULL
       AND coalesce(tm.group_name, '') NOT IN ('placement', 'leadership')
  LOOP
    IF public.agent_raise_flag('TK02', 'task', r.assignee_id, 'task', r.id::text, '', 'high', 'Due date moved: ' || left(r.title, 120),
         format('%s changed the due date from %s to %s.', coalesce(r.by_name, 'Someone'), r.detail ->> 'from', coalesce(r.detail ->> 'to', 'no date')),
         jsonb_build_object('task_id', r.task_id, 'task_title', r.title, 'from', r.detail ->> 'from', 'to', r.detail ->> 'to', 'by_name', r.by_name),
         'Due dates are not moved. If work slipped, it goes in a comment.', p_now) THEN v_created := v_created + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('created', v_created, 'resolved', 0);
END $$;

CREATE OR REPLACE FUNCTION public.agent_rule_tk06(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_day date; r record; v_ok text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  FOR r IN
    SELECT t.person_id, t.full_name,
           (SELECT count(*) FROM agent_read.v_tasks k WHERE k.assignee_id = t.person_id AND k.parent_id IS NULL AND k.status <> 'done') AS open_tasks
      FROM public.agent_team_today(p_now) t
     WHERE t.expects_work AND t.in_window AND t.mins_since_start >= 60 AND coalesce(t.grp, '') NOT IN ('placement', 'leadership') AND NOT t.exempt_tasks
  LOOP
    IF r.open_tasks = 0 THEN
      IF public.agent_raise_flag('TK06', 'task', r.person_id, 'person', r.person_id::text, v_day::text, 'medium', 'No open tasks',
           format('Nothing is assigned to %s in Task, so nothing is being worked on.', r.full_name), '{}'::jsonb,
           'Agree their work and add it to Task with a due date.', p_now) THEN v_created := v_created + 1; END IF;
    ELSE
      v_ok := v_ok || r.person_id::text;
    END IF;
  END LOOP;
  v_ok := v_ok || coalesce((SELECT array_agg(person_id::text) FROM public.agent_team_today(p_now) WHERE NOT expects_work), '{}');
  v_resolved := public.agent_resolve_flags('TK06', v_ok, v_day::text, p_now);
  WITH st AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
               WHERE rule_code = 'TK06' AND status IN ('open', 'snoozed') AND period_key < v_day::text RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM st;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── TK13 Ready for review, TK14 Task completed (immediate) ─────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_tk13(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_created integer := 0; v_resolved integer := 0; v_n integer;
BEGIN
  FOR r IN
    SELECT a.id, a.detail ->> 'to' AS to_status, t.id AS task_id, t.title, t.assignee_id, t.status,
           (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = a.actor_id) AS by_name, tm.full_name AS assignee_name
      FROM agent_read.v_task_activity a
      JOIN agent_read.v_tasks t ON t.id = a.task_id
      JOIN public.agent_team_v tm ON tm.person_id = t.assignee_id
     WHERE a.kind = 'status' AND a.detail ->> 'to' IN ('in_review', 'done')
       AND a.created_at >= p_now - interval '3 hours' AND a.created_at <= p_now AND t.parent_id IS NULL
       AND coalesce(tm.group_name, '') NOT IN ('placement', 'leadership')
  LOOP
    IF r.to_status = 'in_review' AND r.status = 'in_review' THEN
      IF public.agent_raise_flag('TK13', 'task', r.assignee_id, 'task', r.id::text, '', 'low', 'Ready for review: ' || left(r.title, 120),
           format('%s moved this to In Review.', coalesce(r.by_name, r.assignee_name)),
           jsonb_build_object('task_id', r.task_id, 'task_title', r.title, 'by_name', coalesce(r.by_name, r.assignee_name), 'to', 'in_review'),
           'Review it and set it to Complete, or send it back to In Progress.', p_now) THEN v_created := v_created + 1; END IF;
    ELSIF r.to_status = 'done' AND r.status = 'done' THEN
      IF public.agent_raise_flag('TK14', 'task', r.assignee_id, 'task', r.id::text, '', 'info', 'Completed: ' || left(r.title, 120),
           format('%s marked this complete.', coalesce(r.by_name, r.assignee_name)),
           jsonb_build_object('task_id', r.task_id, 'task_title', r.title, 'by_name', coalesce(r.by_name, r.assignee_name)),
           NULL, p_now) THEN v_created := v_created + 1; END IF;
    END IF;
  END LOOP;
  -- No longer waiting for review.
  WITH x AS (UPDATE public.agent_flags f SET status = 'auto_resolved', updated_at = p_now
              WHERE f.rule_code = 'TK13' AND f.status IN ('open', 'snoozed')
                AND NOT EXISTS (SELECT 1 FROM agent_read.v_tasks t WHERE t.id::text = f.evidence ->> 'task_id' AND t.status = 'in_review') RETURNING f.id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_resolved := v_n;
  -- Completed items are good news; they clear themselves after a day.
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'TK14' AND status IN ('open', 'snoozed') AND first_seen_at < p_now - interval '24 hours' RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_resolved := v_resolved + v_n;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── RP01 Missing daily report ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_rp01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_local timestamp; r record; v_ok text[] := '{}'; v_sub uuid[];
  v_created integer := 0; v_resolved integer := 0; v_due boolean;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone;
  v_day := v_local::date;
  v_due := v_local::time >= s.report_deadline + interval '5 minutes';
  SELECT coalesce(array_agg(x), '{}') INTO v_sub FROM public.agent_report_submitters(v_day) x;

  FOR r IN
    SELECT t.person_id, t.full_name FROM public.agent_team_today(p_now) t
     WHERE t.expects_work AND coalesce(t.grp, '') NOT IN ('placement', 'leadership') AND NOT t.exempt_reports
  LOOP
    IF r.person_id = ANY (v_sub) THEN
      v_ok := v_ok || r.person_id::text;
    ELSIF v_due THEN
      IF public.agent_raise_flag('RP01', 'reports', r.person_id, 'person', r.person_id::text, v_day::text, 'high', 'Daily report missing',
           format('No daily report from %s for %s. The deadline was %s.', r.full_name, to_char(v_day, 'Mon FMDD'), public.agent_fmt_ts((v_day::timestamp + s.report_deadline) AT TIME ZONE s.timezone, s.timezone)),
           jsonb_build_object('day', v_day, 'deadline', to_char(s.report_deadline, 'FMHH12:MI AM') || ' ET'),
           'Ask them to send the report now.', p_now) THEN v_created := v_created + 1; END IF;
    END IF;
  END LOOP;
  v_ok := v_ok || coalesce((SELECT array_agg(person_id::text) FROM public.agent_team_today(p_now) WHERE NOT expects_work), '{}');
  v_resolved := public.agent_resolve_flags('RP01', v_ok, v_day::text, p_now);
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── The runner ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_run_rules(p_now timestamptz DEFAULT now(), p_trigger text DEFAULT 'schedule')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_codes text[] := ARRAY['TR01', 'TR02', 'TR05', 'TK01', 'TK02', 'TK06', 'TK13', 'RP01'];
  v_code text; v_res jsonb; v_t0 timestamptz; v_created integer := 0; v_resolved integer := 0; v_errors text[] := '{}'; v_c integer; v_r integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('agent_run_rules')) THEN RETURN jsonb_build_object('skipped', true); END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_t0 := clock_timestamp();

  FOREACH v_code IN ARRAY v_codes LOOP
    IF NOT coalesce((SELECT enabled FROM public.agent_rules WHERE code = v_code), true) THEN CONTINUE; END IF;
    BEGIN
      v_res := CASE v_code
        WHEN 'TR01' THEN public.agent_rule_tr01(p_now) WHEN 'TR02' THEN public.agent_rule_tr02(p_now) WHEN 'TR05' THEN public.agent_rule_tr05(p_now)
        WHEN 'TK01' THEN public.agent_rule_tk01(p_now) WHEN 'TK02' THEN public.agent_rule_tk02(p_now) WHEN 'TK06' THEN public.agent_rule_tk06(p_now)
        WHEN 'TK13' THEN public.agent_rule_tk13(p_now) WHEN 'RP01' THEN public.agent_rule_rp01(p_now) END;
      v_c := (v_res ->> 'created')::integer; v_r := (v_res ->> 'resolved')::integer;
      v_created := v_created + v_c; v_resolved := v_resolved + v_r;
      IF v_c > 0 OR v_r > 0 THEN
        INSERT INTO public.agent_rule_runs (rule_code, trigger, started_at, finished_at, flags_created, flags_resolved) VALUES (v_code, p_trigger, v_t0, clock_timestamp(), v_c, v_r);
      END IF;
      -- the rule works again: close any "rule failed" item for it
      PERFORM public.agent_resolve_flags('SY03', ARRAY[v_code], NULL, p_now);
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || v_code;
      INSERT INTO public.agent_rule_runs (rule_code, trigger, started_at, finished_at, error) VALUES (v_code, p_trigger, v_t0, clock_timestamp(), left(SQLERRM, 300));
      PERFORM public.agent_raise_flag('SY03', NULL, NULL, 'system', v_code, to_char(p_now AT TIME ZONE s.timezone, 'YYYY-MM-DD'), 'medium', 'Rule failed: ' || v_code,
                'The monitor could not run this rule: ' || left(SQLERRM, 200), jsonb_build_object('rule', v_code), NULL, p_now);
    END;
  END LOOP;

  -- Snoozed items wake up when their time is over.
  UPDATE public.agent_flags SET status = 'open', snoozed_until = NULL, updated_at = p_now WHERE status = 'snoozed' AND snoozed_until < p_now;
  IF extract(minute FROM p_now) = 0 THEN DELETE FROM public.agent_rule_runs WHERE started_at < p_now - interval '14 days'; END IF;

  INSERT INTO public.agent_monitor_state (key, value, updated_at)
  VALUES ('last_run', jsonb_build_object('at', p_now, 'ok', cardinality(v_errors) = 0, 'ms', round(extract(epoch FROM (clock_timestamp() - v_t0)) * 1000),
                                         'created', v_created, 'resolved', v_resolved, 'errors', to_jsonb(v_errors), 'trigger', p_trigger), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved, 'errors', to_jsonb(v_errors));
END $$;

-- "Check now" for a person at the keyboard.
CREATE OR REPLACE FUNCTION public.agent_check_now()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  RETURN public.agent_run_rules(now(), 'manual');
END $$;

-- ── The pulse the Inbox shows ──────────────────────────────────────────────
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
   WHERE expects_work AND coalesce(grp, '') NOT IN ('placement', 'leadership') AND NOT exempt_reports;
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
    'rules_active', (SELECT count(*) FROM public.agent_rules WHERE enabled)
  );
END $$;

REVOKE ALL ON FUNCTION public.agent_fmt_ts(timestamptz, text), public.agent_team_today(timestamptz), public.agent_report_submitters(date),
  public.agent_raise_flag(text, text, uuid, text, text, text, text, text, text, jsonb, text, timestamptz),
  public.agent_resolve_flags(text, text[], text, timestamptz),
  public.agent_rule_tr01(timestamptz), public.agent_rule_tr02(timestamptz), public.agent_rule_tr05(timestamptz), public.agent_rule_tk01(timestamptz),
  public.agent_rule_tk02(timestamptz), public.agent_rule_tk06(timestamptz), public.agent_rule_tk13(timestamptz), public.agent_rule_rp01(timestamptz),
  public.agent_run_rules(timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_fmt_ts(timestamptz, text), public.agent_team_today(timestamptz), public.agent_report_submitters(date),
  public.agent_raise_flag(text, text, uuid, text, text, text, text, text, text, jsonb, text, timestamptz),
  public.agent_resolve_flags(text, text[], text, timestamptz),
  public.agent_rule_tr01(timestamptz), public.agent_rule_tr02(timestamptz), public.agent_rule_tr05(timestamptz), public.agent_rule_tk01(timestamptz),
  public.agent_rule_tk02(timestamptz), public.agent_rule_tk06(timestamptz), public.agent_rule_tk13(timestamptz), public.agent_rule_rp01(timestamptz),
  public.agent_run_rules(timestamptz, text) TO service_role;
REVOKE ALL ON FUNCTION public.agent_check_now(), public.agent_team_pulse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_check_now(), public.agent_team_pulse() TO authenticated;

-- ── The rules, switched on ─────────────────────────────────────────────────
INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, status) VALUES
  ('TR01', 'track',   'Not tracking time',    'In the work window with no timer running for 30 minutes (never started) or 45 minutes (stopped).', true, 'medium', 'ready'),
  ('TR02', 'track',   'Forgotten timer',      'A timer running for more than 10 hours.', true, 'low', 'ready'),
  ('TR05', 'track',   'Unexpected sites',     'An unproductive or unfamiliar site visited. Flags on the first sighting.', true, 'medium', 'ready'),
  ('TK01', 'task',    'Overdue task',         'An open task past its due date. Severity rises with the days late.', true, 'low', 'ready'),
  ('TK02', 'task',    'Due date changed',     'A due date moved after it was first set.', true, 'high', 'ready'),
  ('TK06', 'task',    'No open tasks',        'A team member with nothing assigned during the work day.', true, 'medium', 'ready'),
  ('TK13', 'task',    'Ready for review',     'A task moved to In Review. Clears when it leaves In Review.', true, 'low', 'ready'),
  ('TK14', 'task',    'Task completed',       'A task moved to Complete. Clears after 24 hours.', true, 'info', 'ready'),
  ('RP01', 'reports', 'Missing daily report', 'No daily report 5 minutes after the deadline.', true, 'high', 'ready'),
  ('SY03', NULL,      'Rule failed',          'The monitor could not run a rule.', true, 'medium', 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, enabled = true, status = 'ready';

-- The approved and unproductive site lists, from Track's productivity rules (domains only).
INSERT INTO public.agent_domain_list (domain, category, source)
SELECT DISTINCT ON (d) d, CASE r.category WHEN 'productive' THEN 'approved' ELSE 'unproductive' END, 'productivity_rules'
  FROM public.time_productivity_rules r
  CROSS JOIN LATERAL (SELECT regexp_replace(lower(btrim(r.app_name_contains)), '^www\.', '') AS d) x
 WHERE r.category IN ('productive', 'unproductive') AND r.title_contains IS NULL AND r.app_name_contains LIKE '%.%' AND r.app_name_contains !~ '\s'
ON CONFLICT DO NOTHING;

-- ── Every minute ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agent_monitor') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent_monitor');
    PERFORM cron.schedule('agent_monitor', '* * * * *', 'SELECT public.agent_run_rules()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed here: agent_monitor was not scheduled';
  END IF;
  IF to_regclass('public.cron_job_expectations') IS NOT NULL THEN
    INSERT INTO public.cron_job_expectations (job_name, description, max_gap_minutes)
    VALUES ('agent_monitor', 'Ops Agent monitor: runs the rules every minute', 10)
    ON CONFLICT (job_name) DO UPDATE SET description = EXCLUDED.description, max_gap_minutes = EXCLUDED.max_gap_minutes;
  END IF;
END $$;
