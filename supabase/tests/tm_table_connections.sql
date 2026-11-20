-- Task tables: send new entries to another tool. Rules are Super Admin only; a new entry is queued for every enabled rule on its table;
-- an empty entry, a disabled rule and a flood are not; nothing can stop an entry from being saved.
-- Replay: build the minimal fixture, apply the agent migrations, then:  psql -v ON_ERROR_STOP=1 < supabase/tests/tm_table_connections.sql
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

INSERT INTO auth.users (id, email) VALUES ('a0000000-0000-0000-0000-000000000001', 'super@t.local'), ('a0000000-0000-0000-0000-000000000002', 'admin@t.local');
INSERT INTO public.profiles (id, email, full_name, role, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'super@t.local', 'Sue Super', 'super_admin', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'admin@t.local', 'Ada Admin', 'admin', 'active');
INSERT INTO public.tm_tables (id, name) VALUES ('b1000000-0000-0000-0000-000000000001', 'Reports'), ('b1000000-0000-0000-0000-000000000002', 'Other');
INSERT INTO public.agent_connections (id, kind, name, config) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'cliq', 'Cliq', '{"mode":"api"}'),
  ('c1000000-0000-0000-0000-000000000002', 'slack', 'Slack', '{}');

-- ── who can set rules up ───────────────────────────────────────────────────
SELECT public.t_as('a0000000-0000-0000-0000-000000000001');
INSERT INTO public.tm_table_connections (id, table_id, connection_id, name) VALUES ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Reports to Cliq');
SELECT public.t_eq('Super Admin can add a rule', (SELECT count(*) FROM public.tm_table_connections), 1::bigint);

SELECT public.t_as('a0000000-0000-0000-0000-000000000002');
SELECT public.t_eq('an Admin sees no rules', (SELECT count(*) FROM public.tm_table_connections), 0::bigint);
DO $$ BEGIN
  INSERT INTO public.tm_table_connections (table_id, connection_id, name) VALUES ('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'sneaky');
  RAISE EXCEPTION 'FAIL: an Admin added a rule';
EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; WHEN others THEN
  IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- ── a new entry is queued ──────────────────────────────────────────────────
INSERT INTO public.tm_table_records (id, table_id, data) VALUES ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '{"f1":"Done the report"}');
SELECT public.t_eq('one message queued for the rule', (SELECT count(*) FROM public.agent_outbox WHERE kind = 'record' AND ref_id = 'e1000000-0000-0000-0000-000000000001' AND rule_id = 'd1000000-0000-0000-0000-000000000001' AND status = 'pending'), 1::bigint);

INSERT INTO public.tm_table_records (table_id, data) VALUES ('b1000000-0000-0000-0000-000000000001', '{}');
SELECT public.t_eq('an entry with no answers is not announced', (SELECT count(*) FROM public.agent_outbox WHERE kind = 'record'), 1::bigint);

INSERT INTO public.tm_table_records (table_id, data) VALUES ('b1000000-0000-0000-0000-000000000002', '{"x":"y"}');
SELECT public.t_eq('another table does not send', (SELECT count(*) FROM public.agent_outbox WHERE kind = 'record'), 1::bigint);

UPDATE public.tm_table_connections SET enabled = false;
INSERT INTO public.tm_table_records (table_id, data) VALUES ('b1000000-0000-0000-0000-000000000001', '{"f1":"x"}');
SELECT public.t_eq('a switched-off rule sends nothing', (SELECT count(*) FROM public.agent_outbox WHERE kind = 'record'), 1::bigint);
UPDATE public.tm_table_connections SET enabled = true;

-- two rules on two tools both get it; a second rule on the same tool too
INSERT INTO public.tm_table_connections (id, table_id, connection_id, name) VALUES
  ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'Reports to Slack'),
  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Reports to Cliq again');
INSERT INTO public.tm_table_records (id, table_id, data) VALUES ('e1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', '{"f1":"two"}');
SELECT public.t_eq('every enabled rule is queued', (SELECT count(*) FROM public.agent_outbox WHERE ref_id = 'e1000000-0000-0000-0000-000000000002'), 3::bigint);

-- ── a flood is braked ──────────────────────────────────────────────────────
DELETE FROM public.tm_table_connections WHERE id <> 'd1000000-0000-0000-0000-000000000001';
DELETE FROM public.agent_outbox;
INSERT INTO public.tm_table_records (table_id, data) SELECT 'b1000000-0000-0000-0000-000000000001', jsonb_build_object('n', g) FROM generate_series(1, 45) g;
SELECT public.t_eq('at most 30 per rule per minute', (SELECT count(*) FROM public.agent_outbox WHERE rule_id = 'd1000000-0000-0000-0000-000000000001'), 30::bigint);
SELECT public.t_eq('every entry was still saved', (SELECT count(*) FROM public.tm_table_records WHERE data ? 'n'), 45::bigint);

-- ── deleting a rule or a connection cleans up its queue ────────────────────
DELETE FROM public.tm_table_connections WHERE id = 'd1000000-0000-0000-0000-000000000001';
SELECT public.t_eq('a deleted rule takes its queue with it', (SELECT count(*) FROM public.agent_outbox WHERE kind = 'record'), 0::bigint);

-- existing Agent outbox kinds still work and still de-duplicate
INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, title, item_type) VALUES ('f1000000-0000-0000-0000-000000000001', 'RP01', 'high', 'system', 'a', 'High', 'flag');
INSERT INTO public.agent_outbox (connection_id, kind, ref_id) VALUES ('c1000000-0000-0000-0000-000000000002', 'flag', 'f1000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
INSERT INTO public.agent_outbox (connection_id, kind, ref_id) VALUES ('c1000000-0000-0000-0000-000000000002', 'flag', 'f1000000-0000-0000-0000-000000000001') ON CONFLICT DO NOTHING;
SELECT public.t_eq('a flag is queued once per connection', (SELECT count(*) FROM public.agent_outbox WHERE kind = 'flag'), 1::bigint);

ROLLBACK;
SELECT 'ok' AS tm_table_connections;
