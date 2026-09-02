-- Snapshots table for database backup/restore
CREATE TABLE IF NOT EXISTS nc_meta.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES nc_meta.bases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  data JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_base_id ON nc_meta.snapshots(base_id);

ALTER TABLE nc_meta.snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage snapshots"
  ON nc_meta.snapshots FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.snapshots TO authenticated;
