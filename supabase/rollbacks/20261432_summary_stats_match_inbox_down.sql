-- Rollback for 20261432000000_summary_stats_match_inbox.sql.
-- Re-apply the older definitions: agent_build_summary from 20261411000300_agent_summaries.sql, agent_week_stats from
-- 20261423000000_agent_briefing_scorecard.sql, agent_rule_tr05 from 20261410000100_agent_monitor.sql, then:
DROP FUNCTION IF EXISTS public.agent_site_class(text, text);
-- (Summaries already rebuilt keep their new numbers; delete and regenerate them with "Generate now" if the old figures are wanted.)
