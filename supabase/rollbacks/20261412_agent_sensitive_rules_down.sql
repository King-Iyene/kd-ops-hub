-- Rolls back 20261412000000_agent_sensitive_rules.sql. Not run automatically.
-- Items the rules raised stay in agent_flags as dismissed (history); delete them by rule_code below if they are not wanted.

UPDATE public.agent_flags SET status = 'dismissed', updated_at = now()
 WHERE rule_code IN ('PY01', 'PY02', 'BK01', 'BK02', 'LN01', 'LN02', 'DC01', 'DC02', 'PF01', 'HL01', 'CT01') AND status IN ('open', 'snoozed');
DELETE FROM public.agent_rules WHERE code IN ('PY01', 'PY02', 'BK01', 'BK02', 'LN01', 'LN02', 'DC01', 'DC02', 'PF01', 'HL01', 'CT01');

DROP FUNCTION IF EXISTS public.agent_rule_ct01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_hl01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_pf01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_dc02(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_dc01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_ln02(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_ln01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_bk02(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_bk01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_py02(timestamptz);
DROP FUNCTION IF EXISTS public.agent_rule_py01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_sensitive_flag(text, text, text, integer, text, text, text, jsonb, text, numeric, text, numeric, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.agent_sensitive_quiet(timestamptz);
DROP FUNCTION IF EXISTS public.agent_plural(integer, text, text);
DROP FUNCTION IF EXISTS public.agent_sensitive_param(text, text, numeric);
