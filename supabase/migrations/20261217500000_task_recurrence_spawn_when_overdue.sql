-- A recurring task that's still open when its next cadence arrives should
-- NOT block the series: the old task stays exactly as it is (open/blocked/
-- in_progress, with its original due date — so it reads as overdue,
-- same as any other task) while the next occurrence is created anyway,
-- on schedule. Previously the next occurrence only ever got created on
-- completion, so an unclosed recurring task silently stalled the whole
-- series until someone closed it.

-- Tracks exactly which due date a recurrence has already spawned its next
-- occurrence for — needed because a task can now spawn while still open
-- (overdue path) and later still get completed; without this, completing
-- it afterwards would recompute and spawn a second, duplicate occurrence
-- for the same due date.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_last_spawned_due date;

COMMENT ON COLUMN public.tasks.recurrence_last_spawned_due IS
  'The due_date value this task last spawned its next occurrence for (via completion or the overdue nightly sweep) — prevents spawning twice for the same occurrence.';

-- ── 1. On completion: skip if this due date already spawned overdue ────
CREATE OR REPLACE FUNCTION public.handle_task_recurrence_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
BEGIN
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' AND NEW.recurrence_rule IS NOT NULL THEN
    v_from := COALESCE(OLD.due_date, CURRENT_DATE);
    IF NEW.recurrence_last_spawned_due IS DISTINCT FROM v_from THEN
      -- Cadence is anchored to the task's own due date (falling back to
      -- today only when it never had one), never to the completion
      -- timestamp — so a task finished late still schedules its next
      -- occurrence on the original cadence, not "next cadence from today".
      NEW.recurrence_next := public.task_recurrence_next_date(NEW.recurrence_rule, v_from);
      NEW.recurrence_spawned := false;
    END IF;
    -- else: the nightly sweep already spawned the next occurrence for this
    -- due date while it was overdue — completing it now doesn't spawn again.
  ELSIF NEW.status IS DISTINCT FROM 'complete' AND OLD.status = 'complete' THEN
    -- Reopened before the nightly job ran — cancel the pending occurrence;
    -- a future re-completion (of this same due date) will recompute one,
    -- guarded by the check above against whatever was already spawned.
    NEW.recurrence_next := NULL;
    NEW.recurrence_spawned := false;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Nightly job: spawn completions AND overdue-but-still-open tasks ──
CREATE OR REPLACE FUNCTION public.process_task_recurrence_creation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Case A — completed, with a next date already stashed by the trigger.
  INSERT INTO public.tasks (
    title, description, assignee_id, due_date, priority, status,
    created_by, tags, parent_id, project_id, list_id, sort_order,
    start_date, time_estimate_minutes, time_spent_minutes, task_type,
    goal_id, recurrence_rule, recurrence_next, template_id
  )
  SELECT
    t.title, t.description, t.assignee_id, t.recurrence_next, t.priority, 'open',
    t.created_by, t.tags, t.parent_id, t.project_id, t.list_id, t.sort_order,
    t.start_date, t.time_estimate_minutes, 0, t.task_type,
    t.goal_id, t.recurrence_rule, t.recurrence_next, t.template_id
  FROM public.tasks t
  WHERE t.status = 'complete'
    AND t.recurrence_rule IS NOT NULL
    AND t.recurrence_next IS NOT NULL
    AND t.recurrence_spawned = false;

  UPDATE public.tasks t
  SET recurrence_spawned = true, recurrence_last_spawned_due = t.due_date
  WHERE t.status = 'complete'
    AND t.recurrence_rule IS NOT NULL
    AND t.recurrence_next IS NOT NULL
    AND t.recurrence_spawned = false;

  -- Case B — still open (or in_progress/blocked) past its due date: the
  -- series keeps going on schedule regardless. The old task is untouched
  -- (same status, same due_date, so it shows as overdue like any other
  -- task) — only a fresh next occurrence gets created alongside it.
  WITH overdue_open AS (
    SELECT t.*, public.task_recurrence_next_date(t.recurrence_rule, t.due_date) AS next_due
    FROM public.tasks t
    WHERE t.status <> 'complete'
      AND t.recurrence_rule IS NOT NULL
      AND t.due_date IS NOT NULL
      AND t.due_date < CURRENT_DATE
      AND (t.recurrence_last_spawned_due IS NULL OR t.recurrence_last_spawned_due <> t.due_date)
  )
  INSERT INTO public.tasks (
    title, description, assignee_id, due_date, priority, status,
    created_by, tags, parent_id, project_id, list_id, sort_order,
    start_date, time_estimate_minutes, time_spent_minutes, task_type,
    goal_id, recurrence_rule, recurrence_next, template_id
  )
  SELECT
    o.title, o.description, o.assignee_id, o.next_due, o.priority, 'open',
    o.created_by, o.tags, o.parent_id, o.project_id, o.list_id, o.sort_order,
    o.start_date, o.time_estimate_minutes, 0, o.task_type,
    o.goal_id, o.recurrence_rule, o.next_due, o.template_id
  FROM overdue_open o
  WHERE o.next_due IS NOT NULL;

  UPDATE public.tasks t
  SET recurrence_last_spawned_due = t.due_date,
      recurrence_spawned = true,
      recurrence_next = public.task_recurrence_next_date(t.recurrence_rule, t.due_date)
  WHERE t.status <> 'complete'
    AND t.recurrence_rule IS NOT NULL
    AND t.due_date IS NOT NULL
    AND t.due_date < CURRENT_DATE
    AND (t.recurrence_last_spawned_due IS NULL OR t.recurrence_last_spawned_due <> t.due_date)
    AND public.task_recurrence_next_date(t.recurrence_rule, t.due_date) IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.process_task_recurrence_creation IS
  'Nightly (midnight WAT): creates the next occurrence for every recurring task completed since the last run, AND for every recurring task still open past its due date (the old task stays put, overdue, and the series keeps going on schedule).';
