-- Ops Agent: the drafted message is a question put to the person in question.
--
--   agent_flag_draft now returns two texts:
--     body           the EMAIL: "Here is what we noticed: ...", the item and its link, "Can you tell us what is going on with this, and what
--                    happened?" and what we need, then a line saying their manager is copied (the manager is CC'd when it is sent).
--     channel_body   the CHANNEL message (Cliq, Slack): the same, and at the bottom "@<manager> please follow up with <first name> and get
--                    clarity on what is happening." (the sender turns the @name into a real tag).
--     manager        { id, name, email } or null, so the screen can show who is copied.
--   An item for a manager to review, and a thank-you (TK14), keep their own wording and have no manager line.
--   Everything else in the function (who it is addressed to, the item and link, the repeat note, the manager lookup from
--   20261418000000_agent_manager_resolution.sql) is unchanged.
--
-- Rollback: re-apply agent_flag_draft from 20261418000000_agent_manager_resolution.sql.

CREATE OR REPLACE FUNCTION public.agent_flag_draft(p_flag uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f public.agent_flags%ROWTYPE; p public.profiles%ROWTYPE; m public.profiles%ROWTYPE; rec jsonb; v_n integer; v_win integer;
  v_first text; v_link jsonb; v_item text := ''; v_to text := 'person'; v_rcpt public.profiles%ROWTYPE; v_obs text; v_ask text; v_rep text := ''; v_subject text; v_sites text; v_unprod boolean; v_unknown boolean; v_apps text;
  v_q text := ''; v_core text; v_manager jsonb; v_body_email text; v_body_channel text;
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
    v_obs := format('Time on %s today.', v_sites);
  ELSIF f.rule_code = 'TR08' AND v_apps IS NOT NULL THEN
    v_obs := format('Time in %s today.', v_apps);
  END IF;

  IF v_n >= 2 AND f.rule_code <> 'TK14' AND v_to = 'person' THEN
    v_rep := format('This is the %s time in the last %s days that this has come up, so I wanted to raise it with you directly.', public.agent_ordinal(v_n), v_win);
    IF v_n >= 3 THEN v_rep := v_rep || ' If it keeps happening I will need to take it up with your manager.'; END IF;
  END IF;

  v_subject := left(f.title, 120);

  -- Written to the person: what we noticed, and a question. (An item for a manager, and a thank-you, keep their own wording.)
  IF v_to = 'person' AND f.rule_code <> 'TK14' THEN
    v_obs := 'Here is what we noticed: ' || v_obs;
    v_q := 'Can you tell us what is going on with this, and what happened?';
  END IF;
  -- Their manager: copied on the email, tagged at the bottom of a channel message to follow up.
  v_manager := CASE WHEN v_to = 'person' AND f.rule_code <> 'TK14' AND m.id IS NOT NULL AND m.id <> p.id
                    THEN jsonb_build_object('id', m.id, 'name', m.full_name, 'email', m.email) ELSE NULL END;

  v_core := 'Hi ' || v_first || E',\n\n' || v_obs
      || CASE WHEN v_item <> '' THEN E'\n\n' || v_item ELSE '' END
      || CASE WHEN v_link ->> 'person_url' IS NOT NULL THEN E'\nOpen it here: ' || (v_link ->> 'person_url') ELSE '' END
      || E'\n\n' || CASE WHEN v_q <> '' THEN v_q || ' ' ELSE '' END || v_ask || CASE WHEN v_rep <> '' THEN E'\n\n' || v_rep ELSE '' END;
  v_body_email := v_core
      || CASE WHEN v_manager IS NOT NULL THEN E'\n\nI have copied ' || (v_manager ->> 'name') || E' (your manager) so they can follow up with you.' ELSE '' END
      || E'\n\nThank you,\nKD Squares Operations';
  v_body_channel := CASE WHEN v_manager IS NULL THEN v_body_email
      ELSE v_core || E'\n\n@' || (v_manager ->> 'name') || ' please follow up with ' || v_first || ' and get clarity on what is happening.' END;

  RETURN jsonb_build_object(
    'to', v_to, 'recipient_name', v_rcpt.full_name, 'recipient_email', v_rcpt.email, 'recipient_id', v_rcpt.id, 'subject', v_subject,
    'link', v_link, 'manager', v_manager,
    'body', v_body_email, 'channel_body', v_body_channel);
END $$;

REVOKE ALL ON FUNCTION public.agent_flag_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_flag_draft(uuid) TO authenticated, service_role;
