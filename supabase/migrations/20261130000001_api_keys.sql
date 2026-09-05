-- API keys for the public REST API
-- Keys authenticate external integrations (n8n, webhooks, etc.)

CREATE TABLE nc_meta.api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES nc_meta.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{records:read,records:write,schema:read}',
  created_by   UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_hash ON nc_meta.api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_workspace ON nc_meta.api_keys (workspace_id) WHERE revoked_at IS NULL;

ALTER TABLE nc_meta.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage their API keys"
  ON nc_meta.api_keys FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
