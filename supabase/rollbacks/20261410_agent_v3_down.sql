-- Rolls back 20261410000000_agent_team_focus.sql and 20261410000100_agent_monitor.sql. Not run automatically.
-- Open items the monitor raised stay in agent_flags (close them from the Inbox, or delete rule_code in the list below).

-- The monitor
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agent_monitor') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent_monitor');
  END IF;
  IF to_regclass('public.cron_job_expectations') IS NOT NULL THEN DELETE FROM public.cron_job_expectations WHERE job_name = 'agent_monitor'; END IF;
END $$;
DROP FUNCTION IF EXISTS public.agent_team_pulse();
DROP FUNCTION IF EXISTS public.agent_check_now();
DROP FUNCTION IF EXISTS public.agent_run_rules(timestamptz, text);
DROP FUNCTION IF EXISTS public.agent_rule_rp01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tk13(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tk06(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tk02(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tk01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tr05(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tr02(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tr01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_resolve_flags(text, text[], text, timestamptz);
DROP FUNCTION IF EXISTS public.agent_raise_flag(text, text, uuid, text, text, text, text, text, text, jsonb, text, timestamptz);
DROP FUNCTION IF EXISTS public.agent_report_submitters(date);
DROP FUNCTION IF EXISTS public.agent_team_today(timestamptz);
DROP FUNCTION IF EXISTS public.agent_fmt_ts(timestamptz, text);
DROP TABLE IF EXISTS public.agent_monitor_state;
UPDATE public.agent_flags SET status = 'dismissed' WHERE rule_code IN ('TR01', 'TR02', 'TR05', 'TK01', 'TK02', 'TK06', 'TK13', 'TK14', 'RP01', 'SY03') AND status IN ('open', 'snoozed');
DELETE FROM public.agent_rules WHERE code IN ('TR01', 'TR02', 'TR05', 'TK01', 'TK02', 'TK06', 'TK13', 'TK14', 'RP01', 'SY03');

-- Team focus: the reader views as they were
CREATE OR REPLACE VIEW agent_read.v_people AS
SELECT p.id, p.full_name, p.job_title, p.department_id, p.status, p.role,
       p.reporting_manager_id, p.pay_group_id, g.company_id,
       p.timezone, p.start_date, p.employment_type
  FROM public.profiles p
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id
 WHERE coalesce(p.is_anonymised, false) = false;

CREATE OR REPLACE VIEW agent_read.v_tasks AS
SELECT t.id, t.list_id, t.parent_id, t.title, t.description, t.status, t.assignee_id, t.due_date,
       t.completed_at, t.created_at, t.updated_at, t.priority, t.created_by, g.company_id
  FROM public.tm_tasks t
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_task_activity AS
SELECT a.id, a.task_id, a.actor_id, a.kind, a.detail, a.created_at,
       t.assignee_id, g.company_id
  FROM public.tm_task_activity a
  JOIN public.tm_tasks t ON t.id = a.task_id
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_task_comments AS
SELECT c.id, c.task_id, c.author_id, c.body, c.created_at,
       t.assignee_id, g.company_id
  FROM public.tm_task_comments c
  JOIN public.tm_tasks t ON t.id = c.task_id
  LEFT JOIN public.profiles p ON p.id = t.assignee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_time_entries AS
SELECT e.id, e.employee_id, e.project_id, e.task_id, e.start_time, e.end_time, e.duration_minutes,
       e.entry_source, e.is_billable, e.created_at, g.company_id
  FROM public.time_entries e
  LEFT JOIN public.profiles p ON p.id = e.employee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_activity_domains AS
SELECT l.id, l.employee_id, l.captured_at,
       nullif(regexp_replace(lower(substring(coalesce(l.url, '') FROM '^(?:[a-z][a-z0-9+.-]*://)?(?:[^/@]*@)?([^/:?#]+)')), '^www\.', ''), '') AS domain,
       l.app_name, l.productivity_category,
       l.active_seconds, l.window_seconds, l.input_events, l.mouse_events,
       g.company_id
  FROM public.time_activity_logs l
  LEFT JOIN public.profiles p ON p.id = l.employee_id
  LEFT JOIN public.pay_groups g ON g.id = p.pay_group_id;

CREATE OR REPLACE VIEW agent_read.v_leave AS
SELECT lr.employee_id, lr.start_date, lr.end_date, lr.is_half_day, lr.status, 'hr'::text AS source
  FROM public.leave_requests lr
 WHERE lr.status = 'approved' AND lr.deleted_at IS NULL
UNION ALL
SELECT tl.employee_id, tl.start_date, tl.end_date, false AS is_half_day, tl.status, 'track'::text AS source
  FROM public.time_leave_requests tl
 WHERE tl.status = 'approved';

CREATE OR REPLACE FUNCTION public.agent_suggest_person_profiles(p_leadership_pay_groups uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_leadership uuid[];
  v_written integer;
  v_manual integer;
  v_no_company integer;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;

  v_leadership := coalesce(p_leadership_pay_groups,
    ARRAY(SELECT id FROM public.pay_groups WHERE lower(btrim(name)) = 'kds - directors'));

  SELECT count(*) INTO v_no_company FROM public.profiles p
   WHERE p.status = 'active' AND coalesce(p.is_anonymised, false) = false AND p.pay_group_id IS NULL;

  WITH people AS (
    SELECT p.id, p.reporting_manager_id,
           CASE
             WHEN p.pay_group_id = ANY (v_leadership) THEN 'leadership'
             WHEN EXISTS (SELECT 1 FROM public.placements pl WHERE pl.employee_id = p.id AND pl.status = 'active') THEN 'placement'
             ELSE 'core'
           END AS grp
      FROM public.profiles p
     WHERE p.status = 'active' AND coalesce(p.is_anonymised, false) = false AND p.pay_group_id IS NOT NULL
  ), up AS (
    INSERT INTO public.agent_person_profile AS a (person_id, group_name, group_source, manager_id, updated_by)
    SELECT id, grp, 'auto', reporting_manager_id, auth.uid() FROM people
    ON CONFLICT (person_id) DO UPDATE
      SET group_name = EXCLUDED.group_name,
          manager_id = coalesce(a.manager_id, EXCLUDED.manager_id),
          updated_by = auth.uid()
      WHERE a.group_source = 'auto' OR a.group_name IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_written FROM up;

  SELECT count(*) INTO v_manual FROM public.agent_person_profile WHERE group_source = 'manual' AND group_name IS NOT NULL;

  RETURN jsonb_build_object('written', v_written, 'kept_manual', v_manual, 'skipped_no_company', v_no_company);
END $$;

CREATE OR REPLACE FUNCTION public.agent_chat_tool(p_tool text, p_args jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp SET statement_timeout = '10s' AS $$
DECLARE
  s public.agent_settings%ROWTYPE;
  a jsonb := CASE WHEN jsonb_typeof(p_args) = 'object' THEN p_args ELSE '{}'::jsonb END;
  v_super boolean;
  v_limit integer := CASE WHEN a ->> 'limit' ~ '^\d{1,3}$' THEN least(greatest((a ->> 'limit')::integer, 1), 50) ELSE 25 END;
  v_today date;
  v_name text := nullif(btrim(left(a ->> 'name', 80)), '');
  v_status text := nullif(btrim(a ->> 'status'), '');
  v_group text := nullif(btrim(a ->> 'group'), '');
  v_from date := public.agent_safe_date(a ->> 'from');
  v_to date := public.agent_safe_date(a ->> 'to');
  v_day date;
  v_rows jsonb;
  v_out jsonb;
  v_date_field text; v_person_field text; v_setting_field text; v_working boolean;
  v_core_exists boolean;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  v_super := public.agent_can_configure();
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_today := (now() AT TIME ZONE s.timezone)::date;
  IF v_status IS NOT NULL AND v_status NOT IN ('to_do', 'in_progress', 'in_review', 'blocked', 'done') THEN v_status := NULL; END IF;
  IF v_group IS NOT NULL AND v_group NOT IN ('leadership', 'core', 'placement') THEN v_group := NULL; END IF;

  IF p_tool = 'people' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT p.full_name AS name, p.job_title AS title, p.role, c.name AS company, ap.group_name AS "group", m.full_name AS manager
        FROM agent_read.v_people p
        LEFT JOIN agent_read.v_companies c ON c.id = p.company_id
        LEFT JOIN public.agent_person_profile ap ON ap.person_id = p.id
        LEFT JOIN agent_read.v_people m ON m.id = p.reporting_manager_id
       WHERE p.status = 'active'
         AND (v_name IS NULL OR p.full_name ILIKE '%' || v_name || '%')
         AND (v_group IS NULL OR ap.group_name = v_group)
         AND (v_super OR public.agent_in_scope(p.company_id, 'people', p.id))
       ORDER BY p.full_name LIMIT v_limit) r;
    v_out := jsonb_build_object('people', v_rows);

  ELSIF p_tool = 'tasks' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT t.title, t.status, t.priority, t.due_date, p.full_name AS assignee,
             (t.due_date < v_today AND t.status <> 'done') AS overdue
        FROM agent_read.v_tasks t
        LEFT JOIN agent_read.v_people p ON p.id = t.assignee_id
       WHERE t.parent_id IS NULL
         AND CASE WHEN v_status IS NULL THEN t.status <> 'done' ELSE t.status = v_status END
         AND (lower(coalesce(a ->> 'overdue', 'false')) NOT IN ('true', 't', '1') OR (t.due_date < v_today AND t.status <> 'done'))
         AND (v_name IS NULL OR p.full_name ILIKE '%' || v_name || '%')
         AND (v_from IS NULL OR t.due_date >= v_from) AND (v_to IS NULL OR t.due_date <= v_to)
         AND (v_super OR public.agent_in_scope(t.company_id, 'task', t.assignee_id))
       ORDER BY t.due_date NULLS LAST, t.title LIMIT v_limit) r;
    v_out := jsonb_build_object('today', v_today, 'tasks', v_rows, 'note', 'Open tasks unless a status is given. Subtasks are not counted.');

  ELSIF p_tool = 'task_summary' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT coalesce(p.full_name, 'Unassigned') AS assignee,
             count(*) FILTER (WHERE t.status <> 'done') AS open,
             count(*) FILTER (WHERE t.status <> 'done' AND t.due_date < v_today) AS overdue,
             count(*) FILTER (WHERE t.status = 'blocked') AS blocked,
             count(*) FILTER (WHERE t.status = 'in_review') AS in_review,
             count(*) FILTER (WHERE t.status <> 'done' AND t.due_date IS NULL) AS no_due_date,
             count(*) FILTER (WHERE t.status = 'done' AND t.completed_at >= now() - interval '7 days') AS completed_last_7_days
        FROM agent_read.v_tasks t
        LEFT JOIN agent_read.v_people p ON p.id = t.assignee_id
       WHERE t.parent_id IS NULL
         AND (v_super OR public.agent_in_scope(t.company_id, 'task', t.assignee_id))
       GROUP BY p.full_name
       ORDER BY 3 DESC, 2 DESC LIMIT 25) r;
    v_out := jsonb_build_object('today', v_today, 'by_assignee', v_rows);

  ELSIF p_tool = 'daily_reports' THEN
    v_day := coalesce(public.agent_safe_date(a ->> 'date'), v_today);
    v_working := extract(isodow FROM v_day)::integer = ANY (s.default_working_days);
    SELECT t.report_date_field INTO v_setting_field FROM public.tm_tables t WHERE t.id = s.report_table_id;
    SELECT f.id::text INTO v_person_field FROM agent_read.v_report_fields f WHERE f.type = 'person' ORDER BY f.position LIMIT 1;
    IF v_setting_field IS DISTINCT FROM 'created_at' THEN
      SELECT f.id::text INTO v_date_field FROM agent_read.v_report_fields f
       WHERE f.type = 'date' AND (v_setting_field IS NULL OR f.id::text = v_setting_field) ORDER BY f.position LIMIT 1;
      IF v_date_field IS NULL AND v_setting_field IS NOT NULL THEN
        SELECT f.id::text INTO v_date_field FROM agent_read.v_report_fields f WHERE f.type = 'date' ORDER BY f.position LIMIT 1;
      END IF;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public.agent_person_profile WHERE group_name = 'core') INTO v_core_exists;

    WITH day_rows AS (
      SELECT r.data, r.created_by FROM agent_read.v_report_rows r
       WHERE coalesce(public.agent_safe_date(left(r.data ->> v_date_field, 10)), (r.created_at AT TIME ZONE 'Africa/Lagos')::date) = v_day
    ), submitted AS (
      SELECT DISTINCT e::uuid AS person_id
        FROM day_rows d
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN v_person_field IS NULL THEN jsonb_build_array(d.created_by)
               WHEN jsonb_typeof(d.data -> v_person_field) = 'array' THEN d.data -> v_person_field
               WHEN jsonb_typeof(d.data -> v_person_field) = 'string' THEN jsonb_build_array(d.data -> v_person_field)
               ELSE '[]'::jsonb END) AS e
       WHERE e ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ), expected AS (
      SELECT p.id, p.full_name, p.company_id, m.full_name AS manager
        FROM agent_read.v_people p
        LEFT JOIN public.agent_person_profile ap ON ap.person_id = p.id
        LEFT JOIN agent_read.v_people m ON m.id = p.reporting_manager_id
        LEFT JOIN agent_read.v_companies c ON c.id = p.company_id
       WHERE p.status = 'active'
         AND coalesce(ap.exemptions ->> 'reports', 'false') <> 'true'
         AND CASE WHEN v_core_exists THEN ap.group_name = 'core'
                  ELSE c.name ILIKE 'kd squares%' AND p.role <> 'field_staff' AND coalesce(p.job_title, '') !~* 'field\s*agent' END
         AND (v_super OR public.agent_in_scope(p.company_id, 'reports', p.id))
    ), on_leave AS (
      SELECT DISTINCT employee_id FROM agent_read.v_leave WHERE v_day BETWEEN start_date AND end_date
    )
    SELECT jsonb_build_object(
             'date', v_day, 'working_day', v_working,
             'expected', (SELECT count(*) FROM expected),
             'submitted', (SELECT count(*) FROM expected e WHERE e.id IN (SELECT person_id FROM submitted)),
             'missing', coalesce((SELECT jsonb_agg(jsonb_build_object('name', e.full_name, 'manager', e.manager) ORDER BY e.full_name)
                                    FROM expected e WHERE e.id NOT IN (SELECT person_id FROM submitted) AND e.id NOT IN (SELECT employee_id FROM on_leave)), '[]'::jsonb),
             'on_leave', coalesce((SELECT jsonb_agg(e.full_name ORDER BY e.full_name) FROM expected e WHERE e.id IN (SELECT employee_id FROM on_leave) AND e.id NOT IN (SELECT person_id FROM submitted)), '[]'::jsonb),
             'reported', coalesce((SELECT jsonb_agg(e.full_name ORDER BY e.full_name) FROM expected e WHERE e.id IN (SELECT person_id FROM submitted)), '[]'::jsonb))
      INTO v_out;
    v_out := v_out || jsonb_build_object('note', CASE WHEN s.report_table_id IS NULL THEN 'No daily report table is chosen in Settings.' WHEN NOT v_working THEN 'This is not a default working day.' ELSE 'Expected = the core group (or KD Squares staff who are not Field Agents when no groups are set), minus exemptions.' END);

  ELSIF p_tool = 'hours' THEN
    v_to := coalesce(v_to, v_today);
    v_from := coalesce(v_from, v_to - 6);
    IF v_to - v_from > 92 THEN v_from := v_to - 92; END IF;
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT p.full_name AS person,
             round((sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, now()) - e.start_time)) / 60.0)) / 60.0)::numeric, 2) AS hours,
             count(*) AS entries,
             bool_or(e.end_time IS NULL) AS timer_running_now
        FROM agent_read.v_time_entries e
        JOIN agent_read.v_people p ON p.id = e.employee_id
       WHERE e.start_time >= (v_from::timestamp AT TIME ZONE s.timezone)
         AND e.start_time < ((v_to + 1)::timestamp AT TIME ZONE s.timezone)
         AND (v_name IS NULL OR p.full_name ILIKE '%' || v_name || '%')
         AND (v_super OR public.agent_in_scope(e.company_id, 'track', e.employee_id))
       GROUP BY p.full_name ORDER BY 2 DESC LIMIT v_limit) r;
    v_out := jsonb_build_object('from', v_from, 'to', v_to, 'tracked_hours', v_rows);

  ELSIF p_tool = 'leave' THEN
    v_day := coalesce(public.agent_safe_date(a ->> 'date'), v_today);
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT p.full_name AS person, l.start_date AS "from", l.end_date AS "to", l.is_half_day AS half_day, l.source
        FROM agent_read.v_leave l
        JOIN agent_read.v_people p ON p.id = l.employee_id
       WHERE v_day BETWEEN l.start_date AND l.end_date
         AND (v_super OR public.agent_in_scope(p.company_id, 'leave', p.id))
       ORDER BY p.full_name LIMIT v_limit) r;
    v_out := jsonb_build_object('date', v_day, 'on_approved_leave', v_rows);

  ELSIF p_tool = 'flags' THEN
    SELECT coalesce(jsonb_agg(r), '[]'::jsonb) INTO v_rows FROM (
      SELECT f.title, f.severity, f.rule_code, f.why, f.occurrence_count, f.last_seen_at, p.full_name AS person
        FROM public.agent_flags f
        LEFT JOIN agent_read.v_people p ON p.id = f.person_id
       WHERE f.status = 'open'
         AND (v_super OR public.agent_in_scope(f.company_id, f.module, f.person_id))
       ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, f.last_seen_at DESC
       LIMIT v_limit) r;
    v_out := jsonb_build_object('open_flags', v_rows);

  ELSIF p_tool = 'request_human_action' THEN
    -- The agent never edits or deletes anything. A request to do so becomes an Inbox item a person must act on.
    IF coalesce(btrim(a ->> 'title'), '') = '' THEN RAISE EXCEPTION 'title_required'; END IF;
    INSERT INTO public.agent_flags (company_id, rule_code, severity, subject_type, subject_id, title, why, item_type, assigned_to, period_key)
    VALUES (public.agent_company_of(auth.uid()), 'HUMAN_ACTION', 'medium', 'system', gen_random_uuid()::text,
            left(btrim(a ->> 'title'), 200), left(coalesce(a ->> 'details', ''), 2000), 'human_action', auth.uid(), '')
    RETURNING jsonb_build_object('created', true, 'id', id) INTO v_out;

  ELSE
    RAISE EXCEPTION 'unknown_tool';
  END IF;

  RETURN v_out || jsonb_build_object('tool', p_tool,
    'scope', CASE WHEN v_super THEN 'all companies and modules' ELSE 'limited to the companies and modules this person may see' END);
END $$;

REVOKE ALL ON FUNCTION public.agent_chat_tool(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_chat_tool(text, jsonb) TO authenticated;
DROP VIEW IF EXISTS public.agent_team_v;
