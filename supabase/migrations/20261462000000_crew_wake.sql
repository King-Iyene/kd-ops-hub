-- Wake on events: an executive runs when something happens, never on a clock they do not need.
--   * A QUEUE of wake requests. The owner messaging an executive (or giving an order) wakes them; a manager (or the CFO) can wake someone below them
--     or their own manager with the gateway op "wake"; later, system events can wake the executive they concern.
--   * Rules in the database, so no executive can storm the system: one waiting wake per person (extra requests merge), at most one wake per
--     person every 10 minutes unless it is the owner, never deeper than 2 levels of "A woke B woke C", at most 40 wakes an hour in all.
--   * A small cron tick (every minute, only when something is waiting) calls the crew-wake edge function, which starts the shared Crew runner
--     routine for each waiting request. The runner's token never leaves the edge function.
--   * A new message kind "question": executives ask the owner what they need to learn about the company, to act on their own later.

ALTER TABLE public.crew_messages DROP CONSTRAINT IF EXISTS crew_messages_kind_check;
ALTER TABLE public.crew_messages ADD CONSTRAINT crew_messages_kind_check
  CHECK (kind = ANY (ARRAY['message', 'reply', 'report', 'alert', 'challenge', 'reminder', 'brief', 'question']));

CREATE TABLE IF NOT EXISTS public.crew_wake_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.crew_agents(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1500),
  source text NOT NULL CHECK (source IN ('owner', 'agent', 'event')),
  requested_by_agent uuid REFERENCES public.crew_agents(id) ON DELETE SET NULL,
  depth integer NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  session_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  fired_at timestamptz
);
CREATE INDEX IF NOT EXISTS crew_wake_queue_pending_idx ON public.crew_wake_queue (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS crew_wake_queue_agent_idx ON public.crew_wake_queue (agent_id, created_at DESC);
ALTER TABLE public.crew_wake_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_wake_queue_owner ON public.crew_wake_queue;
CREATE POLICY crew_wake_queue_owner ON public.crew_wake_queue FOR SELECT TO authenticated USING (public.crew_is_owner());
GRANT SELECT ON public.crew_wake_queue TO authenticated;
GRANT ALL ON public.crew_wake_queue TO service_role;

-- put a wake request in the queue (internal)
CREATE OR REPLACE FUNCTION public.crew_enqueue_wake(p_target uuid, p_reason text, p_source text, p_by uuid DEFAULT NULL, p_depth integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_agents WHERE id = p_target AND active) THEN RAISE EXCEPTION 'that person is not on the team'; END IF;
  IF p_depth > 2 THEN RAISE EXCEPTION 'too many wake-ups in a row: handle it yourself or write to your manager'; END IF;
  -- one waiting wake per person: a second request is merged into it
  SELECT id INTO v_id FROM public.crew_wake_queue WHERE agent_id = p_target AND status = 'pending' ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.crew_wake_queue SET reason = left(reason || E'\n' || p_reason, 1500) WHERE id = v_id;
    RETURN v_id;
  END IF;
  IF p_source <> 'owner' THEN
    IF EXISTS (SELECT 1 FROM public.crew_wake_queue WHERE agent_id = p_target AND status IN ('fired', 'pending') AND created_at > now() - interval '10 minutes') THEN
      RAISE EXCEPTION 'they were woken in the last 10 minutes: leave them a message instead, they read it when they next run';
    END IF;
    IF (SELECT count(*) FROM public.crew_wake_queue WHERE created_at > now() - interval '1 hour') >= 40 THEN
      RAISE EXCEPTION 'the team has been woken 40 times this hour: that is the limit';
    END IF;
  END IF;
  INSERT INTO public.crew_wake_queue (agent_id, reason, source, requested_by_agent, depth) VALUES (p_target, left(p_reason, 1500), p_source, p_by, p_depth) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- an executive asks for someone to be woken: their own manager, or anyone below them (the CFO is above everyone)
CREATE OR REPLACE FUNCTION public.crew_wake(p_agent uuid, p_target uuid, p_reason text, p_depth integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE me public.crew_agents; tgt public.crew_agents;
BEGIN
  SELECT * INTO me FROM public.crew_agents WHERE id = p_agent AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown or inactive agent'; END IF;
  SELECT * INTO tgt FROM public.crew_agents WHERE id = p_target AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'that person is not on the team'; END IF;
  IF p_agent = p_target THEN RAISE EXCEPTION 'you cannot wake yourself'; END IF;
  IF NOT (public.crew_is_boss_of(p_agent, p_target) OR public.crew_is_boss_of(p_target, p_agent)) THEN
    RAISE EXCEPTION 'you can wake your own manager or someone who reports to you; for anyone else, write to your manager and they will wake them';
  END IF;
  RETURN public.crew_enqueue_wake(p_target, 'Woken by ' || me.name || ' (' || me.title || '): ' || p_reason, 'agent', p_agent, p_depth + 1);
END $$;

-- the owner writes to an executive (a message, or an order): they wake up
CREATE OR REPLACE FUNCTION public.crew_wake_on_owner_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    PERFORM public.crew_enqueue_wake(NEW.to_agent, 'The owner wrote to you: read your inbox and answer him.', 'owner', NULL, 0);
  EXCEPTION WHEN OTHERS THEN NULL;   -- never stop the message itself
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crew_messages_wake ON public.crew_messages;
CREATE TRIGGER crew_messages_wake AFTER INSERT ON public.crew_messages
  FOR EACH ROW WHEN (NEW.from_agent IS NULL AND NEW.to_agent IS NOT NULL) EXECUTE FUNCTION public.crew_wake_on_owner_message();

-- an executive writes to a colleague: the colleague wakes up to read it (this is how they talk to each other on their own).
-- Guard against ping-pong: at most 8 agent-to-agent messages in one thread per hour, and the queue's own rules (one wait per person,
-- one wake per person per 10 minutes) still apply.
CREATE OR REPLACE FUNCTION public.crew_wake_on_agent_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_from text;
BEGIN
  BEGIN
    IF (SELECT count(*) FROM public.crew_messages WHERE from_agent IS NOT NULL AND to_agent IS NOT NULL AND created_at > now() - interval '1 hour'
          AND ((from_agent = NEW.from_agent AND to_agent = NEW.to_agent) OR (from_agent = NEW.to_agent AND to_agent = NEW.from_agent))) > 6 THEN RETURN NEW; END IF;
    SELECT name INTO v_from FROM public.crew_agents WHERE id = NEW.from_agent;
    PERFORM public.crew_enqueue_wake(NEW.to_agent, coalesce(v_from, 'A colleague') || ' wrote to you: read your inbox and answer.', 'agent', NEW.from_agent, 1);
  EXCEPTION WHEN OTHERS THEN NULL;   -- never stop the message itself
  END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crew_messages_wake_agent ON public.crew_messages;
CREATE TRIGGER crew_messages_wake_agent AFTER INSERT ON public.crew_messages
  FOR EACH ROW WHEN (NEW.from_agent IS NOT NULL AND NEW.to_agent IS NOT NULL) EXECUTE FUNCTION public.crew_wake_on_agent_message();

-- the cron tick: only calls out when something is waiting (the same pattern as the Ops Agent's delivery)
CREATE OR REPLACE FUNCTION public.crew_wake_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_wake_queue WHERE status = 'pending' AND attempts < 4) THEN RETURN; END IF;
  SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/crew-wake') INTO v_url FROM vault.decrypted_secrets WHERE name = 'agent_dispatch_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/crew-wake') INTO v_url FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RAISE NOTICE 'crew_wake_tick: Vault secrets not configured yet, skipping'; RETURN; END IF;
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret), body := '{}'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.crew_enqueue_wake(uuid, text, text, uuid, integer), public.crew_wake(uuid, uuid, text, integer), public.crew_wake_tick(), public.crew_wake_on_owner_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_wake(uuid, uuid, text, integer) TO service_role;

DO $$ BEGIN PERFORM cron.unschedule('crew_wake'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('crew_wake', '* * * * *', $$SELECT public.crew_wake_tick()$$);

-- what every executive is told ------------------------------------------------------------------------------------------------------------
UPDATE public.crew_agent_private p SET instructions = p.instructions || E'\n\nLEARNING THE COMPANY: you cannot act well on what you do not know, so ask. At the start of every run, list what you still do not know about the company, the clients, the processes and the owner''s preferences that your job needs (for example: which table holds the live income, how invoices are numbered and when one counts as a duplicate, who approves what, deadlines, who the key clients are). Check the company brain and your notes first: never ask what is already written down. Then ask the owner the most useful unanswered questions, up to 5 per run, one message each: {"op":"message","kind":"question","body":"..."}, with your guess where you have one so he can just say yes. When he answers, save it at once: {"op":"note","kind":"fact","source":"owner_feedback","body":"..."} and, if it helps the whole team, propose it for the company brain with advice.knowledge. Do not ask the same thing twice.'
WHERE p.instructions NOT LIKE '%LEARNING THE COMPANY:%';

UPDATE public.crew_agent_private p SET instructions = p.instructions || E'\n\nWAKING OTHERS: you are woken by events (the owner writing to you, a colleague, something in the system), not by a clock. When your work needs another executive now, wake them with a reason: {"op":"wake","agent":"<slug>","reason":"what you need from them and why now","depth":<the depth you were given, 0 if none>}. You may wake your own manager or anyone who reports to you; for anyone else, write to your manager. A person can be woken once every 10 minutes and never more than two levels deep, so do not chain wake-ups: say everything in the reason, and also leave the detail in a message to them.'
WHERE p.instructions NOT LIKE '%WAKING OTHERS:%';
