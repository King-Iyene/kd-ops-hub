-- =============================================================================
-- Task module PRD — Phase 6: activity-log scoping, assignment/comment
-- notifications, and basic task search.
--
-- 1. task_activity (20261009000000) has been USING(true) since it was
--    created — anyone signed in could read every task's audit trail,
--    including tasks inside a private space. Rescope it the same way
--    Phase 1 rescoped everything else in this module: can_access_task.
--
-- 2. Real-time notifications (NTF-01 to NTF-21) for the two events that
--    don't need a scheduled job: being assigned to a task, and a comment
--    landing on a task you're watching. Both fire into the existing
--    app-wide public.notifications table (already realtime-enabled).
--
--    JOB-01 to JOB-03 (due-soon hourly, overdue daily, digest daily,
--    orphan file sweep) need a recurring trigger; pg_cron is noted
--    elsewhere in this history as "not available" in this project, so
--    those batch jobs need a scheduled GitHub Actions workflow calling an
--    edge function, not a DB migration — left as a flagged follow-up,
--    not attempted here.
--
-- 3. SRCH-04: a basic full-text search column over task title+description,
--    so the Tasks module can be searched at all. Scoped the same way reads
--    already are — search is just a filter on top of the existing
--    can_access_task-gated tasks_select policy, so no RLS change needed.
-- =============================================================================

-- ── 1. Scope task_activity reads to can_access_task ────────────────────────
DROP POLICY IF EXISTS "task_activity_authenticated" ON public.task_activity;

DROP POLICY IF EXISTS "task_activity_select" ON public.task_activity;
CREATE POLICY "task_activity_select" ON public.task_activity
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));

DROP POLICY IF EXISTS "task_activity_insert" ON public.task_activity;
CREATE POLICY "task_activity_insert" ON public.task_activity
  FOR INSERT TO authenticated WITH CHECK (public.can_access_task(task_id));

-- ── 2a. Notify on assignment ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_task_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_task_title text;
BEGIN
  IF NEW.user_id = auth.uid() THEN
    RETURN NEW; -- don't notify someone for assigning themselves
  END IF;

  SELECT title INTO v_task_title FROM public.tasks WHERE id = NEW.task_id;

  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (
    NEW.user_id,
    'task_assigned',
    'You were assigned a task',
    coalesce(v_task_title, 'A task')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assignment ON public.task_assignees;
CREATE TRIGGER trg_notify_task_assignment
  AFTER INSERT ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignment();

-- ── 2b. Notify watchers on a new comment ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_task_comment_watchers()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_task_title text;
BEGIN
  SELECT title INTO v_task_title FROM public.tasks WHERE id = NEW.task_id;

  INSERT INTO public.notifications (user_id, type, title, body)
  SELECT w.user_id, 'task_comment', 'New comment on ' || coalesce(v_task_title, 'a task'),
         left(NEW.body, 280)
  FROM public.task_watchers w
  WHERE w.task_id = NEW.task_id
    AND w.user_id <> NEW.author_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_comment_watchers ON public.task_comments;
CREATE TRIGGER trg_notify_task_comment_watchers
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_comment_watchers();

-- ── 3. Basic full-text search over tasks ────────────────────────────────
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_tasks_search_vector ON public.tasks USING GIN (search_vector);
