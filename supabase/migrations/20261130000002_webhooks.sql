-- Webhooks for external integrations (n8n, Zapier, etc.)
-- Fires HTTP POST to registered URLs when records change.

CREATE TABLE IF NOT EXISTS nc_meta.webhooks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id      UUID NOT NULL REFERENCES nc_meta.bases(id) ON DELETE CASCADE,
  table_id     UUID REFERENCES nc_meta.tables(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  url          TEXT NOT NULL,
  events       TEXT[] NOT NULL DEFAULT '{record.created,record.updated,record.deleted}',
  secret       TEXT,
  headers      JSONB DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_by   UUID REFERENCES auth.users(id),
  last_triggered_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_base ON nc_meta.webhooks (base_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_webhooks_table ON nc_meta.webhooks (table_id) WHERE is_active = true;

ALTER TABLE nc_meta.webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage webhooks" ON nc_meta.webhooks;
CREATE POLICY "Authenticated users can manage webhooks"
  ON nc_meta.webhooks FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
