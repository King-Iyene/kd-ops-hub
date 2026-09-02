-- Migration: Database Platform nc_meta schema
-- A metadata-driven database platform (NocoDB/Airtable-style)

-- 1. Schema
CREATE SCHEMA IF NOT EXISTS nc_meta;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION nc_meta.nc_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Tables

CREATE TABLE nc_meta.workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nc_meta.bases (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES nc_meta.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  schema_name   TEXT NOT NULL UNIQUE,
  icon          TEXT,
  color         TEXT,
  position      INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nc_meta.tables (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id           UUID NOT NULL REFERENCES nc_meta.bases(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  pg_table_name     TEXT NOT NULL,
  primary_field_id  UUID,
  icon              TEXT,
  position          INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (base_id, pg_table_name)
);

CREATE TABLE nc_meta.fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id        UUID NOT NULL REFERENCES nc_meta.tables(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  pg_column_name  TEXT NOT NULL,
  ui_type         TEXT NOT NULL,
  pg_type         TEXT NOT NULL,
  options         JSONB NOT NULL DEFAULT '{}',
  position        INT NOT NULL DEFAULT 0,
  width           INT NOT NULL DEFAULT 180,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  is_unique       BOOLEAN NOT NULL DEFAULT false,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_hidden       BOOLEAN NOT NULL DEFAULT false,
  description     TEXT,
  default_value   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (table_id, pg_column_name)
);

CREATE TABLE nc_meta.views (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id          UUID NOT NULL REFERENCES nc_meta.tables(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT 'Grid View',
  type              TEXT NOT NULL DEFAULT 'grid',
  filters           JSONB NOT NULL DEFAULT '[]',
  sorts             JSONB NOT NULL DEFAULT '[]',
  groups            JSONB NOT NULL DEFAULT '[]',
  field_order       JSONB NOT NULL DEFAULT '[]',
  field_visibility  JSONB NOT NULL DEFAULT '{}',
  field_widths      JSONB NOT NULL DEFAULT '{}',
  is_default        BOOLEAN NOT NULL DEFAULT false,
  is_locked         BOOLEAN NOT NULL DEFAULT false,
  position          INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nc_meta.links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id          UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  related_table_id  UUID NOT NULL REFERENCES nc_meta.tables(id) ON DELETE CASCADE,
  related_field_id  UUID REFERENCES nc_meta.fields(id) ON DELETE SET NULL,
  junction_table_id UUID REFERENCES nc_meta.tables(id) ON DELETE SET NULL,
  type              TEXT NOT NULL DEFAULT 'hm',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nc_meta.formulas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id    UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  expression  TEXT NOT NULL,
  parsed_tree JSONB,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nc_meta.rollups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id        UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  link_field_id   UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  rollup_field_id UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  rollup_function TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nc_meta.lookups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id        UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  link_field_id   UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  lookup_field_id UUID NOT NULL REFERENCES nc_meta.fields(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE nc_meta.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id     UUID REFERENCES nc_meta.bases(id) ON DELETE SET NULL,
  table_id    UUID REFERENCES nc_meta.tables(id) ON DELETE SET NULL,
  record_id   TEXT,
  field_id    UUID REFERENCES nc_meta.fields(id) ON DELETE SET NULL,
  user_id     UUID,
  action      TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Update triggers
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON nc_meta.workspaces
  FOR EACH ROW EXECUTE FUNCTION nc_meta.nc_update_timestamp();

CREATE TRIGGER trg_bases_updated_at BEFORE UPDATE ON nc_meta.bases
  FOR EACH ROW EXECUTE FUNCTION nc_meta.nc_update_timestamp();

CREATE TRIGGER trg_tables_updated_at BEFORE UPDATE ON nc_meta.tables
  FOR EACH ROW EXECUTE FUNCTION nc_meta.nc_update_timestamp();

CREATE TRIGGER trg_fields_updated_at BEFORE UPDATE ON nc_meta.fields
  FOR EACH ROW EXECUTE FUNCTION nc_meta.nc_update_timestamp();

CREATE TRIGGER trg_views_updated_at BEFORE UPDATE ON nc_meta.views
  FOR EACH ROW EXECUTE FUNCTION nc_meta.nc_update_timestamp();

CREATE TRIGGER trg_formulas_updated_at BEFORE UPDATE ON nc_meta.formulas
  FOR EACH ROW EXECUTE FUNCTION nc_meta.nc_update_timestamp();

-- 5. Default workspace
INSERT INTO nc_meta.workspaces (name) VALUES ('KD Squares');

-- 6. Indexes
CREATE INDEX idx_bases_workspace_id ON nc_meta.bases (workspace_id);
CREATE INDEX idx_tables_base_id ON nc_meta.tables (base_id);
CREATE INDEX idx_fields_table_id ON nc_meta.fields (table_id);
CREATE INDEX idx_views_table_id ON nc_meta.views (table_id);
CREATE INDEX idx_audit_log_base_created ON nc_meta.audit_log (base_id, created_at);

-- 7. RLS
ALTER TABLE nc_meta.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.views ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE nc_meta.audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT policies: any authenticated user
CREATE POLICY select_workspaces ON nc_meta.workspaces FOR SELECT TO authenticated USING (true);
CREATE POLICY select_bases ON nc_meta.bases FOR SELECT TO authenticated USING (true);
CREATE POLICY select_tables ON nc_meta.tables FOR SELECT TO authenticated USING (true);
CREATE POLICY select_fields ON nc_meta.fields FOR SELECT TO authenticated USING (true);
CREATE POLICY select_views ON nc_meta.views FOR SELECT TO authenticated USING (true);
CREATE POLICY select_links ON nc_meta.links FOR SELECT TO authenticated USING (true);
CREATE POLICY select_formulas ON nc_meta.formulas FOR SELECT TO authenticated USING (true);
CREATE POLICY select_rollups ON nc_meta.rollups FOR SELECT TO authenticated USING (true);
CREATE POLICY select_lookups ON nc_meta.lookups FOR SELECT TO authenticated USING (true);
CREATE POLICY select_audit_log ON nc_meta.audit_log FOR SELECT TO authenticated USING (true);

-- INSERT policies: admin only
CREATE POLICY insert_workspaces ON nc_meta.workspaces FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_bases ON nc_meta.bases FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_tables ON nc_meta.tables FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_fields ON nc_meta.fields FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_views ON nc_meta.views FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_links ON nc_meta.links FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_formulas ON nc_meta.formulas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_rollups ON nc_meta.rollups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_lookups ON nc_meta.lookups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY insert_audit_log ON nc_meta.audit_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

-- UPDATE policies: admin only
CREATE POLICY update_workspaces ON nc_meta.workspaces FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_bases ON nc_meta.bases FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_tables ON nc_meta.tables FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_fields ON nc_meta.fields FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_views ON nc_meta.views FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_links ON nc_meta.links FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_formulas ON nc_meta.formulas FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_rollups ON nc_meta.rollups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_lookups ON nc_meta.lookups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY update_audit_log ON nc_meta.audit_log FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

-- DELETE policies: admin only
CREATE POLICY delete_workspaces ON nc_meta.workspaces FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_bases ON nc_meta.bases FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_tables ON nc_meta.tables FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_fields ON nc_meta.fields FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_views ON nc_meta.views FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_links ON nc_meta.links FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_formulas ON nc_meta.formulas FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_rollups ON nc_meta.rollups FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_lookups ON nc_meta.lookups FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));
CREATE POLICY delete_audit_log ON nc_meta.audit_log FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

