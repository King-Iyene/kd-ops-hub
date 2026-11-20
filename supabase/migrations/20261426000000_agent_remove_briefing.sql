-- Ops Agent: the morning briefing is removed (it ranked payroll and system items next to team items, which is not what the Summaries are for).
--   * the BR01 rule and its functions are dropped, so nothing writes a briefing any more
--   * the briefings already written are deleted
--   * connections that ticked "Morning briefing" lose that tick (the option no longer exists)
-- The Monday scorecard and the daily, weekly and monthly summaries are unchanged.
--
-- Rollback: re-apply the briefing part of 20261423000000_agent_briefing_scorecard.sql.

DELETE FROM public.agent_summaries WHERE period_kind = 'briefing';
DELETE FROM public.agent_rules WHERE code = 'BR01';
DROP FUNCTION IF EXISTS public.agent_rule_br01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_build_briefing(timestamptz);

UPDATE public.agent_connections
   SET config = jsonb_set(config, '{events}', (config -> 'events') - 'summary_briefing')
 WHERE jsonb_typeof(config -> 'events') = 'array' AND config -> 'events' ? 'summary_briefing';
