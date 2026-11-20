-- Ops Agent: a due date that is moved is flagged wherever it happens.
--
-- TK02 used to look only at top-level tasks whose assignee is on the team and not in the Leadership or Placement groups.
-- A date changed on a subtask, on a task nobody is assigned to, or on a task owned by someone in those groups was never seen.
-- Now every change of an existing due date (moved to another day, or removed) is flagged, on any task and any subtask whose
-- owner is a KD Squares team member or nobody. The first time a date is set is still fine.
--
-- Several edits to the same task on the same day are ONE item: from the first date it had that day to the date it ended on
-- (moved and put back is not an item). A new day is a new item.
--
-- agent_due_date_audit(hours) answers "why was this change not flagged": counts only, Super Admin only.
--
-- Rollback: re-apply agent_rule_tk02 from 20261410000100_agent_monitor.sql and DROP FUNCTION public.agent_due_date_audit(integer).

CREATE OR REPLACE FUNCTION public.agent_rule_tk02(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.agent_settings%ROWTYPE; r record; v_created integer := 0; v_to text; v_from text; v_who text;
BEGIN
  SELECT * INTO s FROM public.agent_settings WHERE id;
  FOR r IN
    WITH ch AS (
      SELECT a.task_id, a.actor_id, a.created_at, a.detail ->> 'from' AS f, a.detail ->> 'to' AS t,
             (a.created_at AT TIME ZONE s.timezone)::date AS d
        FROM public.tm_task_activity a
       WHERE a.kind = 'due_date' AND a.created_at >= p_now - interval '36 hours' AND a.created_at <= p_now
         AND jsonb_typeof(a.detail -> 'from') IS DISTINCT FROM 'null' AND a.detail ? 'from'
         AND (a.detail ->> 'from') IS DISTINCT FROM (a.detail ->> 'to')
    ), g AS (
      SELECT c.task_id, c.d, count(*) AS n,
             (array_agg(c.f ORDER BY c.created_at ASC))[1] AS first_from,
             (array_agg(c.t ORDER BY c.created_at DESC))[1] AS last_to,
             (array_agg(c.actor_id ORDER BY c.created_at DESC))[1] AS actor
        FROM ch c GROUP BY c.task_id, c.d
    )
    SELECT g.task_id, g.d, g.n, g.first_from, g.last_to, t.title, t.assignee_id, t.parent_id,
           (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = g.actor) AS by_name,
           (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = t.assignee_id) AS owner_name
      FROM g JOIN public.tm_tasks t ON t.id = g.task_id
     WHERE g.first_from IS DISTINCT FROM g.last_to
       AND (t.assignee_id IS NULL OR EXISTS (SELECT 1 FROM public.agent_team_v tm WHERE tm.person_id = t.assignee_id))
  LOOP
    v_from := to_char(r.first_from::date, 'Mon FMDD'); v_to := CASE WHEN r.last_to IS NULL THEN NULL ELSE to_char(r.last_to::date, 'Mon FMDD') END;
    v_who := coalesce(r.by_name, 'Someone');
    IF public.agent_raise_flag('TK02', 'task', r.assignee_id, 'task', r.task_id::text, r.d::text, 'high',
         'Due date moved: ' || left(r.title, 120),
         CASE WHEN v_to IS NULL THEN format('%s removed the due date (it was %s).', v_who, v_from)
              ELSE format('%s changed the due date from %s to %s.', v_who, v_from, v_to) END
           || CASE WHEN r.n > 1 THEN format(' %s changes today.', r.n) ELSE '' END
           || CASE WHEN r.assignee_id IS NULL THEN ' The task has no assignee.' WHEN r.parent_id IS NOT NULL THEN ' It is a subtask.' ELSE '' END,
         jsonb_build_object('task_id', r.task_id, 'task_title', r.title, 'from', r.first_from, 'to', r.last_to, 'by_name', r.by_name,
                            'changes', r.n, 'owner_name', r.owner_name, 'subtask', r.parent_id IS NOT NULL),
         'Due dates are not moved. If work slipped, it goes in a comment.', p_now) THEN v_created := v_created + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('created', v_created, 'resolved', 0);
END $$;

-- Why a date change was or was not flagged: counts only.
CREATE OR REPLACE FUNCTION public.agent_due_date_audit(p_hours integer DEFAULT 72)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.agent_settings%ROWTYPE; v_since timestamptz := now() - make_interval(hours => least(greatest(coalesce(p_hours, 72), 1), 720));
BEGIN
  IF NOT public.agent_can_configure() THEN RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.agent_settings WHERE id;
  RETURN (
    WITH ch AS (
      SELECT a.id, a.task_id, a.detail, t.parent_id, t.assignee_id,
             EXISTS (SELECT 1 FROM public.agent_team_v tm WHERE tm.person_id = t.assignee_id) AS on_team
        FROM public.tm_task_activity a LEFT JOIN public.tm_tasks t ON t.id = a.task_id
       WHERE a.kind = 'due_date' AND a.created_at >= v_since
    )
    SELECT jsonb_build_object(
      'hours', least(greatest(coalesce(p_hours, 72), 1), 720),
      'rule_enabled', coalesce((SELECT enabled FROM public.agent_rules WHERE code = 'TK02'), false),
      'date_activity_rows', count(*),
      'first_time_set', count(*) FILTER (WHERE jsonb_typeof(detail -> 'from') IS NOT DISTINCT FROM 'null' OR NOT (detail ? 'from')),
      'moved_or_removed', count(*) FILTER (WHERE detail ? 'from' AND jsonb_typeof(detail -> 'from') <> 'null' AND (detail ->> 'from') IS DISTINCT FROM (detail ->> 'to')),
      'moved_on_subtasks', count(*) FILTER (WHERE detail ? 'from' AND jsonb_typeof(detail -> 'from') <> 'null' AND parent_id IS NOT NULL),
      'moved_unassigned', count(*) FILTER (WHERE detail ? 'from' AND jsonb_typeof(detail -> 'from') <> 'null' AND assignee_id IS NULL),
      'moved_owner_not_on_team', count(*) FILTER (WHERE detail ? 'from' AND jsonb_typeof(detail -> 'from') <> 'null' AND assignee_id IS NOT NULL AND NOT on_team),
      'tk02_items_in_window', (SELECT count(*) FROM public.agent_flags f WHERE f.rule_code = 'TK02' AND f.first_seen_at >= v_since)
    ) FROM ch);
END $$;

REVOKE ALL ON FUNCTION public.agent_due_date_audit(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_due_date_audit(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.agent_rule_tk02(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_rule_tk02(timestamptz) TO service_role;
