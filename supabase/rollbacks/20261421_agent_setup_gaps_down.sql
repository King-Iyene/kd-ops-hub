-- Rollback for 20261421000000_agent_setup_gaps.sql
UPDATE public.agent_flags SET status = 'auto_resolved' WHERE rule_code = 'SU01' AND status IN ('open', 'snoozed');
DELETE FROM public.agent_rules WHERE code = 'SU01';
DROP FUNCTION IF EXISTS public.agent_rule_su01(timestamptz);
