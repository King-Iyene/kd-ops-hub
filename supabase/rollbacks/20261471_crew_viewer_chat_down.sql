-- Rolls back 20261471000000_crew_viewer_chat.sql: viewers can still SEE the agents (that is 20261459) but can no longer chat with them.
-- Viewer conversations are deleted. Everything else in crew_messages, the wake rules and the executives' inbox is as it was before.
DO $$ BEGIN PERFORM cron.unschedule('crew_viewer_tick'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP FUNCTION IF EXISTS public.crew_viewer_tick();
DROP FUNCTION IF EXISTS public.crew_viewer_wake(uuid);
DROP FUNCTION IF EXISTS public.crew_viewer_thread(uuid);
DROP FUNCTION IF EXISTS public.crew_viewer_say(uuid, text);
DROP FUNCTION IF EXISTS public.crew_viewer_questions(uuid);

-- the old six-argument message function
DROP FUNCTION IF EXISTS public.crew_post_message(uuid, uuid, text, text, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.crew_post_message(p_agent uuid, p_to_agent uuid, p_body text, p_kind text DEFAULT 'message', p_ref_proposal uuid DEFAULT NULL, p_ref_order uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_agent AND active) THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  IF p_to_agent IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_to_agent AND active) THEN RAISE EXCEPTION 'unknown recipient'; END IF;
  INSERT INTO public.crew_messages (from_agent, to_agent, to_owner, kind, body, ref_proposal, ref_order)
  VALUES (p_agent, p_to_agent, p_to_agent IS NULL, p_kind, p_body, p_ref_proposal, p_ref_order) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.crew_post_message(uuid, uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_post_message(uuid, uuid, text, text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.crew_inbox(p_agent uuid, p_limit integer DEFAULT 50)
RETURNS SETOF public.crew_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.crew_messages WHERE to_agent = p_agent AND read_at IS NULL ORDER BY created_at LIMIT greatest(1, least(p_limit, 200)) FOR UPDATE SKIP LOCKED
  )
  UPDATE public.crew_messages m SET read_at = now() FROM picked WHERE m.id = picked.id RETURNING m.*;
END $$;

CREATE OR REPLACE FUNCTION public.crew_wake_on_owner_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    PERFORM public.crew_enqueue_wake(NEW.to_agent, 'The owner wrote to you: read your inbox and answer him.', 'owner', NULL, 0);
  EXCEPTION WHEN OTHERS THEN NULL;   -- never stop the message itself
  END;
  RETURN NEW;
END $$;

-- viewer rows go first: their shape does not fit the old rules
DELETE FROM public.crew_messages WHERE viewer_chat OR to_profile IS NOT NULL;
DROP POLICY IF EXISTS crew_messages_owner ON public.crew_messages;
CREATE POLICY crew_messages_owner ON public.crew_messages FOR SELECT TO authenticated
  USING (public.crew_is_owner() AND (meeting_id IS NULL OR public.crew_is_company_owner()));
ALTER TABLE public.crew_messages DROP CONSTRAINT IF EXISTS crew_messages_viewer_chat_shape;
ALTER TABLE public.crew_messages DROP CONSTRAINT IF EXISTS crew_messages_has_recipient;
ALTER TABLE public.crew_messages ADD CONSTRAINT crew_messages_has_recipient CHECK (to_owner OR to_agent IS NOT NULL OR meeting_id IS NOT NULL);
DROP INDEX IF EXISTS public.crew_messages_viewer_from_idx;
DROP INDEX IF EXISTS public.crew_messages_viewer_to_idx;
ALTER TABLE public.crew_messages DROP COLUMN IF EXISTS viewer_chat, DROP COLUMN IF EXISTS to_profile;   -- from_profile is older (the foundation migration) and stays

UPDATE public.crew_agent_private SET instructions = regexp_replace(instructions, E'\n\nVISITORS: [^\n]*', '') WHERE instructions LIKE '%VISITORS:%';
