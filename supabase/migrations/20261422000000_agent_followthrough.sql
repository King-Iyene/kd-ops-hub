-- Ops Agent: follow-through. A message went out about an Inbox item and nothing changed: the Agent follows up, then hands it to the manager.
--
--   Stage 1: 24 hours after the person was last told (an automatic message to a connection, or a message sent from the Inbox) and the item
--            is still open, the Agent follows up with the person (their manager copied, as for any message), and the item's history says so.
--   Stage 2: 24 hours after the follow-up and still open, the Agent asks the person's manager to step in (the history says who).
--   Only items about a person, medium priority or higher; never review items (TK08, TK13) or completions (TK14). Each stage happens once per
--   item. Follow-ups are made on working days between 9:00 AM and 5:30 PM Eastern, so nobody is pinged overnight or on a day off.
--   Delivery goes to the same connections the item was first sent to, plus any connection that ticked "Follow-ups and escalations" (flag_followup).
--   The history line is always written, even when no connection is set up.
--
-- Rollback: supabase/rollbacks/20261422_agent_followthrough_down.sql

CREATE TABLE IF NOT EXISTS public.agent_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id uuid NOT NULL REFERENCES public.agent_flags(id) ON DELETE CASCADE,
  stage smallint NOT NULL CHECK (stage IN (1, 2)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flag_id, stage)
);
ALTER TABLE public.agent_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_followups FROM anon, authenticated;
GRANT SELECT ON public.agent_followups TO authenticated;
GRANT ALL ON public.agent_followups TO service_role;
DROP POLICY IF EXISTS agent_followups_select ON public.agent_followups;
CREATE POLICY agent_followups_select ON public.agent_followups FOR SELECT TO authenticated USING (public.agent_can_access());

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.agent_outbox'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%kind%' LOOP
    EXECUTE format('ALTER TABLE public.agent_outbox DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.agent_outbox ADD CONSTRAINT agent_outbox_kind_check CHECK (kind IN ('flag', 'summary', 'record', 'followup'));

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
REVOKE ALL ON FUNCTION public.agent_run_followups(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_run_followups(timestamptz) TO service_role;

-- A rule like any other (so Settings can switch it off, and a failure shows as "Rule failed" in the Inbox). The monitor runs it every minute.
CREATE OR REPLACE FUNCTION public.agent_rule_ft01(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  v := public.agent_run_followups(p_now);
  RETURN jsonb_build_object('created', coalesce((v ->> 'made')::integer, 0), 'resolved', 0);
END $$;
REVOKE ALL ON FUNCTION public.agent_rule_ft01(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_ft01(timestamptz) TO service_role;

INSERT INTO public.agent_rules (code, module_key, title, description, enabled, severity, params, status) VALUES
  ('FT01', NULL, 'Follow-through', 'A message went out about an item and 24 hours later it is still open: the Agent follows up with the person; 24 hours after that it asks their manager to step in. Medium priority and above, items about a person, working days 9:00 AM to 5:30 PM Eastern.', true, 'info', '{}', 'ready')
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, status = 'ready';
