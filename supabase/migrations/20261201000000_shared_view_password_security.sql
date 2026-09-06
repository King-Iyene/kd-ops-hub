-- Shared view password security fix.
--
-- Previously the client fetched `shared_views.*` (including the raw
-- password) and compared it to user input in the browser, exposing the
-- password to anyone who opened devtools/network tab. This migration:
--   1. Reconciles the shared_views schema with what the app expects
--      (table_id, is_enabled).
--   2. Stores only a bcrypt hash of the password (password_hash), never
--      plaintext.
--   3. Adds a generated `is_password_protected` column so clients can know
--      a password is required without ever reading the hash.
--   4. Locks down column-level SELECT on password_hash so it can never be
--      selected by anon/authenticated roles.
--   5. Adds SECURITY DEFINER RPCs to set and verify the password entirely
--      server-side.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Add table_id (used throughout the app to avoid an extra join) and backfill
-- it from the linked view.
ALTER TABLE nc_meta.shared_views
  ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES nc_meta.tables(id) ON DELETE CASCADE;

UPDATE nc_meta.shared_views sv
SET table_id = v.table_id
FROM nc_meta.views v
WHERE v.id = sv.view_id AND sv.table_id IS NULL;

-- Normalize enabled -> is_enabled to match the rest of the app.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nc_meta' AND table_name = 'shared_views' AND column_name = 'enabled'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'nc_meta' AND table_name = 'shared_views' AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE nc_meta.shared_views RENAME COLUMN enabled TO is_enabled;
  END IF;
END $$;

-- Computed flag so clients know whether a password is required without ever
-- being able to read the hash itself.
ALTER TABLE nc_meta.shared_views
  ADD COLUMN IF NOT EXISTS is_password_protected BOOLEAN GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED;

-- Public (anon) read access to shared view metadata, so the shared-view
-- page can load without a logged-in session.
DROP POLICY IF EXISTS "Public can view enabled shared views" ON nc_meta.shared_views;
CREATE POLICY "Public can view enabled shared views"
  ON nc_meta.shared_views FOR SELECT
  TO anon, authenticated
  USING (is_enabled = true);

GRANT SELECT ON nc_meta.shared_views TO anon;

-- Column-level lockdown: password_hash must never be selectable by any
-- client role. Only an explicit column list (excluding password_hash) is
-- granted.
REVOKE SELECT ON nc_meta.shared_views FROM anon, authenticated;
GRANT SELECT (
  id, view_id, table_id, share_token, is_enabled, allow_csv_download,
  created_at, is_password_protected
) ON nc_meta.shared_views TO anon, authenticated;
GRANT INSERT (view_id, table_id, allow_csv_download, is_enabled) ON nc_meta.shared_views TO authenticated;
GRANT UPDATE (is_enabled, allow_csv_download) ON nc_meta.shared_views TO authenticated;
GRANT DELETE ON nc_meta.shared_views TO authenticated;

-- RPC: set (or clear) a shared view's password. Hashing happens entirely
-- server-side; the plaintext password is never stored.
CREATE OR REPLACE FUNCTION nc_meta.set_shared_view_password(p_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nc_meta, extensions
AS $$
BEGIN
  UPDATE nc_meta.shared_views
  SET password_hash = CASE
    WHEN p_password IS NULL OR p_password = '' THEN NULL
    ELSE crypt(p_password, gen_salt('bf'))
  END
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION nc_meta.set_shared_view_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nc_meta.set_shared_view_password(uuid, text) TO authenticated;

-- RPC: verify a candidate password for a shared view by its public share
-- token. Returns false (never errors with details) for wrong password,
-- disabled view, missing view, or no password set.
CREATE OR REPLACE FUNCTION nc_meta.verify_shared_view_password(p_share_token text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = nc_meta, extensions
AS $$
DECLARE
  v_hash text;
BEGIN
  SELECT password_hash INTO v_hash
  FROM nc_meta.shared_views
  WHERE share_token = p_share_token AND is_enabled = true;

  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_hash = crypt(coalesce(p_password, ''), v_hash);
END;
$$;

REVOKE ALL ON FUNCTION nc_meta.verify_shared_view_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nc_meta.verify_shared_view_password(text, text) TO anon, authenticated;
