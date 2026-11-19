-- Task module: give tasks a real manual order.
--
-- Until now every task was inserted with position 0, so "Manual order" had
-- nothing to sort by and dragging a row had no gap to land in. From now on a
-- new task goes to the end of its list, and existing tasks are numbered in
-- the order they were created. The app drops rows between neighbours using
-- the gaps (steps of 1024) and renumbers a group only when a gap runs out.

CREATE OR REPLACE FUNCTION public.tm_tasks_default_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- An explicit position (anything but the column default) is kept.
  IF NEW.position = 0 THEN
    SELECT coalesce(max(t.position), 0) + 1024
      INTO NEW.position
      FROM public.tm_tasks t
     WHERE t.list_id = NEW.list_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tm_tasks_default_position ON public.tm_tasks;
CREATE TRIGGER tm_tasks_default_position BEFORE INSERT ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tm_tasks_default_position();

-- Number existing tasks per list in creation order. Renumbering is not an
-- edit anyone made, so it must not move "Last updated": switch the
-- updated_at trigger off for this one statement.
ALTER TABLE public.tm_tasks DISABLE TRIGGER tm_tasks_set_updated_at;

UPDATE public.tm_tasks t
   SET position = s.rn * 1024
  FROM (
    SELECT id, row_number() OVER (PARTITION BY list_id ORDER BY position, created_at, id) AS rn
      FROM public.tm_tasks
  ) s
 WHERE s.id = t.id
   AND t.position IS DISTINCT FROM s.rn * 1024;

ALTER TABLE public.tm_tasks ENABLE TRIGGER tm_tasks_set_updated_at;
