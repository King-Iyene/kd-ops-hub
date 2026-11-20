-- Rollback for 20261425000000_agent_team_focus_messages.sql:
-- re-apply agent_outbox_flag from 20261417000100_agent_tracking_notice.sql and agent_run_followups from 20261422000000_agent_followthrough.sql, then
DROP FUNCTION IF EXISTS public.agent_is_team_rule(text);
