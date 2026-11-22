-- Rolls back 20261437000000_cliq_watch.sql. Afterwards re-apply agent_flag_draft from 20261436000000_tailored_messages_and_calls.sql.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN PERFORM cron.unschedule('agent_cliq_watch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent_cliq_watch'); END IF; END $$;
DELETE FROM public.agent_flags WHERE rule_code = 'CQ01';
DELETE FROM public.agent_rules WHERE code = 'CQ01';
DROP FUNCTION IF EXISTS public.agent_rule_cq01(timestamptz);
DROP FUNCTION IF EXISTS public.agent_cliq_watch_tick();
DROP FUNCTION IF EXISTS public.agent_cliq_watch_due(timestamptz);
DROP FUNCTION IF EXISTS public.agent_cliq_watch_status();
DROP FUNCTION IF EXISTS public.agent_cliq_watch_set(uuid, boolean);
DROP FUNCTION IF EXISTS public.agent_working_minutes(timestamptz, timestamptz);
DROP TABLE IF EXISTS public.agent_cliq_messages;
DROP TABLE IF EXISTS public.agent_cliq_watch;
