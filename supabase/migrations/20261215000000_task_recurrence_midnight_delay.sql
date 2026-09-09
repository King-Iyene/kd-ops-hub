-- Change of behaviour: the next occurrence of a recurring task is no
-- longer created the instant it's completed — it now waits until 12am
-- (midnight WAT) the following day. Completing a task just stashes the
-- computed next-cadence due date on it; a nightly cron job then creates
-- the actual next task for every completion that's waiting.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_spawned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tasks.recurrence_spawned IS
  'True once the next occurrence has been created for this completion. Reset to false whenever the task leaves the complete status, so reopening + re-completing schedules a fresh occurrence.';

-- ── 1. On completion: compute and stash the next due date only ─────────
-- Replaces the previous version of this trigger function, which created
-- the next task immediately (20261214000000_task_recurrence_auto_create.sql).
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
    -- Cadence is anchored to the task's own due date (falling back to
    -- today only when it never had one), never to the completion
    -- timestamp — so a task finished late still schedules its next
    -- occurrence on the original cadence, not "next cadence from today".
    v_from := COALESCE(OLD.due_date, CURRENT_DATE);
    NEW.recurrence_next := public.task_recurrence_next_date(NEW.recurrence_rule, v_from);
    NEW.recurrence_spawned := false;
  ELSIF NEW.status IS DISTINCT FROM 'complete' AND OLD.status = 'complete' THEN
    -- Reopened before the nightly job ran — cancel the pending occurrence;
    -- a future re-completion will compute and stash a fresh one.
    NEW.recurrence_next := NULL;
    NEW.recurrence_spawned := false;
  END IF;

  RETURN NEW;
END;
$$;

-- Needs to run BEFORE UPDATE now (it edits NEW instead of inserting a row).
DROP TRIGGER IF EXISTS trg_task_recurrence_on_complete ON public.tasks;
CREATE TRIGGER trg_task_recurrence_on_complete
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_task_recurrence_on_complete();

-- ── 2. Nightly job: spawn the next occurrence for every stashed one ─────
CREATE OR REPLACE FUNCTION public.process_task_recurrence_creation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
  SET recurrence_spawned = true
  WHERE t.status = 'complete'
    AND t.recurrence_rule IS NOT NULL
    AND t.recurrence_next IS NOT NULL
    AND t.recurrence_spawned = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_task_recurrence_creation() TO authenticated;

COMMENT ON FUNCTION public.process_task_recurrence_creation IS
  'Nightly (midnight WAT): creates the next occurrence for every recurring task completed since the last run.';

-- ── 3. Schedule via pg_cron — daily at 00:00 WAT (23:00 UTC) ────────────
SELECT cron.unschedule('kdops_task_recurrence_creation')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_task_recurrence_creation');

SELECT cron.schedule(
  'kdops_task_recurrence_creation',
  '0 23 * * *',                -- 23:00 UTC = 00:00 WAT (Nigeria, UTC+1)
  $$SELECT public.process_task_recurrence_creation()$$
);
