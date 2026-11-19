-- Task module: recurring tasks.
--
-- A task can repeat: daily, weekly, monthly, or custom ("every N days /
-- weeks / months"). The moment a repeating task is marked complete, the
-- database creates the next one with the next due date — no scheduled job,
-- so it happens immediately, whoever completes it and from wherever
-- (list, board, task view, a bulk move).
--
--   tm_tasks.recurrence  jsonb  null = does not repeat. Otherwise
--       { "unit": "day"|"week"|"month", "every": 1..365,
--         "until": "yyyy-MM-dd" (optional, last date a new one may fall on),
--         "anchor_day": 1..31 (months only; set automatically — it keeps a
--                              task that started on the 31st from drifting
--                              to the 28th after one short month) }
--       daily = every 1 day, weekly = every 1 week, monthly = every 1 month.
--   tm_tasks.recurrence_source_id  the task this one was created from.
--
-- Only top-level tasks repeat (subtasks come along with their parent).
--
-- Next due date: counted from the task's due date (from today when it has
-- none). If that lands in the past — it was completed late — it is moved
-- forward to the first occurrence that is today or later, so completing a
-- long-overdue task never creates another overdue one.
--
-- The new task copies: list, title, description, assignee, priority, tags,
-- custom fields, the repeat rule, its subtasks (reset to To do) and its
-- checklists (every item unticked). It starts as To do. Completing the same
-- task again after reopening it does not create a second copy.

ALTER TABLE public.tm_tasks ADD COLUMN IF NOT EXISTS recurrence jsonb;
ALTER TABLE public.tm_tasks ADD COLUMN IF NOT EXISTS recurrence_source_id uuid REFERENCES public.tm_tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tm_tasks_recurrence_source_idx ON public.tm_tasks(recurrence_source_id) WHERE recurrence_source_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tm_valid_recurrence(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  IF coalesce(p ->> 'unit', '') NOT IN ('day', 'week', 'month') THEN RETURN false; END IF;
  IF NOT coalesce((p ->> 'every') ~ '^[0-9]{1,3}$', false) THEN RETURN false; END IF;
  IF (p ->> 'every')::integer NOT BETWEEN 1 AND 365 THEN RETURN false; END IF;
  IF p ->> 'until' IS NOT NULL THEN
    IF (p ->> 'until') !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
    PERFORM (p ->> 'until')::date;
  END IF;
  IF p ->> 'anchor_day' IS NOT NULL THEN
    IF NOT coalesce((p ->> 'anchor_day') ~ '^[0-9]{1,2}$', false) THEN RETURN false; END IF;
    IF (p ->> 'anchor_day')::integer NOT BETWEEN 1 AND 31 THEN RETURN false; END IF;
  END IF;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END
$$;

ALTER TABLE public.tm_tasks DROP CONSTRAINT IF EXISTS tm_tasks_recurrence_shape;
ALTER TABLE public.tm_tasks ADD CONSTRAINT tm_tasks_recurrence_shape
  CHECK (recurrence IS NULL OR (parent_id IS NULL AND public.tm_valid_recurrence(recurrence)));

-- A JSON null (as opposed to SQL NULL) means "does not repeat" too: store it as NULL.
CREATE OR REPLACE FUNCTION public.tm_tasks_normalise_recurrence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.recurrence IS NOT NULL AND jsonb_typeof(NEW.recurrence) = 'null' THEN
    NEW.recurrence := NULL;
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tm_tasks_normalise_recurrence ON public.tm_tasks;
CREATE TRIGGER tm_tasks_normalise_recurrence BEFORE INSERT OR UPDATE OF recurrence ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tm_tasks_normalise_recurrence();

-- The due date of the next occurrence.
CREATE OR REPLACE FUNCTION public.tm_next_due(p_rec jsonb, p_due date, p_today date DEFAULT current_date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_unit text := p_rec ->> 'unit';
  v_every integer := (p_rec ->> 'every')::integer;
  v_base date := coalesce(p_due, p_today);
  v_step integer;
  v_anchor integer;
  v_first date;
  v_last integer;
  v_next date;
  i integer;
BEGIN
  IF v_unit IN ('day', 'week') THEN
    v_step := v_every * CASE v_unit WHEN 'week' THEN 7 ELSE 1 END;
    RETURN v_base + v_step * greatest(1, ceil((p_today - v_base)::numeric / v_step)::integer);
  END IF;

  -- Months: same day of the month, or the last day when the month is shorter.
  v_anchor := coalesce(nullif(p_rec ->> 'anchor_day', '')::integer, extract(day FROM v_base)::integer);
  FOR i IN 1..1200 LOOP
    v_first := (make_date(extract(year FROM v_base)::integer, extract(month FROM v_base)::integer, 1)
                + make_interval(months => v_every * i))::date;
    v_last := extract(day FROM (v_first + interval '1 month' - interval '1 day'))::integer;
    v_next := v_first + (least(v_anchor, v_last) - 1);
    IF v_next >= p_today THEN RETURN v_next; END IF;
  END LOOP;
  RETURN v_next;
END
$$;

-- Completing a repeating task creates the next one.
CREATE OR REPLACE FUNCTION public.tm_tasks_spawn_recurrence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next date;
  v_rec jsonb := NEW.recurrence;
  v_new uuid;
  v_actor uuid := auth.uid();
  v_cl record;
  v_cl_new uuid;
BEGIN
  -- Two people completing at once must not make two copies.
  PERFORM pg_advisory_xact_lock(hashtext('tm_tasks_spawn_recurrence'), hashtext(NEW.id::text));
  -- Reopened and completed again: the next one already exists.
  IF EXISTS (SELECT 1 FROM public.tm_tasks WHERE recurrence_source_id = NEW.id) THEN
    RETURN NULL;
  END IF;

  v_next := public.tm_next_due(v_rec, NEW.due_date, current_date);

  IF v_rec ->> 'until' IS NOT NULL AND v_next > (v_rec ->> 'until')::date THEN
    INSERT INTO public.tm_task_activity (task_id, actor_id, kind, detail)
    VALUES (NEW.id, v_actor, 'recurrence_ended', jsonb_build_object('until', v_rec ->> 'until'));
    RETURN NULL;
  END IF;

  IF v_rec ->> 'unit' = 'month' AND v_rec ->> 'anchor_day' IS NULL THEN
    v_rec := v_rec || jsonb_build_object('anchor_day', extract(day FROM coalesce(NEW.due_date, current_date))::integer);
  END IF;

  INSERT INTO public.tm_tasks
    (list_id, title, description, status, priority, assignee_id, due_date, created_by, tags, custom, recurrence, recurrence_source_id)
  VALUES
    (NEW.list_id, NEW.title, NEW.description, 'to_do', NEW.priority, NEW.assignee_id, v_next, NEW.created_by,
     NEW.tags, NEW.custom, v_rec, NEW.id)
  RETURNING id INTO v_new;

  -- Subtasks come back as To do.
  INSERT INTO public.tm_tasks (list_id, parent_id, title, description, status, priority, assignee_id, created_by, tags)
  SELECT s.list_id, v_new, s.title, s.description, 'to_do', s.priority, s.assignee_id, s.created_by, s.tags
    FROM public.tm_tasks s
   WHERE s.parent_id = NEW.id
   ORDER BY s.position, s.created_at;

  -- Checklists come back with every item unticked.
  FOR v_cl IN SELECT id, name, position FROM public.tm_task_checklists WHERE task_id = NEW.id ORDER BY position, created_at LOOP
    INSERT INTO public.tm_task_checklists (task_id, name, position) VALUES (v_new, v_cl.name, v_cl.position)
    RETURNING id INTO v_cl_new;
    INSERT INTO public.tm_task_checklist_items (checklist_id, body, done, position)
    SELECT v_cl_new, i.body, false, i.position FROM public.tm_task_checklist_items i
     WHERE i.checklist_id = v_cl.id ORDER BY i.position, i.created_at;
  END LOOP;

  INSERT INTO public.tm_task_activity (task_id, actor_id, kind, detail) VALUES
    (NEW.id, v_actor, 'recurred', jsonb_build_object('next_task', v_new, 'due_date', v_next)),
    (v_new, v_actor, 'repeated', jsonb_build_object('from_task', NEW.id));
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS tm_tasks_spawn_recurrence ON public.tm_tasks;
CREATE TRIGGER tm_tasks_spawn_recurrence AFTER UPDATE OF status ON public.tm_tasks
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' AND NEW.recurrence IS NOT NULL)
  EXECUTE FUNCTION public.tm_tasks_spawn_recurrence();

REVOKE ALL ON FUNCTION public.tm_tasks_spawn_recurrence() FROM PUBLIC;
