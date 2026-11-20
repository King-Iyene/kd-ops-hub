-- Rollback for 20261423000000_agent_briefing_scorecard.sql
DELETE FROM public.agent_summaries WHERE period_kind IN ('briefing', 'scorecard');
ALTER TABLE public.agent_summaries DROP CONSTRAINT IF EXISTS agent_summaries_period_kind_check;
ALTER TABLE public.agent_summaries ADD CONSTRAINT agent_summaries_period_kind_check CHECK (period_kind IN ('day', 'week', 'month', 'custom'));
DELETE FROM public.agent_rules WHERE code IN ('BR01', 'SC01');
DROP FUNCTION IF EXISTS public.agent_rule_br01(timestamptz), public.agent_rule_sc01(timestamptz), public.agent_build_briefing(timestamptz),
  public.agent_build_scorecard(date), public.agent_week_stats(date);
-- and re-apply agent_outbox_summary from 20261411000400_agent_connections_memory.sql
