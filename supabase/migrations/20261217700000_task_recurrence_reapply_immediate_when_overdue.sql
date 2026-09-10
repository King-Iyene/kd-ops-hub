-- The rename in 20261217500000 (fixing a duplicate-version collision)
-- accidentally flipped execution order: it now runs AFTER
-- 20261217300000_task_recurrence_immediate_when_overdue.sql and
-- redefines the same function, silently reverting completion of an
-- overdue recurring task back to "always wait for the nightly sweep" —
-- undoing that fix without anyone touching its logic directly.
-- Re-apply the correct, final version here so it's guaranteed to be
-- whichever migration actually runs last.

CREATE OR REPLACE FUNCTION public.handle_task_recurrence_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_next date;
BEGIN
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' AND NEW.recurrence_rule IS NOT NULL THEN
    v_from := COALESCE(OLD.due_date, CURRENT_DATE);
    IF NEW.recurrence_last_spawned_due IS DISTINCT FROM v_from THEN
      v_next := public.task_recurrence_next_date(NEW.recurrence_rule, v_from);

      IF v_next IS NOT NULL AND v_next <= CURRENT_DATE THEN
        -- The next occurrence is already due (or overdue) — don't make it
        -- wait for tonight's sweep, create it right now.
        INSERT INTO public.tasks (
          title, description, assignee_id, due_date, priority, status,
          created_by, tags, parent_id, project_id, list_id, sort_order,
          start_date, time_estimate_minutes, time_spent_minutes, task_type,
          goal_id, recurrence_rule, recurrence_next, template_id
        ) VALUES (
          NEW.title, NEW.description, NEW.assignee_id, v_next, NEW.priority, 'open',
          NEW.created_by, NEW.tags, NEW.parent_id, NEW.project_id, NEW.list_id, NEW.sort_order,
          NEW.start_date, NEW.time_estimate_minutes, 0, NEW.task_type,
          NEW.goal_id, NEW.recurrence_rule, v_next, NEW.template_id
        );
        NEW.recurrence_next := v_next;
        NEW.recurrence_spawned := true;
        NEW.recurrence_last_spawned_due := v_from;
      ELSE
        -- Next occurrence is still in the future (the normal case) — just
        -- stash it; the nightly sweep creates it once midnight WAT passes.
        NEW.recurrence_next := v_next;
        NEW.recurrence_spawned := false;
      END IF;
    END IF;
    -- else: already spawned an occurrence for this due date (via the
    -- overdue-while-open nightly sweep) — completing it now doesn't spawn again.
  ELSIF NEW.status IS DISTINCT FROM 'complete' AND OLD.status = 'complete' THEN
    -- Reopened before anything spawned — cancel the pending occurrence;
    -- a future re-completion (of this same due date) recomputes one,
    -- guarded by the check above against whatever was already spawned.
    NEW.recurrence_next := NULL;
    NEW.recurrence_spawned := false;
  END IF;

  RETURN NEW;
END;
$$;
