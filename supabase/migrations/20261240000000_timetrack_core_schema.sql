-- =============================================================================
-- Time Tracking & Workforce Management module ("timetrack") — core schema.
--
-- Standalone by design: does NOT touch the existing timesheets/
-- timesheet_entries/attendance/shifts tables or pages. Reuses `profiles` as
-- the employee source of truth and `public.current_user_role()` for the
-- app-wide admin/super_admin bypass, but defines its OWN role/capability
-- system (time_roles/time_user_roles) so new role types can be added later
-- via a row insert, not a migration — per spec section 6.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Capability-based roles (extensible without schema changes)
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_roles (
  role_key text PRIMARY KEY,
  label text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.time_roles (role_key, label, capabilities) VALUES
  ('time_admin', 'Admin', jsonb_build_object(
    'manage_projects', true, 'manage_tasks', true, 'track_time', true,
    'view_others_time', true, 'approve_timesheets', true, 'manage_rates', true,
    'create_invoices', true, 'manage_custom_fields', true, 'manage_clients', true,
    'manage_planner', true, 'manage_leave_types', true, 'approve_leave', true,
    'manage_overtime_rules', true, 'manage_budgets', true, 'track_time_for_others', true
  )),
  ('project_manager', 'Project Manager', jsonb_build_object(
    'manage_projects', false, 'manage_tasks', true, 'track_time', true,
    'view_others_time', true, 'approve_timesheets', true, 'manage_rates', false,
    'create_invoices', false, 'manage_custom_fields', false, 'manage_clients', false,
    'manage_planner', true, 'manage_leave_types', false, 'approve_leave', true,
    'manage_overtime_rules', false, 'manage_budgets', false, 'track_time_for_others', false
  )),
  ('regular_user', 'Regular User', jsonb_build_object(
    'manage_projects', false, 'manage_tasks', false, 'track_time', true,
    'view_others_time', false, 'approve_timesheets', false, 'manage_rates', false,
    'create_invoices', false, 'manage_custom_fields', false, 'manage_clients', false,
    'manage_planner', false, 'manage_leave_types', false, 'approve_leave', false,
    'manage_overtime_rules', false, 'manage_budgets', false, 'track_time_for_others', false
  ));

CREATE TABLE public.time_user_roles (
  employee_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role_key text NOT NULL REFERENCES public.time_roles(role_key),
  assigned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Capability check: app-wide super_admin/admin always pass (matches the
-- rest of the app's admin-bypass convention); everyone else needs an
-- explicit time_user_roles row whose role's jsonb capability is true.
CREATE OR REPLACE FUNCTION public.time_has_capability(p_capability text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT
    public.current_user_role() IN ('super_admin', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.time_user_roles ur
      JOIN public.time_roles r ON r.role_key = ur.role_key
      WHERE ur.employee_id = auth.uid()
        AND (r.capabilities ->> p_capability)::boolean IS TRUE
    );
$$;
GRANT EXECUTE ON FUNCTION public.time_has_capability(text) TO authenticated;

-- time_is_project_manager() is defined further below, right after
-- time_projects exists — a LANGUAGE sql function (unlike plpgsql) is
-- validated against real objects at CREATE time, so it can't forward-
-- reference a table that doesn't exist yet in this same migration file.

ALTER TABLE public.time_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_roles_read_all" ON public.time_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_roles_write_admin" ON public.time_roles
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "time_user_roles_read" ON public.time_user_roles
  FOR SELECT TO authenticated USING (
    employee_id = auth.uid() OR public.time_has_capability('manage_projects')
    OR public.current_user_role() IN ('super_admin', 'admin')
  );
CREATE POLICY "time_user_roles_write_admin" ON public.time_user_roles
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin'));

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_clients_read" ON public.time_clients
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_clients_write" ON public.time_clients
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_clients'))
  WITH CHECK (public.time_has_capability('manage_clients'));

-- ---------------------------------------------------------------------------
-- Projects & tasks
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_id uuid REFERENCES public.time_clients(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_billable boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_projects_client_idx ON public.time_projects(client_id);
CREATE INDEX time_projects_manager_idx ON public.time_projects(manager_id);

CREATE OR REPLACE FUNCTION public.time_is_project_manager(p_project_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.time_projects WHERE id = p_project_id AND manager_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.time_is_project_manager(uuid) TO authenticated;

CREATE TABLE public.time_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.time_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_tasks_project_idx ON public.time_tasks(project_id);

ALTER TABLE public.time_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_projects_read" ON public.time_projects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_projects_write" ON public.time_projects
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_projects'))
  WITH CHECK (public.time_has_capability('manage_projects'));

CREATE POLICY "time_tasks_read" ON public.time_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_tasks_write" ON public.time_tasks
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_tasks') OR public.time_is_project_manager(project_id))
  WITH CHECK (public.time_has_capability('manage_tasks') OR public.time_is_project_manager(project_id));

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.time_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "time_tags_read" ON public.time_tags FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_tags_write" ON public.time_tags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Custom fields (polymorphic: applies to project / task / entry)
-- ---------------------------------------------------------------------------
CREATE TABLE public.time_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text', 'number', 'dropdown')),
  applies_to text NOT NULL CHECK (applies_to IN ('project', 'task', 'entry')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.time_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_field_id uuid NOT NULL REFERENCES public.time_custom_fields(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('project', 'task', 'entry')),
  entity_id uuid NOT NULL,
  value jsonb,
  UNIQUE (custom_field_id, entity_id)
);
CREATE INDEX time_custom_field_values_entity_idx ON public.time_custom_field_values(entity_type, entity_id);

ALTER TABLE public.time_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_custom_fields_read" ON public.time_custom_fields
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_custom_fields_write" ON public.time_custom_fields
  FOR ALL TO authenticated
  USING (public.time_has_capability('manage_custom_fields'))
  WITH CHECK (public.time_has_capability('manage_custom_fields'));

CREATE POLICY "time_custom_field_values_read" ON public.time_custom_field_values
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "time_custom_field_values_write" ON public.time_custom_field_values
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.time_roles IS 'timetrack module: capability-based roles, extensible by row insert (spec section 6).';
COMMENT ON TABLE public.time_custom_field_values IS 'Polymorphic custom-field values keyed by (custom_field_id, entity_id); entity_type disambiguates project/task/entry.';
