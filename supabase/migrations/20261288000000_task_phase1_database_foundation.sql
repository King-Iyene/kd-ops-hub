-- =============================================================================
-- Task module rebuild — Phase 1: database foundation.
--
-- Everything here is prefixed tk_ (section 4.2 of the master prompt) and is
-- entirely new: no table, enum, function or trigger here touches the
-- shared tasks/project_spaces/task_lists/task_assignees/space_members
-- schema that other KD Ops modules (Dashboard, Goals, Projects,
-- FlexTables, EmployeeProfile) depend on, and that this module's own
-- earlier attempts were torn down around in Phase 0.
--
-- Roles are NOT a new table. Per the master prompt's own instruction
-- ("the workspace role comes from KD Ops's role model through one helper
-- function"), tk_role_of() maps the existing profiles.role and
-- reporting_manager_id directly — there is no workspace_members table.
--
-- No screens in this phase. This migration also seeds the one workspace
-- row ("KD Squares") and the one dashboard template row with its seven
-- default cards — the only two rows that exist in the product on a
-- fresh start (per the master prompt's "ships empty" requirement).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 9.1 Enumerated types
-- -----------------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.tk_workspace_role AS ENUM ('owner', 'admin', 'manager', 'member'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_space_role AS ENUM ('editor', 'viewer'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_status_category AS ENUM ('not_started', 'active', 'done', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_task_priority AS ENUM ('urgent', 'high', 'normal', 'low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_field_parent AS ENUM ('list', 'table'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_field_type AS ENUM (
  'text', 'long_text', 'number', 'currency', 'date', 'checkbox',
  'single_select', 'multi_select', 'url', 'email', 'phone', 'people',
  'task_link', 'attachment', 'rating', 'created_by', 'created_at',
  'last_modified', 'auto_number'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_view_type AS ENUM ('list', 'board', 'calendar', 'table', 'grid'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_record_source AS ENUM ('grid', 'form', 'api', 'import'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_entity_type AS ENUM ('task', 'record'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.tk_dashboard_scope AS ENUM ('personal', 'admin', 'template'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 7.2 People and the workspace
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tk_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tk_workspaces (name, slug)
SELECT 'KD Squares', 'kd-squares'
WHERE NOT EXISTS (SELECT 1 FROM public.tk_workspaces);

ALTER TABLE public.tk_workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_workspaces_select" ON public.tk_workspaces;
CREATE POLICY "tk_workspaces_select" ON public.tk_workspaces FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- 7.3 Spaces and their contents
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tk_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.tk_workspaces(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS public.tk_space_members (
  space_id uuid NOT NULL REFERENCES public.tk_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.tk_space_role NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tk_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.tk_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  category public.tk_status_category NOT NULL DEFAULT 'active',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tk_unique_status_per_space UNIQUE (space_id, name)
);

CREATE TABLE IF NOT EXISTS public.tk_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.tk_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6b7280',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tk_unique_tag_per_space UNIQUE (space_id, name)
);

CREATE TABLE IF NOT EXISTS public.tk_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.tk_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 7.4 Tasks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tk_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.tk_lists(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description jsonb,
  description_text text,
  status_id uuid REFERENCES public.tk_statuses(id),
  priority public.tk_task_priority NOT NULL DEFAULT 'normal',
  start_date date,
  due_date date,
  due_has_time boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  time_estimate_min integer,
  position double precision NOT NULL DEFAULT 0,
  custom_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description_text, '')), 'B')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tk_tasks_list_status ON public.tk_tasks (list_id, status_id);
CREATE INDEX IF NOT EXISTS idx_tk_tasks_due ON public.tk_tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tk_tasks_completed ON public.tk_tasks (completed_at);
CREATE INDEX IF NOT EXISTS idx_tk_tasks_parent ON public.tk_tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tk_tasks_created_by ON public.tk_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tk_tasks_archived ON public.tk_tasks (archived_at);
CREATE INDEX IF NOT EXISTS idx_tk_tasks_custom_values ON public.tk_tasks USING GIN (custom_values);
CREATE INDEX IF NOT EXISTS idx_tk_tasks_search ON public.tk_tasks USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS public.tk_task_assignees (
  task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tk_task_assignees_user ON public.tk_task_assignees (user_id, task_id);

CREATE TABLE IF NOT EXISTS public.tk_task_watchers (
  task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tk_task_tags (
  task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tk_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.tk_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tk_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.tk_checklists(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Mirrors — FLD-20/21. Maintained by trigger from tk_tasks.custom_values.
CREATE TABLE IF NOT EXISTS public.tk_task_field_people (
  task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  field_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, field_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tk_task_field_people_user ON public.tk_task_field_people (user_id);

CREATE TABLE IF NOT EXISTS public.tk_task_field_links (
  task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  field_id uuid NOT NULL,
  linked_task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, field_id, linked_task_id)
);
CREATE INDEX IF NOT EXISTS idx_tk_task_field_links_linked ON public.tk_task_field_links (linked_task_id);

-- -----------------------------------------------------------------------------
-- 7.5 Tables, fields, records and forms
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tk_data_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.tk_spaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  primary_field_id uuid,
  task_mapping jsonb,
  auto_number_seq integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One field engine, shared by lists and tables (FLD-01/02). parent_type +
-- parent_id is the polymorphic reference no foreign key can express
-- (TEC-01): deleting a list or table must delete its fields explicitly,
-- handled by the trigger below.
CREATE TABLE IF NOT EXISTS public.tk_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type public.tk_field_parent NOT NULL,
  parent_id uuid NOT NULL,
  name text NOT NULL,
  type public.tk_field_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  is_required boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_fields_parent ON public.tk_fields (parent_type, parent_id, position);

ALTER TABLE public.tk_data_tables
  ADD CONSTRAINT tk_data_tables_primary_field_fkey FOREIGN KEY (primary_field_id) REFERENCES public.tk_fields(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.tk_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tk_data_tables(id) ON DELETE CASCADE,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_number integer,
  source public.tk_record_source NOT NULL DEFAULT 'grid',
  form_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  search_vector tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_records_table ON public.tk_records (table_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tk_records_values ON public.tk_records USING GIN (values);
CREATE INDEX IF NOT EXISTS idx_tk_records_search ON public.tk_records USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS public.tk_record_people (
  record_id uuid NOT NULL REFERENCES public.tk_records(id) ON DELETE CASCADE,
  field_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (record_id, field_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tk_record_people_user ON public.tk_record_people (user_id);

CREATE TABLE IF NOT EXISTS public.tk_record_task_links (
  record_id uuid NOT NULL REFERENCES public.tk_records(id) ON DELETE CASCADE,
  field_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tk_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (record_id, field_id, task_id)
);

CREATE TABLE IF NOT EXISTS public.tk_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tk_data_tables(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  field_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  require_auth boolean NOT NULL DEFAULT true,
  public_token uuid DEFAULT gen_random_uuid(),
  notify_user_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tk_records
  ADD CONSTRAINT tk_records_form_fkey FOREIGN KEY (form_id) REFERENCES public.tk_forms(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 7.6 Views, dashboards and collaboration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tk_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type public.tk_field_parent NOT NULL,
  parent_id uuid NOT NULL,
  name text NOT NULL,
  type public.tk_view_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_views_parent ON public.tk_views (parent_type, parent_id);

CREATE TABLE IF NOT EXISTS public.tk_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.tk_workspaces(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scope public.tk_dashboard_scope NOT NULL DEFAULT 'personal',
  name text NOT NULL DEFAULT 'Home',
  global_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tk_one_dashboard_per_owner UNIQUE (owner_id, scope)
);

CREATE TABLE IF NOT EXISTS public.tk_dashboard_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.tk_dashboards(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  layout jsonb NOT NULL DEFAULT '{"x":0,"y":0,"w":6,"h":4}'::jsonb,
  ignores_global_filter boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_dashboard_cards_dashboard ON public.tk_dashboard_cards (dashboard_id, position);

CREATE TABLE IF NOT EXISTS public.tk_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.tk_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  body jsonb NOT NULL,
  body_text text,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_comments_entity ON public.tk_comments (entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS public.tk_reactions (
  comment_id uuid NOT NULL REFERENCES public.tk_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.tk_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type public.tk_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_attachments_entity ON public.tk_attachments (entity_type, entity_id);

CREATE TABLE IF NOT EXISTS public.tk_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  entity_type public.tk_entity_type,
  entity_id uuid,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_notifications_user_unread ON public.tk_notifications (user_id, read_at);

CREATE TABLE IF NOT EXISTS public.tk_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.tk_workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type public.tk_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tk_activity_log_entity ON public.tk_activity_log (entity_type, entity_id, created_at);

-- -----------------------------------------------------------------------------
-- 9.2 Helper functions — single source of each rule.
-- -----------------------------------------------------------------------------

-- Maps KD Ops's existing profiles.role + reporting_manager_id onto the
-- PRD's four-tier model. super_admin -> owner, admin -> admin, a person
-- with at least one active direct report and no higher role -> manager,
-- everyone else -> member. See docs/task/DECISIONS.md.
CREATE OR REPLACE FUNCTION public.tk_role_of(p_user_id uuid DEFAULT auth.uid())
RETURNS public.tk_workspace_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role = 'super_admin' THEN 'owner'
    WHEN p.role = 'admin' THEN 'admin'
    WHEN EXISTS (
      SELECT 1 FROM public.profiles r
      WHERE r.reporting_manager_id = p.id AND COALESCE(r.status, 'active') = 'active'
    ) THEN 'manager'
    ELSE 'member'
  END::public.tk_workspace_role
  FROM public.profiles p WHERE p.id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.tk_is_owner(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.tk_role_of(p_user_id) = 'owner'; $$;

CREATE OR REPLACE FUNCTION public.tk_is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.tk_role_of(p_user_id) IN ('owner', 'admin'); $$;

CREATE OR REPLACE FUNCTION public.tk_is_manager(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.tk_role_of(p_user_id) = 'manager'; $$;

-- Non-transitive: direct reports only, never walked further (PPL-03).
CREATE OR REPLACE FUNCTION public.tk_is_manager_of(p_manager_id uuid, p_target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_id AND reporting_manager_id = p_manager_id);
$$;

-- Everyone for owner/admin; self + direct reports for a manager; self for a member.
CREATE OR REPLACE FUNCTION public.tk_visible_people(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (person_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id FROM public.profiles p
  WHERE
    public.tk_is_admin(p_user_id)
    OR p.id = p_user_id
    OR (public.tk_is_manager(p_user_id) AND p.reporting_manager_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.tk_can_access_space(p_space_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tk_spaces s
    WHERE s.id = p_space_id
      AND (
        public.tk_is_admin(p_user_id)
        OR EXISTS (SELECT 1 FROM public.tk_space_members sm WHERE sm.space_id = s.id AND sm.user_id = p_user_id)
        OR (NOT s.is_private)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.tk_can_edit_space(p_space_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tk_spaces s
    WHERE s.id = p_space_id
      AND s.archived_at IS NULL
      AND (
        public.tk_is_admin(p_user_id)
        OR EXISTS (
          SELECT 1 FROM public.tk_space_members sm
          WHERE sm.space_id = s.id AND sm.user_id = p_user_id AND sm.role = 'editor'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.tk_space_of_list(p_list_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT space_id FROM public.tk_lists WHERE id = p_list_id; $$;

CREATE OR REPLACE FUNCTION public.tk_space_of_table(p_table_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT space_id FROM public.tk_data_tables WHERE id = p_table_id; $$;

CREATE OR REPLACE FUNCTION public.tk_can_access_task(p_task_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.tk_can_access_space(public.tk_space_of_list(t.list_id), p_user_id)
  FROM public.tk_tasks t WHERE t.id = p_task_id;
$$;

CREATE OR REPLACE FUNCTION public.tk_can_edit_task(p_task_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.tk_can_edit_space(public.tk_space_of_list(t.list_id), p_user_id)
  FROM public.tk_tasks t WHERE t.id = p_task_id;
$$;

CREATE OR REPLACE FUNCTION public.tk_can_access_record(p_record_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.tk_can_access_space(public.tk_space_of_table(r.table_id), p_user_id)
  FROM public.tk_records r WHERE r.id = p_record_id;
$$;

-- Delegates to the space rules through the record's table, plus: a
-- member may edit a record they created or are named in (via the
-- people mirror table).
CREATE OR REPLACE FUNCTION public.tk_can_edit_record(p_record_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.tk_can_edit_space(public.tk_space_of_table(r.table_id), p_user_id)
    OR r.created_by = p_user_id
    OR EXISTS (SELECT 1 FROM public.tk_record_people rp WHERE rp.record_id = r.id AND rp.user_id = p_user_id)
  FROM public.tk_records r WHERE r.id = p_record_id;
$$;

CREATE OR REPLACE FUNCTION public.tk_can_fill_form(p_form_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tk_forms f
    JOIN public.tk_data_tables dt ON dt.id = f.table_id
    WHERE f.id = p_form_id
      AND f.is_active
      AND (NOT f.require_auth OR public.tk_can_access_space(dt.space_id, p_user_id))
  );
$$;

GRANT EXECUTE ON FUNCTION
  public.tk_role_of(uuid), public.tk_is_owner(uuid), public.tk_is_admin(uuid), public.tk_is_manager(uuid),
  public.tk_is_manager_of(uuid, uuid), public.tk_visible_people(uuid),
  public.tk_can_access_space(uuid, uuid), public.tk_can_edit_space(uuid, uuid),
  public.tk_space_of_list(uuid), public.tk_space_of_table(uuid),
  public.tk_can_access_task(uuid, uuid), public.tk_can_edit_task(uuid, uuid),
  public.tk_can_access_record(uuid, uuid), public.tk_can_edit_record(uuid, uuid),
  public.tk_can_fill_form(uuid, uuid)
  TO authenticated;


-- =============================================================================
-- Row-level security — every table, one SELECT policy and separate
-- INSERT/UPDATE/DELETE policies (SEC-10). auth.uid() wrapped as
-- (select auth.uid()) throughout so it evaluates once per query (SEC-11).
-- =============================================================================

ALTER TABLE public.tk_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_spaces_select" ON public.tk_spaces;
CREATE POLICY "tk_spaces_select" ON public.tk_spaces FOR SELECT TO authenticated USING (public.tk_can_access_space(id));
DROP POLICY IF EXISTS "tk_spaces_insert" ON public.tk_spaces;
CREATE POLICY "tk_spaces_insert" ON public.tk_spaces FOR INSERT TO authenticated WITH CHECK (public.tk_is_admin());
DROP POLICY IF EXISTS "tk_spaces_update" ON public.tk_spaces;
CREATE POLICY "tk_spaces_update" ON public.tk_spaces FOR UPDATE TO authenticated USING (public.tk_can_edit_space(id));
DROP POLICY IF EXISTS "tk_spaces_delete" ON public.tk_spaces;
CREATE POLICY "tk_spaces_delete" ON public.tk_spaces FOR DELETE TO authenticated USING (public.tk_is_admin() OR created_by = (select auth.uid()));

ALTER TABLE public.tk_space_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_space_members_select" ON public.tk_space_members;
CREATE POLICY "tk_space_members_select" ON public.tk_space_members FOR SELECT TO authenticated USING (public.tk_can_access_space(space_id));
DROP POLICY IF EXISTS "tk_space_members_insert" ON public.tk_space_members;
CREATE POLICY "tk_space_members_insert" ON public.tk_space_members FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_space_members_update" ON public.tk_space_members;
CREATE POLICY "tk_space_members_update" ON public.tk_space_members FOR UPDATE TO authenticated USING (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_space_members_delete" ON public.tk_space_members;
CREATE POLICY "tk_space_members_delete" ON public.tk_space_members FOR DELETE TO authenticated USING (public.tk_can_edit_space(space_id));

ALTER TABLE public.tk_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_statuses_select" ON public.tk_statuses;
CREATE POLICY "tk_statuses_select" ON public.tk_statuses FOR SELECT TO authenticated USING (public.tk_can_access_space(space_id));
DROP POLICY IF EXISTS "tk_statuses_insert" ON public.tk_statuses;
CREATE POLICY "tk_statuses_insert" ON public.tk_statuses FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_statuses_update" ON public.tk_statuses;
CREATE POLICY "tk_statuses_update" ON public.tk_statuses FOR UPDATE TO authenticated USING (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_statuses_delete" ON public.tk_statuses;
CREATE POLICY "tk_statuses_delete" ON public.tk_statuses FOR DELETE TO authenticated USING (public.tk_can_edit_space(space_id));

ALTER TABLE public.tk_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_tags_select" ON public.tk_tags;
CREATE POLICY "tk_tags_select" ON public.tk_tags FOR SELECT TO authenticated USING (public.tk_can_access_space(space_id));
DROP POLICY IF EXISTS "tk_tags_insert" ON public.tk_tags;
CREATE POLICY "tk_tags_insert" ON public.tk_tags FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_tags_update" ON public.tk_tags;
CREATE POLICY "tk_tags_update" ON public.tk_tags FOR UPDATE TO authenticated USING (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_tags_delete" ON public.tk_tags;
CREATE POLICY "tk_tags_delete" ON public.tk_tags FOR DELETE TO authenticated USING (public.tk_can_edit_space(space_id));

ALTER TABLE public.tk_lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_lists_select" ON public.tk_lists;
CREATE POLICY "tk_lists_select" ON public.tk_lists FOR SELECT TO authenticated USING (public.tk_can_access_space(space_id));
DROP POLICY IF EXISTS "tk_lists_insert" ON public.tk_lists;
CREATE POLICY "tk_lists_insert" ON public.tk_lists FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_lists_update" ON public.tk_lists;
CREATE POLICY "tk_lists_update" ON public.tk_lists FOR UPDATE TO authenticated USING (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_lists_delete" ON public.tk_lists;
CREATE POLICY "tk_lists_delete" ON public.tk_lists FOR DELETE TO authenticated USING (public.tk_can_edit_space(space_id));

ALTER TABLE public.tk_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_tasks_select" ON public.tk_tasks;
CREATE POLICY "tk_tasks_select" ON public.tk_tasks FOR SELECT TO authenticated USING (public.tk_can_access_space(public.tk_space_of_list(list_id)));
DROP POLICY IF EXISTS "tk_tasks_insert" ON public.tk_tasks;
CREATE POLICY "tk_tasks_insert" ON public.tk_tasks FOR INSERT TO authenticated WITH CHECK (public.tk_can_access_space(public.tk_space_of_list(list_id)));
DROP POLICY IF EXISTS "tk_tasks_update" ON public.tk_tasks;
CREATE POLICY "tk_tasks_update" ON public.tk_tasks FOR UPDATE TO authenticated USING (public.tk_can_access_space(public.tk_space_of_list(list_id)));
DROP POLICY IF EXISTS "tk_tasks_delete" ON public.tk_tasks;
CREATE POLICY "tk_tasks_delete" ON public.tk_tasks FOR DELETE TO authenticated USING (public.tk_is_admin() OR created_by = (select auth.uid()) OR public.tk_can_edit_space(public.tk_space_of_list(list_id)));

ALTER TABLE public.tk_task_assignees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_task_assignees_select" ON public.tk_task_assignees;
CREATE POLICY "tk_task_assignees_select" ON public.tk_task_assignees FOR SELECT TO authenticated USING (public.tk_can_access_task(task_id));
DROP POLICY IF EXISTS "tk_task_assignees_insert" ON public.tk_task_assignees;
CREATE POLICY "tk_task_assignees_insert" ON public.tk_task_assignees FOR INSERT TO authenticated WITH CHECK (public.tk_can_access_task(task_id));
DROP POLICY IF EXISTS "tk_task_assignees_delete" ON public.tk_task_assignees;
CREATE POLICY "tk_task_assignees_delete" ON public.tk_task_assignees FOR DELETE TO authenticated USING (public.tk_can_access_task(task_id));

ALTER TABLE public.tk_task_watchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_task_watchers_select" ON public.tk_task_watchers;
CREATE POLICY "tk_task_watchers_select" ON public.tk_task_watchers FOR SELECT TO authenticated USING (public.tk_can_access_task(task_id));
DROP POLICY IF EXISTS "tk_task_watchers_insert" ON public.tk_task_watchers;
CREATE POLICY "tk_task_watchers_insert" ON public.tk_task_watchers FOR INSERT TO authenticated WITH CHECK (public.tk_can_access_task(task_id));
DROP POLICY IF EXISTS "tk_task_watchers_delete" ON public.tk_task_watchers;
CREATE POLICY "tk_task_watchers_delete" ON public.tk_task_watchers FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

ALTER TABLE public.tk_task_tags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_task_tags_select" ON public.tk_task_tags;
CREATE POLICY "tk_task_tags_select" ON public.tk_task_tags FOR SELECT TO authenticated USING (public.tk_can_access_task(task_id));
DROP POLICY IF EXISTS "tk_task_tags_insert" ON public.tk_task_tags;
CREATE POLICY "tk_task_tags_insert" ON public.tk_task_tags FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_task(task_id));
DROP POLICY IF EXISTS "tk_task_tags_delete" ON public.tk_task_tags;
CREATE POLICY "tk_task_tags_delete" ON public.tk_task_tags FOR DELETE TO authenticated USING (public.tk_can_edit_task(task_id));

ALTER TABLE public.tk_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_checklists_select" ON public.tk_checklists;
CREATE POLICY "tk_checklists_select" ON public.tk_checklists FOR SELECT TO authenticated USING (public.tk_can_access_task(task_id));
DROP POLICY IF EXISTS "tk_checklists_insert" ON public.tk_checklists;
CREATE POLICY "tk_checklists_insert" ON public.tk_checklists FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_task(task_id));
DROP POLICY IF EXISTS "tk_checklists_update" ON public.tk_checklists;
CREATE POLICY "tk_checklists_update" ON public.tk_checklists FOR UPDATE TO authenticated USING (public.tk_can_edit_task(task_id));
DROP POLICY IF EXISTS "tk_checklists_delete" ON public.tk_checklists;
CREATE POLICY "tk_checklists_delete" ON public.tk_checklists FOR DELETE TO authenticated USING (public.tk_can_edit_task(task_id));

ALTER TABLE public.tk_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_checklist_items_select" ON public.tk_checklist_items;
CREATE POLICY "tk_checklist_items_select" ON public.tk_checklist_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tk_checklists c WHERE c.id = checklist_id AND public.tk_can_access_task(c.task_id))
);
DROP POLICY IF EXISTS "tk_checklist_items_insert" ON public.tk_checklist_items;
CREATE POLICY "tk_checklist_items_insert" ON public.tk_checklist_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.tk_checklists c WHERE c.id = checklist_id AND public.tk_can_edit_task(c.task_id))
);
DROP POLICY IF EXISTS "tk_checklist_items_update" ON public.tk_checklist_items;
CREATE POLICY "tk_checklist_items_update" ON public.tk_checklist_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tk_checklists c WHERE c.id = checklist_id AND public.tk_can_edit_task(c.task_id))
);
DROP POLICY IF EXISTS "tk_checklist_items_delete" ON public.tk_checklist_items;
CREATE POLICY "tk_checklist_items_delete" ON public.tk_checklist_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tk_checklists c WHERE c.id = checklist_id AND public.tk_can_edit_task(c.task_id))
);

ALTER TABLE public.tk_task_field_people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_task_field_people_select" ON public.tk_task_field_people;
CREATE POLICY "tk_task_field_people_select" ON public.tk_task_field_people FOR SELECT TO authenticated USING (
  public.tk_can_access_task(task_id) OR user_id = (select auth.uid())
);

ALTER TABLE public.tk_task_field_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_task_field_links_select" ON public.tk_task_field_links;
CREATE POLICY "tk_task_field_links_select" ON public.tk_task_field_links FOR SELECT TO authenticated USING (
  public.tk_can_access_task(task_id) OR public.tk_can_access_task(linked_task_id)
);

ALTER TABLE public.tk_data_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_data_tables_select" ON public.tk_data_tables;
CREATE POLICY "tk_data_tables_select" ON public.tk_data_tables FOR SELECT TO authenticated USING (public.tk_can_access_space(space_id));
DROP POLICY IF EXISTS "tk_data_tables_insert" ON public.tk_data_tables;
CREATE POLICY "tk_data_tables_insert" ON public.tk_data_tables FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_data_tables_update" ON public.tk_data_tables;
CREATE POLICY "tk_data_tables_update" ON public.tk_data_tables FOR UPDATE TO authenticated USING (public.tk_can_edit_space(space_id));
DROP POLICY IF EXISTS "tk_data_tables_delete" ON public.tk_data_tables;
CREATE POLICY "tk_data_tables_delete" ON public.tk_data_tables FOR DELETE TO authenticated USING (public.tk_can_edit_space(space_id));

-- Fields: parent is polymorphic (list or table). Visibility/edit resolve
-- through whichever parent it is.
CREATE OR REPLACE FUNCTION public.tk_can_access_field_parent(p_parent_type public.tk_field_parent, p_parent_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE p_parent_type
    WHEN 'list' THEN public.tk_can_access_space(public.tk_space_of_list(p_parent_id), p_user_id)
    WHEN 'table' THEN public.tk_can_access_space(public.tk_space_of_table(p_parent_id), p_user_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.tk_can_edit_field_parent(p_parent_type public.tk_field_parent, p_parent_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE p_parent_type
    WHEN 'list' THEN public.tk_can_edit_space(public.tk_space_of_list(p_parent_id), p_user_id)
    WHEN 'table' THEN public.tk_can_edit_space(public.tk_space_of_table(p_parent_id), p_user_id)
  END;
$$;
GRANT EXECUTE ON FUNCTION public.tk_can_access_field_parent(public.tk_field_parent, uuid, uuid), public.tk_can_edit_field_parent(public.tk_field_parent, uuid, uuid) TO authenticated;

ALTER TABLE public.tk_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_fields_select" ON public.tk_fields;
CREATE POLICY "tk_fields_select" ON public.tk_fields FOR SELECT TO authenticated USING (public.tk_can_access_field_parent(parent_type, parent_id));
DROP POLICY IF EXISTS "tk_fields_insert" ON public.tk_fields;
CREATE POLICY "tk_fields_insert" ON public.tk_fields FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_field_parent(parent_type, parent_id));
DROP POLICY IF EXISTS "tk_fields_update" ON public.tk_fields;
CREATE POLICY "tk_fields_update" ON public.tk_fields FOR UPDATE TO authenticated USING (public.tk_can_edit_field_parent(parent_type, parent_id));
DROP POLICY IF EXISTS "tk_fields_delete" ON public.tk_fields;
CREATE POLICY "tk_fields_delete" ON public.tk_fields FOR DELETE TO authenticated USING (public.tk_can_edit_field_parent(parent_type, parent_id));

ALTER TABLE public.tk_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_records_select" ON public.tk_records;
CREATE POLICY "tk_records_select" ON public.tk_records FOR SELECT TO authenticated USING (public.tk_can_access_space(public.tk_space_of_table(table_id)));
DROP POLICY IF EXISTS "tk_records_insert" ON public.tk_records;
CREATE POLICY "tk_records_insert" ON public.tk_records FOR INSERT TO authenticated WITH CHECK (public.tk_can_access_space(public.tk_space_of_table(table_id)));
DROP POLICY IF EXISTS "tk_records_update" ON public.tk_records;
CREATE POLICY "tk_records_update" ON public.tk_records FOR UPDATE TO authenticated USING (public.tk_can_edit_record(id));
DROP POLICY IF EXISTS "tk_records_delete" ON public.tk_records;
CREATE POLICY "tk_records_delete" ON public.tk_records FOR DELETE TO authenticated USING (public.tk_is_admin() OR created_by = (select auth.uid()) OR public.tk_can_edit_space(public.tk_space_of_table(table_id)));

ALTER TABLE public.tk_record_people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_record_people_select" ON public.tk_record_people;
CREATE POLICY "tk_record_people_select" ON public.tk_record_people FOR SELECT TO authenticated USING (
  public.tk_can_access_record(record_id) OR user_id = (select auth.uid())
);

ALTER TABLE public.tk_record_task_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_record_task_links_select" ON public.tk_record_task_links;
CREATE POLICY "tk_record_task_links_select" ON public.tk_record_task_links FOR SELECT TO authenticated USING (
  public.tk_can_access_record(record_id) OR public.tk_can_access_task(task_id)
);

ALTER TABLE public.tk_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_forms_select" ON public.tk_forms;
CREATE POLICY "tk_forms_select" ON public.tk_forms FOR SELECT TO authenticated USING (public.tk_can_access_space(public.tk_space_of_table(table_id)));
DROP POLICY IF EXISTS "tk_forms_insert" ON public.tk_forms;
CREATE POLICY "tk_forms_insert" ON public.tk_forms FOR INSERT TO authenticated WITH CHECK (public.tk_can_edit_space(public.tk_space_of_table(table_id)));
DROP POLICY IF EXISTS "tk_forms_update" ON public.tk_forms;
CREATE POLICY "tk_forms_update" ON public.tk_forms FOR UPDATE TO authenticated USING (public.tk_can_edit_space(public.tk_space_of_table(table_id)));
DROP POLICY IF EXISTS "tk_forms_delete" ON public.tk_forms;
CREATE POLICY "tk_forms_delete" ON public.tk_forms FOR DELETE TO authenticated USING (public.tk_can_edit_space(public.tk_space_of_table(table_id)));

ALTER TABLE public.tk_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_views_select" ON public.tk_views;
CREATE POLICY "tk_views_select" ON public.tk_views FOR SELECT TO authenticated USING (public.tk_can_access_field_parent(parent_type, parent_id));
DROP POLICY IF EXISTS "tk_views_insert" ON public.tk_views;
CREATE POLICY "tk_views_insert" ON public.tk_views FOR INSERT TO authenticated WITH CHECK (public.tk_can_access_field_parent(parent_type, parent_id));
DROP POLICY IF EXISTS "tk_views_update" ON public.tk_views;
CREATE POLICY "tk_views_update" ON public.tk_views FOR UPDATE TO authenticated USING (
  created_by = (select auth.uid()) OR (is_shared AND public.tk_can_edit_field_parent(parent_type, parent_id))
);
DROP POLICY IF EXISTS "tk_views_delete" ON public.tk_views;
CREATE POLICY "tk_views_delete" ON public.tk_views FOR DELETE TO authenticated USING (
  created_by = (select auth.uid()) OR public.tk_can_edit_field_parent(parent_type, parent_id)
);

-- Dashboards and cards: the owner reads/writes their own, admins read
-- all, the template is readable by everyone.
ALTER TABLE public.tk_dashboards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_dashboards_select" ON public.tk_dashboards;
CREATE POLICY "tk_dashboards_select" ON public.tk_dashboards FOR SELECT TO authenticated USING (
  owner_id = (select auth.uid()) OR scope = 'template' OR public.tk_is_admin()
);
DROP POLICY IF EXISTS "tk_dashboards_insert" ON public.tk_dashboards;
CREATE POLICY "tk_dashboards_insert" ON public.tk_dashboards FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()));
DROP POLICY IF EXISTS "tk_dashboards_update" ON public.tk_dashboards;
CREATE POLICY "tk_dashboards_update" ON public.tk_dashboards FOR UPDATE TO authenticated USING (owner_id = (select auth.uid()));
DROP POLICY IF EXISTS "tk_dashboards_delete" ON public.tk_dashboards;
CREATE POLICY "tk_dashboards_delete" ON public.tk_dashboards FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

ALTER TABLE public.tk_dashboard_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_dashboard_cards_select" ON public.tk_dashboard_cards;
CREATE POLICY "tk_dashboard_cards_select" ON public.tk_dashboard_cards FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tk_dashboards d WHERE d.id = dashboard_id AND (d.owner_id = (select auth.uid()) OR d.scope = 'template' OR public.tk_is_admin()))
);
DROP POLICY IF EXISTS "tk_dashboard_cards_insert" ON public.tk_dashboard_cards;
CREATE POLICY "tk_dashboard_cards_insert" ON public.tk_dashboard_cards FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.tk_dashboards d WHERE d.id = dashboard_id AND d.owner_id = (select auth.uid()))
);
DROP POLICY IF EXISTS "tk_dashboard_cards_update" ON public.tk_dashboard_cards;
CREATE POLICY "tk_dashboard_cards_update" ON public.tk_dashboard_cards FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tk_dashboards d WHERE d.id = dashboard_id AND d.owner_id = (select auth.uid()))
);
DROP POLICY IF EXISTS "tk_dashboard_cards_delete" ON public.tk_dashboard_cards;
CREATE POLICY "tk_dashboard_cards_delete" ON public.tk_dashboard_cards FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tk_dashboards d WHERE d.id = dashboard_id AND d.owner_id = (select auth.uid()))
);

-- Comments/reactions/attachments: readable when the underlying task or
-- record is; comments and attachments are polymorphic parents (TEC-01).
CREATE OR REPLACE FUNCTION public.tk_can_access_entity(p_entity_type public.tk_entity_type, p_entity_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'task' THEN public.tk_can_access_task(p_entity_id, p_user_id)
    WHEN 'record' THEN public.tk_can_access_record(p_entity_id, p_user_id)
  END;
$$;
GRANT EXECUTE ON FUNCTION public.tk_can_access_entity(public.tk_entity_type, uuid, uuid) TO authenticated;

ALTER TABLE public.tk_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_comments_select" ON public.tk_comments;
CREATE POLICY "tk_comments_select" ON public.tk_comments FOR SELECT TO authenticated USING (public.tk_can_access_entity(entity_type, entity_id));
DROP POLICY IF EXISTS "tk_comments_insert" ON public.tk_comments;
CREATE POLICY "tk_comments_insert" ON public.tk_comments FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()) AND public.tk_can_access_entity(entity_type, entity_id));
DROP POLICY IF EXISTS "tk_comments_update" ON public.tk_comments;
CREATE POLICY "tk_comments_update" ON public.tk_comments FOR UPDATE TO authenticated USING (created_by = (select auth.uid()));
DROP POLICY IF EXISTS "tk_comments_delete" ON public.tk_comments;
CREATE POLICY "tk_comments_delete" ON public.tk_comments FOR DELETE TO authenticated USING (created_by = (select auth.uid()) OR public.tk_is_admin());

ALTER TABLE public.tk_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_reactions_select" ON public.tk_reactions;
CREATE POLICY "tk_reactions_select" ON public.tk_reactions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tk_comments c WHERE c.id = comment_id AND public.tk_can_access_entity(c.entity_type, c.entity_id))
);
DROP POLICY IF EXISTS "tk_reactions_insert" ON public.tk_reactions;
CREATE POLICY "tk_reactions_insert" ON public.tk_reactions FOR INSERT TO authenticated WITH CHECK (
  user_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.tk_comments c WHERE c.id = comment_id AND public.tk_can_access_entity(c.entity_type, c.entity_id))
);
DROP POLICY IF EXISTS "tk_reactions_delete" ON public.tk_reactions;
CREATE POLICY "tk_reactions_delete" ON public.tk_reactions FOR DELETE TO authenticated USING (user_id = (select auth.uid()));

ALTER TABLE public.tk_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_attachments_select" ON public.tk_attachments;
CREATE POLICY "tk_attachments_select" ON public.tk_attachments FOR SELECT TO authenticated USING (public.tk_can_access_entity(entity_type, entity_id));
DROP POLICY IF EXISTS "tk_attachments_insert" ON public.tk_attachments;
CREATE POLICY "tk_attachments_insert" ON public.tk_attachments FOR INSERT TO authenticated WITH CHECK (uploaded_by = (select auth.uid()) AND public.tk_can_access_entity(entity_type, entity_id));
DROP POLICY IF EXISTS "tk_attachments_delete" ON public.tk_attachments;
CREATE POLICY "tk_attachments_delete" ON public.tk_attachments FOR DELETE TO authenticated USING (uploaded_by = (select auth.uid()) OR public.tk_is_admin());

-- Notifications: only the recipient.
ALTER TABLE public.tk_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_notifications_select" ON public.tk_notifications;
CREATE POLICY "tk_notifications_select" ON public.tk_notifications FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
DROP POLICY IF EXISTS "tk_notifications_update" ON public.tk_notifications;
CREATE POLICY "tk_notifications_update" ON public.tk_notifications FOR UPDATE TO authenticated USING (user_id = (select auth.uid()));
-- Inserted only by triggers/SECURITY DEFINER functions, never directly
-- by a client — no INSERT policy for `authenticated` is defined.

-- Activity log: inserted only by triggers; admins read everything,
-- others only entries for things they can already access.
ALTER TABLE public.tk_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tk_activity_log_select" ON public.tk_activity_log;
CREATE POLICY "tk_activity_log_select" ON public.tk_activity_log FOR SELECT TO authenticated USING (
  public.tk_is_admin() OR public.tk_can_access_entity(entity_type, entity_id)
);

-- =============================================================================
-- Triggers — the rules enforced in the database (section 9.5).
-- =============================================================================

-- TSK-01 equivalent: five default statuses on every new space.
CREATE OR REPLACE FUNCTION public.tk_seed_default_statuses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tk_statuses (space_id, name, color, category, position) VALUES
    (NEW.id, 'To Do',       '#94a3b8', 'not_started', 0),
    (NEW.id, 'In Progress', '#3b82f6', 'active',      1),
    (NEW.id, 'In Review',   '#f59e0b', 'active',      2),
    (NEW.id, 'Blocked',     '#ef4444', 'active',      3),
    (NEW.id, 'Complete',    '#22c55e', 'done',        4)
  ON CONFLICT (space_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_seed_default_statuses ON public.tk_spaces;
CREATE TRIGGER trg_tk_seed_default_statuses AFTER INSERT ON public.tk_spaces
  FOR EACH ROW EXECUTE FUNCTION public.tk_seed_default_statuses();

-- A new space's creator becomes an editor member automatically (7.0).
CREATE OR REPLACE FUNCTION public.tk_add_creator_as_editor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.tk_space_members (space_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'editor')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_add_creator_as_editor ON public.tk_spaces;
CREATE TRIGGER trg_tk_add_creator_as_editor AFTER INSERT ON public.tk_spaces
  FOR EACH ROW EXECUTE FUNCTION public.tk_add_creator_as_editor();

-- TSK-04 equivalent: a status with tasks against it cannot be deleted.
CREATE OR REPLACE FUNCTION public.tk_prevent_delete_status_in_use()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tk_tasks WHERE status_id = OLD.id) THEN
    RAISE EXCEPTION 'This status still has tasks on it. Move them to another status before deleting it.';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_prevent_delete_status_in_use ON public.tk_statuses;
CREATE TRIGGER trg_tk_prevent_delete_status_in_use BEFORE DELETE ON public.tk_statuses
  FOR EACH ROW EXECUTE FUNCTION public.tk_prevent_delete_status_in_use();

-- TSK-05 equivalent: a task's status must belong to its own list's space.
CREATE OR REPLACE FUNCTION public.tk_enforce_status_same_space()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_task_space uuid; v_status_space uuid;
BEGIN
  IF NEW.status_id IS NULL THEN RETURN NEW; END IF;
  v_task_space := public.tk_space_of_list(NEW.list_id);
  SELECT space_id INTO v_status_space FROM public.tk_statuses WHERE id = NEW.status_id;
  IF v_task_space IS DISTINCT FROM v_status_space THEN
    RAISE EXCEPTION 'This status belongs to a different space than the task''s list.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_enforce_status_same_space ON public.tk_tasks;
CREATE TRIGGER trg_tk_enforce_status_same_space BEFORE INSERT OR UPDATE OF status_id, list_id ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_enforce_status_same_space();

-- TSK-03 equivalent: completed_at set on entering a done-category status,
-- cleared on leaving one.
CREATE OR REPLACE FUNCTION public.tk_sync_completed_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_category public.tk_status_category;
BEGIN
  IF NEW.status_id IS NULL THEN
    NEW.completed_at := NULL;
    RETURN NEW;
  END IF;
  SELECT category INTO v_category FROM public.tk_statuses WHERE id = NEW.status_id;
  IF v_category IN ('done', 'closed') THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_sync_completed_at ON public.tk_tasks;
CREATE TRIGGER trg_tk_sync_completed_at BEFORE INSERT OR UPDATE OF status_id ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_sync_completed_at();

-- Subtasks exactly one level deep (TSK-26 equivalent).
CREATE OR REPLACE FUNCTION public.tk_enforce_subtask_depth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_parent_has_parent boolean; v_has_children boolean;
BEGIN
  IF NEW.parent_task_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_task_id = NEW.id THEN RAISE EXCEPTION 'A task cannot be its own parent.'; END IF;
  SELECT (parent_task_id IS NOT NULL) INTO v_parent_has_parent FROM public.tk_tasks WHERE id = NEW.parent_task_id;
  IF v_parent_has_parent THEN RAISE EXCEPTION 'Subtasks are exactly one level deep.'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.tk_tasks WHERE parent_task_id = NEW.id) INTO v_has_children;
  IF v_has_children THEN RAISE EXCEPTION 'This task already has subtasks of its own.'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_enforce_subtask_depth ON public.tk_tasks;
CREATE TRIGGER trg_tk_enforce_subtask_depth BEFORE INSERT OR UPDATE OF parent_task_id ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_enforce_subtask_depth();

-- Creator and each assignee become watchers automatically.
CREATE OR REPLACE FUNCTION public.tk_auto_watch_creator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.tk_task_watchers (task_id, user_id) VALUES (NEW.id, NEW.created_by) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_auto_watch_creator ON public.tk_tasks;
CREATE TRIGGER trg_tk_auto_watch_creator AFTER INSERT ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_auto_watch_creator();

CREATE OR REPLACE FUNCTION public.tk_auto_watch_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tk_task_watchers (task_id, user_id) VALUES (NEW.task_id, NEW.user_id) ON CONFLICT DO NOTHING;
  -- Assigned to a task notification (deduplicated: one row per insert here is fine, the job-level dedup in Phase 13 covers scheduled jobs).
  IF NEW.user_id <> COALESCE(NEW.assigned_by, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.tk_notifications (user_id, type, entity_type, entity_id, actor_id, payload)
    VALUES (NEW.user_id, 'assigned', 'task', NEW.task_id, NEW.assigned_by, '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_auto_watch_assignee ON public.tk_task_assignees;
CREATE TRIGGER trg_tk_auto_watch_assignee AFTER INSERT ON public.tk_task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tk_auto_watch_assignee();

-- Comment on a task notifies watchers except the author; @mentions notify
-- the mentioned people.
CREATE OR REPLACE FUNCTION public.tk_notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_mentioned uuid;
BEGIN
  IF NEW.entity_type = 'task' THEN
    INSERT INTO public.tk_notifications (user_id, type, entity_type, entity_id, actor_id, payload)
    SELECT w.user_id, 'comment', 'task', NEW.entity_id, NEW.created_by, jsonb_build_object('comment_id', NEW.id)
    FROM public.tk_task_watchers w
    WHERE w.task_id = NEW.entity_id AND w.user_id <> NEW.created_by;
  END IF;

  FOREACH v_mentioned IN ARRAY COALESCE(NEW.mentions, '{}')
  LOOP
    IF v_mentioned <> NEW.created_by THEN
      INSERT INTO public.tk_notifications (user_id, type, entity_type, entity_id, actor_id, payload)
      VALUES (v_mentioned, 'mention', NEW.entity_type, NEW.entity_id, NEW.created_by, jsonb_build_object('comment_id', NEW.id));
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_notify_on_comment ON public.tk_comments;
CREATE TRIGGER trg_tk_notify_on_comment AFTER INSERT ON public.tk_comments
  FOR EACH ROW EXECUTE FUNCTION public.tk_notify_on_comment();

-- Status changed notifies watchers.
CREATE OR REPLACE FUNCTION public.tk_notify_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status_name text;
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id AND NEW.status_id IS NOT NULL THEN
    SELECT name INTO v_status_name FROM public.tk_statuses WHERE id = NEW.status_id;
    INSERT INTO public.tk_notifications (user_id, type, entity_type, entity_id, actor_id, payload)
    SELECT w.user_id, 'status_changed', 'task', NEW.id, NULL, jsonb_build_object('status', v_status_name)
    FROM public.tk_task_watchers w;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_notify_status_change ON public.tk_tasks;
CREATE TRIGGER trg_tk_notify_status_change AFTER UPDATE OF status_id ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_notify_status_change();

-- Field engine: cap of 50 fields per parent (FLD-03), select fields must
-- carry options (FLD-04), system types are read-only (FLD-07, enforced
-- by simply never being settable through normal field creation UI —
-- the database constraint here blocks is_required on them, which is the
-- one write-time rule that can be enforced structurally).
CREATE OR REPLACE FUNCTION public.tk_enforce_field_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.tk_fields WHERE parent_type = NEW.parent_type AND parent_id = NEW.parent_id;
  IF TG_OP = 'INSERT' AND v_count >= 50 THEN
    RAISE EXCEPTION 'This % already has 50 fields, the limit.', NEW.parent_type;
  END IF;

  IF NEW.type IN ('single_select', 'multi_select') AND (NEW.config -> 'options') IS NULL THEN
    RAISE EXCEPTION 'A select field must carry an options array.';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_enforce_field_rules ON public.tk_fields;
CREATE TRIGGER trg_tk_enforce_field_rules BEFORE INSERT OR UPDATE ON public.tk_fields
  FOR EACH ROW EXECUTE FUNCTION public.tk_enforce_field_rules();

-- Polymorphic parent cleanup (TEC-01): deleting a list or table must
-- explicitly delete its fields and views.
CREATE OR REPLACE FUNCTION public.tk_cleanup_list_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tk_fields WHERE parent_type = 'list' AND parent_id = OLD.id;
  DELETE FROM public.tk_views WHERE parent_type = 'list' AND parent_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_cleanup_list_parent ON public.tk_lists;
CREATE TRIGGER trg_tk_cleanup_list_parent BEFORE DELETE ON public.tk_lists
  FOR EACH ROW EXECUTE FUNCTION public.tk_cleanup_list_parent();

CREATE OR REPLACE FUNCTION public.tk_cleanup_table_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tk_fields WHERE parent_type = 'table' AND parent_id = OLD.id;
  DELETE FROM public.tk_views WHERE parent_type = 'table' AND parent_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_cleanup_table_parent ON public.tk_data_tables;
CREATE TRIGGER trg_tk_cleanup_table_parent BEFORE DELETE ON public.tk_data_tables
  FOR EACH ROW EXECUTE FUNCTION public.tk_cleanup_table_parent();

CREATE OR REPLACE FUNCTION public.tk_cleanup_task_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tk_comments WHERE entity_type = 'task' AND entity_id = OLD.id;
  DELETE FROM public.tk_attachments WHERE entity_type = 'task' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_cleanup_task_parent ON public.tk_tasks;
CREATE TRIGGER trg_tk_cleanup_task_parent BEFORE DELETE ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_cleanup_task_parent();

CREATE OR REPLACE FUNCTION public.tk_cleanup_record_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tk_comments WHERE entity_type = 'record' AND entity_id = OLD.id;
  DELETE FROM public.tk_attachments WHERE entity_type = 'record' AND entity_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_cleanup_record_parent ON public.tk_records;
CREATE TRIGGER trg_tk_cleanup_record_parent BEFORE DELETE ON public.tk_records
  FOR EACH ROW EXECUTE FUNCTION public.tk_cleanup_record_parent();

-- Mirrors (FLD-20/21): tk_tasks.custom_values and tk_records.values are
-- JSON keyed by field id. Any key whose field is of type 'people' or
-- 'task_link' gets mirrored into a real join table, in the same
-- transaction, on every insert and update.
CREATE OR REPLACE FUNCTION public.tk_mirror_task_custom_values()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_field record; v_elem text;
BEGIN
  DELETE FROM public.tk_task_field_people WHERE task_id = NEW.id;
  DELETE FROM public.tk_task_field_links WHERE task_id = NEW.id;

  FOR v_field IN
    SELECT f.id, f.type FROM public.tk_fields f
    WHERE f.parent_type = 'list'
      AND f.parent_id = (SELECT list_id FROM public.tk_tasks WHERE id = NEW.id)
      AND f.type IN ('people', 'task_link')
  LOOP
    IF jsonb_typeof(NEW.custom_values -> v_field.id::text) = 'array' THEN
      FOR v_elem IN SELECT jsonb_array_elements_text(NEW.custom_values -> v_field.id::text)
      LOOP
        IF v_field.type = 'people' THEN
          INSERT INTO public.tk_task_field_people (task_id, field_id, user_id) VALUES (NEW.id, v_field.id, v_elem::uuid) ON CONFLICT DO NOTHING;
        ELSE
          INSERT INTO public.tk_task_field_links (task_id, field_id, linked_task_id) VALUES (NEW.id, v_field.id, v_elem::uuid) ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_mirror_task_custom_values ON public.tk_tasks;
CREATE TRIGGER trg_tk_mirror_task_custom_values AFTER INSERT OR UPDATE OF custom_values ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_mirror_task_custom_values();

CREATE OR REPLACE FUNCTION public.tk_mirror_record_values()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_field record; v_elem text; v_new_person uuid;
BEGIN
  DELETE FROM public.tk_record_people WHERE record_id = NEW.id;
  DELETE FROM public.tk_record_task_links WHERE record_id = NEW.id;

  FOR v_field IN
    SELECT f.id, f.type FROM public.tk_fields f
    WHERE f.parent_type = 'table'
      AND f.parent_id = (SELECT table_id FROM public.tk_records WHERE id = NEW.id)
      AND f.type IN ('people', 'task_link')
  LOOP
    IF jsonb_typeof(NEW.values -> v_field.id::text) = 'array' THEN
      FOR v_elem IN SELECT jsonb_array_elements_text(NEW.values -> v_field.id::text)
      LOOP
        IF v_field.type = 'people' THEN
          v_new_person := v_elem::uuid;
          INSERT INTO public.tk_record_people (record_id, field_id, user_id) VALUES (NEW.id, v_field.id, v_new_person) ON CONFLICT DO NOTHING;
          -- Named in a People field of a new record notifies the person.
          IF TG_OP = 'INSERT' THEN
            INSERT INTO public.tk_notifications (user_id, type, entity_type, entity_id, actor_id, payload)
            VALUES (v_new_person, 'record_named', 'record', NEW.id, NEW.created_by, '{}'::jsonb);
          END IF;
        ELSE
          INSERT INTO public.tk_record_task_links (record_id, field_id, task_id) VALUES (NEW.id, v_field.id, v_elem::uuid) ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_mirror_record_values ON public.tk_records;
CREATE TRIGGER trg_tk_mirror_record_values AFTER INSERT OR UPDATE OF values ON public.tk_records
  FOR EACH ROW EXECUTE FUNCTION public.tk_mirror_record_values();

-- search_vector on records (no generated column possible since it needs
-- to read sibling fields' plain text via config — kept simple: records
-- have no description_text equivalent yet, just index the primary field
-- value text in Phase 1; richer search lands with Phase 9's grid.)
CREATE OR REPLACE FUNCTION public.tk_sync_record_search_vector()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.values::text, ''));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_sync_record_search_vector ON public.tk_records;
CREATE TRIGGER trg_tk_sync_record_search_vector BEFORE INSERT OR UPDATE OF values ON public.tk_records
  FOR EACH ROW EXECUTE FUNCTION public.tk_sync_record_search_vector();

-- Activity log (NTF-10/11): before-and-after diff on tasks and records.
CREATE OR REPLACE FUNCTION public.tk_log_task_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tk_activity_log (workspace_id, actor_id, entity_type, entity_id, action, diff)
  VALUES (
    (SELECT id FROM public.tk_workspaces LIMIT 1),
    (select auth.uid()),
    'task',
    COALESCE(NEW.id, OLD.id),
    lower(TG_OP),
    CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_object('after', to_jsonb(NEW))
         WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
         ELSE jsonb_build_object('before', to_jsonb(OLD)) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_log_task_activity ON public.tk_tasks;
CREATE TRIGGER trg_tk_log_task_activity AFTER INSERT OR UPDATE OR DELETE ON public.tk_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tk_log_task_activity();

CREATE OR REPLACE FUNCTION public.tk_log_record_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tk_activity_log (workspace_id, actor_id, entity_type, entity_id, action, diff)
  VALUES (
    (SELECT id FROM public.tk_workspaces LIMIT 1),
    (select auth.uid()),
    'record',
    COALESCE(NEW.id, OLD.id),
    lower(TG_OP),
    CASE WHEN TG_OP = 'INSERT' THEN jsonb_build_object('after', to_jsonb(NEW))
         WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
         ELSE jsonb_build_object('before', to_jsonb(OLD)) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_tk_log_record_activity ON public.tk_records;
CREATE TRIGGER trg_tk_log_record_activity AFTER INSERT OR UPDATE OR DELETE ON public.tk_records
  FOR EACH ROW EXECUTE FUNCTION public.tk_log_record_activity();

-- updated_at helpers
CREATE OR REPLACE FUNCTION public.tk_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_tk_spaces_updated_at ON public.tk_spaces;
CREATE TRIGGER trg_tk_spaces_updated_at BEFORE UPDATE ON public.tk_spaces FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_lists_updated_at ON public.tk_lists;
CREATE TRIGGER trg_tk_lists_updated_at BEFORE UPDATE ON public.tk_lists FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_tasks_updated_at ON public.tk_tasks;
CREATE TRIGGER trg_tk_tasks_updated_at BEFORE UPDATE ON public.tk_tasks FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_records_updated_at ON public.tk_records;
CREATE TRIGGER trg_tk_records_updated_at BEFORE UPDATE ON public.tk_records FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_data_tables_updated_at ON public.tk_data_tables;
CREATE TRIGGER trg_tk_data_tables_updated_at BEFORE UPDATE ON public.tk_data_tables FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_forms_updated_at ON public.tk_forms;
CREATE TRIGGER trg_tk_forms_updated_at BEFORE UPDATE ON public.tk_forms FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_views_updated_at ON public.tk_views;
CREATE TRIGGER trg_tk_views_updated_at BEFORE UPDATE ON public.tk_views FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_dashboards_updated_at ON public.tk_dashboards;
CREATE TRIGGER trg_tk_dashboards_updated_at BEFORE UPDATE ON public.tk_dashboards FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_fields_updated_at ON public.tk_fields;
CREATE TRIGGER trg_tk_fields_updated_at BEFORE UPDATE ON public.tk_fields FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();
DROP TRIGGER IF EXISTS trg_tk_workspaces_updated_at ON public.tk_workspaces;
CREATE TRIGGER trg_tk_workspaces_updated_at BEFORE UPDATE ON public.tk_workspaces FOR EACH ROW EXECUTE FUNCTION public.tk_set_updated_at();

-- =============================================================================
-- Dashboard template — the one other row this phase seeds (section 7.1's
-- default layout). Owner_id is NULL (templates have no personal owner);
-- the unique(owner_id, scope) constraint allows many NULL owner_id rows
-- since Postgres treats NULLs as distinct in unique constraints, but we
-- only ever want exactly one template, so guard with a partial unique
-- index instead.
-- =============================================================================
ALTER TABLE public.tk_dashboards DROP CONSTRAINT IF EXISTS tk_one_dashboard_per_owner;
CREATE UNIQUE INDEX IF NOT EXISTS tk_one_dashboard_per_owner ON public.tk_dashboards (owner_id, scope) WHERE owner_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tk_one_template_dashboard ON public.tk_dashboards (scope) WHERE scope = 'template';

INSERT INTO public.tk_dashboards (workspace_id, owner_id, scope, name)
SELECT (SELECT id FROM public.tk_workspaces LIMIT 1), NULL, 'template', 'Home'
WHERE NOT EXISTS (SELECT 1 FROM public.tk_dashboards WHERE scope = 'template');

INSERT INTO public.tk_dashboard_cards (dashboard_id, type, title, layout, position)
SELECT d.id, v.type, v.title, v.layout::jsonb, v.position
FROM public.tk_dashboards d
CROSS JOIN (VALUES
  ('summary',  'Summary',              '{"x":0,"y":0,"w":12,"h":2}', 0),
  ('my_work',  'My Work',              '{"x":0,"y":2,"w":6,"h":5}',  1),
  ('my_board', 'My Board',             '{"x":6,"y":2,"w":6,"h":5}',  2),
  ('this_week','This Week',            '{"x":0,"y":7,"w":6,"h":4}',  3),
  ('delegated','Delegated',            '{"x":6,"y":7,"w":6,"h":4}',  4),
  ('mentions', 'Mentions and comments','{"x":0,"y":11,"w":6,"h":4}', 5),
  ('my_records','My records',         '{"x":6,"y":11,"w":6,"h":4}', 6)
) AS v(type, title, layout, position)
WHERE d.scope = 'template'
  AND NOT EXISTS (SELECT 1 FROM public.tk_dashboard_cards WHERE dashboard_id = d.id);

-- -----------------------------------------------------------------------------
-- A function every person's own dashboard is created from, lazily, on
-- first use (section 7.1: "each person gets their own copy of the
-- template the first time they open Home").
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tk_get_or_create_my_dashboard()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_workspace uuid; v_template uuid;
BEGIN
  SELECT id INTO v_id FROM public.tk_dashboards WHERE owner_id = (select auth.uid()) AND scope = 'personal';
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_workspace FROM public.tk_workspaces LIMIT 1;
  INSERT INTO public.tk_dashboards (workspace_id, owner_id, scope, name)
  VALUES (v_workspace, (select auth.uid()), 'personal', 'Home')
  RETURNING id INTO v_id;

  SELECT id INTO v_template FROM public.tk_dashboards WHERE scope = 'template';
  INSERT INTO public.tk_dashboard_cards (dashboard_id, type, title, config, layout, ignores_global_filter, position)
  SELECT v_id, type, title, config, layout, ignores_global_filter, position
  FROM public.tk_dashboard_cards WHERE dashboard_id = v_template;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tk_get_or_create_my_dashboard() TO authenticated;

-- -----------------------------------------------------------------------------
-- Storage bucket for attachments — private, never publicly addressable
-- (SEC-20).
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
SELECT 'tk-attachments', 'tk-attachments', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'tk-attachments');

DROP POLICY IF EXISTS "tk_attachments_storage_select" ON storage.objects;
CREATE POLICY "tk_attachments_storage_select" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'tk-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tk_attachments a
    WHERE a.storage_path = name AND public.tk_can_access_entity(a.entity_type, a.entity_id)
  )
);
DROP POLICY IF EXISTS "tk_attachments_storage_insert" ON storage.objects;
CREATE POLICY "tk_attachments_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'tk-attachments'
);
DROP POLICY IF EXISTS "tk_attachments_storage_delete" ON storage.objects;
CREATE POLICY "tk_attachments_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'tk-attachments'
  AND EXISTS (
    SELECT 1 FROM public.tk_attachments a
    WHERE a.storage_path = name AND (a.uploaded_by = (select auth.uid()) OR public.tk_is_admin())
  )
);
