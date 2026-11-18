-- Task Module v2 Phase 4: expand the task status model from the original
-- 3-state (open/in_progress/done) to match the 5-state workflow this
-- module's UI is being rebuilt around: to_do / in_progress / in_review /
-- blocked / done. Existing 'open' rows become 'to_do' — same status,
-- renamed, nothing semantically changes for anyone already using it.

ALTER TABLE public.tm_tasks DROP CONSTRAINT tm_tasks_status_check;

UPDATE public.tm_tasks SET status = 'to_do' WHERE status = 'open';

ALTER TABLE public.tm_tasks ALTER COLUMN status SET DEFAULT 'to_do';
ALTER TABLE public.tm_tasks ADD CONSTRAINT tm_tasks_status_check
  CHECK (status IN ('to_do', 'in_progress', 'in_review', 'blocked', 'done'));
