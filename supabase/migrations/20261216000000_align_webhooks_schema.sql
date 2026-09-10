-- Align nc_meta.webhooks with the Developer Hub UI expectations.
-- The original migration (20260902000011) created webhooks with a strict schema
-- (table_id NOT NULL, single event TEXT, method, enabled). The later migration
-- (20261130000002) tried to recreate it with a richer schema but used
-- IF NOT EXISTS, so the old shape persists. This migration bridges the gap.

-- 1. Make table_id nullable (platform-wide webhooks don't target a specific table)
ALTER TABLE nc_meta.webhooks ALTER COLUMN table_id DROP NOT NULL;

-- 2. Add columns the Developer Hub UI expects (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nc_meta' AND table_name='webhooks' AND column_name='events') THEN
    ALTER TABLE nc_meta.webhooks ADD COLUMN events TEXT[] NOT NULL DEFAULT '{record.created,record.updated,record.deleted}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nc_meta' AND table_name='webhooks' AND column_name='secret') THEN
    ALTER TABLE nc_meta.webhooks ADD COLUMN secret TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nc_meta' AND table_name='webhooks' AND column_name='is_active') THEN
    ALTER TABLE nc_meta.webhooks ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nc_meta' AND table_name='webhooks' AND column_name='created_by') THEN
    ALTER TABLE nc_meta.webhooks ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nc_meta' AND table_name='webhooks' AND column_name='last_triggered_at') THEN
    ALTER TABLE nc_meta.webhooks ADD COLUMN last_triggered_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='nc_meta' AND table_name='webhooks' AND column_name='failure_count') THEN
    ALTER TABLE nc_meta.webhooks ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. Update RLS policy so Developer Hub users can manage their own webhooks
DROP POLICY IF EXISTS "Authenticated users can manage webhooks" ON nc_meta.webhooks;
CREATE POLICY "Authenticated users can manage webhooks"
  ON nc_meta.webhooks FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.webhooks TO authenticated;
