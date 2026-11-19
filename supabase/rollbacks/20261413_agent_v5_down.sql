-- Rollback for Ops Agent v5 (20261413000000): chasing rules, system watch, links.
DELETE FROM public.agent_rules WHERE code IN ('ES01', 'ES02', 'SY01', 'SY02', 'SY04');
DROP FUNCTION IF EXISTS public.agent_rule_es01(timestamptz), public.agent_rule_es02(timestamptz), public.agent_rule_sy01(timestamptz), public.agent_rule_sy02(timestamptz), public.agent_rule_sy04(timestamptz),
  public.agent_bump(text), public.agent_age_text(timestamptz, timestamptz), public.agent_dispatch_ready(), public.agent_flag_link(uuid);
ALTER TABLE public.agent_settings DROP COLUMN IF EXISTS app_url;
-- agent_flag_draft, agent_flag_detail and agent_team_pulse: re-apply their definitions from 20261411000200 and 20261410000100.
