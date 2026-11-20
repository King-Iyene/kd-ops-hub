-- Ops Agent: automatic messages in other tools (Cliq, Slack, email, webhooks ...) are about the TEAM only.
--
--   Tasks (TK), time tracking (TR) and daily reports (RP) are team items and are sent to a connection that ticked them, as before.
--   Everything else (system and scheduled-job problems, payroll, bank payments, loans, discipline and grievances, HR letters, performance,
--   contractors, setup gaps, "rule failed") stays in the Inbox for the Super Admin and Admins. It is never pushed to a channel on its own.
--   Follow-ups and escalations (FT01) are team items only, for the same reason.
--   A person can still send any item by hand from the Inbox.
--   Messages about those other items that were queued but not sent yet are cancelled.
--
-- Rollback: supabase/rollbacks/20261425_agent_team_focus_messages_down.sql

CREATE OR REPLACE FUNCTION public.agent_is_team_rule(p_code text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(p_code ~ '^(TK|TR|RP)[0-9]+$', false)
$$;
REVOKE ALL ON FUNCTION public.agent_is_team_rule(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_is_team_rule(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agent_outbox_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.item_type NOT IN ('flag', 'human_action') OR NEW.rule_code = 'TK14' OR NOT public.agent_is_team_rule(NEW.rule_code) THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION public.agent_run_followups(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; v_local timestamp; r record; v_id uuid; v_made integer := 0; v_stage1 timestamptz; v_mgr uuid; v_mgr_name text; v_person text;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('agent_run_followups')) THEN RETURN jsonb_build_object('skipped', true); END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  v_local := p_now AT TIME ZONE s.timezone;
  IF NOT public.agent_is_working_day(v_local::date) OR v_local::time < time '09:00' OR v_local::time >= time '17:30' THEN
    RETURN jsonb_build_object('made', 0, 'quiet', true);
  END IF;

  FOR r IN
    SELECT f.id, f.person_id, f.title,
           greatest(max(m.sent_at), max(o.sent_at)) AS told_at
      FROM public.agent_flags f
      LEFT JOIN public.agent_messages m ON m.flag_id = f.id AND m.status = 'sent'
      LEFT JOIN public.agent_outbox o ON o.kind = 'flag' AND o.ref_id = f.id AND o.status = 'sent'
     WHERE f.status = 'open' AND f.item_type = 'flag' AND f.person_id IS NOT NULL AND public.agent_sev_rank(f.severity) >= 3
       AND f.rule_code NOT IN ('TK08', 'TK13', 'TK14')
       AND public.agent_is_team_rule(f.rule_code)
     GROUP BY f.id
    HAVING greatest(max(m.sent_at), max(o.sent_at)) IS NOT NULL
     ORDER BY greatest(max(m.sent_at), max(o.sent_at))
     LIMIT 40
  LOOP
    EXIT WHEN v_made >= 10;
    SELECT fu.created_at INTO v_stage1 FROM public.agent_followups fu WHERE fu.flag_id = r.id AND fu.stage = 1;
    IF v_stage1 IS NULL THEN
      IF r.told_at <= p_now - interval '24 hours' THEN
        INSERT INTO public.agent_followups (flag_id, stage, created_at) VALUES (r.id, 1, p_now) ON CONFLICT DO NOTHING RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN
          INSERT INTO public.agent_flag_events (flag_id, kind, detail, created_at)
          VALUES (r.id, 'repeated', jsonb_build_object('note', 'Still open 24 hours after the message: the Agent followed up with the person.'), p_now);
        END IF;
      END IF;
    ELSIF v_stage1 <= p_now - interval '24 hours' AND NOT EXISTS (SELECT 1 FROM public.agent_followups fu WHERE fu.flag_id = r.id AND fu.stage = 2) THEN
      INSERT INTO public.agent_followups (flag_id, stage, created_at) VALUES (r.id, 2, p_now) ON CONFLICT DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_mgr := public.agent_manager_of(r.person_id);
        SELECT full_name INTO v_mgr_name FROM public.profiles WHERE id = v_mgr;
        INSERT INTO public.agent_flag_events (flag_id, kind, detail, created_at)
        VALUES (r.id, 'escalated', jsonb_build_object('note', CASE WHEN v_mgr_name IS NOT NULL
                  THEN format('Still open 2 days after the message: the Agent asked %s to step in.', v_mgr_name)
                  ELSE 'Still open 2 days after the message. The person has no manager set, so this needs a Super Admin.' END), p_now);
      END IF;
    END IF;

    IF v_id IS NOT NULL THEN
      v_made := v_made + 1;
      INSERT INTO public.agent_outbox (connection_id, kind, ref_id)
      SELECT cid, 'followup', v_id FROM (
        SELECT o.connection_id AS cid FROM public.agent_outbox o WHERE o.kind = 'flag' AND o.ref_id = r.id AND o.status = 'sent'
        UNION
        SELECT c.id FROM public.agent_connections c WHERE coalesce(c.config -> 'events', '[]'::jsonb) ? 'flag_followup'
      ) q ON CONFLICT DO NOTHING;
      v_id := NULL;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('made', v_made);
END $$;

-- Cancel what is still waiting to be sent about anything that is not a team item (a retry never sends it either).
UPDATE public.agent_outbox o SET status = 'failed', error = 'Not a team item: it stays in the Inbox.'
 WHERE o.status = 'pending' AND o.kind IN ('flag', 'followup')
   AND NOT public.agent_is_team_rule(
         CASE o.kind WHEN 'flag' THEN (SELECT f.rule_code FROM public.agent_flags f WHERE f.id = o.ref_id)
                     ELSE (SELECT f.rule_code FROM public.agent_followups fu JOIN public.agent_flags f ON f.id = fu.flag_id WHERE fu.id = o.ref_id) END);
