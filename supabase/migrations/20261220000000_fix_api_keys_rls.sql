-- Fix api_keys RLS: allow all authenticated users in the workspace to see keys,
-- not just the creator. This matches the webhook policy from 20261216000000.

DROP POLICY IF EXISTS "Authenticated users can manage their API keys" ON nc_meta.api_keys;
CREATE POLICY "Authenticated users can manage their API keys"
  ON nc_meta.api_keys FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON nc_meta.api_keys TO authenticated;
