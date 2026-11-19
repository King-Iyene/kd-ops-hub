-- Ops Agent v2: Inbox actions. Handle, snooze, dismiss or reopen an item the signed in person is allowed to see.
-- The agent still never changes a business record; this only changes the state of its own Inbox item.
--
-- Rollback: supabase/rollbacks/20261409_agent_v2_down.sql

CREATE OR REPLACE FUNCTION public.agent_flag_set_status(p_id uuid, p_status text, p_note text DEFAULT NULL, p_snooze_until timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE f public.agent_flags%ROWTYPE; v_note text := nullif(btrim(left(p_note, 1000)), '');
BEGIN
  IF NOT public.agent_can_access() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  IF p_status NOT IN ('open', 'snoozed', 'handled', 'dismissed') THEN RAISE EXCEPTION 'bad_status'; END IF;
  SELECT * INTO f FROM public.agent_flags WHERE id = p_id;
  -- A missing item and an item out of scope look the same, so existence is not revealed.
  IF NOT FOUND OR NOT public.agent_in_scope(f.company_id, f.module, f.person_id) THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;

  UPDATE public.agent_flags SET
    status = p_status,
    snoozed_until = CASE WHEN p_status = 'snoozed' THEN coalesce(p_snooze_until, now() + interval '1 day') ELSE NULL END,
    handled_by = CASE WHEN p_status IN ('handled', 'dismissed') THEN auth.uid() ELSE NULL END,
    handled_at = CASE WHEN p_status IN ('handled', 'dismissed') THEN now() ELSE NULL END,
    resolution_note = CASE WHEN p_status IN ('handled', 'dismissed') THEN v_note ELSE NULL END,
    dismiss_reason = CASE WHEN p_status = 'dismissed' THEN 'other' ELSE NULL END,
    updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.agent_flag_events (flag_id, kind, actor_id, detail)
  VALUES (p_id, CASE p_status WHEN 'open' THEN 'reopened' WHEN 'snoozed' THEN 'snoozed' WHEN 'handled' THEN 'handled' ELSE 'dismissed' END,
          auth.uid(), jsonb_strip_nulls(jsonb_build_object('note', v_note, 'until', CASE WHEN p_status = 'snoozed' THEN coalesce(p_snooze_until, now() + interval '1 day') END)));
END $$;
REVOKE ALL ON FUNCTION public.agent_flag_set_status(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_flag_set_status(uuid, text, text, timestamptz) TO authenticated;
