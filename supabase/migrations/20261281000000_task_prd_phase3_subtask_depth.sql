-- =============================================================================
-- Task module PRD — Phase 3: enforce "subtasks are exactly one level deep"
-- (TSK). tasks.parent_id already exists (task_management_v2) but nothing
-- stops a subtask from itself having children, or from being re-parented
-- onto another subtask. This adds that guarantee as a trigger so it holds
-- for every writer, not just the current UI.
--
-- Per-space custom statuses (space_statuses) already exist as a table but
-- are not yet wired onto tasks.status — left alone in this phase: tasks.status
-- is read widely across the existing board/kanban UI, so switching it over
-- is a frontend-coordinated change, not a safe standalone migration.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_subtask_depth()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent_has_parent boolean;
  v_has_children boolean;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A task cannot be its own parent.';
  END IF;

  -- The chosen parent must itself be a top-level task (not already a subtask).
  SELECT (parent_id IS NOT NULL) INTO v_parent_has_parent
  FROM public.tasks WHERE id = NEW.parent_id;

  IF v_parent_has_parent THEN
    RAISE EXCEPTION 'Subtasks are exactly one level deep — a subtask cannot itself be a parent task.';
  END IF;

  -- This task must not already have children of its own (becoming a subtask
  -- would make it a middle tier).
  SELECT EXISTS (
    SELECT 1 FROM public.tasks WHERE parent_id = NEW.id
  ) INTO v_has_children;

  IF v_has_children THEN
    RAISE EXCEPTION 'This task already has subtasks of its own — it cannot also become a subtask.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_subtask_depth ON public.tasks;
CREATE TRIGGER trg_enforce_subtask_depth
  BEFORE INSERT OR UPDATE OF parent_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subtask_depth();
