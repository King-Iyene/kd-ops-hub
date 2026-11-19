-- Ops Agent v5: messages that name and link the thing, items that get chased, and the agent watching the systems it depends on.
--
--   1. agent_settings.app_url + agent_flag_link(flag): where an item lives in KD Ops (a task, the report, Track, the module page),
--      as a path and as a full link for the person it is sent to. The draft message names the specific thing and carries that link.
--   2. ES01 Not attended to   an Inbox item nobody has touched for too long (critical 4 h, high 24 h, medium 48 h, low 96 h, on working days).
--      It escalates the item one level and is raised one severity higher.
--   3. ES02 Still happening   an item marked handled (for example after the message was sent) whose condition is still there 24 h
--      (high) or 48 h later. Raised again every 3 days while it lasts.
--   4. SY01 Scheduled job problem   from the existing cron health check (missing, inactive, failed or stale jobs).
--   5. SY02 Delivery problem        messages to connections that failed in the last 24 h, and connections that are in error.
--   6. SY04 Auto-send not set up    a connection asks for automatic sending but the sender cannot run (secret missing).
--   7. agent_dispatch_ready()       is the sender able to run; also in agent_team_pulse().
--
-- Rollback: supabase/rollbacks/20261413_agent_v5_down.sql

ALTER TABLE public.agent_settings ADD COLUMN IF NOT EXISTS app_url text NOT NULL DEFAULT 'https://ops.kdsquares.com' CHECK (app_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$');

-- ── 1. links ───────────────────────────────────────────────────────────────
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

-- ── the draft names the item and links to it ──
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

-- ── detail carries the link ──
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

-- ── the pulse says whether the sender can run ──
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
    'rules_active', (SELECT count(*) FROM public.agent_rules WHERE enabled),
    'dispatch_ready', public.agent_dispatch_ready()
  );
END $$;


-- ── 7. can the sender run? ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_dispatch_ready()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN to_regnamespace('net') IS NOT NULL
     AND to_regclass('vault.decrypted_secrets') IS NOT NULL
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('agent_dispatch_url', 'batch_worker_url'));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- ── 2 and 3. chasing ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_bump(p_sev text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_sev WHEN 'info' THEN 'low' WHEN 'low' THEN 'medium' WHEN 'medium' THEN 'high' ELSE 'critical' END
$$;

CREATE OR REPLACE FUNCTION public.agent_age_text(p_from timestamptz, p_now timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_now - p_from < interval '48 hours' THEN round(extract(epoch FROM (p_now - p_from)) / 3600)::int || ' hours'
              ELSE floor(extract(epoch FROM (p_now - p_from)) / 86400)::int || ' days' END
$$;

CREATE OR REPLACE FUNCTION public.agent_rule_es01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; f record; g record; v_created integer := 0; v_resolved integer := 0; v_new boolean;
  v_rollups text[] := '{}'; v_rollup_rules text[] := '{}'; v_title text; v_ids uuid[];
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  IF public.agent_is_working_day((p_now AT TIME ZONE s.timezone)::date) THEN
    -- Four or more late items of one rule are chased as ONE item ("14 'No open tasks' items ..."), not fourteen.
    FOR g IN
      SELECT o.rule_code, count(*) AS n, min(o.first_seen_at) AS oldest, array_agg(o.id ORDER BY o.first_seen_at) AS ids,
             (array_agg(o.severity ORDER BY public.agent_sev_rank(o.severity) DESC))[1] AS top_sev
        FROM public.agent_flags o
       WHERE o.status = 'open' AND o.item_type IN ('flag', 'human_action') AND o.severity <> 'info'
         AND o.rule_code NOT IN ('ES01', 'ES02', 'SY03', 'TK13', 'TK14')
         AND o.first_seen_at < p_now - make_interval(hours => CASE o.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 24 WHEN 'medium' THEN 48 ELSE 96 END)
       GROUP BY o.rule_code HAVING count(*) >= 4
    LOOP
      v_title := coalesce((SELECT r.title FROM public.agent_rules r WHERE r.code = g.rule_code), g.rule_code);
      v_new := public.agent_raise_flag('ES01', NULL, NULL, 'system', 'rule:' || g.rule_code, '', public.agent_bump(g.top_sev),
        format('Not attended to: %s items for "%s"', g.n, left(v_title, 80)),
        format('%s open "%s" items have not been acted on. The oldest has been open for %s.', g.n, v_title, public.agent_age_text(g.oldest, p_now)),
        jsonb_build_object('rule', g.rule_code, 'count', g.n, 'open_for', public.agent_age_text(g.oldest, p_now), 'flag_ids', to_jsonb(g.ids[1:50])),
        'Open the Inbox filtered to this rule and work through them, or switch the rule off in Settings if it is not useful.', p_now);
      v_rollups := v_rollups || ('rule:' || g.rule_code); v_rollup_rules := v_rollup_rules || g.rule_code;
      IF v_new THEN v_created := v_created + 1; END IF;
    END LOOP;

    FOR f IN
      SELECT * FROM public.agent_flags o
       WHERE o.status = 'open' AND o.item_type IN ('flag', 'human_action') AND o.severity <> 'info'
         AND o.rule_code NOT IN ('ES01', 'ES02', 'SY03', 'TK13', 'TK14') AND NOT (o.rule_code = ANY (v_rollup_rules))
         AND o.first_seen_at < p_now - make_interval(hours => CASE o.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 24 WHEN 'medium' THEN 48 ELSE 96 END)
    LOOP
      v_new := public.agent_raise_flag('ES01', f.module, f.person_id, 'system', f.id::text, '', public.agent_bump(f.severity), 'Not attended to: ' || left(f.title, 150),
        format('"%s" has been open for %s and nobody has acted on it. %s', f.title, public.agent_age_text(f.first_seen_at, p_now), f.why),
        jsonb_build_object('flag_id', f.id, 'rule', f.rule_code, 'open_for', public.agent_age_text(f.first_seen_at, p_now), 'original_severity', f.severity),
        'Handle it, message the person from the card, snooze it, or dismiss it with a reason.', p_now);
      IF v_new THEN
        v_created := v_created + 1;
        UPDATE public.agent_flags SET escalation_level = least(4, escalation_level + 1), updated_at = p_now WHERE id = f.id;
        INSERT INTO public.agent_flag_events (flag_id, kind, detail) VALUES (f.id, 'escalated', jsonb_build_object('why', 'not attended to'));
      END IF;
    END LOOP;
  END IF;

  -- each item that a rollup now covers is escalated once
  FOR f IN SELECT o.id FROM public.agent_flags o WHERE o.status = 'open' AND o.rule_code = ANY (v_rollup_rules) AND o.item_type IN ('flag', 'human_action') AND o.severity <> 'info'
              AND o.first_seen_at < p_now - interval '24 hours'
              AND NOT EXISTS (SELECT 1 FROM public.agent_flag_events e WHERE e.flag_id = o.id AND e.kind = 'escalated') LOOP
    UPDATE public.agent_flags SET escalation_level = least(4, escalation_level + 1), updated_at = p_now WHERE id = f.id;
    INSERT INTO public.agent_flag_events (flag_id, kind, detail) VALUES (f.id, 'escalated', jsonb_build_object('why', 'not attended to'));
  END LOOP;

  -- attended to (handled, dismissed, snoozed, or gone), or now covered by a rollup: the single chase closes
  WITH x AS (UPDATE public.agent_flags es SET status = 'auto_resolved', updated_at = p_now
              WHERE es.rule_code = 'ES01' AND es.status IN ('open', 'snoozed')
                AND CASE WHEN es.subject_id LIKE 'rule:%' THEN NOT (es.subject_id = ANY (v_rollups))
                         ELSE NOT EXISTS (SELECT 1 FROM public.agent_flags o WHERE o.id::text = es.subject_id AND o.status = 'open' AND NOT (o.rule_code = ANY (v_rollup_rules))) END
              RETURNING es.id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

CREATE OR REPLACE FUNCTION public.agent_rule_es02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; f record; v_created integer := 0; v_resolved integer := 0; v_new boolean;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  IF public.agent_is_working_day((p_now AT TIME ZONE s.timezone)::date) THEN
    FOR f IN
      SELECT * FROM public.agent_flags o
       WHERE o.status = 'handled' AND o.item_type = 'flag' AND o.severity <> 'info'
         AND o.rule_code NOT IN ('ES01', 'ES02', 'SY03', 'TK13', 'TK14')
         AND o.handled_at < p_now - make_interval(hours => CASE WHEN o.severity IN ('high', 'critical') THEN 24 ELSE 48 END)
         AND o.last_seen_at > p_now - interval '15 minutes'   -- the rule saw it again a moment ago: it is still true
    LOOP
      v_new := public.agent_raise_flag('ES02', f.module, f.person_id, 'system', f.id::text, ((p_now::date - f.handled_at::date) / 3)::text, public.agent_bump(f.severity),
        'Still happening: ' || left(f.title, 150),
        format('"%s" was marked handled %s ago, but it is still happening. %s', f.title, public.agent_age_text(f.handled_at, p_now), f.why),
        jsonb_build_object('flag_id', f.id, 'rule', f.rule_code, 'handled_for', public.agent_age_text(f.handled_at, p_now), 'original_severity', f.severity),
        'Follow up with the person, or reopen the original item.', p_now);
      IF v_new THEN
        v_created := v_created + 1;
        UPDATE public.agent_flags SET escalation_level = least(4, escalation_level + 1), updated_at = p_now WHERE id = f.id;
        INSERT INTO public.agent_flag_events (flag_id, kind, detail) VALUES (f.id, 'escalated', jsonb_build_object('why', 'still happening after it was handled'));
      END IF;
    END LOOP;
  END IF;
  WITH x AS (UPDATE public.agent_flags es SET status = 'auto_resolved', updated_at = p_now
              WHERE es.rule_code = 'ES02' AND es.status IN ('open', 'snoozed')
                AND NOT EXISTS (SELECT 1 FROM public.agent_flags o WHERE o.id::text = es.subject_id AND o.status = 'handled' AND o.last_seen_at > p_now - interval '15 minutes') RETURNING es.id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── 4. scheduled jobs (the existing cron health check does the looking; this surfaces what it found) ──
CREATE OR REPLACE FUNCTION public.agent_rule_sy01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer;
BEGIN
  IF to_regclass('public.cron_job_alerts') IS NULL THEN RETURN jsonb_build_object('created', 0, 'resolved', 0); END IF;
  FOR r IN EXECUTE 'SELECT job_name, issue, detail, detected_at FROM public.cron_job_alerts WHERE resolved_at IS NULL' LOOP
    IF public.agent_raise_flag('SY01', NULL, NULL, 'system', r.job_name || ':' || r.issue, '', 'high', 'Scheduled job ' || r.issue || ': ' || r.job_name,
         format('The scheduled job "%s" is %s. %s', r.job_name, r.issue, coalesce(r.detail, '')),
         jsonb_build_object('job', r.job_name, 'issue', r.issue, 'since', r.detected_at), 'Check the job in Supabase (Database, Cron) and the function it calls.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || (r.job_name || ':' || r.issue);
  END LOOP;
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'SY01' AND status IN ('open', 'snoozed') AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── 5. delivery problems ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_sy02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_keep text[] := '{}'; v_created integer := 0; v_resolved integer; v_failed integer;
BEGIN
  SELECT (SELECT count(*) FROM public.agent_messages WHERE status = 'failed' AND created_at > p_now - interval '24 hours')
       + (SELECT count(*) FROM public.agent_outbox WHERE status = 'failed' AND created_at > p_now - interval '24 hours') INTO v_failed;
  IF v_failed > 0 THEN
    IF public.agent_raise_flag('SY02', NULL, NULL, 'system', 'delivery-failed', '', 'medium', 'Messages are failing to send',
         format('%s message%s could not be delivered in the last 24 hours. Open Connections to see which tool is refusing them.', v_failed, CASE WHEN v_failed = 1 THEN '' ELSE 's' END),
         jsonb_build_object('failed_24h', v_failed), 'Send a test from Connections and read the error.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || ARRAY['delivery-failed'];
  END IF;
  FOR r IN SELECT id, name, kind, last_error FROM public.agent_connections WHERE status = 'error' LOOP
    IF public.agent_raise_flag('SY02', NULL, NULL, 'system', 'connection:' || r.id, '', 'medium', 'Connection is down: ' || r.name,
         format('The %s connection "%s" is in error: %s', r.kind, r.name, coalesce(r.last_error, 'no detail')),
         jsonb_build_object('connection_id', r.id, 'kind', r.kind), 'Open Connections, fix the address or token, and send a test.', p_now) THEN v_created := v_created + 1; END IF;
    v_keep := v_keep || ('connection:' || r.id);
  END LOOP;
  WITH x AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
              WHERE rule_code = 'SY02' AND status IN ('open', 'snoozed') AND NOT (subject_id = ANY (v_keep)) RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM x;
  GET DIAGNOSTICS v_resolved = ROW_COUNT;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

-- ── 6. auto-send that cannot run ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_sy04(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_n integer; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT count(*) INTO v_n FROM public.agent_connections WHERE jsonb_array_length(coalesce(config -> 'events', '[]'::jsonb)) > 0;
  IF v_n > 0 AND NOT public.agent_dispatch_ready() THEN
    IF public.agent_raise_flag('SY04', NULL, NULL, 'system', 'dispatch-setup', '', 'high', 'Automatic sending is not set up',
         format('%s connection%s should send automatically, but the sender cannot run: the shared cron secret or the function address is missing in the database vault.', v_n, CASE WHEN v_n = 1 THEN '' ELSE 's' END),
         jsonb_build_object('connections', v_n), 'Add the vault secrets agent_dispatch_url and cron_shared_secret (the same secret the other scheduled functions use).', p_now) THEN v_created := 1; END IF;
  ELSE
    v_resolved := public.agent_resolve_flags('SY04', ARRAY['dispatch-setup'], NULL, p_now);
  END IF;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('ES01', NULL, 'Not attended to',            'An Inbox item nobody has touched for too long (critical 4 h, high 24 h, medium 48 h, low 96 h). Escalates it.', true, 'high',   '{}', 'ready'),
  ('ES02', NULL, 'Still happening',            'An item marked handled whose condition is still there a day or two later.',                                     true, 'high',   '{}', 'ready'),
  ('SY01', NULL, 'Scheduled job problem',      'A scheduled job that is missing, disabled, failing or late.',                                                   true, 'high',   '{}', 'ready'),
  ('SY02', NULL, 'Delivery problem',           'Messages to a connection are failing, or a connection is in error.',                                            true, 'medium', '{}', 'ready'),
  ('SY04', NULL, 'Auto-send not set up',       'A connection should send automatically but the sender cannot run.',                                             true, 'high',   '{}', 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, module_key = EXCLUDED.module_key, status = 'ready';

REVOKE ALL ON FUNCTION public.agent_flag_link(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid), public.agent_dispatch_ready(), public.agent_team_pulse() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_flag_link(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid), public.agent_dispatch_ready(), public.agent_team_pulse() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agent_bump(text), public.agent_age_text(timestamptz, timestamptz),
  public.agent_rule_es01(timestamptz), public.agent_rule_es02(timestamptz), public.agent_rule_sy01(timestamptz), public.agent_rule_sy02(timestamptz), public.agent_rule_sy04(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_bump(text), public.agent_age_text(timestamptz, timestamptz),
  public.agent_rule_es01(timestamptz), public.agent_rule_es02(timestamptz), public.agent_rule_sy01(timestamptz), public.agent_rule_sy02(timestamptz), public.agent_rule_sy04(timestamptz) TO service_role;
