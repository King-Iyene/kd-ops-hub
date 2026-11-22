-- Ops Agent v4: the outbox (what connections are sent on their own) and chat-proposed memory.
-- Replay: build the minimal fixture, apply the agent migrations, then:  psql -v ON_ERROR_STOP=1 < supabase/tests/agent_connections_memory.sql
BEGIN;

CREATE FUNCTION public.t_as(p_uid uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  IF p_uid IS NULL THEN PERFORM set_config('request.jwt.claim.sub', '', true); RETURN; END IF;
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  SET ROLE authenticated;
END $$;
CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF; END $$;
CREATE FUNCTION public.t_denied(p_sql text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RAISE EXCEPTION 'FAIL: % was allowed', p_label; EXCEPTION WHEN insufficient_privilege THEN RETURN; END $$;

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000001', 'super@t.local'), ('a0000000-0000-0000-0000-000000000002', 'admin@t.local'), ('a0000000-0000-0000-0000-000000000003', 'member@t.local');
INSERT INTO public.profiles (id, email, full_name, role, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'super@t.local', 'Sue Super', 'super_admin', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'admin@t.local', 'Ada Admin', 'admin', 'active'),
  ('a0000000-0000-0000-0000-000000000003', 'member@t.local', 'Mia Member', 'operations', 'active');

-- ── the outbox ─────────────────────────────────────────────────────────────
INSERT INTO public.agent_connections (id, kind, name, config) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'slack',   'High only',   '{"events": ["flag_high"]}'),
  ('c1000000-0000-0000-0000-000000000002', 'discord', 'All medium+', '{"events": ["flag_all"], "min_severity": "medium"}'),
  ('c1000000-0000-0000-0000-000000000003', 'telegram','Daily only',  '{"events": ["summary_day"]}'),
  ('c1000000-0000-0000-0000-000000000004', 'teams',   'Nothing',     '{}');

CREATE FUNCTION public.t_out(p_ref uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(connection_id::text, 1), ',' ORDER BY connection_id), '') FROM public.agent_outbox WHERE ref_id = p_ref
$$;

INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, title, item_type) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'RP01', 'high',   'system', 'a', 'High',        'flag'),
  ('f1000000-0000-0000-0000-000000000002', 'TK01', 'medium', 'system', 'b', 'Medium',      'flag'),
  ('f1000000-0000-0000-0000-000000000003', 'TK01', 'low',    'system', 'c', 'Low',         'flag'),
  ('f1000000-0000-0000-0000-000000000004', 'TK14', 'info',   'system', 'd', 'Done',        'flag'),
  ('f1000000-0000-0000-0000-000000000005', 'X1',   'critical','system','e', 'Question',    'question'),
  ('f1000000-0000-0000-0000-000000000006', 'X2',   'critical','system','f', 'Human action','human_action');
DO $$
BEGIN
  PERFORM public.t_eq('a high item is not queued, even for a connection that once asked for high items', public.t_out('f1000000-0000-0000-0000-000000000001'), '');
  PERFORM public.t_eq('a medium item is not queued', public.t_out('f1000000-0000-0000-0000-000000000002'), '');
  PERFORM public.t_eq('a low item is not queued', public.t_out('f1000000-0000-0000-0000-000000000003'), '');
  PERFORM public.t_eq('a completed task is not news', public.t_out('f1000000-0000-0000-0000-000000000004'), '');
  PERFORM public.t_eq('a question is not sent', public.t_out('f1000000-0000-0000-0000-000000000005'), '');
  PERFORM public.t_eq('a human action item is not sent', public.t_out('f1000000-0000-0000-0000-000000000006'), '');
  PERFORM public.t_eq('nothing is waiting', (SELECT count(*) FROM public.agent_outbox), 0::bigint);
  RAISE NOTICE 'PASS 1: items are never queued on their own';
END $$;

INSERT INTO public.agent_summaries (id, period_kind, period_start, period_end, narrative, auto) VALUES
  ('51000000-0000-0000-0000-000000000001', 'day',   '2026-11-18', '2026-11-18', 'day',   true),
  ('51000000-0000-0000-0000-000000000002', 'week',  '2026-11-16', '2026-11-20', 'week',  true),
  ('51000000-0000-0000-0000-000000000003', 'day',   '2026-11-19', '2026-11-19', 'by hand', false);
DO $$
BEGIN
  PERFORM public.t_eq('the automatic daily goes to the daily connection', public.t_out('51000000-0000-0000-0000-000000000001'), '3');
  PERFORM public.t_eq('a weekly nobody asked for goes nowhere', public.t_out('51000000-0000-0000-0000-000000000002'), '');
  PERFORM public.t_eq('a summary made by hand is not sent', public.t_out('51000000-0000-0000-0000-000000000003'), '');
  DELETE FROM public.agent_connections WHERE id = 'c1000000-0000-0000-0000-000000000003';
  PERFORM public.t_eq('deleting a connection clears its queue', (SELECT count(*) FROM public.agent_outbox WHERE connection_id = 'c1000000-0000-0000-0000-000000000003'), 0::bigint);
  RAISE NOTICE 'PASS 2: automatic summaries are queued by period; a manual one is not; a deleted connection leaves nothing behind';
END $$;

-- one summary waiting for another connection, so there is something to read
INSERT INTO public.agent_outbox (connection_id, kind, ref_id) VALUES ('c1000000-0000-0000-0000-000000000001', 'summary', '51000000-0000-0000-0000-000000000001');
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$ BEGIN PERFORM public.t_eq('a Super Admin reads the outbox', (SELECT count(*) > 0 FROM public.agent_outbox), true); END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$ BEGIN
  PERFORM public.t_eq('an Admin reads nothing', (SELECT count(*) FROM public.agent_outbox), 0::bigint);
  PERFORM public.t_denied($q$INSERT INTO public.agent_outbox (connection_id, kind, ref_id) VALUES ('c1000000-0000-0000-0000-000000000001', 'flag', gen_random_uuid())$q$, 'an Admin writing the outbox');
  PERFORM public.t_denied($q$SELECT public.agent_dispatch_tick()$q$, 'an Admin waking the sender');
  RAISE NOTICE 'PASS 3: only a Super Admin reads the outbox; nobody signed in writes it or wakes the sender';
END $$;
RESET ROLE;

-- ── memory proposed by chat ────────────────────────────────────────────────
INSERT INTO public.agent_chat_threads (id, user_id, title) VALUES
  ('71000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'mine'),
  ('71000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'not mine');
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
DO $$
DECLARE r jsonb; v_id uuid;
BEGIN
  r := public.agent_memory_suggest('exemption', '  Kemi is on placement   until March, so skip Track checks  ', 'Said in chat on Nov 19 after a not-tracking item', 'person', 'Kemi', '71000000-0000-0000-0000-000000000001');
  PERFORM public.t_eq('saved as a suggestion', r ->> 'duplicate', 'false');
  v_id := (r ->> 'id')::uuid;
  PERFORM public.t_eq('waiting for the answer', (SELECT status FROM public.agent_memory WHERE id = v_id), 'proposed');
  PERFORM public.t_eq('from chat', (SELECT source FROM public.agent_memory WHERE id = v_id), 'chat');
  PERFORM public.t_eq('spaces tidied', (SELECT content FROM public.agent_memory WHERE id = v_id), 'Kemi is on placement until March, so skip Track checks');
  PERFORM public.t_eq('detail and scope kept', (SELECT detail || '|' || scope || '|' || scope_ref FROM public.agent_memory WHERE id = v_id), 'Said in chat on Nov 19 after a not-tracking item|person|Kemi');
  PERFORM public.t_eq('linked to the thread', (SELECT source_thread FROM public.agent_memory WHERE id = v_id), '71000000-0000-0000-0000-000000000001'::uuid);
  PERFORM public.t_eq('proposed by the asker', (SELECT proposed_by FROM public.agent_memory WHERE id = v_id), 'a0000000-0000-0000-0000-000000000001'::uuid);

  r := public.agent_memory_suggest('exemption', 'kemi is on placement until march, so skip track checks');
  PERFORM public.t_eq('the same thing is not asked twice', r ->> 'duplicate', 'true');
  PERFORM public.t_eq('and points at the first', (r ->> 'id')::uuid, v_id);

  UPDATE public.agent_memory SET status = 'active', approved_by = 'a0000000-0000-0000-0000-000000000001' WHERE id = v_id;
  r := public.agent_memory_suggest('exemption', 'Kemi is on placement until March, so skip Track checks');
  PERFORM public.t_eq('nor once it is active', r ->> 'duplicate', 'true');
  UPDATE public.agent_memory SET status = 'rejected' WHERE id = v_id;
  r := public.agent_memory_suggest('exemption', 'Kemi is on placement until March, so skip Track checks');
  PERFORM public.t_eq('a rejected one may be proposed again', r ->> 'duplicate', 'false');

  PERFORM public.t_eq('too short is refused', public.agent_memory_suggest('fact', 'ok') ->> 'ok', 'false');
  r := public.agent_memory_suggest('weird', 'Our week starts on Monday', NULL, 'nowhere', NULL, '71000000-0000-0000-0000-000000000002');
  PERFORM public.t_eq('unknown type becomes fact', (SELECT type FROM public.agent_memory WHERE id = (r ->> 'id')::uuid), 'fact');
  PERFORM public.t_eq('unknown scope becomes global', (SELECT scope FROM public.agent_memory WHERE id = (r ->> 'id')::uuid), 'global');
  PERFORM public.t_eq('somebody else''s thread is not linked', (SELECT source_thread FROM public.agent_memory WHERE id = (r ->> 'id')::uuid), NULL::uuid);
  RAISE NOTICE 'PASS 4: chat proposes memory with detail, scope and thread; never twice; Yes makes it active; bad values are tidied';
END $$;
SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
DO $$ BEGIN
  PERFORM public.t_denied($q$SELECT public.agent_memory_suggest('fact', 'Something an Admin tried to teach it')$q$, 'an Admin proposing memory');
  RAISE NOTICE 'PASS 5: an Admin cannot teach the agent';
END $$;
RESET ROLE;

-- ── the kinds of connection ────────────────────────────────────────────────
DO $$
DECLARE k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['slack', 'cliq', 'discord', 'teams', 'gchat', 'telegram', 'email', 'webhook', 'n8n', 'api'] LOOP
    INSERT INTO public.agent_connections (kind, name) VALUES (k, 'kind ' || k);
  END LOOP;
  BEGIN INSERT INTO public.agent_connections (kind, name) VALUES ('carrier_pigeon', 'x'); RAISE EXCEPTION 'FAIL: unknown kind accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'PASS 6: every kind of tool is accepted, unknown ones are not';
END $$;

ROLLBACK;
