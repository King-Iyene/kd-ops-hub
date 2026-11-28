DROP TRIGGER IF EXISTS crew_check_drive_proposal ON public.crew_proposals;
DROP FUNCTION IF EXISTS public.crew_check_drive_proposal();
DELETE FROM public.crew_proposals WHERE action LIKE 'drive.%';
ALTER TABLE public.crew_proposals DROP CONSTRAINT IF EXISTS crew_proposals_action_check;
ALTER TABLE public.crew_proposals ADD CONSTRAINT crew_proposals_action_check CHECK (action ~ '^(record\.(create|update|soft_delete)|draft\.(batch_payment|payroll_run|invoice|filing)|advice\.[a-z_]+|agent\.(retire|hire)|external\.(github|vercel|supabase|other))$');
UPDATE public.crew_agent_private SET allowed_actions = ARRAY(SELECT x FROM unnest(allowed_actions) x WHERE x NOT LIKE 'drive.%');
CREATE OR REPLACE FUNCTION public.crew_my_approved(p_agent uuid)
RETURNS SETOF public.crew_proposals LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
  SELECT * FROM public.crew_proposals WHERE agent_id = p_agent AND status = 'approved' AND action LIKE 'draft.%' ORDER BY decided_at
$f$;
CREATE OR REPLACE FUNCTION public.crew_report_done(p_agent uuid, p_proposal uuid, p_result jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  UPDATE public.crew_proposals SET status = 'executed', executed_at = now(), result = coalesce(p_result, '{}'::jsonb)
   WHERE id = p_proposal AND agent_id = p_agent AND status = 'approved' AND action LIKE 'draft.%';
  IF NOT FOUND THEN RAISE EXCEPTION 'that is not an approved draft of yours'; END IF;
END $f$;
-- The finance merge is reversed with the 20261465 rollback (and re-issuing keys).
