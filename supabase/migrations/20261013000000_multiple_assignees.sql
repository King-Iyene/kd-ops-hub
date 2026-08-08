-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  Multiple assignees — ClickUp-style multi-assignment             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.task_assignees (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_task_assignee UNIQUE (task_id, user_id)
);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignees_authenticated"
  ON public.task_assignees FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON public.task_assignees (task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees (user_id);
