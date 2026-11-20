-- Ops Agent: "not tracking" builds on the Inbox card through the day, and the agent's standing instructions make it an operational lead.
--
--   1. TR01 "Not tracking time": the first notice is unchanged. While the person is still not tracking, the SAME Inbox card is updated
--      (never a second card) and says it plainly: "Cara Obi still isn't tracking, and it's 1:15 PM EST. First noticed at 9:30 AM EST."
--      The card's history gets a "Checked again" line about once an hour, and a line when it becomes high priority. A person who tracked
--      and then stopped again reads "Cara Obi stopped tracking again". Nothing is added to a card that was handled, dismissed or snoozed.
--   2. Operating rules: an "Operational lead" section is added to the end of the rules a Super Admin edits in Settings (once; their own
--      edits to the rest are kept, and if they delete the section it is not put back).
--
-- Rollback: supabase/rollbacks/20261420_agent_operational_lead_down.sql.

CREATE OR REPLACE FUNCTION public.agent_fmt_span(p_min numeric)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN m >= 60 THEN (m / 60)::text || ' h ' || (m % 60)::text || ' min' ELSE m::text || ' min' END
    FROM (SELECT greatest(round(coalesce(p_min, 0))::int, 0) AS m) x
$$;
REVOKE ALL ON FUNCTION public.agent_fmt_span(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_fmt_span(numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agent_rule_tr01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_day date; v_start timestamptz; r record; v_idle numeric; v_sev text; v_why text; v_began timestamptz;
  v_prev record; v_has boolean; v_build boolean; v_after text; v_last timestamptz; v_title text; v_since numeric; v_tracked text; v_now_txt text;
  v_ok text[] := '{}'; v_created integer := 0; v_resolved integer := 0;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_day := (p_now AT TIME ZONE s.timezone)::date;
  v_start := v_day::timestamp AT TIME ZONE s.timezone;
  v_now_txt := public.agent_fmt_ts(p_now, s.timezone);

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
      v_tracked := CASE WHEN r.tracked_min >= 60 THEN round(r.tracked_min / 60.0, 1) || ' hours' ELSE round(r.tracked_min) || ' minutes' END;

      -- Has this person already been raised today? Then this card is built on, not repeated.
      SELECT f.id, f.status, f.severity, f.first_seen_at INTO v_prev FROM public.agent_flags f
       WHERE f.rule_code = 'TR01' AND f.subject_type = 'person' AND f.subject_id = r.person_id::text AND f.period_key = v_day::text;
      v_has := FOUND;
      v_since := CASE WHEN v_has THEN greatest(extract(epoch FROM (p_now - v_prev.first_seen_at)) / 60.0, 0) ELSE 0 END;

      -- The first notice reads as before; the build-up wording starts once it has been open for a while (not on the next minute's run).
      v_build := v_has AND (v_since >= 15 OR (r.last_at IS NOT NULL AND r.last_at > v_prev.first_seen_at));
      IF NOT v_build THEN
        v_title := 'Not tracking time';
        v_why := CASE WHEN r.last_at IS NULL
                      THEN format('Their work day started at %s and nothing has been tracked %s minutes in.', public.agent_fmt_ts(v_began, s.timezone), round(r.mins_since_start))
                      ELSE format('Stopped tracking at %s, %s minutes ago. %s tracked today.', public.agent_fmt_ts(r.last_at, s.timezone), round(v_idle), v_tracked) END;
      ELSE
        v_title := 'Still not tracking time';
        v_why := CASE
          WHEN r.last_at IS NOT NULL AND r.last_at > v_prev.first_seen_at THEN
            format('%s stopped tracking again, and it''s %s. Last tracked at %s (%s ago), %s tracked today.', r.full_name, v_now_txt,
                   public.agent_fmt_ts(r.last_at, s.timezone), public.agent_fmt_span(v_idle), v_tracked)
          WHEN r.last_at IS NULL THEN
            format('%s still isn''t tracking, and it''s %s. Their work day started at %s and nothing has been tracked yet. First noticed at %s, %s ago.',
                   r.full_name, v_now_txt, public.agent_fmt_ts(v_began, s.timezone), public.agent_fmt_ts(v_prev.first_seen_at, s.timezone), public.agent_fmt_span(v_since))
          ELSE
            format('%s still isn''t tracking, and it''s %s. Last tracked at %s (%s ago), %s tracked today. First noticed at %s, %s ago.',
                   r.full_name, v_now_txt, public.agent_fmt_ts(r.last_at, s.timezone), public.agent_fmt_span(v_idle), v_tracked,
                   public.agent_fmt_ts(v_prev.first_seen_at, s.timezone), public.agent_fmt_span(v_since)) END;
      END IF;

      IF public.agent_raise_flag('TR01', 'track', r.person_id, 'person', r.person_id::text, v_day::text, v_sev, v_title, v_why,
           jsonb_build_object('tracked_minutes_today', round(r.tracked_min), 'last_tracked_at', r.last_at, 'idle_minutes', round(v_idle),
                              'work_started_at', v_began, 'first_noticed_at', CASE WHEN v_has THEN v_prev.first_seen_at ELSE p_now END,
                              'window', to_char(s.default_work_start, 'HH24:MI') || '–' || to_char(s.default_work_end, 'HH24:MI') || ' ET'),
           'Ask them to start their timer in Track.', p_now) THEN v_created := v_created + 1; END IF;

      -- The card's history: a line about once an hour while it stays open, and one when it becomes high priority.
      IF v_build THEN
        SELECT f.status INTO v_after FROM public.agent_flags f WHERE f.id = v_prev.id;
        IF v_after = 'open' AND v_prev.status <> 'auto_resolved' THEN
          IF v_prev.severity <> 'high' AND v_sev = 'high' THEN
            INSERT INTO public.agent_flag_events (flag_id, kind, detail, created_at)
            VALUES (v_prev.id, 'escalated', jsonb_build_object('note', format('Still not tracking at %s: now high priority.', v_now_txt)), p_now);
          END IF;
          SELECT max(e.created_at) INTO v_last FROM public.agent_flag_events e
           WHERE e.flag_id = v_prev.id AND e.kind IN ('created', 'reopened', 'repeated', 'escalated');
          IF v_last IS NULL OR v_last <= p_now - interval '60 minutes' THEN
            INSERT INTO public.agent_flag_events (flag_id, kind, detail, created_at)
            VALUES (v_prev.id, 'repeated', jsonb_build_object('note', format('Still not tracking at %s (%s since first noticed).', v_now_txt, public.agent_fmt_span(v_since))), p_now);
          END IF;
        END IF;
      END IF;
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

UPDATE public.agent_rules SET description = 'No timer 30 minutes after the person''s own work start (never started), or 45 minutes after it stopped. Raised the minute it applies, then the same Inbox card is updated through the day ("still isn''t tracking, and it''s 1:15 PM") until they track.' WHERE code = 'TR01';

-- ── Operating rules: the operational lead section (added once) ──────────────
UPDATE public.agent_settings
   SET operating_rules = btrim(operating_rules, E'\n') || E'\n\n' || $rules$## Operational lead
You are the operational lead of the group. Run it the way a seasoned COO runs a business that turns over millions a year: nothing is allowed to fall through the cracks, and every issue ends with an owner, a next step and a time.
- Follow through. If something was raised before and is still open, say so, say how long it has been open and raise the level; do not repeat the first message. ("Cara still isn't tracking, and it's 1:15 PM EST.")
- Put money, clients and deadlines first (client work, overdue tasks, missed daily reports, unapproved time), then team habits. When asked, say what matters most today.
- Every item has an owner, a next step and a deadline. If you cannot tell who owns it, say so and propose who should.
- Look for patterns across people, days and companies (the same person again, the same blocker across a team, a manager whose team keeps slipping) and name them with the evidence.
- Read the context before raising anything: leave, holidays, part days, placement staff, people who are done for the day. Do not chase someone who is covered, and never create noise.
- Escalate in order: the person, then their manager, then HR, and say when the next step is due. Consequences are only ever a recommendation.
- Be brief and plain: the fact, the fix, the deadline. No blame and no judging a person.
- When you do not know, say what you checked and what you need. Never invent.
- Close the loop. Note when something clears, and at the end of the day say what is still open and who has it.
$rules$
 WHERE id AND position('## Operational lead' IN operating_rules) = 0;
