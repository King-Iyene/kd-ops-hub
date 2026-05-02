-- =============================================================================
-- Replace the GUC-based anomaly emailer with a private-table secrets store
-- that works from the Supabase SQL Editor (no superuser needed).
--
-- Why: ALTER DATABASE … SET app.settings.* requires superuser, which the
-- Supabase hosted SQL Editor doesn't grant. The previous migration relied
-- on those GUCs and couldn't be configured by the operator without ssh-
-- ing into the postgres process. This swap fixes that: the URL + service
-- role are stored in _private.app_secrets, set via a simple RPC.
--
-- Setup steps for the operator (run once in SQL Editor):
--   SELECT public.set_app_secret('supabase_url', 'https://YOUR-PROJ.supabase.co');
--   SELECT public.set_app_secret('service_role_key', 'eyJ…');  -- service_role JWT
--
-- After that, every high/critical payment_anomalies INSERT auto-emails
-- the active super_admins/admins via the templated anomaly.alert email.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- _private.app_secrets — RLS-locked to nobody (only SECURITY DEFINER fns
-- can read it).
-- ──────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS _private;

CREATE TABLE IF NOT EXISTS _private.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON _private.app_secrets FROM PUBLIC, anon, authenticated;
-- (No GRANT to authenticated — only SECURITY DEFINER fns reach this.)

-- ──────────────────────────────────────────────────────────────────────────
-- Setter RPC — super_admin only. Upserts a key/value pair into the secrets
-- table. SECURITY DEFINER so the call bypasses table grants.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_app_secret(p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, _private
AS $$
BEGIN
  -- Allow only super_admin profiles, or service-role / postgres callers.
  IF current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
      RAISE EXCEPTION 'set_app_secret is super_admin only';
    END IF;
  END IF;
  INSERT INTO _private.app_secrets(key, value)
       VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_app_secret(text, text) TO authenticated;

-- Internal getter — never exposed to authenticated. Used by the trigger.
CREATE OR REPLACE FUNCTION _private.get_app_secret(p_key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = _private
AS $$
DECLARE
  v_value text;
BEGIN
  SELECT value INTO v_value FROM _private.app_secrets WHERE key = p_key;
  RETURN v_value;
END;
$$;
REVOKE ALL ON FUNCTION _private.get_app_secret(text) FROM PUBLIC, anon, authenticated;

-- ──────────────────────────────────────────────────────────────────────────
-- Replace the anomaly-admin-notify function to read from app_secrets
-- instead of GUCs.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_anomaly_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, _private
AS $$
DECLARE
  v_url text;
  v_service_role text;
  v_admin record;
  v_payload jsonb;
BEGIN
  IF NEW.severity NOT IN ('high','critical') THEN
    RETURN NEW;
  END IF;

  v_url := _private.get_app_secret('supabase_url');
  v_service_role := _private.get_app_secret('service_role_key');

  -- If either secret isn't set yet, skip silently — the anomaly insert
  -- itself still succeeds. The operator wires up email by calling
  -- set_app_secret(...) twice; until then, only in-app notifications fire.
  IF v_url IS NULL OR v_service_role IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_admin IN
    SELECT email, full_name FROM public.profiles
     WHERE role IN ('super_admin','admin')
       AND status = 'active'
       AND email IS NOT NULL
  LOOP
    v_payload := jsonb_build_object(
      'channel', 'templated',
      'template_key', 'anomaly.alert',
      'to', v_admin.email,
      'vars', jsonb_build_object(
        'title', NEW.title,
        'summary', COALESCE(NEW.description, ''),
        'severity', NEW.severity,
        'detected_at', to_char(NEW.detected_at, 'DD Mon YYYY HH24:MI'),
        'link', v_url || '/anomalies'
      )
    );

    BEGIN
      PERFORM extensions.http_post(
        url := v_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_role
        ),
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger itself was created in 20260808100000 — function replacement above
-- is enough; CREATE OR REPLACE doesn't need the trigger to be re-bound.

COMMENT ON FUNCTION public.set_app_secret IS
  'Super-admin-only setter for _private.app_secrets. Use to configure the '
  'anomaly email trigger: '
  '  SELECT set_app_secret(''supabase_url'', ''https://X.supabase.co''); '
  '  SELECT set_app_secret(''service_role_key'', ''eyJ…''); '
  'Keys can be rotated by simply running set_app_secret again with the new value.';
