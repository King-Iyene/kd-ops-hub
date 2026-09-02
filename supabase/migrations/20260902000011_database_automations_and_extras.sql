-- Automations table
CREATE TABLE IF NOT EXISTS nc_meta.automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES nc_meta.bases(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES nc_meta.tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled automation',
  enabled BOOLEAN NOT NULL DEFAULT false,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('record_created', 'record_updated', 'record_deleted', 'field_changed', 'scheduled')),
  trigger_config JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_table_id ON nc_meta.automations(table_id);
CREATE INDEX idx_automations_enabled ON nc_meta.automations(table_id, enabled) WHERE enabled = true;

ALTER TABLE nc_meta.automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage automations"
  ON nc_meta.automations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.automations TO authenticated;

-- Webhooks table
CREATE TABLE IF NOT EXISTS nc_meta.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES nc_meta.bases(id) ON DELETE CASCADE,
  table_id UUID NOT NULL REFERENCES nc_meta.tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled webhook',
  url TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  headers JSONB NOT NULL DEFAULT '{}',
  event TEXT NOT NULL CHECK (event IN ('record.created', 'record.updated', 'record.deleted')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nc_meta.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage webhooks"
  ON nc_meta.webhooks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.webhooks TO authenticated;

-- Shared views table
CREATE TABLE IF NOT EXISTS nc_meta.shared_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  view_id UUID NOT NULL REFERENCES nc_meta.views(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  password_hash TEXT,
  allow_csv_download BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nc_meta.shared_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage shared views"
  ON nc_meta.shared_views FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.shared_views TO authenticated;

-- API tokens table
CREATE TABLE IF NOT EXISTS nc_meta.api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL REFERENCES nc_meta.bases(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL DEFAULT 'API Token',
  permissions TEXT[] NOT NULL DEFAULT ARRAY['read'],
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE nc_meta.api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage API tokens"
  ON nc_meta.api_tokens FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.api_tokens TO authenticated;

-- Comments table (per-record)
CREATE TABLE IF NOT EXISTS nc_meta.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_id UUID NOT NULL,
  table_id UUID NOT NULL,
  record_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_record ON nc_meta.comments(base_id, table_id, record_id);

ALTER TABLE nc_meta.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage comments"
  ON nc_meta.comments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.comments TO authenticated;
