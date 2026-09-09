-- Anon-safe pickers for public (shared) form views.
--
-- A shared form view can contain a People field (assign real system users)
-- or a Linked Tasks field (link rows of public.tasks). An unauthenticated
-- visitor filling in that form needs to see the option lists, but anon must
-- NOT get blanket SELECT on public.profiles_directory or public.tasks.
--
-- So instead of widening grants, this migration adds two SECURITY DEFINER
-- RPCs that only return data when:
--   * the share token belongs to an enabled shared view,
--   * that view is a form view,
--   * that form's table actually has a field of the matching type, and
--   * the password (when the shared view is password protected) checks out.
-- Only the minimal columns needed to render the picker are returned.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + explicit grant/revoke.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Shared guard: does this token open a form view whose table has a field of
-- the given ui_type, and is the supplied password acceptable?
CREATE OR REPLACE FUNCTION nc_meta.shared_form_allows_field_type(
  p_share_token text,
  p_ui_type text,
  p_password text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = nc_meta, public, extensions
AS $$
DECLARE
  v_table_id uuid;
  v_hash text;
BEGIN
  SELECT sv.table_id, sv.password_hash
    INTO v_table_id, v_hash
  FROM nc_meta.shared_views sv
  JOIN nc_meta.views v ON v.id = sv.view_id
  WHERE sv.share_token = p_share_token
    AND sv.is_enabled = true
    AND v.type = 'form';

  IF v_table_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_hash IS NOT NULL AND v_hash <> crypt(coalesce(p_password, ''), v_hash) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM nc_meta.fields f
    WHERE f.table_id = v_table_id AND f.ui_type = p_ui_type
  );
END;
$$;

REVOKE ALL ON FUNCTION nc_meta.shared_form_allows_field_type(text, text, text) FROM PUBLIC;

-- People options for a shared form's People (User) fields.
CREATE OR REPLACE FUNCTION nc_meta.shared_form_people(
  p_share_token text,
  p_password text DEFAULT NULL
)
RETURNS TABLE (id uuid, full_name text, email text, photo_url text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = nc_meta, public, extensions
AS $$
BEGIN
  IF NOT nc_meta.shared_form_allows_field_type(p_share_token, 'User', p_password) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.photo_url
  FROM public.profiles p
  WHERE coalesce(p.is_anonymised, false) = false
    AND p.status IN ('active', 'invited')
    AND p.email IS NOT NULL
  ORDER BY p.full_name
  LIMIT 500;
END;
$$;

REVOKE ALL ON FUNCTION nc_meta.shared_form_people(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nc_meta.shared_form_people(text, text) TO anon, authenticated;

-- Task options for a shared form's Linked Tasks fields.
CREATE OR REPLACE FUNCTION nc_meta.shared_form_tasks(
  p_share_token text,
  p_password text DEFAULT NULL
)
RETURNS TABLE (id uuid, title text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = nc_meta, public, extensions
AS $$
BEGIN
  IF NOT nc_meta.shared_form_allows_field_type(p_share_token, 'LinkedTasks', p_password) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.title, t.status
  FROM public.tasks t
  ORDER BY t.created_at DESC
  LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION nc_meta.shared_form_tasks(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nc_meta.shared_form_tasks(text, text) TO anon, authenticated;
