-- Ops Agent: time tracking alerts reach other tools the moment they are raised, and "not tracking" says when the day started.
--
--   1. agent_outbox_flag: a connection with the event 'flag_tracking' ("Time tracking alerts") is sent every new time tracking item
--      (not tracking 30 minutes into the day, a forgotten timer, a timer with no tracker proof, manual time, blocked apps, hours that do
--      not add up), whatever its severity. High-priority items still go to connections that asked for them, as before.
--   2. TR01 "Not tracking time": the message names the person's own start time ("Their work day started at 9:00 AM ET and nothing has
--      been tracked 30 minutes in"). The rule itself is unchanged: 30 minutes after the person's own work start with nothing tracked,
--      45 minutes after a timer stopped.
--
-- Rollback: re-apply agent_outbox_flag from 20261411000400_agent_connections_memory.sql and agent_rule_tr01 from 20261410000200_agent_tr01_done_for_day.sql.

CREATE OR REPLACE FUNCTION public.agent_outbox_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.item_type NOT IN ('flag', 'human_action') OR NEW.rule_code = 'TK14' THEN RETURN NEW; END IF;
  INSERT INTO public.agent_outbox (connection_id, kind, ref_id)
  SELECT c.id, 'flag', NEW.id FROM public.agent_connections c
   WHERE ((coalesce(c.config -> 'events', '[]'::jsonb) ? 'flag_all')
          OR (public.agent_sev_rank(NEW.severity) >= 4 AND coalesce(c.config -> 'events', '[]'::jsonb) ? 'flag_high')
          OR (NEW.rule_code IN ('TR01', 'TR02', 'TR06', 'TR07', 'TR08', 'TR09') AND coalesce(c.config -> 'events', '[]'::jsonb) ? 'flag_tracking'))
     AND public.agent_sev_rank(NEW.severity) >= public.agent_sev_rank(coalesce(nullif(c.config ->> 'min_severity', ''), 'info'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.agent_outbox_flag() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.agent_rule_tr01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_start timestamptz; r record; v_idle numeric; v_sev text; v_why text; v_began timestamptz;
  v_ok text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  v_start := v_day::timestamp AT TIME ZONE s.timezone;

  FOR r IN
    SELECT t.person_id, t.full_name, t.mins_since_start,
           EXISTS (SELECT 1 FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.end_time IS NULL) AS running,
           (SELECT coalesce(sum(coalesce(e.duration_minutes, extract(epoch FROM (coalesce(e.end_time, p_now) - e.start_time)) / 60.0)), 0)
              FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.start_time >= v_start) AS tracked_min,
           (SELECT max(coalesce(e.end_time, p_now)) FROM agent_read.v_time_entries e WHERE e.employee_id = t.person_id AND e.start_time >= v_start) AS last_at
      FROM public.agent_team_today(p_now) t
     WHERE t.expects_work AND t.in_window AND coalesce(t.grp, '') <> 'placement' AND NOT t.exempt_time
  LOOP
    v_idle := CASE WHEN r.last_at IS NULL THEN r.mins_since_start ELSE extract(epoch FROM (p_now - r.last_at)) / 60.0 END;
    -- Someone who has already tracked about three quarters of a full work day is done for the day, not slacking.
    IF NOT r.running AND v_idle >= (CASE WHEN r.last_at IS NULL THEN 30 ELSE 45 END)
       AND NOT (r.last_at IS NOT NULL AND r.tracked_min >= 0.75 * extract(epoch FROM (s.default_work_end - s.default_work_start)) / 60.0) THEN
      v_sev := CASE WHEN v_idle >= 120 THEN 'high' ELSE 'medium' END;
      v_began := p_now - make_interval(secs => round(r.mins_since_start * 60)::double precision);
      v_why := CASE WHEN r.last_at IS NULL
                    THEN format('Their work day started at %s and nothing has been tracked %s minutes in.', public.agent_fmt_ts(v_began, s.timezone), round(r.mins_since_start))
                    ELSE format('Stopped tracking at %s, %s minutes ago. %s tracked today.', public.agent_fmt_ts(r.last_at, s.timezone), round(v_idle),
                                CASE WHEN r.tracked_min >= 60 THEN round(r.tracked_min / 60.0, 1) || ' hours' ELSE round(r.tracked_min) || ' minutes' END) END;
      IF public.agent_raise_flag('TR01', 'track', r.person_id, 'person', r.person_id::text, v_day::text, v_sev, 'Not tracking time', v_why,
           jsonb_build_object('tracked_minutes_today', round(r.tracked_min), 'last_tracked_at', r.last_at, 'idle_minutes', round(v_idle),
                              'work_started_at', v_began,
                              'window', to_char(s.default_work_start, 'HH24:MI') || '–' || to_char(s.default_work_end, 'HH24:MI') || ' ET'),
           'Ask them to start their timer in Track.', p_now) THEN v_created := v_created + 1; END IF;
    ELSE
      v_ok := v_ok || r.person_id::text;
    END IF;
  END LOOP;

  -- Closed by the agent: they started tracking, or they are on leave, or it is a day off.
  v_ok := v_ok || coalesce((SELECT array_agg(person_id::text) FROM public.agent_team_today(p_now) WHERE NOT expects_work), '{}');
  v_resolved := public.agent_resolve_flags('TR01', v_ok, v_day::text, p_now);
  -- Yesterday's "not tracking" no longer matters.
  WITH st AS (UPDATE public.agent_flags SET status = 'auto_resolved', updated_at = p_now
               WHERE rule_code = 'TR01' AND status IN ('open', 'snoozed') AND period_key < v_day::text RETURNING id)
  INSERT INTO public.agent_flag_events (flag_id, kind) SELECT id, 'auto_resolved' FROM st;
  RETURN jsonb_build_object('created', v_created, 'resolved', v_resolved);
END $$;

REVOKE ALL ON FUNCTION public.agent_rule_tr01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_tr01(timestamptz) TO service_role;

UPDATE public.agent_rules SET description = 'No timer 30 minutes after the person''s own work start (never started), or 45 minutes after it stopped. Raised the minute it applies.' WHERE code = 'TR01';
