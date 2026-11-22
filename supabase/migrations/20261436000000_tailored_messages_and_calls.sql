-- Ops Agent: messages to people are short, personal and ask what is happening; repeats are warned about, and the system remembers the warning.
--
--   Hi Denzel, I found that you are not tracking time. Work starts at 9 AM EST and I have nothing from you yet. What is happening? ...
--   Hi Nina, there is no task assigned to you in Task. What is happening? Can you reach out to your manager?
--
--   Repeats: the 2nd (or later) time something has come up in the last 14 days the message says so and adds "If it happens again, <manager>
--   will have a call with you." When a message like that is SENT, the warning is recorded (agent_warnings). If the same thing then happens
--   again, the agent raises a "Call needed" item (rule FT02) for the manager in the Inbox, and the message after that says the call will happen.
--   Nothing is sent on its own: the person sends the message from the Inbox.
--
-- agent_flag_draft returns the same keys as before (to, recipient_*, subject, link, manager, body = email, channel_body) plus
--   warning { level: none | warn | call, count, window_days, manager, warned_at }.
--
-- Rollback: re-apply agent_flag_draft from 20261419000000_agent_draft_questions.sql; DROP TRIGGER agent_messages_warning ON public.agent_messages;
--   DROP FUNCTION agent_record_warning(), agent_rule_ft02(timestamptz); DROP TABLE agent_warnings; DELETE FROM agent_rules WHERE code = 'FT02'.

-- ── What was said, and when: the memory of warnings ────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  flag_id uuid REFERENCES public.agent_flags(id) ON DELETE SET NULL,
  message_id uuid UNIQUE REFERENCES public.agent_messages(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  count_in_window integer NOT NULL DEFAULT 2,
  warned_at timestamptz NOT NULL DEFAULT now(),
  call_flag_id uuid REFERENCES public.agent_flags(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_warnings_person_idx ON public.agent_warnings (person_id, rule_code, warned_at DESC);
ALTER TABLE public.agent_warnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_warnings_read ON public.agent_warnings;
CREATE POLICY agent_warnings_read ON public.agent_warnings FOR SELECT TO authenticated USING (public.agent_can_configure());
REVOKE ALL ON public.agent_warnings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_warnings TO authenticated;
GRANT ALL ON public.agent_warnings TO service_role;

-- A message that went to the person about something that has come up before is a warning.
CREATE OR REPLACE FUNCTION public.agent_record_warning()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.agent_flags%ROWTYPE; rec jsonb; v_n integer; v_mgr uuid;
BEGIN
  IF NEW.status <> 'sent' OR NEW.flag_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'sent' THEN RETURN NEW; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = NEW.flag_id;
  IF NOT FOUND OR f.person_id IS NULL OR NOT public.agent_is_team_rule(f.rule_code) OR f.rule_code IN ('TK08', 'TK13', 'TK14') THEN RETURN NEW; END IF;
  IF NEW.recipient_id IS DISTINCT FROM f.person_id THEN RETURN NEW; END IF;   -- only what went to the person themselves
  rec := public.agent_flag_recurrence(NEW.flag_id);
  v_n := coalesce((rec ->> 'count_in_window')::integer, 1);
  IF v_n < 2 THEN RETURN NEW; END IF;
  -- already warned before this one came up: the message said a call would follow; the call item (FT02) is the next step, not another warning
  IF EXISTS (SELECT 1 FROM public.agent_warnings w WHERE w.person_id = f.person_id AND w.rule_code = f.rule_code AND w.warned_at < f.first_seen_at
               AND w.warned_at > f.first_seen_at - make_interval(days => coalesce((rec ->> 'window_days')::integer, 14))) THEN RETURN NEW; END IF;
  v_mgr := public.agent_manager_of(f.person_id);
  INSERT INTO public.agent_warnings (person_id, rule_code, flag_id, message_id, manager_id, count_in_window, warned_at)
  VALUES (f.person_id, f.rule_code, f.id, NEW.id, v_mgr, v_n, coalesce(NEW.sent_at, now()))
  ON CONFLICT (message_id) DO NOTHING;
  INSERT INTO public.agent_flag_events (flag_id, kind, detail)
  VALUES (f.id, 'note', jsonb_build_object('note', 'Warned: this has come up ' || v_n || ' times. If it happens again a call with the manager is needed.'));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.agent_record_warning() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS agent_messages_warning ON public.agent_messages;
CREATE TRIGGER agent_messages_warning AFTER INSERT OR UPDATE OF status ON public.agent_messages FOR EACH ROW EXECUTE FUNCTION public.agent_record_warning();

-- ── FT02: it happened again after the warning: a call is needed ────────────
CREATE OR REPLACE FUNCTION public.agent_rule_ft02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; r record; v_win integer; v_created integer := 0; v_new uuid; v_rule text; v_mgr text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_win := coalesce(s.escalation_window_days, 14);
  FOR r IN
    SELECT w.id AS wid, w.person_id, w.rule_code, w.warned_at, w.manager_id, p.full_name AS person, g.first_seen_at, g.id AS again_id,
           (SELECT count(*) FROM public.agent_flags x WHERE x.person_id = w.person_id AND x.rule_code = w.rule_code AND x.first_seen_at > w.warned_at
               AND x.status <> 'dismissed') AS times_since
      FROM public.agent_warnings w
      JOIN public.profiles p ON p.id = w.person_id
      JOIN LATERAL (SELECT x.id, x.first_seen_at FROM public.agent_flags x
                     WHERE x.person_id = w.person_id AND x.rule_code = w.rule_code AND x.first_seen_at > w.warned_at AND x.status <> 'dismissed'
                       AND coalesce(x.dismiss_reason, '') <> 'false_positive' ORDER BY x.first_seen_at LIMIT 1) g ON true
     WHERE w.call_flag_id IS NULL AND w.warned_at > p_now - make_interval(days => v_win)
  LOOP
    SELECT title INTO v_rule FROM public.agent_rules WHERE code = r.rule_code;
    SELECT full_name INTO v_mgr FROM public.profiles WHERE id = coalesce(r.manager_id, public.agent_manager_of(r.person_id));
    IF public.agent_raise_flag('FT02', 'people', r.person_id, 'person', r.wid::text, '', 'high',
         format('Call needed: %s (%s, again after a warning)', r.person, lower(coalesce(v_rule, r.rule_code))),
         format('%s was told on %s that %s would have a call with them if this happened again. It has: %s.',
                r.person, to_char(r.warned_at AT TIME ZONE s.timezone, 'Mon FMDD'), coalesce(v_mgr, 'their manager'),
                to_char(r.first_seen_at AT TIME ZONE s.timezone, 'Dy Mon FMDD')),
         jsonb_build_object('rule', r.rule_code, 'rule_title', v_rule, 'warned_at', r.warned_at, 'happened_again_at', r.first_seen_at,
                            'times_since_warning', r.times_since, 'manager_name', v_mgr, 'warning_id', r.wid),
         'Have the call, then mark this handled and note what was agreed.', p_now) THEN
      v_created := v_created + 1;
    END IF;
    SELECT id INTO v_new FROM public.agent_flags WHERE rule_code = 'FT02' AND subject_type = 'person' AND subject_id = r.wid::text AND period_key = '';
    IF v_new IS NOT NULL THEN UPDATE public.agent_warnings SET call_flag_id = v_new WHERE id = r.wid; END IF;
  END LOOP;
  RETURN jsonb_build_object('created', v_created, 'resolved', 0);
END $$;
REVOKE ALL ON FUNCTION public.agent_rule_ft02(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_ft02(timestamptz) TO service_role;

INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('FT02', 'people', 'Call needed', 'A person was warned (in a message that said their manager would have a call with them if it happened again) and it happened again: an item for the manager to have the call.', true, 'high', '{}', 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'ready';

-- ── The drafted message ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_flag_draft(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE; rec jsonb; v_n integer; v_win integer; s public.agent_settings%ROWTYPE;
  v_first text; v_link jsonb; v_to text := 'person'; v_rcpt public.profiles%ROWTYPE; v_obs text; v_ask text; v_q text := ' What is happening?'; v_rep text := '';
  v_subject text; v_sites text; v_unprod boolean; v_unknown boolean; v_apps text; v_manager jsonb; v_body_email text; v_body_channel text; v_core text;
  v_title text; v_day text; v_mfirst text; v_warned timestamptz; v_level text := 'none'; v_start text; v_last text; v_idle numeric; v_tz text;
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_flag;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id; v_tz := s.timezone;
  SELECT * INTO p FROM public.profiles WHERE id = f.person_id;
  SELECT * INTO m FROM public.profiles WHERE id = coalesce(public.agent_manager_of(p.id), f.manager_id);
  rec := public.agent_flag_recurrence(p_flag);
  v_n := (rec ->> 'count_in_window')::int; v_win := (rec ->> 'window_days')::int;
  v_mfirst := nullif(split_part(coalesce(m.full_name, ''), ' ', 1), '');

  -- reviews and calls go to the manager; everything else to the person
  IF f.rule_code IN ('TK08', 'TK13', 'FT02') AND m.id IS NOT NULL THEN v_to := 'manager'; v_rcpt := m; ELSE v_rcpt := p; END IF;
  v_first := coalesce(nullif(split_part(coalesce(v_rcpt.full_name, ''), ' ', 1), ''), 'there');

  v_title := coalesce(f.evidence ->> 'task_title', '');
  v_day := CASE WHEN f.period_key ~ '^\d{4}-\d{2}-\d{2}$' THEN to_char(f.period_key::date, 'Dy Mon FMDD') ELSE 'that day' END;
  v_sites := (SELECT string_agg(x ->> 'domain' || ' (about ' || greatest(1, round(((x ->> 'seconds')::numeric) / 60)) || ' min)', ', ')
                FROM (SELECT x FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) x LIMIT 4) q(x));
  v_unprod := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) x WHERE x ->> 'category' = 'unproductive');
  v_unknown := EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(f.evidence -> 'sites', '[]'::jsonb)) x WHERE x ->> 'category' <> 'unproductive');
  v_apps := (SELECT string_agg(x ->> 'app' || ' (about ' || greatest(1, round(((x ->> 'seconds')::numeric) / 60)) || ' min)', ', ')
               FROM (SELECT x FROM jsonb_array_elements(coalesce(f.evidence -> 'apps', '[]'::jsonb)) x LIMIT 4) q(x));
  v_start := CASE WHEN f.evidence ->> 'work_started_at' IS NOT NULL THEN
               CASE WHEN extract(minute FROM ((f.evidence ->> 'work_started_at')::timestamptz AT TIME ZONE v_tz)) = 0
                    THEN to_char(((f.evidence ->> 'work_started_at')::timestamptz AT TIME ZONE v_tz), 'FMHH12 AM')
                    ELSE to_char(((f.evidence ->> 'work_started_at')::timestamptz AT TIME ZONE v_tz), 'FMHH12:MI AM') END || ' EST'
             ELSE CASE WHEN extract(minute FROM s.default_work_start) = 0 THEN to_char(s.default_work_start, 'FMHH12 AM') ELSE to_char(s.default_work_start, 'FMHH12:MI AM') END || ' EST' END;
  v_last := CASE WHEN f.evidence ->> 'last_tracked_at' IS NOT NULL THEN to_char(((f.evidence ->> 'last_tracked_at')::timestamptz AT TIME ZONE v_tz), 'FMHH12:MI AM') || ' EST' END;
  v_idle := coalesce((f.evidence ->> 'idle_minutes')::numeric, 0);
  v_link := public.agent_flag_link(p_flag);

  -- what was noticed, in a sentence, and what to do about it
  v_obs := CASE f.rule_code
    WHEN 'TR01' THEN CASE WHEN coalesce((f.evidence ->> 'tracked_minutes_today')::numeric, 0) = 0 OR v_last IS NULL
        THEN format('I found that you are not tracking time. Work starts at %s and I have nothing from you yet.', v_start)
        ELSE format('I found that you stopped tracking time at %s and I have nothing since (%s minutes).', v_last, round(v_idle)) END
    WHEN 'TR02' THEN 'I found that your timer has been running for more than 10 hours.'
    WHEN 'TR03' THEN format('I found that your tracked time on %s was low. %s', v_day, f.why)
    WHEN 'TR05' THEN CASE WHEN v_sites IS NOT NULL THEN format('I noticed time on %s today.', v_sites) ELSE 'I noticed sites that are not on our work list today.' END
    WHEN 'TR06' THEN format('I found that your timer, started at %s, is running but the Track app has captured nothing since it started.', coalesce(f.evidence ->> 'started_text', 'earlier'))
    WHEN 'TR07' THEN format('I found manual time on %s with nothing from the tracker to back it.', v_day)
    WHEN 'TR08' THEN CASE WHEN v_apps IS NOT NULL THEN format('I noticed time in %s today.', v_apps) ELSE 'I noticed apps that do not look like work today.' END
    WHEN 'TR09' THEN format('I found hours that do not add up on %s. %s', v_day, f.why)
    WHEN 'TR10' THEN format('I found that your time tracker is not fully set up (week %s).', f.period_key)
    WHEN 'TK01' THEN format('I found that your task "%s" is past its due date%s.', v_title, CASE WHEN f.evidence ->> 'due_date' IS NOT NULL THEN ' (' || to_char((f.evidence ->> 'due_date')::date, 'Mon FMDD') || ')' ELSE '' END)
    WHEN 'TK02' THEN format('I found that the due date on your task "%s" was moved%s.', v_title,
                       CASE WHEN f.evidence ->> 'from' IS NOT NULL AND f.evidence ->> 'to' IS NOT NULL THEN ' (' || (f.evidence ->> 'from') || ' to ' || (f.evidence ->> 'to') || ')' ELSE '' END)
    WHEN 'TK04' THEN format('I found that your task "%s" has been blocked for a while.', v_title)
    WHEN 'TK05' THEN format('I found that your task "%s" has not moved for a few days.', v_title)
    WHEN 'TK06' THEN 'there is no task assigned to you in Task.'
    WHEN 'TK07' THEN format('I found that your task "%s" has no description.', v_title)
    WHEN 'TK11' THEN format('I found that your task "%s" is due soon and not started.', v_title)
    WHEN 'RP01' THEN format('I have not seen your daily report for %s yet.', v_day)
    WHEN 'RP03' THEN 'I have not seen your daily report today or on the last working day.'
    WHEN 'TK08' THEN format('%s''s task "%s" is waiting for your review.', coalesce(p.full_name, 'A team member'), v_title)
    WHEN 'TK13' THEN format('%s''s task "%s" is ready for your review.', coalesce(p.full_name, 'A team member'), v_title)
    WHEN 'FT02' THEN format('%s', f.why)
    WHEN 'TK14' THEN 'your task is complete.'
    ELSE 'I noticed this: ' || f.why END;

  v_ask := CASE f.rule_code
    WHEN 'TR01' THEN 'If you are in a meeting or away, let me know; otherwise please start your timer.'
    WHEN 'TR02' THEN 'Did you forget to stop it? If so, please stop it and correct the entry.'
    WHEN 'TR03' THEN 'Could you tell me what got in the way, and whether the work was tracked somewhere else?'
    WHEN 'TR05' THEN CASE
        WHEN v_unprod AND v_unknown THEN 'Some of these look personal and some I do not recognise. If any of it was for work, tell me what it is for and I will add it to our list; otherwise please keep work time for work.'
        WHEN v_unprod THEN 'These look personal. Please keep work time for work; if any of it was for a work reason, tell me what it was.'
        ELSE 'Was this for work? If it was, tell me what it is used for and I will add it to our approved list.' END
    WHEN 'TR06' THEN 'Please check the app is open and signed in, or stop the timer if you are not working.'
    WHEN 'TR07' THEN 'Please add a note to each entry saying what was done and why it was added afterwards.'
    WHEN 'TR08' THEN CASE WHEN coalesce((f.evidence ->> 'blocked_seconds')::numeric, 0) > 0
        THEN 'Some of these apps are blocked on work time. Please stop using them; if there was a work reason, tell me what it was.'
        ELSE 'Please keep work time for work; if any of it was for a work reason, tell me what it was.' END
    WHEN 'TR09' THEN 'Please check this time and correct anything that is wrong.'
    WHEN 'TR10' THEN 'Please make sure the Track desktop app is installed and signed in on the computer you work on.'
    WHEN 'TK01' THEN 'Please add an update in the task comments with when it will be done.'
    WHEN 'TK02' THEN 'Due dates are not moved once set. Please explain the change in the task comments.'
    WHEN 'TK04' THEN 'Who can clear it? Please say so in the task comments.'
    WHEN 'TK05' THEN 'Please add a short update in the task comments.'
    WHEN 'TK06' THEN 'Can you reach out to your manager?'
    WHEN 'TK07' THEN 'Please add what needs doing and what success looks like.'
    WHEN 'TK11' THEN 'If something is stopping you from starting, tell me today so we can fix it.'
    WHEN 'RP01' THEN 'Please send it as soon as you can.'
    WHEN 'RP03' THEN 'Please send it today, and tell me what makes it hard to send.'
    WHEN 'TK08' THEN 'Please review it and either move it to Complete or say what is missing.'
    WHEN 'TK13' THEN 'Please review it and either move it to Complete or say what is missing.'
    WHEN 'FT02' THEN 'Please have the call, then mark this handled and note what was agreed.'
    WHEN 'TK14' THEN 'Thank you, nice work.'
    ELSE 'Please let me know.' END;

  -- Not a question: what is for a manager to do, and a thank-you
  IF v_to = 'manager' OR f.rule_code = 'TK14' THEN v_q := ''; END IF;
  IF v_to = 'manager' THEN
    v_obs := coalesce(v_obs, '');
  END IF;

  -- Repeats: said once, and remembered. A warning (a message that said a call would follow) is recorded when it is sent.
  SELECT max(w.warned_at) INTO v_warned FROM public.agent_warnings w
   WHERE w.person_id = f.person_id AND w.rule_code = f.rule_code AND w.warned_at < f.first_seen_at AND w.warned_at > f.first_seen_at - make_interval(days => v_win);
  IF v_to = 'person' AND f.rule_code <> 'TK14' AND public.agent_is_team_rule(f.rule_code) THEN
    IF v_warned IS NOT NULL THEN
      v_level := 'call';
      v_rep := format('This has come up again since I messaged you on %s. %s will have a call with you about it.', to_char(v_warned AT TIME ZONE v_tz, 'Mon FMDD'), coalesce(v_mfirst, 'We'));
      IF v_mfirst IS NULL THEN v_rep := format('This has come up again since I messaged you on %s. We will need to have a call about it.', to_char(v_warned AT TIME ZONE v_tz, 'Mon FMDD')); END IF;
    ELSIF v_n >= 2 THEN
      v_level := 'warn';
      v_rep := format('This is the %s time in the last %s days that this has come up. If it happens again, %s.', public.agent_ordinal(v_n), v_win,
                      CASE WHEN v_mfirst IS NOT NULL THEN v_mfirst || ' will have a call with you' ELSE 'we will need to have a call about it' END);
    END IF;
  END IF;

  v_subject := left(f.title, 120);
  v_manager := CASE WHEN v_to = 'person' AND f.rule_code <> 'TK14' AND m.id IS NOT NULL AND m.id <> p.id
                    THEN jsonb_build_object('id', m.id, 'name', m.full_name, 'email', m.email) ELSE NULL END;

  v_core := 'Hi ' || v_first || ', ' || v_obs || v_q || CASE WHEN v_ask <> '' THEN ' ' || v_ask ELSE '' END
      || CASE WHEN v_link ->> 'person_url' IS NOT NULL AND f.rule_code <> 'TK14' THEN E'\nOpen it here: ' || (v_link ->> 'person_url') ELSE '' END
      || CASE WHEN v_rep <> '' THEN E'\n\n' || v_rep ELSE '' END;
  v_body_email := v_core
      || CASE WHEN v_manager IS NOT NULL THEN E'\n\nI have copied ' || (v_manager ->> 'name') || E' (your manager) so they can follow up with you.' ELSE '' END
      || E'\n\nThank you,\nKD Squares Operations';
  v_body_channel := CASE WHEN v_manager IS NULL THEN v_body_email
      ELSE v_core || E'\n\n@' || (v_manager ->> 'name') || ' please follow up with ' || v_first || '.' END;

  RETURN jsonb_build_object(
    'to', v_to, 'recipient_name', v_rcpt.full_name, 'recipient_email', v_rcpt.email, 'recipient_id', v_rcpt.id, 'subject', v_subject,
    'link', v_link, 'manager', v_manager,
    'warning', jsonb_build_object('level', v_level, 'count', v_n, 'window_days', v_win, 'manager', v_mfirst, 'warned_at', v_warned),
    'body', v_body_email, 'channel_body', v_body_channel);
END $$;
REVOKE ALL ON FUNCTION public.agent_flag_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_flag_draft(uuid) TO authenticated, service_role;
