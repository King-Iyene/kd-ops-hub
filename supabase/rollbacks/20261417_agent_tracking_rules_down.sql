-- Rolls back 20261417000000_agent_tracking_rules.sql. Not run automatically.
-- Items the rules raised stay in agent_flags as dismissed (history); delete them by rule_code below if they are not wanted.

UPDATE public.agent_flags SET status = 'dismissed', updated_at = now()
 WHERE rule_code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10') AND status IN ('open', 'snoozed');
DELETE FROM public.agent_rules WHERE code IN ('TR06', 'TR07', 'TR08', 'TR09', 'TR10');

DROP FUNCTION IF EXISTS public.agent_rule_tr10(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tr09(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tr08(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tr07(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_tr06(timestamptz);
DROP FUNCTION IF EXISTS public.agent_entry_day(timestamptz, text, text);

-- The Inbox link, draft and detail functions go back to their definitions in 20261413000000_agent_v5.sql.
CREATE OR REPLACE FUNCTION public.agent_flag_link(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; s public.agent_settings%ROWTYPE; v_path text; v_person_path text; v_label text; v_table uuid; v_token text;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;

  IF f.evidence ->> 'task_id' ~ '^[0-9a-f-]{36}$' THEN
    v_path := '/task?task=' || (f.evidence ->> 'task_id'); v_person_path := v_path; v_label := 'Open the task';
  ELSIF f.rule_code IN ('RP01', 'RP03') THEN
    v_table := s.report_table_id;
    IF v_table IS NOT NULL THEN
      v_path := '/task/table/' || v_table;
      SELECT token INTO v_token FROM public.tm_forms WHERE table_id = v_table AND is_open ORDER BY created_at LIMIT 1;
      IF v_token IS NOT NULL THEN v_person_path := '/tf/' || v_token; END IF;
    END IF;
    v_label := 'Open the report';
  ELSIF f.rule_code IN ('TR01', 'TR02', 'TR03', 'TR05') THEN
    v_path := '/timesheets'; v_person_path := '/timesheets'; v_label := 'Open Track';
  ELSIF f.rule_code LIKE 'PY%' THEN v_path := '/payroll'; v_label := 'Open Payroll';
  ELSIF f.rule_code LIKE 'BK%' THEN v_path := '/payments'; v_label := 'Open Payments';
  ELSIF f.rule_code LIKE 'LN%' THEN v_path := '/ewa'; v_label := 'Open Earned wage access';
  ELSIF f.rule_code = 'DC01' THEN v_path := '/grievances'; v_label := 'Open Grievances';
  ELSIF f.rule_code = 'DC02' THEN v_path := '/disciplinary'; v_label := 'Open Disciplinary records';
  ELSIF f.rule_code LIKE 'PF%' THEN v_path := '/performance'; v_label := 'Open Performance';
  ELSIF f.rule_code LIKE 'HL%' THEN v_path := '/hr-letters'; v_label := 'Open HR letters';
  ELSIF f.rule_code LIKE 'CT%' THEN v_path := '/contractors'; v_label := 'Open Contractors';
  END IF;
  -- anything else lives in the Inbox itself
  IF v_path IS NULL THEN v_path := '/agent/inbox?flag=' || f.id; v_label := 'Open in the Ops Agent Inbox'; END IF;

  RETURN jsonb_build_object(
    'label', v_label, 'path', v_path, 'url', s.app_url || v_path,
    'person_path', v_person_path, 'person_url', CASE WHEN v_person_path IS NULL THEN NULL ELSE s.app_url || v_person_path END,
    'inbox_url', s.app_url || '/agent/inbox?flag=' || f.id);
END $$;

CREATE OR REPLACE FUNCTION public.agent_flag_draft(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE; rec jsonb; v_n integer; v_win integer;
  v_first text; v_link jsonb; v_item text := ''; v_to text := 'person'; v_rcpt public.profiles%ROWTYPE; v_obs text; v_ask text; v_rep text := ''; v_subject text; v_sites text; v_unprod boolean; v_unknown boolean;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = f.person_id;
  SELECT * INTO m FROM public.profiles WHERE id = coalesce(f.manager_id, p.reporting_manager_id);
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

  v_link := public.agent_flag_link(p_flag);
  -- the specific thing, by name, and where to find it (never a vague "a task")
  v_item := CASE
    WHEN f.evidence ->> 'task_title' IS NOT NULL THEN format('Task: "%s"%s', f.evidence ->> 'task_title', CASE WHEN f.evidence ->> 'due_date' IS NOT NULL THEN ' (due ' || to_char((f.evidence ->> 'due_date')::date, 'Mon FMDD') || ')' ELSE '' END)
    WHEN f.rule_code IN ('RP01', 'RP03') THEN 'Daily report for ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'today')
    WHEN f.rule_code = 'TR03' THEN 'Tracked time on ' || coalesce(to_char(nullif(f.period_key, '')::date, 'Dy Mon FMDD'), 'that day')
    WHEN f.rule_code IN ('TR01', 'TR02') THEN 'Your timer: ' || f.title
    ELSE '' END;

  v_ask := CASE f.rule_code
    WHEN 'TR01' THEN 'Please start your timer, or let me know if you are in a meeting or away from your desk.'
    WHEN 'TR02' THEN 'Please check whether that timer is still running by mistake and stop it if so.'
    WHEN 'TR03' THEN 'Could you tell me what got in the way, and whether any of that work was tracked somewhere else?'
    WHEN 'TR05' THEN CASE
        WHEN v_unprod AND v_unknown THEN 'Some of these look personal and some I do not recognise. If any of it was for work, tell me what it is for and I will add it to our list; otherwise please keep work time for work.'
        WHEN v_unprod THEN 'These look personal. Please keep work time for work; if any of it was for a work reason, tell me what it was.'
        ELSE 'Was this for work? If it was, tell me what it is used for and I will add it to our approved list so it does not come up again.' END
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
  v_day date; v_person jsonb := NULL; v_today jsonb := NULL; v_sites jsonb := '[]'::jsonb; v_tracked numeric;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (now() AT TIME ZONE s.timezone)::date;

  IF f.person_id IS NOT NULL THEN
    SELECT * INTO p FROM public.profiles WHERE id = f.person_id;
    SELECT * INTO m FROM public.profiles WHERE id = coalesce(f.manager_id, p.reporting_manager_id);
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
    'draft', CASE WHEN f.item_type = 'flag' AND f.status IN ('open', 'snoozed') THEN public.agent_flag_draft(p_flag) ELSE NULL END,
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ev.kind, 'at', ev.created_at, 'actor', a.full_name, 'detail', ev.detail) ORDER BY ev.created_at DESC), '[]'::jsonb)
                   FROM public.agent_flag_events ev LEFT JOIN public.profiles a ON a.id = ev.actor_id WHERE ev.flag_id = f.id),
    'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', mm.id, 'channel', mm.channel, 'status', mm.status, 'body', mm.body, 'recipient', mm.recipient_label, 'sent_at', mm.sent_at, 'error', mm.error) ORDER BY mm.created_at DESC), '[]'::jsonb)
                   FROM public.agent_messages mm WHERE mm.flag_id = f.id));
END $$;

REVOKE ALL ON FUNCTION public.agent_flag_link(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_flag_link(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) TO authenticated, service_role;
