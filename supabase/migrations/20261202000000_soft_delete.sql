-- Trash table for soft delete with 30-day retention.

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

ALTER TABLE nc_meta.trash ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view trash" ON nc_meta.trash;
CREATE POLICY "Users can view trash" ON nc_meta.trash
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert to trash" ON nc_meta.trash;
CREATE POLICY "Users can insert to trash" ON nc_meta.trash
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete from trash" ON nc_meta.trash;
CREATE POLICY "Users can delete from trash" ON nc_meta.trash
  FOR DELETE TO authenticated
  USING (true);

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
