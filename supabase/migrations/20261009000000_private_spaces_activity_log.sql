-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  Task Management v3 — Private spaces, activity log, mentions    ║
-- ║                                                                   ║
-- ║  Adds: private/public space toggle, space_members access table,  ║
-- ║        task_activity log for audit trail, favorites table.        ║
-- ╚═══════════════════════════════════════════════════════════════════╝


-- ─── 1. Private spaces — add is_private flag ────────────────────────

ALTER TABLE public.project_spaces
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;


-- ─── 2. Space Members — controls who sees private spaces ────────────

CREATE TABLE IF NOT EXISTS public.space_members (
  space_id   UUID        NOT NULL REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  added_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "space_members_authenticated"
  ON public.space_members FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_space_members_user
  ON public.space_members (user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_space
  ON public.space_members (space_id);


-- ─── 3. Update spaces RLS — private spaces visible only to members ──

DROP POLICY IF EXISTS "spaces_authenticated" ON public.project_spaces;

CREATE POLICY "spaces_visible"
  ON public.project_spaces FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      is_private = false
      OR owner_id = auth.uid()
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.space_members sm
        WHERE sm.space_id = id AND sm.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "spaces_insert"
  ON public.project_spaces FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "spaces_update"
  ON public.project_spaces FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.space_members sm
      WHERE sm.space_id = id AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "spaces_delete"
  ON public.project_spaces FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR created_by = auth.uid()
  );


-- ─── 4. Task Activity Log — audit trail for task changes ────────────

CREATE TABLE IF NOT EXISTS public.task_activity (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id     UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL
    CHECK (action IN (
      'created', 'updated', 'status_changed', 'assigned',
      'priority_changed', 'due_date_changed', 'completed',
      'reopened', 'commented', 'subtask_added', 'subtask_removed',
      'tag_added', 'tag_removed', 'moved'
    )),
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_activity_authenticated"
  ON public.task_activity FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_task_activity_task
  ON public.task_activity (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_activity_user
  ON public.task_activity (user_id);


-- ─── 5. User Favorites — pinned spaces/views/tasks ─────────────────

CREATE TABLE IF NOT EXISTS public.user_favorites (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type   TEXT        NOT NULL
    CHECK (item_type IN ('space', 'task', 'view')),
  item_id     TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_favorite UNIQUE (user_id, item_type, item_id)
);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_own"
  ON public.user_favorites FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_favorites_user
  ON public.user_favorites (user_id, sort_order);
