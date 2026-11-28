-- Run after 20261462 and 20261463, in something that rolls back. Checks: offline owner = no scan, a ping makes him online, the off switch, and that the weekly
-- self-review wakes two executives per scan, never the same one twice in a week.
DO $t$
DECLARE o text := ''; r jsonb; ow uuid;
BEGIN
  SELECT owner_profile_id INTO ow FROM public.crew_settings WHERE id;
  UPDATE public.crew_settings SET owner_seen_at = now() - interval '2 hours', last_event_scan_at = now() - interval '24 hours', watch_events = true WHERE id;
  r := public.crew_event_scan(); o := o || 'offline=' || coalesce(r ->> 'skipped', 'RAN') || '; ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ow, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated; PERFORM public.crew_owner_ping(); RESET ROLE;
  r := public.crew_event_scan(); o := o || 'online_woken=' || coalesce((r -> 'woken')::text, r::text) || '; ';
  o := o || 'self_reviews=' || (SELECT count(*) FROM public.crew_wake_queue WHERE reason LIKE 'WEEKLY SELF-REVIEW%') || '; ';
  UPDATE public.crew_wake_queue SET status = 'fired' WHERE status = 'pending';
  UPDATE public.crew_wake_queue SET created_at = now() - interval '11 minutes' WHERE source = 'event';
  r := public.crew_event_scan(); o := o || 'second_scan_woken=' || coalesce((r -> 'woken')::text, r::text) || '; ';
  o := o || 'distinct_reviewed=' || (SELECT count(DISTINCT agent_id) FROM public.crew_wake_queue WHERE reason LIKE 'WEEKLY SELF-REVIEW%') || '; ';
  UPDATE public.crew_settings SET watch_events = false WHERE id;
  r := public.crew_event_scan(); o := o || 'off=' || coalesce(r ->> 'skipped', 'RAN') || '; ';
  RAISE EXCEPTION 'TESTRESULT: %', o;
END $t$;
