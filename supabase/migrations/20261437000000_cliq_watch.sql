-- Ops Agent: watch Zoho Cliq for messages that tag someone and get no answer.
--
--   Every 2 hours during working hours (9 to 5 on working days, Eastern) the Cliq connection that has "Watch" switched on reads the channels
--   it can see (see supabase/functions/_shared/agent-cliq-monitor.ts). A message that tags a KD Squares team member is remembered
--   (agent_cliq_messages, with its text) unless it is only a thank-you or an FYI. When the tagged person posts anything in that channel
--   afterwards (in the thread or outside it) the message is answered. When 2 working hours pass without an answer, rule CQ01 raises an
--   Inbox item for the tagged person; its drafted message is posted by the Send button as a reply in that Cliq thread. Nothing is sent on its own.
--
-- Rollback: supabase/rollbacks/20261437_cliq_watch_down.sql

CREATE TABLE IF NOT EXISTS public.agent_cliq_watch (
  connection_id uuid PRIMARY KEY REFERENCES public.agent_connections(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  checked_through timestamptz,
  last_run_at timestamptz,
  last_ok_at timestamptz,
  last_error text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_cliq_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.agent_connections(id) ON DELETE CASCADE,
  channel_id text,
  channel_name text NOT NULL DEFAULT '',
  channel_unique text NOT NULL DEFAULT '',
  chat_id text,
  message_id text NOT NULL,
  thread_chat_id text,
  posted_at timestamptz NOT NULL,
  sender_cliq_id text,
  sender_name text NOT NULL DEFAULT '',
  tagged_cliq_id text NOT NULL,
  tagged_name text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  classification text NOT NULL DEFAULT 'message' CHECK (classification IN ('request', 'message', 'ack')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'no_answer_needed', 'expired')),
  answered_at timestamptz,
  answered_in text CHECK (answered_in IN ('channel', 'thread')),
  flag_id uuid REFERENCES public.agent_flags(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, message_id, tagged_cliq_id)
);
CREATE INDEX IF NOT EXISTS agent_cliq_messages_open_idx ON public.agent_cliq_messages (connection_id, status, posted_at);

ALTER TABLE public.agent_cliq_watch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_cliq_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_cliq_watch_read ON public.agent_cliq_watch;
CREATE POLICY agent_cliq_watch_read ON public.agent_cliq_watch FOR SELECT TO authenticated USING (public.agent_can_configure());
DROP POLICY IF EXISTS agent_cliq_messages_read ON public.agent_cliq_messages;
CREATE POLICY agent_cliq_messages_read ON public.agent_cliq_messages FOR SELECT TO authenticated USING (public.agent_can_configure());
REVOKE ALL ON public.agent_cliq_watch, public.agent_cliq_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_cliq_watch, public.agent_cliq_messages TO authenticated;
GRANT ALL ON public.agent_cliq_watch, public.agent_cliq_messages TO service_role;

-- ── Working minutes between two moments: only working days, only between the work start and end (Eastern) ──
CREATE OR REPLACE FUNCTION public.agent_working_minutes(p_from timestamptz, p_to timestamptz)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; d date; last_d date; a timestamptz; b timestamptz; v_total numeric := 0;
BEGIN
  IF p_to IS NULL OR p_from IS NULL OR p_to <= p_from THEN RETURN 0; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  d := (p_from AT TIME ZONE s.timezone)::date; last_d := (p_to AT TIME ZONE s.timezone)::date;
  IF last_d - d > 30 THEN d := last_d - 30; END IF;
  WHILE d <= last_d LOOP
    IF public.agent_is_working_day(d) THEN
      a := greatest(p_from, (d + s.default_work_start) AT TIME ZONE s.timezone);
      b := least(p_to, (d + s.default_work_end) AT TIME ZONE s.timezone);
      IF b > a THEN v_total := v_total + extract(epoch FROM (b - a)) / 60.0; END IF;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN round(v_total, 1);
END $$;
REVOKE ALL ON FUNCTION public.agent_working_minutes(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_working_minutes(timestamptz, timestamptz) TO service_role;

-- ── Switch the watch on or off, and read how it is going (Super Admin) ──────
CREATE OR REPLACE FUNCTION public.agent_cliq_watch_set(p_connection uuid, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_was boolean;
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq' AND config ->> 'mode' = 'api') THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT enabled INTO v_was FROM public.agent_cliq_watch WHERE connection_id = p_connection;
  -- Switching it on starts from now: nothing older is looked at, so the first check does not flood the Inbox.
  INSERT INTO public.agent_cliq_watch (connection_id, enabled, enabled_at, checked_through, updated_at)
  VALUES (p_connection, p_enabled, CASE WHEN p_enabled THEN now() END, CASE WHEN p_enabled THEN now() END, now())
  ON CONFLICT (connection_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now(),
    enabled_at = CASE WHEN EXCLUDED.enabled AND NOT coalesce(v_was, false) THEN now() ELSE agent_cliq_watch.enabled_at END,
    checked_through = CASE WHEN EXCLUDED.enabled AND NOT coalesce(v_was, false) THEN now() ELSE agent_cliq_watch.checked_through END,
    last_error = CASE WHEN EXCLUDED.enabled THEN agent_cliq_watch.last_error ELSE NULL END;
  RETURN jsonb_build_object('enabled', p_enabled);
END $$;

CREATE OR REPLACE FUNCTION public.agent_cliq_watch_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'connection_id', w.connection_id, 'enabled', w.enabled, 'last_run_at', w.last_run_at, 'last_ok_at', w.last_ok_at, 'last_error', w.last_error, 'stats', w.stats,
      'waiting', (SELECT count(*) FROM public.agent_cliq_messages m WHERE m.connection_id = w.connection_id AND m.status = 'open' AND m.classification <> 'ack'),
      'answered_7d', (SELECT count(*) FROM public.agent_cliq_messages m WHERE m.connection_id = w.connection_id AND m.status = 'answered' AND m.answered_at > now() - interval '7 days'))
    ) FROM public.agent_cliq_watch w), '[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.agent_cliq_watch_set(uuid, boolean), public.agent_cliq_watch_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_cliq_watch_set(uuid, boolean), public.agent_cliq_watch_status() TO authenticated, service_role;

-- ── When to read: every 2 hours of working time ─────────────────────────────
-- Working day, from the work start to half an hour after the work end (the last read of the day closes what was answered), and the
-- last read was at least 105 minutes ago. pg_cron wakes this at 7 minutes past every hour; the reads land near 9:07, 11:07, 13:07, 15:07 and 17:07.
CREATE OR REPLACE FUNCTION public.agent_cliq_watch_due(p_now timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_local timestamp;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone;
  IF NOT coalesce(public.agent_is_working_day(v_local::date), false) THEN RETURN false; END IF;
  IF v_local::time < s.default_work_start OR v_local::time >= s.default_work_end + interval '30 minutes' THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.agent_cliq_watch w WHERE w.enabled AND (w.last_run_at IS NULL OR w.last_run_at <= p_now - interval '105 minutes'));
END $$;

CREATE OR REPLACE FUNCTION public.agent_cliq_watch_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT public.agent_cliq_watch_due(now()) THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'agent_cliq_monitor_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/agent-cliq-monitor') INTO v_url FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'agent_cliq_watch_tick: Vault secrets not configured yet, skipping';
    RETURN;
  END IF;
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret), body := '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.agent_cliq_watch_due(timestamptz), public.agent_cliq_watch_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_cliq_watch_due(timestamptz), public.agent_cliq_watch_tick() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('agent_cliq_watch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent_cliq_watch');
    PERFORM cron.schedule('agent_cliq_watch', '7 * * * *', 'SELECT public.agent_cliq_watch_tick()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed here: agent_cliq_watch was not scheduled';
  END IF;
END $$;

-- ── CQ01: tagged in Cliq and not answered ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.agent_rule_cq01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; r record; v_wait numeric; v_created integer := 0; v_resolved integer := 0; v_sev text; v_ids text[]; v_fid uuid; v_hours text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  UPDATE public.agent_cliq_messages SET status = 'expired' WHERE status = 'open' AND posted_at < p_now - interval '7 days';

  FOR r IN
    SELECT m.*, ti.person_id AS tagged_person, tp.full_name AS tagged_full, sp.full_name AS sender_full, sp.id AS sender_person
      FROM public.agent_cliq_messages m
      JOIN public.agent_cliq_watch w ON w.connection_id = m.connection_id AND w.enabled
      JOIN public.agent_identity_map ti ON ti.cliq_user_id = m.tagged_cliq_id
      JOIN public.agent_team_v t ON t.person_id = ti.person_id
      JOIN public.profiles tp ON tp.id = ti.person_id
      LEFT JOIN public.agent_identity_map si ON si.cliq_user_id = m.sender_cliq_id
      LEFT JOIN public.profiles sp ON sp.id = si.person_id
     WHERE m.status = 'open' AND m.classification <> 'ack' AND m.posted_at <= p_now AND m.sender_cliq_id IS DISTINCT FROM m.tagged_cliq_id
  LOOP
    v_wait := public.agent_working_minutes(r.posted_at, p_now);
    CONTINUE WHEN v_wait < 120;
    v_sev := CASE WHEN v_wait >= 8 * 60 THEN 'high' ELSE 'medium' END;
    v_hours := CASE WHEN v_wait >= 8 * 60 THEN round(v_wait / (8 * 60.0), 1) || ' working days' ELSE round(v_wait / 60.0, 1) || ' working hours' END;
    IF public.agent_raise_flag('CQ01', 'people', r.tagged_person, 'person', r.id::text, '', v_sev,
         format('Not answered in Cliq: %s (tagged by %s in #%s)', r.tagged_full, coalesce(nullif(r.sender_full, ''), nullif(r.sender_name, ''), 'someone'), r.channel_name),
         format('%s tagged %s in #%s at %s and there has been no reply for %s: "%s"',
                coalesce(nullif(r.sender_full, ''), nullif(r.sender_name, ''), 'Someone'), r.tagged_full, r.channel_name,
                to_char(r.posted_at AT TIME ZONE s.timezone, 'Dy Mon FMDD, FMHH12:MI AM') || ' EST', v_hours, left(r.text, 300)),
         jsonb_build_object('message_row_id', r.id, 'connection_id', r.connection_id, 'channel_name', r.channel_name, 'channel_unique', r.channel_unique,
                            'message_id', r.message_id, 'posted_at', r.posted_at, 'text', left(r.text, 1000), 'sender_name', coalesce(nullif(r.sender_full, ''), r.sender_name),
                            'sender_person_id', r.sender_person, 'tagged_name', r.tagged_full, 'classification', r.classification, 'waiting_minutes', round(v_wait)),
         'Send the drafted reply: it is posted in the same Cliq thread and tags them.', p_now) THEN
      v_created := v_created + 1;
    END IF;
    SELECT id INTO v_fid FROM public.agent_flags WHERE rule_code = 'CQ01' AND subject_type = 'person' AND subject_id = r.id::text AND period_key = '';
    IF v_fid IS NOT NULL THEN UPDATE public.agent_cliq_messages SET flag_id = v_fid WHERE id = r.id AND flag_id IS DISTINCT FROM v_fid; END IF;
  END LOOP;

  -- closed by the agent: answered, not needed, expired, no longer watched, or the person is no longer on the team
  SELECT array_agg(m.id::text) INTO v_ids
    FROM public.agent_cliq_messages m JOIN public.agent_flags f ON f.id = m.flag_id AND f.status IN ('open', 'snoozed')
   WHERE m.status <> 'open'
      OR NOT EXISTS (SELECT 1 FROM public.agent_cliq_watch w WHERE w.connection_id = m.connection_id AND w.enabled)
      OR NOT EXISTS (SELECT 1 FROM public.agent_identity_map i JOIN public.agent_team_v t ON t.person_id = i.person_id WHERE i.cliq_user_id = m.tagged_cliq_id);
  v_resolved := public.agent_resolve_flags('CQ01', coalesce(v_ids, '{}'), '', p_now);
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;
REVOKE ALL ON FUNCTION public.agent_rule_cq01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_cq01(timestamptz) TO service_role;

INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('CQ01', 'people', 'Tagged in Cliq, not answered', 'Someone was tagged in a Cliq message and has not replied (in the thread or the channel) after 2 working hours. The drafted reply is posted in the same thread. Needs the Cliq connection to Watch.', true, 'medium', '{}', 'ready')
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
    WHEN 'CQ01' THEN format('%s tagged you in %s at %s and I do not see a reply yet: "%s"',
                       coalesce(nullif(split_part(coalesce(f.evidence ->> 'sender_name', ''), ' ', 1), ''), 'Someone'),
                       '#' || coalesce(f.evidence ->> 'channel_name', 'a channel'),
                       to_char((f.evidence ->> 'posted_at')::timestamptz AT TIME ZONE v_tz, 'FMHH12:MI AM') || ' EST',
                       left(coalesce(f.evidence ->> 'text', ''), 240) || CASE WHEN length(coalesce(f.evidence ->> 'text', '')) > 240 THEN '...' ELSE '' END)
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
    WHEN 'CQ01' THEN 'Can you reply in the thread, or tell me what is getting in the way?'
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

  IF f.rule_code = 'CQ01' THEN v_obs := v_obs || '.'; END IF;
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
