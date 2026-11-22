-- Ops Agent: only the daily, weekly and monthly summaries go out on their own. Everything else stays in the Inbox and is sent by a person
-- with the Send button (the Inbox draft, with the manager copied and people tagged, as before).
--
--   * New items (tasks, time tracking, daily reports) are no longer queued for Cliq or any other tool. agent_outbox_flag() does nothing.
--   * Follow-ups and escalations (24 hours and 2 days after a message) are still worked out and shown on the item, but are no longer sent.
--   * Existing connections lose the item events (flag_high, flag_tracking, flag_all, flag_followup). Any connection that had them, or the
--     daily summary, now gets the daily, weekly and monthly summaries. A weekly scorecard stays as it was set.
--   * Messages about items that were queued but not sent yet are cancelled.
--   * Messages from a table's connection rules (Task module) are separate and unchanged.
--
-- Rollback: re-apply agent_outbox_flag and agent_run_followups from 20261425000000_agent_team_focus_messages.sql and re-add the events you want.

CREATE OR REPLACE FUNCTION public.agent_outbox_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN NEW;   -- items are sent by hand from the Inbox, never on their own
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
          VALUES (r.id, 'repeated', jsonb_build_object('note', 'Still open 24 hours after the message: time to follow up with the person.'), p_now);
        END IF;
      END IF;
    ELSIF v_stage1 <= p_now - interval '24 hours' AND NOT EXISTS (SELECT 1 FROM public.agent_followups fu WHERE fu.flag_id = r.id AND fu.stage = 2) THEN
      INSERT INTO public.agent_followups (flag_id, stage, created_at) VALUES (r.id, 2, p_now) ON CONFLICT DO NOTHING RETURNING id INTO v_id;
      IF v_id IS NOT NULL THEN
        v_mgr := public.agent_manager_of(r.person_id);
        SELECT full_name INTO v_mgr_name FROM public.profiles WHERE id = v_mgr;
        INSERT INTO public.agent_flag_events (flag_id, kind, detail, created_at)
        VALUES (r.id, 'escalated', jsonb_build_object('note', CASE WHEN v_mgr_name IS NOT NULL
                  THEN format('Still open 2 days after the message: %s should step in.', v_mgr_name)
                  ELSE 'Still open 2 days after the message. The person has no manager set, so this needs a Super Admin.' END), p_now);
      END IF;
    END IF;

    IF v_id IS NOT NULL THEN
      v_made := v_made + 1;
      -- nothing is sent on its own: the Inbox card shows the follow-up is due, and a person sends it with the button
      v_id := NULL;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('made', v_made);
END $$;

-- Nothing about an item is waiting to be sent on its own any more.
UPDATE public.agent_outbox SET status = 'failed', error = 'Items are sent by hand from the Inbox.'
 WHERE status = 'pending' AND kind IN ('flag', 'followup');

-- Connections: drop the item events, and make sure the three summaries are on for any connection that was getting items or the daily summary.
UPDATE public.agent_connections c
   SET config = jsonb_set(c.config, '{events}', (
         SELECT coalesce(jsonb_agg(DISTINCT q.e), '[]'::jsonb) FROM (
           SELECT x AS e FROM jsonb_array_elements_text(coalesce(c.config -> 'events', '[]'::jsonb)) x WHERE x NOT LIKE 'flag\_%'
           UNION SELECT 'summary_day' UNION SELECT 'summary_week' UNION SELECT 'summary_month'
         ) q))
 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(c.config -> 'events', '[]'::jsonb)) x WHERE x LIKE 'flag\_%' OR x = 'summary_day');
