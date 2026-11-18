-- =============================================================================
-- Task Module v2 ("tm_" prefix — distinct from the fully-removed "tk_" module)
-- Phase 1: database foundation only. No frontend yet.
--
-- Shape: flat, org-wide Folders → Lists (task lists) and Tables (Airtable-lite
-- databases). Folders/Lists/Tables/Fields are structure — only admin/super_admin
-- create or change them. Tasks and table Records are day-to-day content — any
-- authenticated member can create/edit/delete them, same as every other
-- module in this app (payments, projects, etc. gate the structure, not the
-- everyday rows).
--
-- Reuses the app's existing public.current_user_role() helper and
-- public.set_updated_at() trigger rather than introducing new ones.
-- =============================================================================

CREATE TABLE public.tm_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tm_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.tm_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_lists_folder_id_idx ON public.tm_lists(folder_id);

CREATE TABLE public.tm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.tm_lists(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  priority text CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date date,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX tm_tasks_list_id_idx ON public.tm_tasks(list_id);
CREATE INDEX tm_tasks_assignee_id_idx ON public.tm_tasks(assignee_id);
CREATE INDEX tm_tasks_status_idx ON public.tm_tasks(status);

CREATE TABLE public.tm_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.tm_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_tables_folder_id_idx ON public.tm_tables(folder_id);

-- One row per column. "config" holds type-specific extras — e.g.
-- {"options": ["A","B"]} for single_select — so adding a field type later
-- never needs a schema change here.
CREATE TABLE public.tm_table_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tm_tables(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('text', 'long_text', 'number', 'date', 'checkbox', 'single_select', 'person', 'task')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_table_fields_table_id_idx ON public.tm_table_fields(table_id);

-- One row per record. All of a record's cell values live together in one
-- jsonb object keyed by field id — avoids a per-cell table, and avoids
-- ALTER TABLE on every new column, which is what makes this "Airtable-lite"
-- instead of Airtable. A "person" field stores a profile id (or array of
-- ids); a "task" field stores a tm_tasks id (or array). Referential
-- integrity for those links is enforced by the API layer, not a DB FK,
-- the same tradeoff any EAV-style design makes.
CREATE TABLE public.tm_table_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.tm_tables(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tm_table_records_table_id_idx ON public.tm_table_records(table_id);

CREATE TRIGGER tm_folders_set_updated_at BEFORE UPDATE ON public.tm_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tm_lists_set_updated_at BEFORE UPDATE ON public.tm_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tm_tasks_set_updated_at BEFORE UPDATE ON public.tm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tm_tables_set_updated_at BEFORE UPDATE ON public.tm_tables
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tm_table_records_set_updated_at BEFORE UPDATE ON public.tm_table_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.tm_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_table_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_table_records ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can see everything — flat, org-wide, no per-folder
-- membership in this first version.
CREATE POLICY tm_folders_select ON public.tm_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_lists_select ON public.tm_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_tasks_select ON public.tm_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_tables_select ON public.tm_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_table_fields_select ON public.tm_table_fields FOR SELECT TO authenticated USING (true);
CREATE POLICY tm_table_records_select ON public.tm_table_records FOR SELECT TO authenticated USING (true);

-- Structure (folders/lists/tables/fields) — admin/super_admin only.
CREATE POLICY tm_folders_write ON public.tm_folders FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin'));
CREATE POLICY tm_lists_write ON public.tm_lists FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin'));
CREATE POLICY tm_tables_write ON public.tm_tables FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin'));
CREATE POLICY tm_table_fields_write ON public.tm_table_fields FOR ALL TO authenticated
  USING (public.current_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_user_role() IN ('admin', 'super_admin'));

-- Content (tasks/records) — any authenticated member.
CREATE POLICY tm_tasks_write ON public.tm_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tm_table_records_write ON public.tm_table_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
