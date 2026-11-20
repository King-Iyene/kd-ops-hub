-- Rollback for 20261422000000_agent_followthrough.sql
DELETE FROM public.agent_outbox WHERE kind = 'followup';
ALTER TABLE public.agent_outbox DROP CONSTRAINT IF EXISTS agent_outbox_kind_check;
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_kind_check CHECK (kind IN ('flag', 'summary', 'record'));
DELETE FROM public.agent_rules WHERE code = 'FT01';
DROP FUNCTION IF EXISTS public.agent_rule_ft01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_run_followups(timestamptz);
DROP TABLE IF EXISTS public.agent_followups;
