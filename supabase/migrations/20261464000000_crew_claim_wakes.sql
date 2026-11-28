-- The local Crew daemon (on the owner's PC) collects the waiting wake tasks with the CFO's key and runs each as the named executive on the PC.
-- Only the CFO's key may do it (the CFO is the boss of everyone), and a task is handed out once: it is marked fired as it is taken.
-- (The cloud route, the crew-wake function, does the same job through the cloud routine; with both set up they simply share the queue.)

CREATE OR REPLACE FUNCTION public.crew_claim_wakes(p_agent uuid, p_max integer DEFAULT 6) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_agent AND active AND role = 'cfo') THEN RAISE EXCEPTION 'only the CFO key can collect the waiting tasks'; END IF;
  WITH c AS (
    UPDATE public.crew_wake_queue q SET status = 'fired', fired_at = now(), attempts = q.attempts + 1
    WHERE q.id IN (SELECT w.id FROM public.crew_wake_queue w WHERE w.status = 'pending' AND w.attempts < 4 ORDER BY (w.source = 'owner') DESC, w.created_at LIMIT greatest(1, least(p_max, 12)) FOR UPDATE SKIP LOCKED)
    RETURNING q.id, q.agent_id, q.reason, q.depth, q.source
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', a.slug, 'name', a.name, 'role', a.role, 'reason', c.reason, 'depth', c.depth, 'source', c.source)), '[]'::jsonb)
    INTO v FROM c JOIN public.crew_agents a ON a.id = c.agent_id;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.crew_claim_wakes(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_claim_wakes(uuid, integer) TO service_role;
