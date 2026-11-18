-- =============================================================================
-- Task module rebuild (new PRD v1.0, 18 Nov 2026) — Phase 1: core access model.
--
-- This evolves the EXISTING tables in place rather than dropping/renaming
-- them: `tasks`, `project_spaces` and friends are read by several other
-- modules (Dashboard, Goals, Projects, FlexTables, EmployeeProfile), so a
-- rename would break them. Table names stay; behaviour moves to match the
-- new PRD's rules. Sample task rows are wiped per the user's confirmation
-- that none of it is real production data worth preserving.
--
-- Adds:
--   - workspaces / workspace_members (PRD §7.2) — the new 4-tier role model
--     (owner/admin/manager/member) for the Task module specifically. This
--     is additive: profiles.role (super_admin/admin/finance/...) is a much
--     broader HR-wide role used across the whole app and is left untouched.
--   - Helper predicates from PRD §6.1: workspace_role_of, is_owner, is_admin,
--     is_manager, is_workspace_member, is_manager_of, visible_people.
--   - statuses (PRD §7.3, TSK-01) — real per-space statuses replacing the
--     free-text tasks.status check constraint. tasks.status is kept and
--     kept in sync by trigger so Dashboard/Goals/Projects/FlexTables, which
--     only ever read it, need no changes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Wipe sample task data per explicit user confirmation (none of it is real
-- production data). This also clears the way for status_id backfill below
-- to not have to guess-map stale sample statuses.
-- -----------------------------------------------------------------------------
TRUNCATE public.task_comments, public.task_checklists, public.task_watchers,
  public.task_assignees, public.custom_field_values, public.custom_field_people,
  public.custom_field_task_links, public.task_activity, public.tasks
  RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
-- workspaces — one row, created here (not seed data), per PRD §7.2 / §12.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.workspaces (name, slug)
SELECT 'KD Squares', 'kd-squares'
WHERE NOT EXISTS (SELECT 1 FROM public.workspaces);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspaces_select" ON public.workspaces;
CREATE POLICY "workspaces_select" ON public.workspaces FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- workspace_members — the new 4-tier role for the Task module (PRD §3.2).
-- Seeded from profiles.role (the existing HR-wide role) + reporting_manager_id
-- (the existing, already-shared manager reference — see PPL-01 in the PRD:
-- "this single field is the source of truth for who reports to whom"; KD Ops
-- already has exactly one such field, reporting_manager_id, shared with
-- Track's approval chain, so it is reused rather than duplicated).
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'manager', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.workspace_members (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT
  (SELECT id FROM public.workspaces LIMIT 1),
  p.id,
  CASE
    WHEN p.role = 'super_admin' THEN 'owner'
    WHEN p.role = 'admin' THEN 'admin'
    WHEN EXISTS (
      SELECT 1 FROM public.profiles r WHERE r.reporting_manager_id = p.id AND COALESCE(r.status, 'active') = 'active'
    ) THEN 'manager'
    ELSE 'member'
  END::public.workspace_role
FROM public.profiles p
WHERE COALESCE(p.status, 'active') = 'active'
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Helper predicates (PRD §6.1), SECURITY DEFINER STABLE throughout so they
-- never recurse into the policies that call them (SEC-12).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workspace_role_of(p_user_id uuid DEFAULT auth.uid())
RETURNS public.workspace_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE user_id = p_user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_owner(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.workspace_role_of(p_user_id) = 'owner';
$$;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.workspace_role_of(p_user_id) IN ('owner', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_manager(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.workspace_role_of(p_user_id) = 'manager';
$$;

-- PPL-03: non-transitive — direct reports only, never walked further.
CREATE OR REPLACE FUNCTION public.is_manager_of(p_manager_id uuid, p_target_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_target_id AND reporting_manager_id = p_manager_id
  );
$$;

-- PPL-04: resolves scope server-side before any aggregate/cross-person read.
CREATE OR REPLACE FUNCTION public.visible_people(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (person_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id FROM public.profiles p
  WHERE
    public.is_admin(p_user_id)
    OR p.id = p_user_id
    OR (public.is_manager(p_user_id) AND p.reporting_manager_id = p_user_id);
$$;

GRANT EXECUTE ON FUNCTION
  public.workspace_role_of(uuid), public.is_workspace_member(uuid),
  public.is_owner(uuid), public.is_admin(uuid), public.is_manager(uuid),
  public.is_manager_of(uuid, uuid), public.visible_people(uuid)
  TO authenticated;

DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
CREATE POLICY "workspace_members_select" ON public.workspace_members
  FOR SELECT TO authenticated USING (true);

-- PPL-02: only owners/admins set role or manager; nobody edits their own.
DROP POLICY IF EXISTS "workspace_members_update" ON public.workspace_members;
CREATE POLICY "workspace_members_update" ON public.workspace_members
  FOR UPDATE TO authenticated USING (public.is_admin() AND user_id <> auth.uid());

DROP POLICY IF EXISTS "workspace_members_insert" ON public.workspace_members;
CREATE POLICY "workspace_members_insert" ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- statuses (PRD §7.3, TSK-01 to TSK-05) — real per-space statuses. tasks.status
-- (the existing free-text column other modules read) is kept and synced from
-- status_id by trigger, so this is additive, not breaking, for every reader
-- outside the Tasks module.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.status_category AS ENUM ('not_started', 'active', 'done', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.project_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  category public.status_category NOT NULL DEFAULT 'active',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_status_name_per_space UNIQUE (space_id, name)
);

CREATE INDEX IF NOT EXISTS idx_statuses_space ON public.statuses (space_id, position);

ALTER TABLE public.statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "statuses_select" ON public.statuses;
CREATE POLICY "statuses_select" ON public.statuses
  FOR SELECT TO authenticated USING (public.can_access_space(space_id));

DROP POLICY IF EXISTS "statuses_insert" ON public.statuses;
CREATE POLICY "statuses_insert" ON public.statuses
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_space(space_id));

DROP POLICY IF EXISTS "statuses_update" ON public.statuses;
CREATE POLICY "statuses_update" ON public.statuses
  FOR UPDATE TO authenticated USING (public.can_edit_space(space_id));

-- TSK-04: a status with tasks against it may not be deleted.
CREATE OR REPLACE FUNCTION public.prevent_delete_status_in_use()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tasks WHERE status_id = OLD.id) THEN
    RAISE EXCEPTION 'This status still has tasks on it — move them to another status before deleting it.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_delete_status_in_use ON public.statuses;
CREATE TRIGGER trg_prevent_delete_status_in_use
  BEFORE DELETE ON public.statuses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_status_in_use();

DROP POLICY IF EXISTS "statuses_delete" ON public.statuses;
CREATE POLICY "statuses_delete" ON public.statuses
  FOR DELETE TO authenticated USING (public.can_edit_space(space_id));

-- TSK-01: five seeded statuses on every new space (one not_started, three
-- active, one done). Also backfill every EXISTING space, since this table
-- is new.
CREATE OR REPLACE FUNCTION public.seed_default_statuses()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.statuses (space_id, name, color, category, position) VALUES
    (NEW.id, 'Open',        '#94a3b8', 'not_started', 0),
    (NEW.id, 'To Do',       '#60a5fa', 'active',      1),
    (NEW.id, 'In Progress', '#3b82f6', 'active',      2),
    (NEW.id, 'Blocked',     '#ef4444', 'active',      3),
    (NEW.id, 'Complete',    '#22c55e', 'done',        4)
  ON CONFLICT (space_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_statuses ON public.project_spaces;
CREATE TRIGGER trg_seed_default_statuses
  AFTER INSERT ON public.project_spaces
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_statuses();

INSERT INTO public.statuses (space_id, name, color, category, position)
SELECT s.id, v.name, v.color, v.category::public.status_category, v.position
FROM public.project_spaces s
CROSS JOIN (VALUES
  ('Open',        '#94a3b8', 'not_started', 0),
  ('To Do',       '#60a5fa', 'active',      1),
  ('In Progress', '#3b82f6', 'active',      2),
  ('Blocked',     '#ef4444', 'active',      3),
  ('Complete',    '#22c55e', 'done',        4)
) AS v(name, color, category, position)
WHERE s.deleted_at IS NULL
ON CONFLICT (space_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- tasks.status_id — the new source of truth; tasks.status (free text) is kept
-- in sync by trigger purely for backward compatibility with modules outside
-- Task (Dashboard, Goals, Projects, FlexTables, EmployeeProfile) that only
-- ever read it.
-- -----------------------------------------------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status_id uuid REFERENCES public.statuses(id);

-- TSK-05: a task's status must belong to its own list's space. Enforced here,
-- on write — effective_space_for_task already exists from the Phase 1 (Nov)
-- hardening and resolves a task's space through its list or legacy project.
CREATE OR REPLACE FUNCTION public.enforce_status_same_space()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_task_space uuid;
  v_status_space uuid;
BEGIN
  IF NEW.status_id IS NULL THEN RETURN NEW; END IF;
  v_task_space := public.effective_space_for_task(NEW.list_id, NEW.project_id);
  SELECT space_id INTO v_status_space FROM public.statuses WHERE id = NEW.status_id;
  IF v_task_space IS NOT NULL AND v_status_space IS NOT NULL AND v_task_space <> v_status_space THEN
    RAISE EXCEPTION 'This status belongs to a different space than the task''s list.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_status_same_space ON public.tasks;
CREATE TRIGGER trg_enforce_status_same_space
  BEFORE INSERT OR UPDATE OF status_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_status_same_space();

-- TSK-03: moving into a 'done' category status records completed_at; moving
-- out clears it. Also keeps the legacy tasks.status text column in sync.
CREATE OR REPLACE FUNCTION public.sync_task_status_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_category public.status_category;
  v_name text;
BEGIN
  IF NEW.status_id IS NULL THEN RETURN NEW; END IF;
  SELECT category, name INTO v_category, v_name FROM public.statuses WHERE id = NEW.status_id;

  NEW.status := CASE
    WHEN v_category = 'not_started' THEN 'open'
    WHEN v_category = 'done' OR v_category = 'closed' THEN 'complete'
    WHEN v_name = 'Blocked' THEN 'blocked'
    ELSE 'in_progress'
  END;

  IF v_category IN ('done', 'closed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_status_fields ON public.tasks;
CREATE TRIGGER trg_sync_task_status_fields
  BEFORE INSERT OR UPDATE OF status_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_status_fields();
