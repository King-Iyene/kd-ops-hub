-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  Goal-Task Linking — connect tasks to goals for OKR tracking     ║
-- ║  + add goal_id FK on tasks for direct assignment                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Many-to-many: a goal can have multiple tasks, a task can serve
-- multiple goals (e.g. cross-team initiatives).
CREATE TABLE IF NOT EXISTS public.goal_tasks (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id     UUID        NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_goal_task UNIQUE (goal_id, task_id)
);

ALTER TABLE public.goal_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goal_tasks_authenticated"
  ON public.goal_tasks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal ON public.goal_tasks (goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_task ON public.goal_tasks (task_id);

-- Convenience FK: quick assignment of a task to a single primary goal
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_goal ON public.tasks (goal_id) WHERE goal_id IS NOT NULL;
