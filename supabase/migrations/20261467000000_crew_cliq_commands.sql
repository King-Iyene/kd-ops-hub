-- Crew: approve, reject and reply to the AI executives FROM Zoho Cliq. Off until the owner turns it on (Crew > Settings > Cliq).
--
--   * OUTBOUND: every new pending proposal is posted once in the chosen Cliq channel with the owner tagged and the exact words to reply with.
--   * INBOUND: a message in that channel written by the owner's own Cliq account ("approve a1b2c3", "reject a1b2c3 too high", "hale: check the tax date")
--     is carried out. Nobody else's message is ever obeyed (the edge function crew-cliq checks the sender; this file checks everything else).
--   * The decision is made by the REAL crew_decide / crew_say, run as the owner for the length of one call. So every rule that already exists
--     (who may approve, risk, reminders, executors, soft deletes, lessons for the agent) still applies and nothing is copied here.
--   * Stricter than the app on purpose: a high-risk proposal (and any hiring or letting an executive go) needs the word CONFIRM, and a payment or a
--     payroll run cannot be approved from Cliq at all (they are drafts a person carries out; approve those in the app). Nothing here can pay anybody.
--
-- The four functions below can only be called by the server (service_role). A signed-in user cannot reach them, so they cannot be used to act as the owner.
-- Rollback: supabase/rollbacks/20261467_crew_cliq_commands_down.sql

-- 1. settings ----------------------------------------------------------------------------------------------------------------------------------
ALTER TABLE public.crew_settings
  ADD COLUMN IF NOT EXISTS cliq_commands_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cliq_owner_id text,
  ADD COLUMN IF NOT EXISTS cliq_cursor_ms bigint NOT NULL DEFAULT 0;
ALTER TABLE public.crew_settings DROP CONSTRAINT IF EXISTS crew_settings_cliq_owner_id_check;
ALTER TABLE public.crew_settings ADD CONSTRAINT crew_settings_cliq_owner_id_check
  CHECK (cliq_owner_id IS NULL OR cliq_owner_id ~ '^[A-Za-z0-9._@+-]{2,120}$');
ALTER TABLE public.crew_proposals ADD COLUMN IF NOT EXISTS cliq_notified_at timestamptz;

-- Saving is the same function as before with two more optional answers (the old four-argument call still works):
--   p_commands: null = leave as it is.   p_owner_id: null = leave as it is, '' = clear it.
-- Turning commands on, or changing whose Cliq account is obeyed, restarts the "read up to here" mark, so old messages are never carried out.
DROP FUNCTION IF EXISTS public.crew_save_settings(boolean, uuid, uuid, text[]);
CREATE OR REPLACE FUNCTION public.crew_save_settings(p_enabled boolean, p_connection uuid, p_profile uuid, p_kinds text[], p_commands boolean DEFAULT NULL, p_owner_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.crew_settings; v_commands boolean; v_owner text; v_restart boolean;
BEGIN
  IF NOT public.crew_is_owner() THEN RAISE EXCEPTION 'only the owner can change Crew settings'; END IF;
  IF p_enabled AND p_connection IS NULL THEN RAISE EXCEPTION 'choose the Cliq connection first'; END IF;
  IF p_connection IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.agent_connections WHERE id = p_connection AND kind = 'cliq') THEN RAISE EXCEPTION 'that is not a Cliq connection'; END IF;
  IF p_kinds IS NULL OR cardinality(p_kinds) = 0 OR NOT (p_kinds <@ ARRAY['message', 'reply', 'report', 'alert', 'challenge', 'reminder', 'brief']) THEN RAISE EXCEPTION 'bad message kinds'; END IF;
  SELECT * INTO s FROM public.crew_settings WHERE id;
  -- left as it is, unless alerts are being switched off: commands use the alerts' channel, so they go off with them
  v_commands := coalesce(p_commands, s.cliq_commands_enabled AND p_enabled);
  v_owner := CASE WHEN p_owner_id IS NULL THEN s.cliq_owner_id ELSE nullif(btrim(p_owner_id), '') END;
  IF v_owner IS NOT NULL AND v_owner !~ '^[A-Za-z0-9._@+-]{2,120}$' THEN RAISE EXCEPTION 'the Cliq user id or email may only use letters, digits and . _ @ + - (2 to 120 characters)'; END IF;
  IF v_commands AND NOT p_enabled THEN RAISE EXCEPTION 'turn on Cliq alerts first: commands use the same channel'; END IF;
  IF v_commands AND v_owner IS NULL THEN RAISE EXCEPTION 'type your Cliq user id or email: only that account is obeyed'; END IF;
  v_restart := (v_commands AND NOT s.cliq_commands_enabled) OR v_owner IS DISTINCT FROM s.cliq_owner_id OR p_connection IS DISTINCT FROM s.cliq_connection_id;
  UPDATE public.crew_settings SET cliq_enabled = p_enabled, cliq_connection_id = p_connection, notify_profile_id = p_profile, notify_kinds = p_kinds,
         cliq_commands_enabled = v_commands, cliq_owner_id = v_owner, cliq_cursor_ms = CASE WHEN v_restart THEN 0 ELSE cliq_cursor_ms END, updated_at = now()
   WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_save_settings(boolean, uuid, uuid, text[], boolean, text) TO authenticated, service_role;

-- 2. who the owner is, and the pending list with a short code each -------------------------------------------------------------------------------
-- The owner is the profile named in the settings, and must still be a super admin (the same test crew_decide makes).
CREATE OR REPLACE FUNCTION public.crew_cliq_owner() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT owner_profile_id INTO v FROM public.crew_settings WHERE id;
  IF v IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v AND role = 'super_admin') THEN RAISE EXCEPTION 'the owner is not set up in Crew settings'; END IF;
  RETURN v;
END $$;

-- Waiting proposals with the shortest code (6 to 8 letters and digits) that no other waiting proposal shares.
CREATE OR REPLACE FUNCTION public.crew_cliq_pending_rows()
RETURNS TABLE (id uuid, code text, agent_name text, agent_title text, action text, summary text, risk text, created_at timestamptz, notified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.id,
         CASE WHEN count(*) OVER (PARTITION BY left(p.id::text, 6)) = 1 THEN left(p.id::text, 6)
              WHEN count(*) OVER (PARTITION BY left(p.id::text, 7)) = 1 THEN left(p.id::text, 7)
              ELSE left(p.id::text, 8) END,
         a.name, a.title, p.action, p.summary, p.risk, p.created_at, p.cliq_notified_at IS NOT NULL
    FROM public.crew_proposals p JOIN public.crew_agents a ON a.id = p.agent_id
   WHERE p.status = 'pending' AND (p.expires_at IS NULL OR p.expires_at > now())
$$;

-- new proposals not yet posted in Cliq, oldest first
CREATE OR REPLACE FUNCTION public.crew_cliq_pending_to_notify(p_limit integer DEFAULT 5)
RETURNS TABLE (id uuid, code text, agent_name text, agent_title text, action text, summary text, risk text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.code, r.agent_name, r.agent_title, r.action, r.summary, r.risk
    FROM public.crew_cliq_pending_rows() r WHERE NOT r.notified ORDER BY r.created_at LIMIT greatest(1, least(coalesce(p_limit, 5), 20))
$$;

-- every waiting proposal (for the "status" command), newest first
CREATE OR REPLACE FUNCTION public.crew_cliq_pending_list(p_limit integer DEFAULT 10)
RETURNS TABLE (id uuid, code text, agent_name text, agent_title text, action text, summary text, risk text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.code, r.agent_name, r.agent_title, r.action, r.summary, r.risk
    FROM public.crew_cliq_pending_rows() r ORDER BY r.created_at DESC LIMIT greatest(1, least(coalesce(p_limit, 10), 30))
$$;

-- Takes the proposals before they are posted, so two overlapping runs never post the same one twice. Returns the ids this call took.
CREATE OR REPLACE FUNCTION public.crew_cliq_mark_notified(p_ids uuid[]) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v uuid[];
BEGIN
  WITH u AS (UPDATE public.crew_proposals SET cliq_notified_at = now() WHERE id = ANY (p_ids) AND cliq_notified_at IS NULL AND status = 'pending' RETURNING id)
  SELECT coalesce(array_agg(id), '{}') INTO v FROM u;
  RETURN v;
END $$;

-- Gives them back when the post failed, so the next run tries again.
CREATE OR REPLACE FUNCTION public.crew_cliq_unmark_notified(p_ids uuid[]) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.crew_proposals SET cliq_notified_at = NULL WHERE id = ANY (p_ids) AND status = 'pending'
$$;

-- 3. approve or reject ----------------------------------------------------------------------------------------------------------------------------
-- p_code: 6 to 8 letters and digits at the start of the proposal id, and it must be one waiting proposal. p_note: for a reject, the reason (optional);
-- for an approve of a high-risk proposal, the literal word CONFIRM.
CREATE OR REPLACE FUNCTION public.crew_cliq_decide(p_code text, p_decision text, p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_owner uuid; v_code text; v_all integer; v_waiting integer; r public.crew_proposals; v_agent text; v_need_confirm boolean; v_note text; v_res jsonb;
BEGIN
  v_owner := public.crew_cliq_owner();
  IF p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN RAISE EXCEPTION 'say approve or reject'; END IF;
  v_code := lower(btrim(coalesce(p_code, '')));
  IF v_code !~ '^[0-9a-f]{6,8}$' THEN RAISE EXCEPTION 'the code is 6 to 8 letters and digits, like a1b2c3'; END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'pending') INTO v_all, v_waiting FROM public.crew_proposals WHERE id::text LIKE v_code || '%';
  IF v_all = 0 THEN RAISE EXCEPTION 'no proposal starts with %', v_code; END IF;
  IF v_waiting = 0 THEN
    IF v_all = 1 THEN
      SELECT * INTO r FROM public.crew_proposals WHERE id::text LIKE v_code || '%';
      RAISE EXCEPTION 'that one is already %', r.status;   -- a message replayed after it was decided ends here, nothing is done twice
    END IF;
    RAISE EXCEPTION 'nothing waiting starts with %', v_code;
  END IF;
  IF v_waiting > 1 THEN RAISE EXCEPTION '% waiting proposals start with %: type more of the code (up to 8 characters)', v_waiting, v_code; END IF;
  SELECT * INTO r FROM public.crew_proposals WHERE id::text LIKE v_code || '%' AND status = 'pending';
  SELECT name INTO v_agent FROM public.crew_agents WHERE id = r.agent_id;

  IF p_decision = 'approve' THEN
    IF r.action IN ('draft.batch_payment', 'draft.payroll_run') THEN RAISE EXCEPTION 'payments and payroll are approved in the app, not from Cliq'; END IF;
    v_need_confirm := r.risk = 'high' OR r.action LIKE 'agent.%';
    IF v_need_confirm AND coalesce(p_note, '') <> 'CONFIRM' THEN
      RAISE EXCEPTION 'this one is %: to approve it, reply  approve % confirm', CASE WHEN r.risk = 'high' THEN 'high-risk' ELSE 'about the team (hiring or letting someone go)' END, v_code;
    END IF;
    v_note := 'Approved from Cliq';
  ELSE
    v_note := nullif(left(btrim(coalesce(p_note, '')), 500), '');   -- no reason stays empty, so the executive knows to ask before proposing it again
  END IF;

  -- Be the owner for this one call only (the setting is local to the transaction): crew_decide then applies every rule exactly as in the app.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  v_res := public.crew_decide(r.id, p_decision, v_note);
  RETURN coalesce(v_res, '{}'::jsonb) || jsonb_build_object('proposal', r.id, 'agent', v_agent, 'summary', r.summary, 'action', r.action);
END $$;

-- 4. write to an executive ---------------------------------------------------------------------------------------------------------------------------
-- p_agent_slug: the slug (cfo) or the first name (Hale) of one active executive. The message is the owner's own, sent with crew_say, so the executive wakes as usual.
CREATE OR REPLACE FUNCTION public.crew_cliq_say(p_agent_slug text, p_body text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid; v_key text; v_n integer; a public.crew_agents; v_body text; v_id uuid;
BEGIN
  v_owner := public.crew_cliq_owner();
  v_key := lower(btrim(coalesce(p_agent_slug, '')));
  v_body := btrim(coalesce(p_body, ''));
  IF v_key = '' OR length(v_key) > 40 THEN RAISE EXCEPTION 'say who it is for: their first name or slug, a colon, then the message'; END IF;
  IF v_body = '' THEN RAISE EXCEPTION 'the message is empty'; END IF;
  IF length(v_body) > 4000 THEN RAISE EXCEPTION 'the message is too long for Cliq (4000 characters at most)'; END IF;
  SELECT count(*) INTO v_n FROM public.crew_agents WHERE active AND (slug = v_key OR lower(split_part(name, ' ', 1)) = v_key);
  IF v_n = 0 THEN RAISE EXCEPTION 'no one on the team is called %', v_key; END IF;
  IF v_n > 1 THEN
    SELECT * INTO a FROM public.crew_agents WHERE active AND slug = v_key;   -- an exact slug always wins
    IF NOT FOUND THEN RAISE EXCEPTION 'more than one person is called %: use the slug (for example cfo)', v_key; END IF;
  ELSE
    SELECT * INTO a FROM public.crew_agents WHERE active AND (slug = v_key OR lower(split_part(name, ' ', 1)) = v_key);
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  v_id := public.crew_say(a.id, v_body);
  RETURN jsonb_build_object('message', v_id, 'agent', a.name, 'slug', a.slug, 'title', a.title);
END $$;

-- 5. who may call what --------------------------------------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.crew_cliq_owner(), public.crew_cliq_pending_rows(), public.crew_cliq_pending_to_notify(integer), public.crew_cliq_pending_list(integer),
  public.crew_cliq_mark_notified(uuid[]), public.crew_cliq_unmark_notified(uuid[]), public.crew_cliq_decide(text, text, text), public.crew_cliq_say(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crew_cliq_owner(), public.crew_cliq_pending_rows(), public.crew_cliq_pending_to_notify(integer), public.crew_cliq_pending_list(integer),
  public.crew_cliq_mark_notified(uuid[]), public.crew_cliq_unmark_notified(uuid[]), public.crew_cliq_decide(text, text, text), public.crew_cliq_say(text, text)
  TO service_role;

-- 6. the clock: every minute, and it only calls out when the owner has turned this on (the same pattern as crew_wake) ------------------------------------
CREATE OR REPLACE FUNCTION public.crew_cliq_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.crew_settings WHERE id AND cliq_enabled AND cliq_commands_enabled AND cliq_connection_id IS NOT NULL AND cliq_owner_id IS NOT NULL) THEN RETURN; END IF;
  SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/crew-cliq') INTO v_url FROM vault.decrypted_secrets WHERE name = 'agent_dispatch_url';
  IF v_url IS NULL THEN
    SELECT regexp_replace(decrypted_secret, '/[^/]+/?$', '/crew-cliq') INTO v_url FROM vault.decrypted_secrets WHERE name = 'batch_worker_url';
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RAISE NOTICE 'crew_cliq_tick: Vault secrets not configured yet, skipping'; RETURN; END IF;
  PERFORM net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret), body := '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.crew_cliq_tick() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN PERFORM cron.unschedule('crew_cliq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('crew_cliq', '* * * * *', $$SELECT public.crew_cliq_tick()$$);
