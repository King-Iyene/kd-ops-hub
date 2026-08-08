-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  Task Management v3 — ClickUp parity features                    ║
-- ║                                                                   ║
-- ║  Adds: task checklists, space-level custom statuses,             ║
-- ║        task types (task/milestone/bug/feature),                   ║
-- ║        folders within spaces.                                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝


-- ─── 1. Task Checklists — lightweight to-dos within tasks ───────────
-- Separate from subtasks: checklists are simple checkbox items,
-- subtasks are full tasks with own status/assignee/priority.

CREATE TABLE IF NOT EXISTS public.task_checklists (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  is_checked  BOOLEAN     NOT NULL DEFAULT false,
  assignee_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklists_authenticated"
  ON public.task_checklists FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_checklists_task
  ON public.task_checklists (task_id, sort_order);


-- ─── 2. Space-level custom statuses ────────────────────────────────
-- Each space can define its own workflow statuses.
-- status_group classifies for reporting: not_started, active, done, closed.

CREATE TABLE IF NOT EXISTS public.space_statuses (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id      UUID        NOT NULL REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  color         TEXT        NOT NULL DEFAULT '#6b7280',
  status_group  TEXT        NOT NULL DEFAULT 'active'
    CHECK (status_group IN ('not_started', 'active', 'done', 'closed')),
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_status_per_space UNIQUE (space_id, name)
);

ALTER TABLE public.space_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "space_statuses_authenticated"
  ON public.space_statuses FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_space_statuses_space
  ON public.space_statuses (space_id, sort_order);


-- ─── 3. Task type column ───────────────────────────────────────────
-- Classify tasks as: task, milestone, bug, feature

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'task'
    CHECK (task_type IN ('task', 'milestone', 'bug', 'feature'));


-- ─── 4. Folders within spaces ──────────────────────────────────────
-- Folders group lists within a space.
-- ClickUp: Space > Folder > List > Task
-- KDOps:   Space > Folder > List > Task  (projects can also be used)

CREATE TABLE IF NOT EXISTS public.space_folders (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  space_id    UUID        NOT NULL REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.space_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folders_authenticated"
  ON public.space_folders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_folders_space
  ON public.space_folders (space_id, sort_order);

-- Link task_lists to folders
ALTER TABLE public.task_lists
  ADD COLUMN IF NOT EXISTS folder_id UUID
    REFERENCES public.space_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_lists_folder
  ON public.task_lists (folder_id) WHERE folder_id IS NOT NULL;
