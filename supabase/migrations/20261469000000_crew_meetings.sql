-- Crew: LIVE AGENT MEETINGS. The owner calls a meeting with a topic and 2 to 8 executives; they discuss it on their own, the chair (the CFO unless he picks
-- someone else) writes the minutes, and the owner watches, speaks, or ends it.
--
--   * A meeting changes NOTHING. Agents talk in it; anything that would change data is still a proposal in the owner-approval queue (crew_proposals),
--     made by the right executive afterwards, as an action item in the minutes.
--   * How the agents take part: they are WOKEN (the existing wake queue, run by the local daemon / the crew-wake routine) with a reason that says how to read the
--     thread and contribute through the gateway ops "meeting" and "meeting_post". Each member speaks once per round (default 2 rounds, never more than 3).
--   * crew_meeting_tick() runs every minute: when every member has spoken in the round (or 10 minutes passed) it opens the next round, or after the last round
--     it asks the chair for the minutes; a meeting stuck waiting for minutes is closed with a note after 15 minutes.
--   * Never unbounded: at most 3 meetings open at once, 10 a day, 8 members, 3 rounds, so at most 8 x 3 + 1 wakes per meeting, and the wake queue still merges
--     requests (one waiting wake per person). Meeting wakes use the 'owner' source because the owner called the meeting (it skips the 10-minute and hourly caps
--     the queue puts on agent-to-agent wakes, which would otherwise starve round two); the limits above are what bound them.
--   * Only the company owner (crew_is_company_owner) can see meetings, members and meeting messages. Meeting messages are kept OUT of the normal inbox and team channel
--     (they carry meeting_id), and they never wake anybody or reach Cliq: only the final minutes report does (to_owner), like any other report.
--
-- Rollback: supabase/rollbacks/20261469_crew_meetings_down.sql

-- 1. tables -----------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crew_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL CHECK (char_length(topic) BETWEEN 3 AND 300),
  brief text NOT NULL DEFAULT '' CHECK (char_length(brief) <= 3000),          -- the owner's context, optional
  chair_agent uuid NOT NULL REFERENCES public.crew_agents(id) ON DELETE CASCADE,
  called_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'summarising', 'closed')),
  round integer NOT NULL DEFAULT 1 CHECK (round BETWEEN 1 AND 3),
  max_rounds integer NOT NULL DEFAULT 2 CHECK (max_rounds BETWEEN 1 AND 3),
  round_started_at timestamptz NOT NULL DEFAULT now(),
  summarising_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  minutes jsonb                                                                -- {summary, decisions[], needs_owner[], action_items[{agent, task}]}
);
CREATE INDEX IF NOT EXISTS crew_meetings_status_idx ON public.crew_meetings (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crew_meeting_members (
  meeting_id uuid NOT NULL REFERENCES public.crew_meetings(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.crew_agents(id) ON DELETE CASCADE,
  spoke_round integer NOT NULL DEFAULT 0,                                      -- the last round this member spoke in (0 = not yet)
  PRIMARY KEY (meeting_id, agent_id)
);

-- meeting lines live in crew_messages (one thread per meeting: thread_id = the meeting id)
ALTER TABLE public.crew_messages ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.crew_meetings(id) ON DELETE CASCADE;
ALTER TABLE public.crew_messages ADD COLUMN IF NOT EXISTS meeting_round integer;
CREATE INDEX IF NOT EXISTS crew_messages_meeting_idx ON public.crew_messages (meeting_id, created_at) WHERE meeting_id IS NOT NULL;

-- a meeting line is said to the room, so it has no single recipient: the old "to the owner or to one agent" rule gets that one exception
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.crew_messages'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE '%to_owner%' AND pg_get_constraintdef(oid) LIKE '%to_agent%' LOOP
    EXECUTE format('ALTER TABLE public.crew_messages DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.crew_messages ADD CONSTRAINT crew_messages_has_recipient CHECK (to_owner OR to_agent IS NOT NULL OR meeting_id IS NOT NULL);

-- 2. access: the company owner reads; nobody writes from the app (every change goes through a function below) ------------------------------------
ALTER TABLE public.crew_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_meeting_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_meetings_owner ON public.crew_meetings;
CREATE POLICY crew_meetings_owner ON public.crew_meetings FOR SELECT TO authenticated USING (public.crew_is_company_owner());
DROP POLICY IF EXISTS crew_meeting_members_owner ON public.crew_meeting_members;
CREATE POLICY crew_meeting_members_owner ON public.crew_meeting_members FOR SELECT TO authenticated USING (public.crew_is_company_owner());
REVOKE ALL ON public.crew_meetings, public.crew_meeting_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.crew_meetings, public.crew_meeting_members TO authenticated;
GRANT ALL ON public.crew_meetings, public.crew_meeting_members TO service_role;

-- the rest of crew_messages stays as it was (any super admin the policy allowed); only meeting lines need the company owner
DROP POLICY IF EXISTS crew_messages_owner ON public.crew_messages;
CREATE POLICY crew_messages_owner ON public.crew_messages FOR SELECT TO authenticated
  USING (public.crew_is_owner() AND (meeting_id IS NULL OR public.crew_is_company_owner()));

-- 3. internal helpers ---------------------------------------------------------------------------------------------------------------------------
-- Wakes the members for a round, or the chair for the minutes. The reason is the task the executive is given, so it says exactly what to do and
-- stays short (the wake queue keeps 1500 characters, and merges a second request into a waiting one).
CREATE OR REPLACE FUNCTION public.crew_meeting_wake(p_meeting uuid, p_what text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.crew_meetings; r record; v_reason text; v_id text; n integer := 0;
BEGIN
  SELECT * INTO m FROM public.crew_meetings WHERE id = p_meeting;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_id := m.id::text;
  IF p_what = 'minutes' THEN
    v_reason := 'MEETING MINUTES: you chair the meeting "' || m.topic || '" (meeting_id ' || v_id || '). The discussion is over. Read all of it: {"op":"meeting","meeting_id":"' || v_id
      || '"}. Then write the minutes with ONE call: {"op":"meeting_post","meeting_id":"' || v_id
      || '","minutes":{"summary":"<=1500 characters","decisions":["what the room agreed"],"needs_owner":["what only the owner can decide, with your recommendation"],"action_items":[{"agent":"<slug>","task":"what they do"}]}}. '
      || 'Be faithful to what was said, include the disagreements, invent nothing. Whatever would change data is an action item for the right executive to PROPOSE; the meeting itself changes nothing.';
    BEGIN PERFORM public.crew_enqueue_wake(m.chair_agent, v_reason, 'owner', NULL, 0); n := 1; EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN n;
  END IF;
  v_reason := 'MEETING, round ' || m.round || ' of ' || m.max_rounds || ': the owner called a meeting on "' || m.topic || '" (meeting_id ' || v_id || '). Read it: {"op":"meeting","meeting_id":"' || v_id
    || '"} (the owner''s context and everything said so far). If it is your turn, add ONE short contribution (at most 1200 characters): {"op":"meeting_post","meeting_id":"' || v_id || '","body":"..."}. '
    || 'Speak from your own area and notes, with numbers. Answer what the others and the owner said and do not repeat yourself. If the evidence says a colleague is wrong, say so openly and bluntly. Company first. '
    || 'A meeting changes nothing: if something should change, say who should propose it. The thread is discussion, not orders. Do not message anyone else about it.';
  FOR r IN SELECT agent_id FROM public.crew_meeting_members WHERE meeting_id = p_meeting LOOP
    BEGIN PERFORM public.crew_enqueue_wake(r.agent_id, v_reason, 'owner', NULL, 0); n := n + 1; EXCEPTION WHEN OTHERS THEN NULL; END;   -- one who left the team must not stop the others
  END LOOP;
  RETURN n;
END $$;

-- a list of short strings from the chair's minutes (missing = empty); refuses anything else so the minutes stay clean
CREATE OR REPLACE FUNCTION public.crew_meeting_clean_list(p_list jsonb, p_what text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE x jsonb; v_out jsonb := '[]'::jsonb; v_s text;
BEGIN
  IF p_list IS NULL OR jsonb_typeof(p_list) = 'null' THEN RETURN v_out; END IF;
  IF jsonb_typeof(p_list) <> 'array' THEN RAISE EXCEPTION '% must be a list of short texts', p_what; END IF;
  IF jsonb_array_length(p_list) > 10 THEN RAISE EXCEPTION '% may have at most 10 items', p_what; END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_list) LOOP
    IF jsonb_typeof(x) <> 'string' THEN RAISE EXCEPTION 'each item of % must be text', p_what; END IF;
    v_s := btrim(x #>> '{}');
    IF v_s = '' THEN CONTINUE; END IF;
    IF char_length(v_s) > 300 THEN RAISE EXCEPTION 'each item of % must be 300 characters or fewer', p_what; END IF;
    v_out := v_out || to_jsonb(v_s);
  END LOOP;
  RETURN v_out;
END $$;

-- 4. the owner's functions (company owner only) ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_meeting_call(p_topic text, p_brief text, p_agents uuid[], p_chair uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_topic text := btrim(coalesce(p_topic, '')); v_brief text := btrim(coalesce(p_brief, '')); v_chair uuid; v_ids uuid[]; v_id uuid;
BEGIN
  IF NOT public.crew_is_company_owner() THEN RAISE EXCEPTION 'only the owner can call a meeting'; END IF;
  IF char_length(v_topic) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'the topic must be 3 to 300 characters'; END IF;
  IF char_length(v_brief) > 3000 THEN RAISE EXCEPTION 'the context may be at most 3000 characters'; END IF;
  -- the chair is the CFO unless the owner picks someone; the chair always takes part
  v_chair := coalesce(p_chair, (SELECT id FROM public.crew_agents WHERE slug = 'cfo' AND active));
  IF v_chair IS NULL THEN RAISE EXCEPTION 'choose a chair'; END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(coalesce(p_agents, '{}'::uuid[]) || v_chair) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) < 2 OR cardinality(v_ids) > 8 THEN RAISE EXCEPTION 'a meeting needs 2 to 8 people'; END IF;
  IF (SELECT count(*) FROM public.crew_agents WHERE id = ANY (v_ids) AND active) <> cardinality(v_ids) THEN RAISE EXCEPTION 'everyone in a meeting must be an active member of the team'; END IF;
  -- cost guard: a few meetings at a time, a few a day
  IF (SELECT count(*) FROM public.crew_meetings WHERE status <> 'closed') >= 3 THEN RAISE EXCEPTION 'three meetings are already running: end one first'; END IF;
  IF (SELECT count(*) FROM public.crew_meetings WHERE created_at > now() - interval '1 day') >= 10 THEN RAISE EXCEPTION 'ten meetings have been called in the last day: that is the limit'; END IF;

  INSERT INTO public.crew_meetings (topic, brief, chair_agent, called_by) VALUES (v_topic, v_brief, v_chair, auth.uid()) RETURNING id INTO v_id;
  INSERT INTO public.crew_meeting_members (meeting_id, agent_id) SELECT v_id, x FROM unnest(v_ids) AS x;
  PERFORM public.crew_meeting_wake(v_id, 'round');
  RETURN v_id;
END $$;

-- the owner speaks in the room: it joins the thread and the agents read it at the next round
CREATE OR REPLACE FUNCTION public.crew_meeting_say(p_meeting uuid, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.crew_meetings; v_body text := btrim(coalesce(p_body, '')); v_msg uuid;
BEGIN
  IF NOT public.crew_is_company_owner() THEN RAISE EXCEPTION 'only the owner can speak in a meeting'; END IF;
  IF v_body = '' OR char_length(v_body) > 2000 THEN RAISE EXCEPTION 'write between 1 and 2000 characters'; END IF;
  SELECT * INTO m FROM public.crew_meetings WHERE id = p_meeting;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such meeting'; END IF;
  IF m.status = 'closed' THEN RAISE EXCEPTION 'that meeting is closed'; END IF;
  INSERT INTO public.crew_messages (thread_id, from_agent, from_profile, to_agent, to_owner, kind, body, meeting_id, meeting_round)
  VALUES (m.id, NULL, auth.uid(), NULL, false, 'message', v_body, m.id, m.round) RETURNING id INTO v_msg;
  RETURN v_msg;
END $$;

-- the owner ends it early: the chair is asked for the minutes (once; asking again does nothing)
CREATE OR REPLACE FUNCTION public.crew_meeting_end(p_meeting uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.crew_meetings;
BEGIN
  IF NOT public.crew_is_company_owner() THEN RAISE EXCEPTION 'only the owner can end a meeting'; END IF;
  SELECT * INTO m FROM public.crew_meetings WHERE id = p_meeting FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such meeting'; END IF;
  IF m.status = 'closed' THEN RAISE EXCEPTION 'that meeting is already closed'; END IF;
  IF m.status = 'open' THEN
    UPDATE public.crew_meetings SET status = 'summarising', summarising_at = now() WHERE id = p_meeting;
    PERFORM public.crew_meeting_wake(p_meeting, 'minutes');
  END IF;
END $$;

-- 5. the agents' functions (the gateway calls them with the agent id it resolved from the agent's own key) ------------------------------------------
-- Everything a member needs to take part: the topic, the owner's context, who is in, what was said, and whose turn it is.
CREATE OR REPLACE FUNCTION public.crew_meeting_thread(p_agent uuid, p_meeting uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.crew_meetings; me public.crew_meeting_members; v_chair text; v_total integer; v_slug text;
BEGIN
  SELECT slug INTO v_slug FROM public.crew_agents WHERE id = p_agent AND active;
  IF v_slug IS NULL THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT * INTO m FROM public.crew_meetings WHERE id = p_meeting;
  SELECT * INTO me FROM public.crew_meeting_members WHERE meeting_id = p_meeting AND agent_id = p_agent;
  IF m.id IS NULL OR me.agent_id IS NULL THEN RAISE EXCEPTION 'you are not in that meeting'; END IF;   -- the same answer for "no such meeting", so ids cannot be probed
  SELECT slug INTO v_chair FROM public.crew_agents WHERE id = m.chair_agent;
  SELECT count(*) INTO v_total FROM public.crew_messages WHERE meeting_id = p_meeting;
  RETURN jsonb_build_object(
    'meeting', jsonb_build_object('id', m.id, 'topic', m.topic, 'context_from_owner', m.brief, 'status', m.status, 'round', m.round, 'max_rounds', m.max_rounds, 'chair', v_chair),
    'you', jsonb_build_object('slug', v_slug, 'is_chair', p_agent = m.chair_agent,
        'your_turn', m.status = 'open' AND me.spoke_round < m.round,
        'minutes_needed', m.status = 'summarising' AND p_agent = m.chair_agent),
    'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'title', a.title, 'spoke_this_round', mm.spoke_round >= m.round) ORDER BY a.name), '[]'::jsonb)
                  FROM public.crew_meeting_members mm JOIN public.crew_agents a ON a.id = mm.agent_id WHERE mm.meeting_id = p_meeting),
    'waiting_for', (SELECT coalesce(jsonb_agg(a.slug ORDER BY a.name), '[]'::jsonb)
                      FROM public.crew_meeting_members mm JOIN public.crew_agents a ON a.id = mm.agent_id WHERE mm.meeting_id = p_meeting AND mm.spoke_round < m.round AND m.status = 'open'),
    'earlier_lines_not_shown', greatest(v_total - 40, 0),
    'messages', (SELECT coalesce(jsonb_agg(jsonb_build_object('from', x.who, 'round', x.meeting_round, 'at', x.created_at, 'body', x.body) ORDER BY x.created_at), '[]'::jsonb)
                   FROM (SELECT coalesce(a.slug, 'owner') AS who, c.meeting_round, c.created_at, c.body
                           FROM public.crew_messages c LEFT JOIN public.crew_agents a ON a.id = c.from_agent
                          WHERE c.meeting_id = p_meeting ORDER BY c.created_at DESC LIMIT 40) x)
  );
END $$;

-- A member adds ONE contribution for the round (at most 1200 characters). The chair, once the discussion is over, passes the minutes instead:
-- that writes them, closes the meeting, sends the owner a report and hands each action item to the named executive.
CREATE OR REPLACE FUNCTION public.crew_meeting_post(p_agent uuid, p_meeting uuid, p_body text, p_minutes jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m public.crew_meetings; me public.crew_meeting_members; a public.crew_agents; v_body text := btrim(coalesce(p_body, ''));
  v_summary text; v_decisions jsonb; v_needs jsonb; v_items jsonb := '[]'::jsonb; v_minutes jsonb; it jsonb; v_slug text; v_task text; t public.crew_agents; v_text text; x text;
BEGIN
  SELECT * INTO a FROM public.crew_agents WHERE id = p_agent AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT * INTO m FROM public.crew_meetings WHERE id = p_meeting FOR UPDATE;
  SELECT * INTO me FROM public.crew_meeting_members WHERE meeting_id = p_meeting AND agent_id = p_agent;
  IF m.id IS NULL OR me.agent_id IS NULL THEN RAISE EXCEPTION 'you are not in that meeting'; END IF;
  IF m.status = 'closed' THEN RAISE EXCEPTION 'this meeting is closed'; END IF;
  IF char_length(v_body) > 1200 THEN RAISE EXCEPTION 'keep it to 1200 characters'; END IF;

  IF p_minutes IS NULL OR jsonb_typeof(p_minutes) = 'null' THEN
    -- an ordinary contribution
    IF v_body = '' THEN RAISE EXCEPTION 'say something (body is empty)'; END IF;
    IF m.status = 'summarising' THEN
      RAISE EXCEPTION '%', CASE WHEN p_agent = m.chair_agent THEN 'the discussion is over: send the minutes (op meeting_post with minutes)' ELSE 'the discussion is over: the chair is writing the minutes' END;
    END IF;
    IF me.spoke_round >= m.round THEN RAISE EXCEPTION 'you have already spoken in round %: wait for the next round', m.round; END IF;
    INSERT INTO public.crew_messages (thread_id, from_agent, to_agent, to_owner, kind, body, meeting_id, meeting_round)
    VALUES (m.id, p_agent, NULL, false, 'message', v_body, m.id, m.round);
    UPDATE public.crew_meeting_members SET spoke_round = m.round WHERE meeting_id = p_meeting AND agent_id = p_agent;
    RETURN jsonb_build_object('posted', true, 'round', m.round, 'waiting_for', (SELECT coalesce(jsonb_agg(ag.slug ORDER BY ag.name), '[]'::jsonb)
      FROM public.crew_meeting_members mm JOIN public.crew_agents ag ON ag.id = mm.agent_id WHERE mm.meeting_id = p_meeting AND mm.spoke_round < m.round));
  END IF;

  -- the minutes: the chair only, and only after the discussion
  IF p_agent <> m.chair_agent THEN RAISE EXCEPTION 'only the chair writes the minutes'; END IF;
  IF m.status <> 'summarising' THEN RAISE EXCEPTION 'the minutes come after the discussion: this meeting is still open'; END IF;
  IF jsonb_typeof(p_minutes) <> 'object' THEN RAISE EXCEPTION 'minutes must be an object'; END IF;
  IF jsonb_typeof(p_minutes -> 'summary') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'minutes need a summary (text)'; END IF;
  v_summary := btrim(p_minutes ->> 'summary');
  IF v_summary = '' OR char_length(v_summary) > 1500 THEN RAISE EXCEPTION 'the summary must be 1 to 1500 characters'; END IF;
  v_decisions := public.crew_meeting_clean_list(p_minutes -> 'decisions', 'decisions');
  v_needs := public.crew_meeting_clean_list(p_minutes -> 'needs_owner', 'needs_owner');
  IF p_minutes -> 'action_items' IS NOT NULL AND jsonb_typeof(p_minutes -> 'action_items') NOT IN ('array', 'null') THEN RAISE EXCEPTION 'action_items must be a list of {agent, task}'; END IF;
  IF jsonb_typeof(p_minutes -> 'action_items') = 'array' THEN
    IF jsonb_array_length(p_minutes -> 'action_items') > 10 THEN RAISE EXCEPTION 'at most 10 action items'; END IF;
    FOR it IN SELECT value FROM jsonb_array_elements(p_minutes -> 'action_items') LOOP
      IF jsonb_typeof(it) <> 'object' OR jsonb_typeof(it -> 'agent') IS DISTINCT FROM 'string' OR jsonb_typeof(it -> 'task') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'each action item needs agent (a slug) and task (text)'; END IF;
      v_slug := lower(btrim(it ->> 'agent')); v_task := btrim(it ->> 'task');
      IF v_task = '' OR char_length(v_task) > 300 THEN RAISE EXCEPTION 'each action item task must be 1 to 300 characters'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE slug = v_slug AND active) THEN RAISE EXCEPTION 'action item: nobody called "%" is on the team (use the slug)', left(v_slug, 40); END IF;
      v_items := v_items || jsonb_build_array(jsonb_build_object('agent', v_slug, 'task', v_task));
    END LOOP;
  END IF;
  v_minutes := jsonb_build_object('summary', v_summary, 'decisions', v_decisions, 'needs_owner', v_needs, 'action_items', v_items);

  UPDATE public.crew_meetings SET status = 'closed', closed_at = now(), minutes = v_minutes WHERE id = p_meeting;
  IF v_body <> '' THEN
    INSERT INTO public.crew_messages (thread_id, from_agent, to_agent, to_owner, kind, body, meeting_id, meeting_round)
    VALUES (m.id, p_agent, NULL, false, 'message', v_body, m.id, m.round);
  END IF;

  -- the report to the owner (an ordinary report: it shows in his inbox and, if he turned Cliq on, there too)
  v_text := 'MINUTES of the meeting "' || m.topic || E'"\n\n' || v_summary;
  IF jsonb_array_length(v_decisions) > 0 THEN v_text := v_text || E'\n\nDecisions:'; FOR x IN SELECT value #>> '{}' FROM jsonb_array_elements(v_decisions) LOOP v_text := v_text || E'\n- ' || x; END LOOP; END IF;
  IF jsonb_array_length(v_needs) > 0 THEN v_text := v_text || E'\n\nNeeds your decision:'; FOR x IN SELECT value #>> '{}' FROM jsonb_array_elements(v_needs) LOOP v_text := v_text || E'\n- ' || x; END LOOP; END IF;
  IF jsonb_array_length(v_items) > 0 THEN
    v_text := v_text || E'\n\nAction items:';
    FOR it IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      SELECT * INTO t FROM public.crew_agents WHERE slug = it ->> 'agent';
      v_text := v_text || E'\n- ' || coalesce(t.name, it ->> 'agent') || ': ' || (it ->> 'task');
    END LOOP;
  END IF;
  INSERT INTO public.crew_messages (thread_id, from_agent, to_owner, kind, body) VALUES (m.id, p_agent, true, 'report', left(v_text, 7900));

  -- each action item goes to the executive it names (an ordinary message: they wake, within the queue's usual limits, and answer or propose what is needed)
  FOR it IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    SELECT * INTO t FROM public.crew_agents WHERE slug = it ->> 'agent' AND active;
    IF FOUND AND t.id <> p_agent THEN
      INSERT INTO public.crew_messages (thread_id, from_agent, to_agent, to_owner, kind, body)
      VALUES (m.id, p_agent, t.id, false, 'message', 'ACTION ITEM from the meeting "' || m.topic || '" (minuted by ' || a.name || '): ' || (it ->> 'task')
        || ' If it needs a change of data, make a proposal for the owner to approve; do not change anything yourself.');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('closed', true, 'action_items_sent', jsonb_array_length(v_items));
END $$;

-- 6. the tick: moves meetings along -------------------------------------------------------------------------------------------------------------
-- It only touches this database (it puts wakes in the queue), so unlike crew_wake_tick it needs no Vault secret: the existing crew_wake tick then
-- fires whatever is waiting. Runs every minute and does nothing when no meeting is running.
CREATE OR REPLACE FUNCTION public.crew_meeting_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m record; v_next integer := 0; v_minutes integer := 0; v_closed integer := 0;
BEGIN
  FOR m IN SELECT * FROM public.crew_meetings WHERE status <> 'closed' ORDER BY created_at FOR UPDATE SKIP LOCKED LOOP
    IF m.status = 'open' THEN
      -- the round is done when every member still on the team has spoken, or after 10 minutes (a member who never answers must not hold the room)
      IF m.round_started_at < now() - interval '10 minutes'
         OR NOT EXISTS (SELECT 1 FROM public.crew_meeting_members x JOIN public.crew_agents a ON a.id = x.agent_id AND a.active WHERE x.meeting_id = m.id AND x.spoke_round < m.round) THEN
        IF m.round < m.max_rounds THEN
          UPDATE public.crew_meetings SET round = round + 1, round_started_at = now() WHERE id = m.id;
          PERFORM public.crew_meeting_wake(m.id, 'round');
          v_next := v_next + 1;
        ELSE
          UPDATE public.crew_meetings SET status = 'summarising', summarising_at = now() WHERE id = m.id;
          PERFORM public.crew_meeting_wake(m.id, 'minutes');
          v_minutes := v_minutes + 1;
        END IF;
      END IF;
    ELSIF m.status = 'summarising' AND coalesce(m.summarising_at, m.created_at) < now() - interval '15 minutes' THEN
      -- the chair never wrote the minutes: close it and tell the owner, so it does not sit open for ever
      UPDATE public.crew_meetings SET status = 'closed', closed_at = now(),
        minutes = jsonb_build_object('summary', 'The meeting was closed without minutes: the chair did not write them within 15 minutes. Read the transcript.', 'decisions', '[]'::jsonb, 'needs_owner', '[]'::jsonb, 'action_items', '[]'::jsonb)
       WHERE id = m.id;
      INSERT INTO public.crew_messages (thread_id, from_agent, to_owner, kind, body)
      VALUES (m.id, m.chair_agent, true, 'alert', 'The meeting "' || m.topic || '" was closed without minutes: I did not write them in time. The transcript is in the Meetings tab.');
      v_closed := v_closed + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('next_round', v_next, 'minutes_asked', v_minutes, 'closed_without_minutes', v_closed);
END $$;

-- 7. who may call what ----------------------------------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.crew_meeting_wake(uuid, text), public.crew_meeting_clean_list(jsonb, text), public.crew_meeting_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crew_meeting_call(text, text, uuid[], uuid), public.crew_meeting_say(uuid, text), public.crew_meeting_end(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_meeting_call(text, text, uuid[], uuid), public.crew_meeting_say(uuid, text), public.crew_meeting_end(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crew_meeting_thread(uuid, uuid), public.crew_meeting_post(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_meeting_thread(uuid, uuid), public.crew_meeting_post(uuid, uuid, text, jsonb) TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('crew_meeting_tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('crew_meeting_tick', '* * * * *', $$SELECT public.crew_meeting_tick()$$);
