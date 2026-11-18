-- =============================================================================
-- Task module PRD — Phase 1: real space/role access control.
--
-- The Tasks module (project_spaces, space_members, task_lists, tasks, and
-- the join tables around them) is mostly a working ClickUp-style system
-- already, but a deliberate earlier decision ("close_using_true_policies")
-- left almost every one of its tables at USING(true) for read/write.
-- project_spaces.is_private + space_members already work correctly for the
-- space itself, but that privacy never cascades down: a task inside a
-- private space's list is still globally readable/writable by any
-- signed-in employee today. This migration closes that gap.
--
-- Backfill first: every currently active profile is added as a 'member' of
-- every existing space, so nobody loses visibility on day one — this only
-- changes what happens to FUTURE private spaces and FUTURE membership
-- changes, not today's access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Backfill: preserve today's access before tightening anything.
-- -----------------------------------------------------------------------------
INSERT INTO public.space_members (space_id, user_id, role, added_by)
SELECT s.id, p.id, 'member', s.owner_id
FROM public.project_spaces s
CROSS JOIN public.profiles p
WHERE s.deleted_at IS NULL
  AND COALESCE(p.status, 'active') = 'active'
ON CONFLICT (space_id, user_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helper functions — single source of each predicate, reused by every policy
-- below. SECURITY DEFINER + STABLE, same convention as current_user_role().
-- -----------------------------------------------------------------------------

-- A list's actual space: either set directly, or inherited from its project.
CREATE OR REPLACE FUNCTION public.effective_space_for_list(p_list_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    tl.space_id,
    (SELECT pr.space_id FROM public.projects pr WHERE pr.id = tl.project_id)
  )
  FROM public.task_lists tl
  WHERE tl.id = p_list_id
$$;
GRANT EXECUTE ON FUNCTION public.effective_space_for_list(uuid) TO authenticated;

-- A task's actual space: via its list (list_id), or directly via project_id
-- for tasks that predate the list hierarchy. NULL (no resolvable space) is
-- a legitimate case — a standalone task with no list and no project — and
-- is treated as open, matching today's behaviour for anything never placed
-- in a space.
CREATE OR REPLACE FUNCTION public.effective_space_for_task(p_list_id uuid, p_project_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    public.effective_space_for_list(p_list_id),
    (SELECT pr.space_id FROM public.projects pr WHERE pr.id = p_project_id)
  )
$$;
GRANT EXECUTE ON FUNCTION public.effective_space_for_task(uuid, uuid) TO authenticated;

-- Can the caller see this space's contents? Mirrors project_spaces'
-- own "spaces_visible" policy logic so a task/list resolves the same
-- answer its parent space already gives for itself. NULL space = open
-- (nothing to restrict — not every list/task lives in a space).
CREATE OR REPLACE FUNCTION public.can_access_space(p_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_space_id IS NULL OR EXISTS (
    SELECT 1 FROM public.project_spaces s
    WHERE s.id = p_space_id
      AND s.deleted_at IS NULL
      AND (
        NOT s.is_private
        OR public.current_user_role() IN ('super_admin', 'admin')
        OR s.owner_id = auth.uid()
        OR s.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = s.id AND sm.user_id = auth.uid()
        )
      )
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_access_space(uuid) TO authenticated;

-- Can the caller create/change content inside this space? A 'viewer'
-- space_members row can read but not write. NULL space = open, matching
-- can_access_space's treatment of unscoped content.
CREATE OR REPLACE FUNCTION public.can_edit_space(p_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_space_id IS NULL OR EXISTS (
    SELECT 1 FROM public.project_spaces s
    WHERE s.id = p_space_id
      AND s.deleted_at IS NULL
      AND (
        public.current_user_role() IN ('super_admin', 'admin')
        OR s.owner_id = auth.uid()
        OR s.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.space_members sm
          WHERE sm.space_id = s.id AND sm.user_id = auth.uid() AND sm.role <> 'viewer'
        )
      )
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_edit_space(uuid) TO authenticated;

-- Can the caller already access this specific task (by id)? Used where a
-- join table (comments, checklists, ...) needs to check against an
-- existing task row rather than a list_id/project_id pair.
CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND (
        public.can_access_space(public.effective_space_for_task(t.list_id, t.project_id))
        OR t.created_by = auth.uid()
        OR t.assignee_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid())
      )
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_access_task(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_edit_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND (
        public.can_edit_space(public.effective_space_for_task(t.list_id, t.project_id))
        OR t.created_by = auth.uid()
        OR t.assignee_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid())
      )
  )
$$;
GRANT EXECUTE ON FUNCTION public.can_edit_task(uuid) TO authenticated;

-- =============================================================================
-- task_lists — visibility/write now follow the space, instead of USING(true).
-- =============================================================================
DROP POLICY IF EXISTS "task_lists_select" ON public.task_lists;
CREATE POLICY "task_lists_select" ON public.task_lists
  FOR SELECT TO authenticated
  USING (public.can_access_space(COALESCE(space_id, (SELECT pr.space_id FROM public.projects pr WHERE pr.id = project_id))));

DROP POLICY IF EXISTS "task_lists_insert" ON public.task_lists;
CREATE POLICY "task_lists_insert" ON public.task_lists
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_space(COALESCE(space_id, (SELECT pr.space_id FROM public.projects pr WHERE pr.id = project_id))));

DROP POLICY IF EXISTS "task_lists_update" ON public.task_lists;
CREATE POLICY "task_lists_update" ON public.task_lists
  FOR UPDATE TO authenticated
  USING (public.can_edit_space(COALESCE(space_id, (SELECT pr.space_id FROM public.projects pr WHERE pr.id = project_id))))
  WITH CHECK (public.can_edit_space(COALESCE(space_id, (SELECT pr.space_id FROM public.projects pr WHERE pr.id = project_id))));

-- task_lists_delete (admin-only) is unchanged — already correct.

-- =============================================================================
-- tasks — the single biggest gap: private-space membership did not reach here.
-- =============================================================================
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
CREATE POLICY "tasks_select" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.can_access_space(public.effective_space_for_task(list_id, project_id))
    OR created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = id AND ta.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_space(public.effective_space_for_task(list_id, project_id)));

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.can_edit_space(public.effective_space_for_task(list_id, project_id))
    OR created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = id AND ta.user_id = auth.uid())
  )
  WITH CHECK (
    public.can_edit_space(public.effective_space_for_task(list_id, project_id))
    OR created_by = auth.uid()
    OR assignee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = id AND ta.user_id = auth.uid())
  );

-- tasks_delete (creator or admin) is unchanged — already matches the PRD's
-- member row ("delete tasks: only ones they created").

-- =============================================================================
-- Join tables around a task — scope to the parent task's access instead of
-- USING(true). All of these already have a stable task_id column to hang
-- the check on.
-- =============================================================================

-- task_assignees
DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;
CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));
DROP POLICY IF EXISTS "task_assignees_insert" ON public.task_assignees;
CREATE POLICY "task_assignees_insert" ON public.task_assignees
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_task(task_id));
DROP POLICY IF EXISTS "task_assignees_delete" ON public.task_assignees;
CREATE POLICY "task_assignees_delete" ON public.task_assignees
  FOR DELETE TO authenticated USING (public.can_edit_task(task_id) OR user_id = auth.uid());

-- task_comments (author-only write already correct; only SELECT widens today)
DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
CREATE POLICY "task_comments_select" ON public.task_comments
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));

-- task_checklists
DROP POLICY IF EXISTS "task_checklists_select" ON public.task_checklists;
CREATE POLICY "task_checklists_select" ON public.task_checklists
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));
DROP POLICY IF EXISTS "task_checklists_insert" ON public.task_checklists;
CREATE POLICY "task_checklists_insert" ON public.task_checklists
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_task(task_id));
DROP POLICY IF EXISTS "task_checklists_update" ON public.task_checklists;
CREATE POLICY "task_checklists_update" ON public.task_checklists
  FOR UPDATE TO authenticated USING (public.can_edit_task(task_id)) WITH CHECK (public.can_edit_task(task_id));
DROP POLICY IF EXISTS "task_checklists_delete" ON public.task_checklists;
CREATE POLICY "task_checklists_delete" ON public.task_checklists
  FOR DELETE TO authenticated USING (public.can_edit_task(task_id));

-- task_watchers
DROP POLICY IF EXISTS "task_watchers_select" ON public.task_watchers;
CREATE POLICY "task_watchers_select" ON public.task_watchers
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));
DROP POLICY IF EXISTS "task_watchers_insert" ON public.task_watchers;
CREATE POLICY "task_watchers_insert" ON public.task_watchers
  FOR INSERT TO authenticated WITH CHECK (public.can_access_task(task_id));
DROP POLICY IF EXISTS "task_watchers_delete" ON public.task_watchers;
CREATE POLICY "task_watchers_delete" ON public.task_watchers
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.can_edit_task(task_id));

-- task_dependencies
DROP POLICY IF EXISTS "task_deps_select" ON public.task_dependencies;
CREATE POLICY "task_deps_select" ON public.task_dependencies
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));
DROP POLICY IF EXISTS "task_deps_insert" ON public.task_dependencies;
CREATE POLICY "task_deps_insert" ON public.task_dependencies
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_task(task_id));
DROP POLICY IF EXISTS "task_deps_delete" ON public.task_dependencies;
CREATE POLICY "task_deps_delete" ON public.task_dependencies
  FOR DELETE TO authenticated USING (public.can_edit_task(task_id));

-- task_time_entries (owner-only delete already correct)
DROP POLICY IF EXISTS "task_time_entries_select" ON public.task_time_entries;
CREATE POLICY "task_time_entries_select" ON public.task_time_entries
  FOR SELECT TO authenticated USING (public.can_access_task(task_id));
DROP POLICY IF EXISTS "task_time_entries_insert" ON public.task_time_entries;
CREATE POLICY "task_time_entries_insert" ON public.task_time_entries
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.can_access_task(task_id));
DROP POLICY IF EXISTS "task_time_entries_update" ON public.task_time_entries;
CREATE POLICY "task_time_entries_update" ON public.task_time_entries
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- Space-level tables: task_templates/space_folders/space_statuses scope to
-- the space itself; space_members gets real read/write scoping (today it's
-- wide open — any authenticated user can add/remove/promote members of any
-- space, even one they can't see).
-- =============================================================================

DROP POLICY IF EXISTS "task_templates_select" ON public.task_templates;
CREATE POLICY "task_templates_select" ON public.task_templates
  FOR SELECT TO authenticated USING (is_global OR public.can_access_space(space_id));
DROP POLICY IF EXISTS "task_templates_insert" ON public.task_templates;
CREATE POLICY "task_templates_insert" ON public.task_templates
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_space(space_id));
DROP POLICY IF EXISTS "task_templates_update" ON public.task_templates;
CREATE POLICY "task_templates_update" ON public.task_templates
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id)) WITH CHECK (public.can_edit_space(space_id));

DROP POLICY IF EXISTS "space_folders_read_write" ON public.space_folders;
CREATE POLICY "space_folders_read_write" ON public.space_folders
  FOR SELECT TO authenticated USING (public.can_access_space(space_id));
DROP POLICY IF EXISTS "space_folders_insert" ON public.space_folders;
CREATE POLICY "space_folders_insert" ON public.space_folders
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_space(space_id));
DROP POLICY IF EXISTS "space_folders_update" ON public.space_folders;
CREATE POLICY "space_folders_update" ON public.space_folders
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id)) WITH CHECK (public.can_edit_space(space_id));

DROP POLICY IF EXISTS "space_statuses_read_write" ON public.space_statuses;
CREATE POLICY "space_statuses_read_write" ON public.space_statuses
  FOR SELECT TO authenticated USING (public.can_access_space(space_id));
DROP POLICY IF EXISTS "space_statuses_insert" ON public.space_statuses;
CREATE POLICY "space_statuses_insert" ON public.space_statuses
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_space(space_id));
DROP POLICY IF EXISTS "space_statuses_update" ON public.space_statuses;
CREATE POLICY "space_statuses_update" ON public.space_statuses
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id)) WITH CHECK (public.can_edit_space(space_id));

-- space_members: read requires being able to see the space; adding/changing
-- a member requires being able to edit the space (or admin) — not "any
-- authenticated user can add/promote anyone to any space," as it is today.
DROP POLICY IF EXISTS "space_members_read_write" ON public.space_members;
CREATE POLICY "space_members_read_write" ON public.space_members
  FOR SELECT TO authenticated USING (public.can_access_space(space_id) OR user_id = auth.uid());
DROP POLICY IF EXISTS "space_members_insert" ON public.space_members;
CREATE POLICY "space_members_insert" ON public.space_members
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_space(space_id));
DROP POLICY IF EXISTS "space_members_update" ON public.space_members;
CREATE POLICY "space_members_update" ON public.space_members
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id)) WITH CHECK (public.can_edit_space(space_id));
-- space_members_delete (admin or self) is unchanged — already correct.

-- =============================================================================
-- saved_views: the is_shared column has existed since it was added but was
-- never honoured by RLS — a "shared" view was only ever visible to its own
-- creator. Wire it in: shared views are visible to anyone who can see the
-- space; still only the creator can edit or delete their own view.
-- =============================================================================
DROP POLICY IF EXISTS "saved_views_own" ON public.saved_views;
CREATE POLICY "saved_views_select" ON public.saved_views
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR (is_shared AND public.can_access_space(space_id)));
CREATE POLICY "saved_views_insert" ON public.saved_views
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "saved_views_update" ON public.saved_views
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "saved_views_delete" ON public.saved_views
  FOR DELETE TO authenticated USING (created_by = auth.uid());
