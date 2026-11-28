-- Pause an agent: a paused agent is never woken, so it burns no tokens (the owner does not need Marketing for now, maybe later).
-- It is enforced in the database where wakes are written (a trigger on the wake queue), so every way of waking an agent is covered at once:
-- the owner's messages, other agents, events, the weekly self-review, meetings, visitors. Nothing queued is lost: on resume the agent is woken
-- once and reads its inbox. Only the company owner can pause or resume.

ALTER TABLE public.crew_agents ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;
ALTER TABLE public.crew_agents ADD COLUMN IF NOT EXISTS paused_at timestamptz;

CREATE OR REPLACE FUNCTION public.crew_wake_skip_paused() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $f$
BEGIN
  IF EXISTS (SELECT 1 FROM public.crew_agents WHERE id = NEW.agent_id AND paused) THEN RETURN NULL; END IF;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS crew_wake_skip_paused ON public.crew_wake_queue;
CREATE TRIGGER crew_wake_skip_paused BEFORE INSERT ON public.crew_wake_queue FOR EACH ROW EXECUTE FUNCTION public.crew_wake_skip_paused();

CREATE OR REPLACE FUNCTION public.crew_set_paused(p_agent uuid, p_paused boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $f$
DECLARE a public.crew_agents; v_dropped integer := 0;
BEGIN
  IF NOT public.crew_is_company_owner() THEN RAISE EXCEPTION 'only the owner can pause or resume an agent'; END IF;
  SELECT * INTO a FROM public.crew_agents WHERE id = p_agent AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such active agent'; END IF;
  IF a.paused = p_paused THEN RETURN jsonb_build_object('paused', a.paused, 'changed', false); END IF;
  IF p_paused THEN
    UPDATE public.crew_agents SET paused = true, paused_at = now(), status = 'offline', activity = 'Paused by the owner', updated_at = now() WHERE id = p_agent;
    UPDATE public.crew_wake_queue SET status = 'skipped', error = 'agent paused by the owner' WHERE agent_id = p_agent AND status = 'pending';
    GET DIAGNOSTICS v_dropped = ROW_COUNT;
  ELSE
    UPDATE public.crew_agents SET paused = false, paused_at = NULL, activity = '', updated_at = now() WHERE id = p_agent;
    PERFORM public.crew_enqueue_wake(p_agent, 'You were paused by the owner and are back at work: read your inbox and anything addressed to you, then carry on with your job.', 'owner', NULL, 0);
  END IF;
  RETURN jsonb_build_object('paused', p_paused, 'changed', true, 'waiting_wakes_dropped', v_dropped);
END $f$;

REVOKE ALL ON FUNCTION public.crew_set_paused(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crew_set_paused(uuid, boolean) TO authenticated;
