-- Fix old webhook columns that conflict with new schema
-- The original migration (20260902000011) created event TEXT NOT NULL with a CHECK constraint
-- and method TEXT NOT NULL. The newer schema uses events TEXT[] and is_active instead.
-- This migration makes the old columns compatible so both old and new code paths work.

ALTER TABLE nc_meta.webhooks ALTER COLUMN event DROP NOT NULL;
ALTER TABLE nc_meta.webhooks ALTER COLUMN event SET DEFAULT 'record.created';
ALTER TABLE nc_meta.webhooks DROP CONSTRAINT IF EXISTS webhooks_event_check;
ALTER TABLE nc_meta.webhooks ALTER COLUMN method SET DEFAULT 'POST';

-- Migrate any existing enabled -> is_active data
UPDATE nc_meta.webhooks SET is_active = enabled WHERE is_active IS NULL AND enabled IS NOT NULL;

-- Insert sentinel workspace, base and table so platform-wide webhooks/API keys satisfy FK constraints
INSERT INTO nc_meta.workspaces (id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'Platform')
ON CONFLICT (id) DO NOTHING;

INSERT INTO nc_meta.bases (id, workspace_id, name, schema_name)
  SELECT '00000000-0000-0000-0000-000000000000', id, 'Platform', 'nc_platform'
  FROM nc_meta.workspaces LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO nc_meta.tables (id, base_id, name, pg_table_name, position)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'Platform', 'platform', 0)
ON CONFLICT (id) DO NOTHING;
