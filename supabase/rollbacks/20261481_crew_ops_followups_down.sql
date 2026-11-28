-- Rolls back 20261481000000_crew_ops_followups.sql: the standing permission, the post log (and its history), the time source and the routine go away.
-- Posts already made in Cliq stay there. The Head of Operations goes back to reviewing tracker items without posting.
DO $$ BEGIN PERFORM cron.unschedule('crew_ops_followup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.crew_ops_followup_tick(timestamptz);
DROP FUNCTION IF EXISTS public.crew_standing_kill_all();
DROP FUNCTION IF EXISTS public.crew_set_standing_permission(uuid, uuid, boolean, integer, text[]);
DROP FUNCTION IF EXISTS public.crew_cliq_post_finish(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.crew_cliq_post_reserve(uuid, text, text, text[]);
DROP FUNCTION IF EXISTS public.crew_cliq_post_refuse(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.crew_cliq_post_text_error(text);

UPDATE public.crew_agent_private p SET allowed_sources = array_remove(p.allowed_sources, 'time_today') WHERE 'time_today' = ANY (p.allowed_sources);
DELETE FROM public.crew_app_sources WHERE name = 'time_today';
DROP VIEW IF EXISTS public.crew_v_time_today;

UPDATE public.crew_agent_private p SET instructions = left(p.instructions, position(E'\n\nTEAM FOLLOW-UPS IN CLIQ' IN p.instructions) - 1)
 WHERE position(E'\n\nTEAM FOLLOW-UPS IN CLIQ' IN p.instructions) > 0;

DROP TABLE IF EXISTS public.crew_ops_followup_runs;
DROP TABLE IF EXISTS public.crew_cliq_posts;
DROP TABLE IF EXISTS public.crew_standing_permissions;
