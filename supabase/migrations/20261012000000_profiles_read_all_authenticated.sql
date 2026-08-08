-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  ClickUp-style open workspace visibility                        ║
-- ║  All authenticated users can see profiles, tasks, and comments  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ── PROFILES: all workspace members visible to each other ────────────
CREATE POLICY "profiles_read_all_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- ── TASKS: replace restrictive per-user policies with open read ──────
-- Drop old restrictive policies
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_read" ON public.tasks;
DROP POLICY IF EXISTS "tasks_write" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

-- All authenticated users can read all tasks (ClickUp workspace model)
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated USING (true);

-- All authenticated users can create tasks
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (true);

-- All authenticated users can update tasks (assignee, creator, or any team member)
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated USING (true);

-- Only task creator or admins can delete tasks
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated USING (
    created_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

-- ── TASK COMMENTS: open read, author-only write ─────────────────────
DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_all" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_all_authenticated" ON public.task_comments;

CREATE POLICY "task_comments_select" ON public.task_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "task_comments_insert" ON public.task_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY "task_comments_update" ON public.task_comments
  FOR UPDATE TO authenticated USING (author_id = auth.uid());

CREATE POLICY "task_comments_delete" ON public.task_comments
  FOR DELETE TO authenticated USING (
    author_id = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin')
  );

-- ── SPACE FOLDERS: ensure open access ───────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='space_folders') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname='public' AND tablename='space_folders') THEN
      ALTER TABLE public.space_folders ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "space_folders_authenticated" ON public.space_folders
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- ── TASK CHECKLISTS: ensure open access ─────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='task_checklists') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies
                   WHERE schemaname='public' AND tablename='task_checklists') THEN
      ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "task_checklists_authenticated" ON public.task_checklists
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;
