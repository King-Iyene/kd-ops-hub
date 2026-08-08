-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  Task Management v2 — ClickUp-style foundations                  ║
-- ║                                                                   ║
-- ║  Adds: project spaces (workspace hierarchy), task lists,          ║
-- ║        subtasks via parent_id, drag sort ordering,                ║
-- ║        task dependencies, watchers, time-entry tracking.          ║
-- ║                                                                   ║
-- ║  Phase 1 of the long-term PM platform build.                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝


-- ─── 1. Project Spaces ──────────────────────────────────────────────
-- Top-level organizational containers — the Space in
-- Space > Project > List > Task hierarchy.

CREATE TABLE IF NOT EXISTS public.project_spaces (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT,
  color       TEXT        DEFAULT '#6366f1',
  icon        TEXT        DEFAULT 'FolderKanban',
  owner_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE public.project_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spaces_authenticated"
  ON public.project_spaces FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_spaces_owner
  ON public.project_spaces (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spaces_sort
  ON public.project_spaces (sort_order) WHERE deleted_at IS NULL;

CREATE TRIGGER set_project_spaces_updated_at
  BEFORE UPDATE ON public.project_spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 2. Link projects to spaces ─────────────────────────────────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS space_id UUID
    REFERENCES public.project_spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_space
  ON public.projects (space_id) WHERE deleted_at IS NULL;


-- ─── 3. Task Lists ──────────────────────────────────────────────────
-- Optional grouping within a project or space (like ClickUp Lists).
-- A list belongs to exactly one parent — project or space.

CREATE TABLE IF NOT EXISTS public.task_lists (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID        REFERENCES public.projects(id) ON DELETE CASCADE,
  space_id    UUID        REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_list_has_parent
    CHECK (project_id IS NOT NULL OR space_id IS NOT NULL)
);

ALTER TABLE public.task_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_lists_authenticated"
  ON public.task_lists FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_task_lists_project
  ON public.task_lists (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_lists_space
  ON public.task_lists (space_id) WHERE space_id IS NOT NULL;


-- ─── 4. Enhance tasks — subtasks, ordering, time fields ─────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS parent_id
    UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS list_id
    UUID REFERENCES public.task_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order
    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date
    DATE,
  ADD COLUMN IF NOT EXISTS time_estimate_minutes
    INTEGER CHECK (time_estimate_minutes IS NULL OR time_estimate_minutes >= 0),
  ADD COLUMN IF NOT EXISTS time_spent_minutes
    INTEGER NOT NULL DEFAULT 0 CHECK (time_spent_minutes >= 0);

CREATE INDEX IF NOT EXISTS idx_tasks_parent
  ON public.tasks (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_list
  ON public.tasks (list_id) WHERE list_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_sort
  ON public.tasks (status, sort_order);


-- ─── 5. Task Dependencies ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id         UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_id   UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type TEXT        NOT NULL DEFAULT 'blocks'
    CHECK (dependency_type IN ('blocks', 'is_blocked_by', 'relates_to')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_id),
  CONSTRAINT unique_dependency  UNIQUE (task_id, depends_on_id)
);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deps_authenticated"
  ON public.task_dependencies FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_task_deps_task
  ON public.task_dependencies (task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends
  ON public.task_dependencies (depends_on_id);


-- ─── 6. Task Watchers ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.task_watchers (
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.task_watchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchers_authenticated"
  ON public.task_watchers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);


-- ─── 7. Time Entries — start/stop timer per task ────────────────────

CREATE TABLE IF NOT EXISTS public.task_time_entries (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id          UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  duration_minutes INTEGER,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_entries_authenticated"
  ON public.task_time_entries FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_time_entries_task
  ON public.task_time_entries (task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user
  ON public.task_time_entries (user_id);
