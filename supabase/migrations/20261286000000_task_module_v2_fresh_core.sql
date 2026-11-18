-- =============================================================================
-- Task module v2 — a totally new, self-contained module built from the new
-- PRD (v1.0, 18 Nov 2026) and the reference screenshots, replacing the old
-- Tasks feature entirely at the product level. Per explicit instruction:
-- the old Task module is removed from navigation; this is a from-scratch
-- build, not an evolution of the old tables — so every table here is new
-- and prefixed `tm_` (Task Module) to guarantee zero collision or
-- entanglement with the legacy `tasks`/`project_spaces` tables, which
-- other, unrelated screens (Dashboard, Goals, Projects, FlexTables,
-- EmployeeProfile) still read and are left completely untouched.
--
-- People and roles are NOT rebuilt — per explicit instruction, this ties
-- directly into what KD Ops already has: auth.users/profiles for people,
-- and the workspace_members/workspace_role infrastructure already built
-- and deployed in the prior two migrations (seeded from profiles.role and
-- reporting_manager_id) for the owner/admin/manager/member tiers.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tm_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  icon text,
  is_private boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tm_space_members (
  space_id uuid NOT NULL REFERENCES public.tm_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

DO $$ BEGIN
  CREATE TYPE public.tm_status_category AS ENUM ('not_started', 'active', 'done', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tm_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.tm_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  category public.tm_status_category NOT NULL DEFAULT 'active',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tm_unique_status_per_space UNIQUE (space_id, name)
);

CREATE TABLE IF NOT EXISTS public.tm_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.tm_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE public.tm_task_priority AS ENUM ('urgent', 'high', 'normal', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.tm_lists(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status_id uuid REFERENCES public.tm_statuses(id),
  priority public.tm_task_priority NOT NULL DEFAULT 'normal',
  start_date date,
  due_date date,
  due_has_time boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  time_estimate_min integer,
  position double precision NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tm_tasks_list ON public.tm_tasks (list_id, archived_at);
CREATE INDEX IF NOT EXISTS idx_tm_tasks_parent ON public.tm_tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tm_tasks_due ON public.tm_tasks (due_date);

CREATE TABLE IF NOT EXISTS public.tm_task_assignees (
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tm_task_assignees_user ON public.tm_task_assignees (user_id, task_id);

CREATE TABLE IF NOT EXISTS public.tm_task_watchers (
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tm_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tm_comments_task ON public.tm_comments (task_id, created_at);

-- -----------------------------------------------------------------------------
-- Access control (PRD section 6), scoped entirely to the tm_ tables.
-- Reuses is_admin()/is_workspace_member() already deployed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tm_can_access_space(p_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (SELECT 1 FROM public.tm_space_members WHERE space_id = p_space_id AND user_id = auth.uid())
    OR (
      public.is_workspace_member()
      AND EXISTS (SELECT 1 FROM public.tm_spaces WHERE id = p_space_id AND is_private = false)
    );
$$;

CREATE OR REPLACE FUNCTION public.tm_can_edit_space(p_space_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tm_space_members
      WHERE space_id = p_space_id AND user_id = auth.uid() AND role = 'editor'
    );
$$;

CREATE OR REPLACE FUNCTION public.tm_space_of_list(p_list_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT space_id FROM public.tm_lists WHERE id = p_list_id;
$$;

CREATE OR REPLACE FUNCTION public.tm_space_of_task(p_task_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.tm_space_of_list(l.id) FROM public.tm_tasks t JOIN public.tm_lists l ON l.id = t.list_id WHERE t.id = p_task_id;
$$;

CREATE OR REPLACE FUNCTION public.tm_can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.tm_can_access_space(public.tm_space_of_task(p_task_id));
$$;

CREATE OR REPLACE FUNCTION public.tm_can_edit_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.tm_can_edit_space(public.tm_space_of_task(p_task_id));
$$;

GRANT EXECUTE ON FUNCTION
  public.tm_can_access_space(uuid), public.tm_can_edit_space(uuid),
  public.tm_space_of_list(uuid), public.tm_space_of_task(uuid),
  public.tm_can_access_task(uuid), public.tm_can_edit_task(uuid)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.tm_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_spaces_select" ON public.tm_spaces;
CREATE POLICY "tm_spaces_select" ON public.tm_spaces FOR SELECT TO authenticated USING (public.tm_can_access_space(id));
DROP POLICY IF EXISTS "tm_spaces_insert" ON public.tm_spaces;
CREATE POLICY "tm_spaces_insert" ON public.tm_spaces FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member());
DROP POLICY IF EXISTS "tm_spaces_update" ON public.tm_spaces;
CREATE POLICY "tm_spaces_update" ON public.tm_spaces FOR UPDATE TO authenticated USING (public.tm_can_edit_space(id));
DROP POLICY IF EXISTS "tm_spaces_delete" ON public.tm_spaces;
CREATE POLICY "tm_spaces_delete" ON public.tm_spaces FOR DELETE TO authenticated USING (public.is_admin() OR created_by = auth.uid());

ALTER TABLE public.tm_space_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_space_members_select" ON public.tm_space_members;
CREATE POLICY "tm_space_members_select" ON public.tm_space_members FOR SELECT TO authenticated USING (public.tm_can_access_space(space_id));
DROP POLICY IF EXISTS "tm_space_members_insert" ON public.tm_space_members;
CREATE POLICY "tm_space_members_insert" ON public.tm_space_members FOR INSERT TO authenticated WITH CHECK (public.tm_can_edit_space(space_id));
DROP POLICY IF EXISTS "tm_space_members_delete" ON public.tm_space_members;
CREATE POLICY "tm_space_members_delete" ON public.tm_space_members FOR DELETE TO authenticated USING (public.tm_can_edit_space(space_id));

ALTER TABLE public.tm_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_statuses_select" ON public.tm_statuses;
CREATE POLICY "tm_statuses_select" ON public.tm_statuses FOR SELECT TO authenticated USING (public.tm_can_access_space(space_id));
DROP POLICY IF EXISTS "tm_statuses_insert" ON public.tm_statuses;
CREATE POLICY "tm_statuses_insert" ON public.tm_statuses FOR INSERT TO authenticated WITH CHECK (public.tm_can_edit_space(space_id));
DROP POLICY IF EXISTS "tm_statuses_update" ON public.tm_statuses;
CREATE POLICY "tm_statuses_update" ON public.tm_statuses FOR UPDATE TO authenticated USING (public.tm_can_edit_space(space_id));
DROP POLICY IF EXISTS "tm_statuses_delete" ON public.tm_statuses;
CREATE POLICY "tm_statuses_delete" ON public.tm_statuses FOR DELETE TO authenticated USING (public.tm_can_edit_space(space_id));

ALTER TABLE public.tm_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_lists_select" ON public.tm_lists;
CREATE POLICY "tm_lists_select" ON public.tm_lists FOR SELECT TO authenticated USING (public.tm_can_access_space(space_id));
DROP POLICY IF EXISTS "tm_lists_insert" ON public.tm_lists;
CREATE POLICY "tm_lists_insert" ON public.tm_lists FOR INSERT TO authenticated WITH CHECK (public.tm_can_edit_space(space_id));
DROP POLICY IF EXISTS "tm_lists_update" ON public.tm_lists;
CREATE POLICY "tm_lists_update" ON public.tm_lists FOR UPDATE TO authenticated USING (public.tm_can_edit_space(space_id));
DROP POLICY IF EXISTS "tm_lists_delete" ON public.tm_lists;
CREATE POLICY "tm_lists_delete" ON public.tm_lists FOR DELETE TO authenticated USING (public.tm_can_edit_space(space_id));

ALTER TABLE public.tm_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_tasks_select" ON public.tm_tasks;
CREATE POLICY "tm_tasks_select" ON public.tm_tasks FOR SELECT TO authenticated USING (public.tm_can_access_space(public.tm_space_of_list(list_id)));
DROP POLICY IF EXISTS "tm_tasks_insert" ON public.tm_tasks;
CREATE POLICY "tm_tasks_insert" ON public.tm_tasks FOR INSERT TO authenticated WITH CHECK (public.tm_can_access_space(public.tm_space_of_list(list_id)));
DROP POLICY IF EXISTS "tm_tasks_update" ON public.tm_tasks;
CREATE POLICY "tm_tasks_update" ON public.tm_tasks FOR UPDATE TO authenticated USING (public.tm_can_access_space(public.tm_space_of_list(list_id)));
DROP POLICY IF EXISTS "tm_tasks_delete" ON public.tm_tasks;
CREATE POLICY "tm_tasks_delete" ON public.tm_tasks FOR DELETE TO authenticated USING (public.is_admin() OR created_by = auth.uid() OR public.tm_can_edit_space(public.tm_space_of_list(list_id)));

ALTER TABLE public.tm_task_assignees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_task_assignees_select" ON public.tm_task_assignees;
CREATE POLICY "tm_task_assignees_select" ON public.tm_task_assignees FOR SELECT TO authenticated USING (public.tm_can_access_task(task_id));
DROP POLICY IF EXISTS "tm_task_assignees_insert" ON public.tm_task_assignees;
CREATE POLICY "tm_task_assignees_insert" ON public.tm_task_assignees FOR INSERT TO authenticated WITH CHECK (public.tm_can_access_task(task_id));
DROP POLICY IF EXISTS "tm_task_assignees_delete" ON public.tm_task_assignees;
CREATE POLICY "tm_task_assignees_delete" ON public.tm_task_assignees FOR DELETE TO authenticated USING (public.tm_can_access_task(task_id));

ALTER TABLE public.tm_task_watchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_task_watchers_select" ON public.tm_task_watchers;
CREATE POLICY "tm_task_watchers_select" ON public.tm_task_watchers FOR SELECT TO authenticated USING (public.tm_can_access_task(task_id));
DROP POLICY IF EXISTS "tm_task_watchers_insert" ON public.tm_task_watchers;
CREATE POLICY "tm_task_watchers_insert" ON public.tm_task_watchers FOR INSERT TO authenticated WITH CHECK (public.tm_can_access_task(task_id));
DROP POLICY IF EXISTS "tm_task_watchers_delete" ON public.tm_task_watchers;
CREATE POLICY "tm_task_watchers_delete" ON public.tm_task_watchers FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.tm_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tm_comments_select" ON public.tm_comments;
CREATE POLICY "tm_comments_select" ON public.tm_comments FOR SELECT TO authenticated USING (public.tm_can_access_task(task_id));
DROP POLICY IF EXISTS "tm_comments_insert" ON public.tm_comments;
CREATE POLICY "tm_comments_insert" ON public.tm_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.tm_can_access_task(task_id));
DROP POLICY IF EXISTS "tm_comments_update" ON public.tm_comments;
CREATE POLICY "tm_comments_update" ON public.tm_comments FOR UPDATE TO authenticated USING (author_id = auth.uid());
DROP POLICY IF EXISTS "tm_comments_delete" ON public.tm_comments;
CREATE POLICY "tm_comments_delete" ON public.tm_comments FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.is_admin());

-- -----------------------------------------------------------------------------
-- TSK-01 equivalent: five default statuses on every new space.
-- TSK-03 equivalent: entering a done-category status sets completed_at.
-- Subtasks exactly one level deep, matching the old module's own rule.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tm_seed_default_statuses()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tm_statuses (space_id, name, color, category, position) VALUES
    (NEW.id, 'Open',        '#94a3b8', 'not_started', 0),
    (NEW.id, 'To Do',       '#60a5fa', 'active',      1),
    (NEW.id, 'In Progress', '#3b82f6', 'active',      2),
    (NEW.id, 'Blocked',     '#ef4444', 'active',      3),
    (NEW.id, 'Complete',    '#22c55e', 'done',        4)
  ON CONFLICT (space_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tm_seed_default_statuses ON public.tm_spaces;
CREATE TRIGGER trg_tm_seed_default_statuses
  AFTER INSERT ON public.tm_spaces
  FOR EACH ROW EXECUTE FUNCTION public.tm_seed_default_statuses();

CREATE OR REPLACE FUNCTION public.tm_sync_completed_at()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_category public.tm_status_category;
BEGIN
  IF NEW.status_id IS NULL THEN RETURN NEW; END IF;
  SELECT category INTO v_category FROM public.tm_statuses WHERE id = NEW.status_id;
  IF v_category IN ('done', 'closed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tm_sync_completed_at ON public.tm_tasks;
CREATE TRIGGER trg_tm_sync_completed_at
  BEFORE INSERT OR UPDATE OF status_id ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tm_sync_completed_at();

CREATE OR REPLACE FUNCTION public.tm_enforce_subtask_depth()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_parent_has_parent boolean;
  v_has_children boolean;
BEGIN
  IF NEW.parent_task_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_task_id = NEW.id THEN
    RAISE EXCEPTION 'A task cannot be its own parent.';
  END IF;
  SELECT (parent_task_id IS NOT NULL) INTO v_parent_has_parent FROM public.tm_tasks WHERE id = NEW.parent_task_id;
  IF v_parent_has_parent THEN
    RAISE EXCEPTION 'Subtasks are exactly one level deep.';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.tm_tasks WHERE parent_task_id = NEW.id) INTO v_has_children;
  IF v_has_children THEN
    RAISE EXCEPTION 'This task already has subtasks of its own.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tm_enforce_subtask_depth ON public.tm_tasks;
CREATE TRIGGER trg_tm_enforce_subtask_depth
  BEFORE INSERT OR UPDATE OF parent_task_id ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tm_enforce_subtask_depth();

CREATE OR REPLACE FUNCTION public.tm_auto_watch_creator()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.tm_task_watchers (task_id, user_id) VALUES (NEW.id, NEW.created_by) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tm_auto_watch_creator ON public.tm_tasks;
CREATE TRIGGER trg_tm_auto_watch_creator
  AFTER INSERT ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tm_auto_watch_creator();

CREATE OR REPLACE FUNCTION public.tm_auto_watch_assignee()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tm_task_watchers (task_id, user_id) VALUES (NEW.task_id, NEW.user_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tm_auto_watch_assignee ON public.tm_task_assignees;
CREATE TRIGGER trg_tm_auto_watch_assignee
  AFTER INSERT ON public.tm_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tm_auto_watch_assignee();

-- -----------------------------------------------------------------------------
-- One starter space so the new module isn't empty on first load.
-- -----------------------------------------------------------------------------
INSERT INTO public.tm_spaces (name, color, is_private, created_by)
SELECT 'KD Squares', '#ec4899', false, (SELECT id FROM auth.users LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM public.tm_spaces);

INSERT INTO public.tm_lists (space_id, name, position)
SELECT id, 'Ops and Clients', 0 FROM public.tm_spaces
WHERE NOT EXISTS (SELECT 1 FROM public.tm_lists);
