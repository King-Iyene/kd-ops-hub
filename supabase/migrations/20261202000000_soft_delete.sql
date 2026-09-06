-- Add soft delete columns to support trash/restore functionality.
-- Instead of hard-deleting records, they get moved to trash (is_deleted = true)
-- and can be restored within 30 days.

-- We add these columns via a function that runs against every user-data table
-- in nc_* schemas, plus a cleanup function.

-- First, add a trash metadata table to nc_meta
CREATE TABLE IF NOT EXISTS nc_meta.trash (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES nc_meta.bases(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES nc_meta.tables(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS idx_trash_base_table ON nc_meta.trash(base_id, table_id);
CREATE INDEX IF NOT EXISTS idx_trash_expires ON nc_meta.trash(expires_at);

-- RLS
ALTER TABLE nc_meta.trash ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trash" ON nc_meta.trash
  FOR SELECT TO authenticated
  USING (
    base_id IN (SELECT id FROM nc_meta.bases WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can insert to trash" ON nc_meta.trash
  FOR INSERT TO authenticated
  WITH CHECK (
    base_id IN (SELECT id FROM nc_meta.bases WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can delete from trash" ON nc_meta.trash
  FOR DELETE TO authenticated
  USING (
    base_id IN (SELECT id FROM nc_meta.bases WHERE owner_id = auth.uid())
  );

-- Cleanup function to permanently delete expired trash
CREATE OR REPLACE FUNCTION nc_meta.cleanup_expired_trash()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nc_meta
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM nc_meta.trash WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
