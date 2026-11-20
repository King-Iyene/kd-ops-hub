-- Ops Agent: ONE rule for who a person's manager is, used everywhere (the Inbox card, drafted messages, rules, the Cliq tags).
--
-- Until now the agent read only profiles.reporting_manager_id. The manager you set for a person in Settings, People (agent_person_profile.
-- manager_id) was ignored, so some cards showed no manager and Cliq messages could not CC one. Now:
--   agent_manager_of(person) = the manager set in Settings, People, else the staff profile's reporting manager, else the head of their
--                              department (never the person themselves).
--   agent_team_v.manager_id  uses it, so every rule that raises an item stores the right manager.
--   agent_flag_draft / agent_flag_detail use it (the same bodies as 20261417000000, with only the manager lookup changed).
--   Open items get their manager filled in or corrected once, here.
--
-- Rollback: supabase/rollbacks/20261418_agent_manager_resolution_down.sql

CREATE OR REPLACE FUNCTION public.agent_manager_of(p_person uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    (SELECT ap.manager_id FROM public.agent_person_profile ap WHERE ap.person_id = p_person AND ap.manager_id IS NOT NULL AND ap.manager_id <> p_person),
    (SELECT p.reporting_manager_id FROM public.profiles p WHERE p.id = p_person AND p.reporting_manager_id IS NOT NULL AND p.reporting_manager_id <> p_person),
    (SELECT d.head_id FROM public.profiles p JOIN public.departments d ON d.id = p.department_id WHERE p.id = p_person AND d.head_id IS NOT NULL AND d.head_id <> p_person)
  )
$$;
REVOKE ALL ON FUNCTION public.agent_manager_of(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_manager_of(uuid) TO service_role;

CREATE OR REPLACE VIEW public.agent_team_v AS
SELECT p.id AS person_id, p.full_name, p.job_title, p.role, public.agent_manager_of(p.id) AS manager_id, g.company_id,
       ap.group_name, ap.exemptions, ap.working_days, ap.work_start, ap.work_end, ap.country_code
  FROM public.profiles p
  JOIN public.pay_groups g ON g.id = p.pay_group_id
  JOIN public.companies c ON c.id = g.company_id
  LEFT JOIN public.agent_person_profile ap ON ap.person_id = p.id
 WHERE p.status = 'active'
   AND coalesce(p.is_anonymised, false) = false
   AND c.name ILIKE 'kd squares%'
   AND p.role IS DISTINCT FROM 'field_staff'
   AND coalesce(p.job_title, '') !~* 'field\s*agents?';
REVOKE ALL ON public.agent_team_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_team_v TO service_role;

CREATE OR REPLACE FUNCTION public.agent_flag_draft(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE; rec jsonb; v_n integer; v_win integer;
  v_first text; v_link jsonb; v_item text := ''; v_to text := 'person'; v_rcpt public.profiles%ROWTYPE; v_obs text; v_ask text; v_rep text := ''; v_subject text; v_sites text; v_unprod boolean; v_unknown boolean; v_apps text;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = f.person_id;
  SELECT * INTO m FROM public.profiles WHERE id = coalesce(public.agent_manager_of(p.id), f.manager_id);
  rec := public.agent_flag_recurrence(p_flag);
  v_n := (rec ->> 'count_in_window')::int; v_win := (rec ->> 'window_days')::int;

  -- who should hear about it: reviews go to the manager; everything else to the person
  IF f.rule_code IN ('TK08', 'TK13') AND m.id IS NOT NULL THEN v_to := 'manager'; v_rcpt := m; ELSE v_rcpt := p; END IF;
  v_first := coalesce(nullif(split_part(coalesce(v_rcpt.full_name, ''), ' ', 1), ''), 'there');

  v_obs := f.why;
  v_sites := (SELECT string_agg(s ->> 'domain' || ' (about ' || greatest(1, round(((s ->> 'seconds')::numeric) / 60)) || ' min)', ', ')
                FROM (SELECT s FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) s LIMIT 4) q(s));
  v_unprod := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) s WHERE s ->> 'category' = 'unproductive');
  v_unknown := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) s WHERE s ->> 'category' <> 'unproductive');

  v_apps := (SELECT string_agg(a ->> 'app' || ' (about ' || greatest(1, round(((a ->> 'seconds')::numeric) / 60)) || ' min)', ', ')
               FROM (SELECT a FROM jsonb_array_elements(coalesce(f.evidence -> 'apps', '[]'::jsonb)) a LIMIT 4) q(a));

  v_link := public.agent_flag_link(p_flag);
  -- the specific thing, by name, and where to find it (never a vague "a task")
  v_item := CASE
    WHEN f.evidence ->> 'task_title' IS NOT NULL THEN format('Task: "%s"%s', f.evidence ->> 'task_title', CASE WHEN f.evidence ->> 'due_date' IS NOT NULL THEN ' (due ' || to_char((f.evidence ->> 'due_date')::date, 'Mon FMDD') || ')' ELSE '' END)
    WHEN f.rule_code IN ('RP01', 'RP03') THEN 'Daily report for ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'today')
    WHEN f.rule_code = 'TR03' THEN 'Tracked time on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code IN ('TR01', 'TR02') THEN 'Your timer: ' || f.title
    WHEN f.rule_code = 'TR06' THEN 'Your timer, started at ' || coalesce(f.evidence ->> 'started_text', 'earlier')
    WHEN f.rule_code = 'TR07' THEN 'Manual time on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code = 'TR08' THEN 'Apps used on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code = 'TR09' THEN 'Tracked time on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code = 'TR10' THEN 'Time tracker setup, week ' || f.period_key
    ELSE '' END;

  v_ask := CASE f.rule_code
    WHEN 'TR01' THEN 'Please start your timer, or let me know if you are in a meeting or away from your desk.'
    WHEN 'TR02' THEN 'Please check whether that timer is still running by mistake and stop it if so.'
    WHEN 'TR03' THEN 'Could you tell me what got in the way, and whether any of that work was tracked somewhere else?'
    WHEN 'TR05' THEN CASE
        WHEN v_unprod AND v_unknown THEN 'Some of these look personal and some I do not recognise. If any of it was for work, tell me what it is for and I will add it to our list; otherwise please keep work time for work.'
        WHEN v_unprod THEN 'These look personal. Please keep work time for work; if any of it was for a work reason, tell me what it was.'
        ELSE 'Was this for work? If it was, tell me what it is used for and I will add it to our approved list so it does not come up again.' END
    WHEN 'TR06' THEN 'Your timer is running but the Track desktop app has captured nothing since it started. Please check the app is open and signed in, or stop the timer if you are not working.'
    WHEN 'TR07' THEN 'Could you tell me what this time was for, and why it was added afterwards? Please add a note to each entry saying what was done.'
    WHEN 'TR08' THEN CASE WHEN coalesce((f.evidence ->> 'blocked_seconds')::numeric, 0) > 0
        THEN 'Some of these apps are blocked on work time. Please stop using them; if there was a work reason, tell me what it was.'
        ELSE 'These do not look like work. Please keep work time for work; if any of it was for a work reason, tell me what it was.' END
    WHEN 'TR09' THEN 'Please check this time and correct anything that is wrong. If it is right, tell me what it covers.'
    WHEN 'TR10' THEN 'Your time tracker is not fully set up. Please make sure the Track desktop app is installed and signed in on the computer you work on. If something is stopping you, tell me and we will sort it out.'
    WHEN 'TK01' THEN 'Please add an update in the task comments with when it will be finished. Due dates are not moved once set.'
    WHEN 'TK02' THEN 'Due dates are not moved once set. Please explain the change in the task comments so it is on record.'
    WHEN 'TK04' THEN 'What is blocking it, and who can clear it? Please say so in the task comments.'
    WHEN 'TK05' THEN 'Please add a short update in the task comments on where it stands.'
    WHEN 'TK06' THEN 'You have no open tasks at the moment. Please check with your manager for what to pick up next.'
    WHEN 'TK07' THEN 'Please add a description that says what needs doing and what success looks like.'
    WHEN 'TK08' THEN 'Please review it and either move it to Complete or say what is missing.'
    WHEN 'TK11' THEN 'Is anything stopping you from starting? Please tell me today so we can fix it.'
    WHEN 'TK13' THEN 'Please review it and either move it to Complete or say what is missing.'
    WHEN 'TK14' THEN 'Thank you, nice work.'
    WHEN 'RP01' THEN 'Please send your daily report now.'
    WHEN 'RP03' THEN 'Please send your report today, and tell me what is making them hard to send so we can fix it.'
    ELSE 'Please let me know what is happening.' END;

  IF v_to = 'manager' THEN
    v_obs := format('%s''s task is ready for you. %s', coalesce(p.full_name, 'A team member'), f.why);
  ELSIF f.rule_code = 'TR05' AND v_sites IS NOT NULL THEN
    v_obs := format('I noticed time on %s today.', v_sites);
  ELSIF f.rule_code = 'TR08' AND v_apps IS NOT NULL THEN
    v_obs := format('I noticed time in %s today.', v_apps);
  END IF;

  IF v_n >= 2 AND f.rule_code <> 'TK14' AND v_to = 'person' THEN
    v_rep := format('This is the %s time in the last %s days that this has come up, so I wanted to raise it with you directly.', public.agent_ordinal(v_n), v_win);
    IF v_n >= 3 THEN v_rep := v_rep || ' If it keeps happening I will need to take it up with your manager.'; END IF;
  END IF;

  v_subject := left(f.title, 120);
  RETURN jsonb_build_object(
    'to', v_to, 'recipient_name', v_rcpt.full_name, 'recipient_email', v_rcpt.email, 'recipient_id', v_rcpt.id, 'subject', v_subject,
    'link', v_link,
    'body', 'Hi ' || v_first || E',\n\n' || v_obs
      || CASE WHEN v_item <> '' THEN E'\n\n' || v_item ELSE '' END
      || CASE WHEN v_link ->> 'person_url' IS NOT NULL THEN E'\nOpen it here: ' || (v_link ->> 'person_url') ELSE '' END
      || E'\n\n' || v_ask || CASE WHEN v_rep <> '' THEN E'\n\n' || v_rep ELSE '' END || E'\n\nThank you,\nKD Squares Operations');
END $$;

CREATE OR REPLACE FUNCTION public.agent_flag_detail(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; s public.agent_settings%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE;
  v_day date; v_person jsonb := NULL; v_today jsonb := NULL; v_sites jsonb := '[]'::jsonb; v_tracked numeric; v_tracker jsonb := NULL;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (now() AT TIME ZONE s.timezone)::date;

  IF f.person_id IS NOT NULL THEN
    SELECT * INTO p FROM public.profiles WHERE id = f.person_id;
    SELECT * INTO m FROM public.profiles WHERE id = coalesce(public.agent_manager_of(p.id), f.manager_id);
    v_person := jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'photo_url', p.photo_url, 'job_title', p.job_title,
      'manager', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'full_name', m.full_name, 'photo_url', m.photo_url) END);
    SELECT coalesce(sum(coalesce(e.duration_minutes, extract(epoch FROM (now() - e.start_time)) / 60.0)), 0) INTO v_tracked
      FROM agent_read.v_time_entries e WHERE e.employee_id = f.person_id AND (e.start_time AT TIME ZONE s.timezone)::date = v_day;
    v_today := jsonb_build_object(
      'tracked_minutes', round(v_tracked),
      'tracking_now', EXISTS (SELECT 1 FROM agent_read.v_time_entries e WHERE e.employee_id = f.person_id AND e.end_time IS NULL),
      'open_tasks', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.assignee_id = f.person_id AND t.status <> 'done' AND t.parent_id IS NULL),
      'overdue_tasks', (SELECT count(*) FROM agent_read.v_tasks t WHERE t.assignee_id = f.person_id AND t.status <> 'done' AND t.parent_id IS NULL AND t.due_date < v_day),
      'reported_today', f.person_id IN (SELECT public.agent_report_submitters(v_day)),
      'on_leave', EXISTS (SELECT 1 FROM agent_read.v_leave l WHERE l.employee_id = f.person_id AND v_day BETWEEN l.start_date AND l.end_date));
  END IF;

  IF f.rule_code = 'TR05' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'domain', x.domain, 'seconds', x.seconds, 'category', x.category,
             'list', (SELECT d.category FROM public.agent_domain_list d WHERE d.domain = x.domain AND d.company_id IS NULL AND d.team IS NULL LIMIT 1),
             'hint', public.agent_site_hint(x.domain),
             'days_seen', (SELECT count(DISTINCT (a.captured_at AT TIME ZONE s.timezone)::date) FROM agent_read.v_activity_domains a
                            WHERE a.employee_id = f.person_id AND a.domain = x.domain AND a.captured_at > now() - interval '30 days'),
             'team_users', (SELECT count(DISTINCT a.employee_id) FROM agent_read.v_activity_domains a WHERE a.domain = x.domain AND a.captured_at > now() - interval '14 days'))
           ORDER BY x.seconds DESC), '[]'::jsonb)
      INTO v_sites
      FROM (SELECT e ->> 'domain' AS domain, (e ->> 'seconds')::int AS seconds, e ->> 'category' AS category
              FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) e WHERE e ->> 'domain' IS NOT NULL) x;
  END IF;

  -- the tracking rules: what the desktop tracker looks like for this person (counts and dates only, never a URL or a title)
  IF f.rule_code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10') AND f.person_id IS NOT NULL THEN
    SELECT jsonb_build_object('app_enabled', a.is_enabled, 'screenshots_enabled', a.screenshots_enabled, 'app_version', a.app_version,
                              'last_login_at', a.last_login_at, 'capture_interval_minutes', a.capture_interval_minutes)
      INTO v_tracker FROM public.time_agent_settings a WHERE a.employee_id = f.person_id;
    v_tracker := coalesce(v_tracker, '{}'::jsonb) || jsonb_build_object(
      'has_settings', v_tracker IS NOT NULL,
      'activity_captures_today', (SELECT count(*) FROM agent_read.v_activity_domains l WHERE l.employee_id = f.person_id AND l.captured_at >= v_day::timestamp AT TIME ZONE s.timezone),
      'last_activity_at', (SELECT max(l.captured_at) FROM agent_read.v_activity_domains l WHERE l.employee_id = f.person_id AND l.captured_at >= now() - interval '7 days'));
  END IF;

  RETURN jsonb_build_object(
    'flag', jsonb_build_object('id', f.id, 'rule_code', f.rule_code, 'severity', f.severity, 'status', f.status, 'title', f.title, 'why', f.why,
      'evidence', f.evidence, 'suggested_action', f.suggested_action, 'occurrence_count', f.occurrence_count, 'escalation_level', f.escalation_level,
      'first_seen_at', f.first_seen_at, 'last_seen_at', f.last_seen_at, 'resolution_note', f.resolution_note, 'snoozed_until', f.snoozed_until,
      'subject_type', f.subject_type, 'subject_id', f.subject_id, 'period_key', f.period_key, 'item_type', f.item_type),
    'person', v_person,
    'today', v_today,
    'recurrence', public.agent_flag_recurrence(p_flag),
    'link', public.agent_flag_link(p_flag),
    'sites', v_sites,
    'tracker', v_tracker,
    'draft', CASE WHEN f.item_type = 'flag' AND f.status IN ('open', 'snoozed') THEN public.agent_flag_draft(p_flag) ELSE NULL END,
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ev.kind, 'at', ev.created_at, 'actor', a.full_name, 'detail', ev.detail) ORDER BY ev.created_at DESC), '[]'::jsonb)
                   FROM public.agent_flag_events ev LEFT JOIN public.profiles a ON a.id = ev.actor_id WHERE ev.flag_id = f.id),
    'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', mm.id, 'channel', mm.channel, 'status', mm.status, 'body', mm.body, 'recipient', mm.recipient_label, 'sent_at', mm.sent_at, 'error', mm.error) ORDER BY mm.created_at DESC), '[]'::jsonb)
                   FROM public.agent_messages mm WHERE mm.flag_id = f.id));
END $$;

REVOKE ALL ON FUNCTION public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) TO authenticated, service_role;

-- Fill in or correct the manager on items that are still open (a closed item keeps what it had).
UPDATE public.agent_flags f SET manager_id = public.agent_manager_of(f.person_id)
 WHERE f.person_id IS NOT NULL AND f.status IN ('open', 'snoozed') AND f.manager_id IS DISTINCT FROM public.agent_manager_of(f.person_id);
