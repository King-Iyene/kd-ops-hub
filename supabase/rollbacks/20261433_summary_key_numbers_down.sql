-- Rollback for 20261433000000_summary_key_numbers.sql: re-apply agent_build_summary from 20261432000000_summary_stats_match_inbox.sql, then:
DROP FUNCTION IF EXISTS public.agent_period_kpis(date, date);
