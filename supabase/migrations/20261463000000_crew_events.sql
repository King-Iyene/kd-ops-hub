-- Event watching: the system wakes the executive an event concerns, but only while the owner is online, and in small batches (cheap in tokens).
--   * crew_owner_ping(): the app calls it every couple of minutes while the owner has it open. "Online" means a ping in the last 10 minutes.
--   * crew_event_scan(): every 5 minutes. While the owner is online it looks at what changed since the last scan (new expenses, new invoices, new payment
--     batches, new missing-receipt flags) and puts ONE wake request per concerned executive in the wake queue, with the counts and a plain reason.
--     While the owner is offline it does nothing and does not move its marker, so what happened is picked up when he is back (at most 24 hours back);
--     the CFO's daily briefing covers the rest.
--   * Token care: the wake queue already merges requests, allows one wake per person per 10 minutes, and 40 an hour; events add a limit of 12 event wakes
--     per person per day.
-- The owner can switch the "only while I am online" rule off (crew_settings.watch_only_online).

ALTER TABLE public.crew_settings ADD COLUMN IF NOT EXISTS owner_seen_at timestamptz;
ALTER TABLE public.crew_settings ADD COLUMN IF NOT EXISTS last_event_scan_at timestamptz;
ALTER TABLE public.crew_settings ADD COLUMN IF NOT EXISTS watch_events boolean NOT NULL DEFAULT true;
ALTER TABLE public.crew_settings ADD COLUMN IF NOT EXISTS watch_only_online boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.crew_owner_ping() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.crew_is_company_owner() THEN RETURN; END IF;
  UPDATE public.crew_settings SET owner_seen_at = now() WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.crew_owner_ping() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_owner_ping() TO authenticated;

-- one event wake for one executive (internal): daily limit, then the queue's own rules
CREATE OR REPLACE FUNCTION public.crew_event_wake(p_slug text, p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.crew_agents WHERE slug = p_slug AND active;
  IF v_id IS NULL THEN RETURN false; END IF;
  IF (SELECT count(*) FROM public.crew_wake_queue WHERE agent_id = v_id AND source = 'event' AND created_at > now() - interval '1 day') >= 12 THEN RETURN false; END IF;
  PERFORM public.crew_enqueue_wake(v_id, p_reason, 'event', NULL, 0);
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.crew_event_scan() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.crew_settings; v_since timestamptz; v_now timestamptz := now(); n integer; woken text[] := '{}'; r record;
BEGIN
  SELECT * INTO s FROM public.crew_settings WHERE id;
  IF NOT FOUND OR NOT s.watch_events THEN RETURN jsonb_build_object('skipped', 'event watching is off'); END IF;
  IF s.watch_only_online AND (s.owner_seen_at IS NULL OR s.owner_seen_at < v_now - interval '10 minutes') THEN RETURN jsonb_build_object('skipped', 'the owner is offline'); END IF;
  v_since := greatest(coalesce(s.last_event_scan_at, v_now - interval '10 minutes'), v_now - interval '24 hours');

  SELECT count(*) INTO n FROM public.expenses WHERE created_at > v_since AND deleted_at IS NULL;
  IF n > 0 AND public.crew_event_wake('controller', n || ' new expense(s) were recorded since ' || to_char(v_since AT TIME ZONE 'Africa/Lagos', 'DD Mon HH24:MI') || ' (Lagos). Check them for duplicates, wrong amounts and missing receipts, and propose what is needed. Read them with the expenses source, newest first.') THEN woken := woken || 'controller'; END IF;

  SELECT count(*) INTO n FROM public.invoices WHERE created_at > v_since AND deleted_at IS NULL;
  IF n > 0 AND public.crew_event_wake('revenue', n || ' new invoice(s) were created since ' || to_char(v_since AT TIME ZONE 'Africa/Lagos', 'DD Mon HH24:MI') || ' (Lagos). Check them against the clients and against earlier invoices for duplicates and wrong amounts, and tell your manager what you find. Read them with the invoices source, newest first.') THEN woken := woken || 'revenue'; END IF;

  SELECT count(*) INTO n FROM public.payment_batches WHERE created_at > v_since AND deleted_at IS NULL;
  IF n > 0 AND public.crew_event_wake('treasury', n || ' new payment batch(es) were created since ' || to_char(v_since AT TIME ZONE 'Africa/Lagos', 'DD Mon HH24:MI') || ' (Lagos). Check the totals, the payees (by fingerprint, never account numbers) and duplicates against earlier batches, and report to your manager. Read them with the payment_batches source.') THEN woken := woken || 'treasury'; END IF;

  SELECT count(*) INTO n FROM public.agent_flags WHERE created_at > v_since AND status = 'open' AND rule_code ~ '^(FL|EX)[0-9]+$';
  IF n > 0 AND public.crew_event_wake('ops_head', n || ' new missing-receipt item(s) were flagged since ' || to_char(v_since AT TIME ZONE 'Africa/Lagos', 'DD Mon HH24:MI') || ' (Lagos) by the receipt follow-up rules. Check who has been reminded and who has not answered, and tell your manager what needs chasing.') THEN woken := woken || 'ops_head'; END IF;

  -- self-improvement: once a week each executive reviews its own work (two at a time, so they are spread out and the cost stays small)
  FOR r IN SELECT a.slug FROM public.crew_agents a WHERE a.active AND NOT EXISTS (
             SELECT 1 FROM public.crew_wake_queue q WHERE q.agent_id = a.id AND q.reason LIKE 'WEEKLY SELF-REVIEW%' AND q.created_at > v_now - interval '7 days')
           ORDER BY random() LIMIT 2 LOOP
    IF public.crew_event_wake(r.slug, 'WEEKLY SELF-REVIEW: read your notes, what the owner approved and rejected this week, the mistakes logged against you and what he answered. Write down what you learned (op note), name one habit you will change, file one improvement idea if the system could do something for you (op idea), and ask the owner at most 3 new questions you still need answered to work on your own. Be short.') THEN woken := woken || r.slug; END IF;
  END LOOP;

  UPDATE public.crew_settings SET last_event_scan_at = v_now WHERE id;
  RETURN jsonb_build_object('scanned_since', v_since, 'woken', woken);
END $$;
REVOKE ALL ON FUNCTION public.crew_event_wake(text, text), public.crew_event_scan() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN PERFORM cron.unschedule('crew_event_scan'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('crew_event_scan', '*/5 * * * *', $$SELECT public.crew_event_scan()$$);
