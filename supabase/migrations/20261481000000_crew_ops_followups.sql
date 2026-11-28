-- Crew: the Head of Operations (ops_head) follows up with the TEAM in Cliq, under a STANDING permission the owner switches on and can switch off at any time.
--
--   * crew_standing_permissions: "this agent may post in this Cliq connection's channel, at most N times a day, only these kinds of post". OFF by default.
--     Only the owner can change it (owner-only functions below). A kill switch turns every standing permission off at once.
--   * crew_cliq_posts: every post an agent makes (and every refusal), with the agent, kind, text, who was tagged and the result. The owner reads it.
--   * crew_cliq_post_reserve(): the ONE place the rules are applied, called by the crew-gateway op "cliq_post" before anything is posted: permission on,
--     kind allowed, daily cap, the text rules (700 characters at most, no links except kdsquares.com, no money amounts, no email addresses, no phone or
--     account numbers, nothing that looks like a secret, no hand-written tags), people tagged by name from the Ops Agent's team (only people with a saved Cliq id
--     are really tagged), and a tracking reminder to the same person at most once a day. A refusal is logged and explained to the agent.
--   * crew_v_time_today + the source "time_today": what ops_head may READ about time tracking today (person, tracked minutes, last activity, expected hours,
--     whether the person is expected to work now). It reuses the Ops Agent's own definition of the team, work hours, time zone, leave and holidays.
--   * crew_ops_followup_tick() + cron "crew_ops_followup": on working days, twice a day, at (work start + 90 min) and (work end - 2 hours) in the company
--     time zone from the Ops Agent settings (09:00 and 17:00 New York today, so 10:30 and 15:00), it wakes Henry ONCE per slot, only when his permission is on
--     and someone is behind. The wake text tells him exactly what to do. Two wakes a day at most.
-- A paused agent (20261480) cannot post and is not woken by the routine. This migration comes after 20261480 on purpose.
-- Nothing posts anywhere until the owner switches the permission on in Crew > Team.
-- Rollback: supabase/rollbacks/20261481_crew_ops_followups_down.sql

-- 1. the permission and the log ----------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_standing_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.crew_agents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind = 'cliq_post'),
  connection_id uuid REFERENCES public.agent_connections(id) ON DELETE SET NULL,
  enabled boolean NOT NULL DEFAULT false,
  max_posts_per_day integer NOT NULL DEFAULT 6 CHECK (max_posts_per_day BETWEEN 1 AND 20),
  allowed_kinds text[] NOT NULL DEFAULT ARRAY['tracking_followup', 'announcement']
    CHECK (cardinality(allowed_kinds) > 0 AND allowed_kinds <@ ARRAY['tracking_followup', 'announcement']),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, kind)
);

CREATE TABLE IF NOT EXISTS public.crew_cliq_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.crew_agents(id) ON DELETE CASCADE,
  permission_id uuid REFERENCES public.crew_standing_permissions(id) ON DELETE SET NULL,
  kind text NOT NULL,
  body text NOT NULL,
  tagged jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{"person_id": "...", "name": "...", "tagged": true}] (a name is only really tagged when the person has a Cliq id)
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'sent', 'failed', 'refused')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS crew_cliq_posts_agent_idx ON public.crew_cliq_posts (agent_id, created_at DESC);

ALTER TABLE public.crew_standing_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_cliq_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_standing_permissions_owner ON public.crew_standing_permissions;
CREATE POLICY crew_standing_permissions_owner ON public.crew_standing_permissions FOR SELECT TO authenticated USING (public.crew_is_owner());
DROP POLICY IF EXISTS crew_cliq_posts_owner ON public.crew_cliq_posts;
CREATE POLICY crew_cliq_posts_owner ON public.crew_cliq_posts FOR SELECT TO authenticated USING (public.crew_is_owner());
REVOKE ALL ON public.crew_standing_permissions, public.crew_cliq_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_standing_permissions, public.crew_cliq_posts TO authenticated;
GRANT ALL ON public.crew_standing_permissions, public.crew_cliq_posts TO service_role;

-- 2. the text rules ----------------------------------------------------------------------------------------------------------------------------------
-- NULL when the text is fine, otherwise a plain sentence for the agent. (The gateway checks the same rules first; this is the one that counts.)
CREATE OR REPLACE FUNCTION public.crew_cliq_post_text_error(p_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE t text := coalesce(p_text, ''); m text[]; v_host text;
BEGIN
  IF btrim(t) = '' THEN RETURN 'the message is empty'; END IF;
  IF char_length(t) > 700 THEN RETURN 'too long: 700 characters at most'; END IF;
  IF t ~ '\{@' THEN RETURN 'do not write tags yourself: name the people in the tag list and write @Full Name in the text'; END IF;
  IF t ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}' THEN RETURN 'no email addresses in a post'; END IF;
  IF t ~* '\m(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}' OR t ~* 'bearer\s+[A-Za-z0-9._-]{12,}' OR t ~ 'eyJ[A-Za-z0-9_-]{10,}' OR t ~* 'crew_[0-9a-f]{16,}'
     OR t ~* '\m(password|passcode|secret|api[ _-]?key|token|otp|pin|cvv)\M\s*(is|:|=)\s*\S+' OR t ~ '[A-Za-z0-9+/=_-]{32,}' THEN
    RETURN 'that looks like a secret or a key: never put one in a post';
  END IF;
  FOR m IN SELECT regexp_matches(t, '(https?://[^\s]+|www\.[^\s]+|\m[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|dev|ng|uk|us|info|biz|me|ly|xyz|ai|tv|gov|edu)\M[^\s]*)', 'gi') LOOP
    v_host := lower(split_part(split_part(split_part(regexp_replace(m[1], '^https?://', '', 'i'), '/', 1), '?', 1), ':', 1));
    v_host := regexp_replace(v_host, '^www\.', '');
    IF v_host <> 'kdsquares.com' AND v_host NOT LIKE '%.kdsquares.com' THEN RETURN 'no links except kdsquares.com'; END IF;
  END LOOP;
  IF t ~ '[$€£₦¥]' OR t ~* '\m(ngn|usd|eur|gbp|naira|dollars?|euros?|pounds?|kobo)\M' OR t ~ '\mN\s?\d' OR t ~ '\d{1,3}(,\d{3})+' THEN
    RETURN 'no money amounts in a post';
  END IF;
  IF t ~ '\d{8,}' OR t ~ '\+\d[\d\s().-]{7,}\d' OR t ~ '\m\d{3}[\s.-]\d{3,4}[\s.-]\d{4}\M' THEN RETURN 'no phone or account numbers in a post'; END IF;
  RETURN NULL;
END $$;

-- 3. what a post needs before it goes out ------------------------------------------------------------------------------------------------------------
-- A refusal is written to the log (at most 30 a day per agent, so a loop cannot flood it) and returned as {allowed:false, error}.
CREATE OR REPLACE FUNCTION public.crew_cliq_post_refuse(p_agent uuid, p_perm uuid, p_kind text, p_text text, p_error text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT count(*) FROM public.crew_cliq_posts WHERE agent_id = p_agent AND status = 'refused' AND created_at > now() - interval '1 day') < 30 THEN
    INSERT INTO public.crew_cliq_posts (agent_id, permission_id, kind, body, status, error)
    VALUES (p_agent, p_perm, left(coalesce(p_kind, '?'), 40), left(coalesce(p_text, ''), 700), 'refused', left(p_error, 300));
  END IF;
  RETURN jsonb_build_object('allowed', false, 'error', p_error);
END $$;

CREATE OR REPLACE FUNCTION public.crew_cliq_post_reserve(p_agent uuid, p_kind text, p_text text, p_tag text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.crew_agents; perm public.crew_standing_permissions; conn public.agent_connections; v_tz text; v_day_start timestamptz; v_err text;
  v_names text[]; v_name text; v_n integer; v_pid uuid; v_full text; v_cliq text; v_people jsonb := '[]'::jsonb; v_tagged jsonb := '[]'::jsonb; v_id uuid; v_text text := btrim(coalesce(p_text, ''));
BEGIN
  SELECT * INTO a FROM public.crew_agents WHERE id = p_agent AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT * INTO perm FROM public.crew_standing_permissions WHERE agent_id = p_agent AND kind = 'cliq_post';
  IF a.paused THEN RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, btrim(coalesce(p_text, '')), 'you are paused by the owner: you cannot post'); END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('tracking_followup', 'announcement') THEN
    RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, 'kind must be tracking_followup or announcement');
  END IF;
  IF NOT FOUND OR NOT perm.enabled OR perm.connection_id IS NULL THEN
    RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, 'you have no standing permission to post in Cliq (the owner has it switched off): tell the owner in the Crew inbox instead');
  END IF;
  IF NOT (p_kind = ANY (perm.allowed_kinds)) THEN
    RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, 'your permission does not cover ' || p_kind || ' posts');
  END IF;
  SELECT * INTO conn FROM public.agent_connections WHERE id = perm.connection_id AND kind = 'cliq';
  IF NOT FOUND OR conn.config ->> 'mode' <> 'api' OR coalesce(conn.config ->> 'channel', '') !~ '^[a-z0-9_]{1,50}$' THEN
    RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, 'the Cliq channel for your permission is not usable: tell the owner');
  END IF;

  v_err := public.crew_cliq_post_text_error(v_text);
  IF v_err IS NOT NULL THEN RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, v_err); END IF;

  -- the daily cap, counted in the company time zone (posts that failed do not count)
  SELECT timezone INTO v_tz FROM public.agent_settings WHERE id;
  v_day_start := ((now() AT TIME ZONE coalesce(v_tz, 'UTC'))::date::timestamp AT TIME ZONE coalesce(v_tz, 'UTC'));
  SELECT count(*) INTO v_n FROM public.crew_cliq_posts
   WHERE agent_id = p_agent AND created_at >= v_day_start AND (status = 'sent' OR (status = 'reserved' AND created_at > now() - interval '10 minutes'));
  IF v_n >= perm.max_posts_per_day THEN
    RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, format('you have used today''s limit of %s posts: leave it for tomorrow or tell the owner', perm.max_posts_per_day));
  END IF;

  -- who is named: people on the Ops Agent's team, by their full name; only a person with a saved Cliq id is really tagged
  IF p_tag IS NOT NULL THEN
    IF cardinality(p_tag) > 8 THEN RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, 'name at most 8 people in one post'); END IF;
    SELECT array_agg(DISTINCT lower(btrim(x))) INTO v_names FROM unnest(p_tag) x WHERE btrim(x) <> '';
  END IF;
  FOREACH v_name IN ARRAY coalesce(v_names, '{}') LOOP
    SELECT count(*), min(t.person_id::text)::uuid, min(t.full_name) INTO v_n, v_pid, v_full FROM public.agent_team_v t WHERE lower(btrim(t.full_name)) = v_name;
    IF v_n = 0 THEN RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, format('no one on the team is called "%s": use the full name exactly as in KD Ops', left(v_name, 60))); END IF;
    IF v_n > 1 THEN RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, format('more than one person is called "%s": tell the owner', left(v_name, 60))); END IF;
    SELECT btrim(i.cliq_user_id) INTO v_cliq FROM public.agent_identity_map i WHERE i.person_id = v_pid AND btrim(i.cliq_user_id) ~ '^[A-Za-z0-9._@+-]{2,120}$';
    -- one reminder a day per person: no repeats, nothing that reads as naming and shaming
    IF p_kind = 'tracking_followup' AND EXISTS (
         SELECT 1 FROM public.crew_cliq_posts p WHERE p.kind = 'tracking_followup' AND p.created_at >= v_day_start
            AND (p.status = 'sent' OR (p.status = 'reserved' AND p.created_at > now() - interval '10 minutes'))
            AND p.tagged @> jsonb_build_array(jsonb_build_object('person_id', v_pid))) THEN
      RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, format('%s was already reminded today: one reminder a day is the limit (tell the owner if it keeps happening)', v_full));
    END IF;
    v_people := v_people || jsonb_build_array(jsonb_build_object('name', v_full, 'id', coalesce(v_cliq, '')));
    v_tagged := v_tagged || jsonb_build_array(jsonb_build_object('person_id', v_pid, 'name', v_full, 'tagged', v_cliq IS NOT NULL));
  END LOOP;
  IF p_kind = 'tracking_followup' AND jsonb_array_length(v_tagged) = 0 THEN
    RETURN public.crew_cliq_post_refuse(p_agent, perm.id, p_kind, v_text, 'a tracking follow-up must name the person (or people) it is for in the tag list');
  END IF;

  INSERT INTO public.crew_cliq_posts (agent_id, permission_id, kind, body, tagged, status) VALUES (p_agent, perm.id, p_kind, v_text, v_tagged, 'reserved') RETURNING id INTO v_id;
  RETURN jsonb_build_object('allowed', true, 'post_id', v_id, 'connection_id', perm.connection_id, 'kind', p_kind, 'text', v_text, 'mentions', v_people,
                            'agent_name', a.name, 'agent_title', a.title, 'via', conn.name);
END $$;

-- the result of the real post (the gateway calls this right after trying to post)
CREATE OR REPLACE FUNCTION public.crew_cliq_post_finish(p_post uuid, p_ok boolean, p_error text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.crew_cliq_posts SET status = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END, error = CASE WHEN p_ok THEN NULL ELSE left(coalesce(p_error, 'failed'), 300) END,
         sent_at = CASE WHEN p_ok THEN now() END
   WHERE id = p_post AND status = 'reserved'
$$;

-- 4. the owner's controls ----------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_set_standing_permission(p_agent uuid, p_connection uuid, p_enabled boolean, p_max integer DEFAULT 6, p_kinds text[] DEFAULT ARRAY['tracking_followup', 'announcement'])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can change standing permissions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_agent AND active) THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  IF p_connection IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq' AND config ->> 'mode' = 'api' AND coalesce(config ->> 'channel', '') ~ '^[a-z0-9_]{1,50}$') THEN
    RAISE EXCEPTION 'choose a Cliq connection that signs in with Zoho and has a channel';
  END IF;
  IF p_enabled AND p_connection IS NULL THEN RAISE EXCEPTION 'choose the channel first'; END IF;
  IF p_max IS NULL OR p_max < 1 OR p_max > 20 THEN RAISE EXCEPTION 'the daily limit is between 1 and 20'; END IF;
  IF p_kinds IS NULL OR cardinality(p_kinds) = 0 OR NOT (p_kinds <@ ARRAY['tracking_followup', 'announcement']) THEN RAISE EXCEPTION 'choose which kinds of post are allowed'; END IF;
  INSERT INTO public.crew_standing_permissions (agent_id, kind, connection_id, enabled, max_posts_per_day, allowed_kinds, created_by)
  VALUES (p_agent, 'cliq_post', p_connection, p_enabled, p_max, p_kinds, auth.uid())
  ON CONFLICT (agent_id, kind) DO UPDATE SET connection_id = EXCLUDED.connection_id, enabled = EXCLUDED.enabled, max_posts_per_day = EXCLUDED.max_posts_per_day,
    allowed_kinds = EXCLUDED.allowed_kinds, created_by = coalesce(public.crew_standing_permissions.created_by, EXCLUDED.created_by), updated_at = now();
END $$;

-- the kill switch: every standing permission off, now
CREATE OR REPLACE FUNCTION public.crew_standing_kill_all() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v integer;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can switch standing permissions off'; END IF;
  WITH u AS (UPDATE public.crew_standing_permissions SET enabled = false, updated_at = now() WHERE enabled RETURNING 1) SELECT count(*) INTO v FROM u;
  RETURN v;
END $$;

-- 5. what ops_head may READ about time tracking today ---------------------------------------------------------------------------------------------------
-- Built on the Ops Agent's own team definition (who works today, inside their window, not on leave or a holiday, not exempt) and its time entries.
CREATE OR REPLACE VIEW public.crew_v_time_today AS
WITH s AS (
  SELECT timezone, default_work_start, default_work_end,
         (now() AT TIME ZONE timezone)::date AS day, ((now() AT TIME ZONE timezone)::date::timestamp AT TIME ZONE timezone) AS day_start
    FROM public.agent_settings WHERE id
)
SELECT t.person_id, t.full_name, s.day,
       coalesce((SELECT round(sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, now()) - e.start_time)) / 60.0)))::int
                   FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.start_time >= s.day_start), 0) AS tracked_minutes,
       EXISTS (SELECT 1 FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.end_time IS NULL) AS timer_running,
       (SELECT max(coalesce(e.end_time, now())) FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.start_time >= s.day_start) AS last_tracked_at,
       (SELECT max(l.captured_at) FROM public.time_activity_logs l WHERE l.employee_id = t.person_id AND l.captured_at >= s.day_start) AS last_capture_at,
       round(extract(epoch FROM (coalesce(v.work_end, s.default_work_end) - coalesce(v.work_start, s.default_work_start))) / 3600.0, 1) AS expected_hours,
       t.expects_work, t.in_window, t.exempt_time, round(t.mins_since_start)::int AS minutes_since_work_start,
       EXISTS (SELECT 1 FROM public.agent_identity_map i WHERE i.person_id = t.person_id AND btrim(i.cliq_user_id) ~ '^[A-Za-z0-9._@+-]{2,120}$') AS can_tag,
       EXISTS (SELECT 1 FROM public.agent_flags f WHERE f.rule_code = 'TR01' AND f.subject_id = t.person_id::text AND f.period_key = s.day::text) AS ops_agent_flagged,
       t.grp AS group_name
  FROM s, public.agent_team_today(now()) t LEFT JOIN public.agent_team_v v ON v.person_id = t.person_id;
REVOKE ALL ON public.crew_v_time_today FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_v_time_today TO service_role;

INSERT INTO public.crew_app_sources (name, relation, columns, description) VALUES
  ('time_today', 'public.crew_v_time_today',
   ARRAY['person_id', 'full_name', 'day', 'tracked_minutes', 'timer_running', 'last_tracked_at', 'last_capture_at', 'expected_hours', 'expects_work', 'in_window', 'exempt_time', 'minutes_since_work_start', 'can_tag', 'ops_agent_flagged', 'group_name'],
   'Time tracking today, per person (company time zone): minutes tracked, timer running, last tracked and last captured time, expected hours, whether they are expected to work right now, whether the Ops Agent already raised "not tracking time" for them today')
ON CONFLICT (name) DO UPDATE SET relation = EXCLUDED.relation, columns = EXCLUDED.columns, description = EXCLUDED.description;

UPDATE public.crew_agent_private p SET allowed_sources = (SELECT array(SELECT DISTINCT unnest(p.allowed_sources || ARRAY['time_today']) ORDER BY 1))
  FROM public.crew_agents a WHERE a.id = p.agent_id AND a.slug = 'ops_head' AND NOT ('time_today' = ANY (p.allowed_sources));

-- 6. ships prepared but OFF: ops_head -> the Operations channel -------------------------------------------------------------------------------------------
INSERT INTO public.crew_standing_permissions (agent_id, kind, connection_id, enabled, max_posts_per_day, allowed_kinds)
SELECT a.id, 'cliq_post',
       (SELECT c.id FROM public.agent_connections c WHERE c.kind = 'cliq' AND c.config ->> 'mode' = 'api' AND c.config ->> 'channel' = 'kdsoperations' ORDER BY c.created_at LIMIT 1),
       false, 6, ARRAY['tracking_followup', 'announcement']
  FROM public.crew_agents a WHERE a.slug = 'ops_head' AND a.active
ON CONFLICT (agent_id, kind) DO NOTHING;

UPDATE public.crew_agent_private p SET instructions = p.instructions || E'\n\nTEAM FOLLOW-UPS IN CLIQ (a standing permission the owner switches on and can switch off): when it is on you may post to the team in the Operations Cliq channel with op cliq_post {"kind":"tracking_followup"|"announcement","text":"...","tag":["Full Name",...]}. Limits you cannot change: a daily cap, 700 characters, no links except kdsquares.com, no money amounts, no emails, phone or account numbers, no secrets, one tracking reminder per person per day. Write @Full Name in the text for each person in the tag list. TRACKING FOLLOW-UPS: read the source time_today (op app) and remind, politely and in one line, people who are expected to work now and have tracked nothing or very little; do not remind someone the Ops Agent already raised (ops_agent_flagged); never put hours, percentages or comparisons in the channel and never single anyone out beyond the reminder. When someone keeps missing (check your notes), tell the owner in the Crew inbox, not in the channel. ANNOUNCEMENTS only when the owner asked for one or a rule requires it. Everything you post is logged for the owner.'
  FROM public.crew_agents a WHERE a.id = p.agent_id AND a.slug = 'ops_head' AND p.instructions NOT LIKE '%TEAM FOLLOW-UPS IN CLIQ%';

-- 7. the routine ---------------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_ops_followup_runs (
  day date NOT NULL,
  slot smallint NOT NULL CHECK (slot IN (1, 2)),
  fired_at timestamptz NOT NULL DEFAULT now(),
  people integer NOT NULL DEFAULT 0,
  note text,
  PRIMARY KEY (day, slot)
);
ALTER TABLE public.crew_ops_followup_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crew_ops_followup_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.crew_ops_followup_runs TO service_role;

-- Called every 10 minutes on weekdays. The two moments are worked out from the Ops Agent's settings (company time zone, working days, work start and end),
-- not guessed: work start + 90 minutes (10:30 for a 09:00 start) and work end - 2 hours (15:00 for a 17:00 end). Each happens once a day, only when the
-- permission is on, and only when somebody is behind (expected to work now, little or nothing tracked).
CREATE OR REPLACE FUNCTION public.crew_ops_followup_tick(p_now timestamptz DEFAULT now()) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings; v_ops uuid; v_local timestamp; v_day date; v_t time; v_slot smallint; v_when time; v_behind integer; v_names text; v_reason text; v_label text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  IF s.timezone IS NULL THEN RETURN 'no time zone'; END IF;
  SELECT a.id INTO v_ops FROM public.crew_agents a JOIN public.crew_standing_permissions sp ON sp.agent_id = a.id AND sp.kind = 'cliq_post' AND sp.enabled AND sp.connection_id IS NOT NULL
   WHERE a.slug = 'ops_head' AND a.active AND NOT a.paused;
  IF v_ops IS NULL THEN RETURN 'permission off'; END IF;

  v_local := p_now AT TIME ZONE s.timezone;
  v_day := v_local::date; v_t := v_local::time;
  IF NOT (extract(isodow FROM v_local)::int = ANY (s.default_working_days)) THEN RETURN 'not a working day'; END IF;

  FOR v_slot IN 1..2 LOOP
    v_when := CASE v_slot WHEN 1 THEN s.default_work_start + interval '90 minutes' ELSE s.default_work_end - interval '2 hours' END;
    v_label := CASE v_slot WHEN 1 THEN 'mid-morning' ELSE 'mid-afternoon' END;
    CONTINUE WHEN NOT (v_t >= v_when AND v_t < v_when + interval '20 minutes');
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.crew_ops_followup_runs WHERE day = v_day AND slot = v_slot);

    SELECT count(*), string_agg(full_name, ', ' ORDER BY full_name) INTO v_behind, v_names
      FROM public.crew_v_time_today
     WHERE expects_work AND in_window AND NOT exempt_time AND coalesce(group_name, '') <> 'placement' AND minutes_since_work_start >= 30 AND NOT timer_running
       AND tracked_minutes < 0.4 * least(minutes_since_work_start, expected_hours * 60);
    INSERT INTO public.crew_ops_followup_runs (day, slot, people, note) VALUES (v_day, v_slot, coalesce(v_behind, 0), CASE WHEN coalesce(v_behind, 0) = 0 THEN 'nobody behind: no wake' END) ON CONFLICT DO NOTHING;
    IF coalesce(v_behind, 0) = 0 THEN CONTINUE; END IF;

    v_reason := format('Time-tracking check, %s (%s %s). Do exactly this. 1) Read {"op":"app","source":"time_today","filters":[{"field":"expects_work","op":"eq","value":"true"},{"field":"in_window","op":"eq","value":"true"}]}. About %s people look behind. '
      || '2) For people who are not exempt, not already raised by the Ops Agent (ops_agent_flagged is false) and who have tracked nothing or very little, send ONE polite one-line reminder in the Operations channel with {"op":"cliq_post","kind":"tracking_followup","text":"@Full Name ...","tag":["Full Name"]}; one post may name up to 6 people. A refusal explains itself: do not retry around it. '
      || '3) Never put hours, percentages or comparisons in the channel and never name anyone more than in the reminder. 4) People who keep missing (look at your notes) or who tracked nothing all day: tell the owner in the Crew inbox (op message, kind alert), not in the channel. 5) Post an announcement only if the owner asked or a rule requires it. 6) Note who you reminded (op note). Be brief.',
      v_label, to_char(v_local, 'HH24:MI'), s.timezone, v_behind);
    BEGIN
      PERFORM public.crew_enqueue_wake(v_ops, left(v_reason, 1500), 'event', NULL, 0);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.crew_ops_followup_runs SET note = left('could not wake: ' || SQLERRM, 200) WHERE day = v_day AND slot = v_slot;
    END;
    RETURN format('woke ops_head for the %s check (%s people)', v_label, v_behind);
  END LOOP;
  RETURN 'nothing to do now';
END $$;

REVOKE ALL ON FUNCTION public.crew_cliq_post_text_error(text), public.crew_cliq_post_refuse(uuid, uuid, text, text, text), public.crew_cliq_post_reserve(uuid, text, text, text[]),
  public.crew_cliq_post_finish(uuid, boolean, text), public.crew_ops_followup_tick(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_cliq_post_text_error(text), public.crew_cliq_post_reserve(uuid, text, text, text[]), public.crew_cliq_post_finish(uuid, boolean, text), public.crew_ops_followup_tick(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.crew_set_standing_permission(uuid, uuid, boolean, integer, text[]), public.crew_standing_kill_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_set_standing_permission(uuid, uuid, boolean, integer, text[]), public.crew_standing_kill_all() TO authenticated, service_role;

DO $$ BEGIN PERFORM cron.unschedule('crew_ops_followup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('crew_ops_followup', '*/10 * * * 1-5', $$SELECT public.crew_ops_followup_tick()$$);
