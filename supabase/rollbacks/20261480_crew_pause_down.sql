DROP TRIGGER IF EXISTS crew_wake_skip_paused ON public.crew_wake_queue;
DROP FUNCTION IF EXISTS public.crew_wake_skip_paused();
DROP FUNCTION IF EXISTS public.crew_set_paused(uuid, boolean);
ALTER TABLE public.crew_agents DROP COLUMN IF EXISTS paused_at;
ALTER TABLE public.crew_agents DROP COLUMN IF EXISTS paused;
