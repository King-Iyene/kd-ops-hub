-- Ops Agent v4 (3 of 5): what the Inbox shows when a card is opened.
--
--   agent_flag_detail(flag)   everything about one item in one call: the person (with photo), what is happening today, how often
--                             this has come up (recurrence), the sites (with the list status and a work/personal hint), the history
--                             of the item, the messages already sent, and a ready-to-edit draft message.
--   agent_flag_draft(flag)    the draft on its own: {to, subject, body, recipient_name, recipient_email}. Worded per rule, and it says
--                             when this is not the first time ("the 3rd time in the last 14 days").
--   agent_site_hint(domain)   work / personal / unknown for a site nobody has classified yet, with the reason.
--
-- Super Admin only (agent_can_access). Read only: nothing here changes a record.
--
-- Rollback: supabase/rollbacks/20261411_agent_v4_down.sql

CREATE OR REPLACE FUNCTION public.agent_ordinal(n integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT n::text || CASE WHEN n % 100 BETWEEN 11 AND 13 THEN 'th' WHEN n % 10 = 1 THEN 'st' WHEN n % 10 = 2 THEN 'nd' WHEN n % 10 = 3 THEN 'rd' ELSE 'th' END
$$;

-- ── A site nobody has classified: does it look like part of our work? ──────
-- Order of evidence: the team already uses it (2 people) -> work; it is named in a task -> work; it belongs to a family of tools we
-- know -> work; it is a known entertainment / social site -> personal; otherwise unknown (Claude is asked next, from Settings > Claude).
CREATE OR REPLACE FUNCTION public.agent_site_hint(p_domain text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d text := public.agent_clean_domain(p_domain); v_users integer; v_tasks integer; v_fam text;
  v_work text[] := ARRAY['github.com','gitlab.com','bitbucket.org','supabase.co','supabase.com','vercel.com','netlify.com','cloudflare.com','notion.so','notion.com',
    'slack.com','zoho.com','zohocliq.com','zohomail.com','zoho.eu','google.com','googleapis.com','docs.google.com','drive.google.com','microsoft.com','office.com','live.com',
    'sharepoint.com','zoom.us','figma.com','canva.com','atlassian.net','atlassian.com','trello.com','asana.com','clickup.com','linear.app','airtable.com','openai.com',
    'anthropic.com','claude.ai','lovable.dev','stackoverflow.com','npmjs.com','mozilla.org','paystack.com','flutterwave.com','mono.co','sendgrid.com','twilio.com',
    'hubspot.com','calendly.com','loom.com','dropbox.com','box.com','docusign.com','quickbooks.com','xero.com','wave.com','gohighlevel.com','leadconnectorhq.com'];
  v_fun text[] := ARRAY['youtube.com','youtu.be','facebook.com','instagram.com','tiktok.com','netflix.com','twitter.com','x.com','snapchat.com','twitch.tv','primevideo.com',
    'hulu.com','spotify.com','9gag.com','reddit.com','pinterest.com','betking.com','bet9ja.com','sportybet.com','nairabet.com','jumia.com.ng','amazon.com','aliexpress.com'];
  k text;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF d IS NULL THEN RETURN jsonb_build_object('verdict', 'unknown', 'reason', 'No site.'); END IF;
  SELECT count(DISTINCT a.employee_id) INTO v_users FROM agent_read.v_activity_domains a
   WHERE (a.domain = d OR a.domain LIKE '%.' || d) AND a.captured_at > now() - interval '14 days';
  IF v_users >= 2 THEN RETURN jsonb_build_object('verdict', 'work', 'reason', format('%s people on the team have used it in the last 2 weeks.', v_users)); END IF;
  SELECT count(*) INTO v_tasks FROM agent_read.v_tasks t WHERE position(d IN lower(coalesce(t.title, '') || ' ' || coalesce(t.description, ''))) > 0;
  IF v_tasks > 0 THEN RETURN jsonb_build_object('verdict', 'work', 'reason', format('It is named in %s of our tasks.', v_tasks)); END IF;
  FOREACH k IN ARRAY v_work LOOP
    IF d = k OR d LIKE '%.' || k THEN RETURN jsonb_build_object('verdict', 'work', 'reason', 'It belongs to a tool we normally use (' || k || ').'); END IF;
  END LOOP;
  FOREACH k IN ARRAY v_fun LOOP
    IF d = k OR d LIKE '%.' || k THEN RETURN jsonb_build_object('verdict', 'personal', 'reason', 'A social, shopping or entertainment site.'); END IF;
  END LOOP;
  IF d ~ '(^|[.-])(bank|pay|payroll|invoice|tax|hr|crm|erp|docs|support|portal|admin|login)[.-]' THEN
    RETURN jsonb_build_object('verdict', 'work', 'reason', 'The name looks like a business or software tool.');
  END IF;
  RETURN jsonb_build_object('verdict', 'unknown', 'reason', 'Nothing we know connects it to our work yet.');
END $$;

-- ── How often has this come up for this person? ────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_flag_recurrence(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.agent_flags%ROWTYPE; v_win integer; v_n integer; v_dates jsonb;
BEGIN
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND OR f.person_id IS NULL THEN RETURN jsonb_build_object('window_days', 0, 'count_in_window', 1, 'label', 'First time', 'dates', '[]'::jsonb, 'total', 1); END IF;
  SELECT escalation_window_days INTO v_win FROM public.agent_settings WHERE id;
  v_win := coalesce(v_win, 14);
  SELECT count(*), coalesce(jsonb_agg(x.d ORDER BY x.d DESC) FILTER (WHERE x.id <> p_flag), '[]'::jsonb)
    INTO v_n, v_dates
    FROM (SELECT g.id, g.first_seen_at AS d FROM public.agent_flags g
           WHERE g.person_id = f.person_id AND g.rule_code = f.rule_code AND coalesce(g.dismiss_reason, '') <> 'false_positive'
             AND (g.id = p_flag OR g.first_seen_at > f.first_seen_at - make_interval(days => v_win))
             AND g.first_seen_at <= f.first_seen_at ORDER BY g.first_seen_at DESC LIMIT 12) x;
  RETURN jsonb_build_object(
    'window_days', v_win, 'count_in_window', v_n, 'dates', v_dates,
    'total', (SELECT count(*) FROM public.agent_flags g WHERE g.person_id = f.person_id AND g.rule_code = f.rule_code AND coalesce(g.dismiss_reason, '') <> 'false_positive'),
    'label', CASE WHEN v_n <= 1 THEN format('First time in the last %s days', v_win) ELSE format('The %s time in the last %s days', public.agent_ordinal(v_n), v_win) END);
END $$;

-- ── The draft message ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_flag_draft(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE; rec jsonb; v_n integer; v_win integer;
  v_first text; v_to text := 'person'; v_rcpt public.profiles%ROWTYPE; v_obs text; v_ask text; v_rep text := ''; v_subject text; v_sites text; v_unprod boolean; v_unknown boolean;
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
    'body', 'Hi ' || v_first || E',\n\n' || v_obs || E'\n\n' || v_ask || CASE WHEN v_rep <> '' THEN E'\n\n' || v_rep ELSE '' END || E'\n\nThank you,\nKD Squares Operations');
END $$;

-- ── Everything about one item ──────────────────────────────────────────────
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
    'sites', v_sites,
    'draft', CASE WHEN f.item_type = 'flag' AND f.status IN ('open', 'snoozed') THEN public.agent_flag_draft(p_flag) ELSE NULL END,
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object('kind', ev.kind, 'at', ev.created_at, 'actor', a.full_name, 'detail', ev.detail) ORDER BY ev.created_at DESC), '[]'::jsonb)
                   FROM public.agent_flag_events ev LEFT JOIN public.profiles a ON a.id = ev.actor_id WHERE ev.flag_id = f.id),
    'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', mm.id, 'channel', mm.channel, 'status', mm.status, 'body', mm.body, 'recipient', mm.recipient_label, 'sent_at', mm.sent_at, 'error', mm.error) ORDER BY mm.created_at DESC), '[]'::jsonb)
                   FROM public.agent_messages mm WHERE mm.flag_id = f.id));
END $$;

REVOKE ALL ON FUNCTION public.agent_ordinal(integer), public.agent_site_hint(text), public.agent_flag_recurrence(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_ordinal(integer), public.agent_site_hint(text), public.agent_flag_recurrence(uuid), public.agent_flag_draft(uuid), public.agent_flag_detail(uuid) TO authenticated, service_role;
