-- Add slug columns to nc_meta base/table/view tables
-- with auto-generation from names and duplicate handling

-- 1. Reusable slug generator
CREATE OR REPLACE FUNCTION nc_meta.generate_slug(name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT left(
    trim(BOTH '-' FROM
      regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
    ),
    60
  );
$$;

-- 2. Add slug columns
ALTER TABLE nc_meta.bases  ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE nc_meta.tables ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE nc_meta.views  ADD COLUMN IF NOT EXISTS slug TEXT;

-- 3. Backfill existing rows with duplicate handling

-- Bases: scope = workspace_id
WITH ranked AS (
  SELECT id, nc_meta.generate_slug(name) AS base_slug, workspace_id,
         row_number() OVER (PARTITION BY workspace_id, nc_meta.generate_slug(name) ORDER BY created_at, id) AS rn
  FROM nc_meta.bases
  WHERE slug IS NULL AND name IS NOT NULL
)
UPDATE nc_meta.bases b
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug
                ELSE left(r.base_slug, 57) || '-' || (r.rn - 1)::text END
FROM ranked r WHERE b.id = r.id;

-- Tables: scope = base_id
WITH ranked AS (
  SELECT id, nc_meta.generate_slug(name) AS base_slug, base_id,
         row_number() OVER (PARTITION BY base_id, nc_meta.generate_slug(name) ORDER BY created_at, id) AS rn
  FROM nc_meta.tables
  WHERE slug IS NULL AND name IS NOT NULL
)
UPDATE nc_meta.tables t
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug
                ELSE left(r.base_slug, 57) || '-' || (r.rn - 1)::text END
FROM ranked r WHERE t.id = r.id;

-- Views: scope = table_id
WITH ranked AS (
  SELECT id, nc_meta.generate_slug(name) AS base_slug, table_id,
         row_number() OVER (PARTITION BY table_id, nc_meta.generate_slug(name) ORDER BY created_at, id) AS rn
  FROM nc_meta.views
  WHERE slug IS NULL AND name IS NOT NULL
)
UPDATE nc_meta.views v
SET slug = CASE WHEN r.rn = 1 THEN r.base_slug
                ELSE left(r.base_slug, 57) || '-' || (r.rn - 1)::text END
FROM ranked r WHERE v.id = r.id;

-- 4. Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_bases_workspace_slug  ON nc_meta.bases  (workspace_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tables_base_slug      ON nc_meta.tables (base_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_views_table_slug      ON nc_meta.views  (table_id, slug);

-- 5. Trigger function for bases
CREATE OR REPLACE FUNCTION nc_meta.set_base_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  candidate TEXT;
  suffix INT := 0;
  final_slug TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name AND OLD.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  candidate := nc_meta.generate_slug(NEW.name);
  final_slug := candidate;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM nc_meta.bases
      WHERE workspace_id = NEW.workspace_id AND slug = final_slug AND id IS DISTINCT FROM NEW.id
    );
    suffix := suffix + 1;
    final_slug := left(candidate, 57) || '-' || suffix::text;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_base_slug
  BEFORE INSERT OR UPDATE ON nc_meta.bases
  FOR EACH ROW EXECUTE FUNCTION nc_meta.set_base_slug();

-- 6. Trigger function for tables
CREATE OR REPLACE FUNCTION nc_meta.set_table_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  candidate TEXT;
  suffix INT := 0;
  final_slug TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name AND OLD.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  candidate := nc_meta.generate_slug(NEW.name);
  final_slug := candidate;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM nc_meta.tables
      WHERE base_id = NEW.base_id AND slug = final_slug AND id IS DISTINCT FROM NEW.id
    );
    suffix := suffix + 1;
    final_slug := left(candidate, 57) || '-' || suffix::text;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_table_slug
  BEFORE INSERT OR UPDATE ON nc_meta.tables
  FOR EACH ROW EXECUTE FUNCTION nc_meta.set_table_slug();

-- 7. Trigger function for views
CREATE OR REPLACE FUNCTION nc_meta.set_view_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  candidate TEXT;
  suffix INT := 0;
  final_slug TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name AND OLD.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  candidate := nc_meta.generate_slug(NEW.name);
  final_slug := candidate;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM nc_meta.views
      WHERE table_id = NEW.table_id AND slug = final_slug AND id IS DISTINCT FROM NEW.id
    );
    suffix := suffix + 1;
    final_slug := left(candidate, 57) || '-' || suffix::text;
  END LOOP;

  NEW.slug := final_slug;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_view_slug
  BEFORE INSERT OR UPDATE ON nc_meta.views
  FOR EACH ROW EXECUTE FUNCTION nc_meta.set_view_slug();
