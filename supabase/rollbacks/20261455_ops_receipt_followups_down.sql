-- Rolls back 20261455000000_ops_receipt_followups.sql. Open FL01 and EX01 items are removed.
DELETE FROM public.agent_flags WHERE rule_code IN ('FL01', 'EX01');
DELETE FROM public.agent_rules WHERE code IN ('FL01', 'EX01');
DROP FUNCTION IF EXISTS public.agent_rule_fl01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_ex01(timestamptz);
CREATE OR REPLACE FUNCTION public.agent_is_team_rule(p_code text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(p_code ~ '^(TK|TR|RP)[0-9]+$', false)
$$;
DELETE FROM public.agent_module_catalog WHERE key = 'fleet';
