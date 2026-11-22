-- Ops Agent: items (tracking alerts, tasks, reports) are never queued for a connection on their own; only summaries are.
-- Replay: build the minimal fixture, apply the agent migrations, then:  psql -v ON_ERROR_STOP=1 < supabase/tests/agent_tracking_notice.sql
BEGIN;
CREATE FUNCTION public.t_eq(p_label text, p_got anyelement, p_want anyelement) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'FAIL: % (got %, want %)', p_label, p_got, p_want; END IF; END $$;
CREATE FUNCTION public.t_out(p_ref uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(right(connection_id::text, 1), ',' ORDER BY connection_id), '') FROM public.agent_outbox WHERE ref_id = p_ref
$$;

INSERT INTO public.agent_connections (id, kind, name, config) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'cliq',    'Tracking',     '{"events": ["flag_tracking"]}'),
  ('c1000000-0000-0000-0000-000000000002', 'slack',   'High only',    '{"events": ["flag_high"]}'),
  ('c1000000-0000-0000-0000-000000000003', 'discord', 'Everything',   '{"events": ["flag_all"]}'),
  ('c1000000-0000-0000-0000-000000000004', 'teams',   'Tracking high','{"events": ["flag_tracking"], "min_severity": "high"}'),
  ('c1000000-0000-0000-0000-000000000005', 'telegram','Nothing',      '{}');

INSERT INTO public.agent_flags (id, rule_code, severity, subject_type, subject_id, title, item_type) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'TR01', 'medium', 'system', 'a', 'Not tracking (medium)', 'flag'),
  ('f1000000-0000-0000-0000-000000000002', 'TR01', 'high',   'system', 'b', 'Not tracking (high)',   'flag'),
  ('f1000000-0000-0000-0000-000000000003', 'TK01', 'low',    'system', 'c', 'Overdue task',          'flag'),
  ('f1000000-0000-0000-0000-000000000004', 'TR06', 'medium', 'system', 'd', 'No tracker proof',      'flag'),
  ('f1000000-0000-0000-0000-000000000005', 'TR09', 'low',    'system', 'e', 'Hours do not add up',   'flag'),
  ('f1000000-0000-0000-0000-000000000006', 'TR05', 'medium', 'system', 'f', 'Unexpected sites',      'flag');

-- Items are never sent on their own, whatever a connection's old settings say: they stay in the Inbox and are sent by hand.
SELECT public.t_eq('a tracking alert is not queued for anyone', public.t_out('f1000000-0000-0000-0000-000000000001'), '');
SELECT public.t_eq('a high tracking alert is not queued either', public.t_out('f1000000-0000-0000-0000-000000000002'), '');
SELECT public.t_eq('an overdue task is not queued', public.t_out('f1000000-0000-0000-0000-000000000003'), '');
SELECT public.t_eq('a timer with no proof is not queued', public.t_out('f1000000-0000-0000-0000-000000000004'), '');
SELECT public.t_eq('hours that do not add up are not queued', public.t_out('f1000000-0000-0000-0000-000000000006'), '');
SELECT public.t_eq('nothing at all is waiting to be sent', (SELECT count(*) FROM public.agent_outbox), 0::bigint);

ROLLBACK;
SELECT 'ok' AS agent_tracking_notice;
