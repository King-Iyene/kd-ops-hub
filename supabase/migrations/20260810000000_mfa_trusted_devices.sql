-- =============================================================================
-- MFA support: trusted devices
--
-- Supabase Auth ships native TOTP MFA. We don't store secrets / factors here
-- (Supabase does, in the auth schema). What we add is:
--
--   trusted_devices       — opt-in "remember this device for 30 days" so the
--                            user isn't prompted for the 6-digit code on every
--                            sign-in. Only stores a random device_id, never
--                            anything that could be used to forge a session.
--   mfa_backup_codes      — single-use recovery codes generated at enrolment.
--                            Stored as bcrypt-style hashes, never plaintext.
--
-- All policies: row owner only. No admin can read another user's devices /
-- backup codes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Random UUID generated client-side; stored in browser localStorage. The
  -- only thing it does is gate "skip MFA challenge on next sign-in"; it
  -- carries no auth privilege of its own.
  device_id uuid NOT NULL,
  -- Cosmetic — "Chrome on Mac · Lagos · 2 May 2026".
  label text,
  ip_hash text,
  user_agent text,
  trusted_until timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS trusted_devices_uniq
  ON public.trusted_devices(user_id, device_id);
CREATE INDEX IF NOT EXISTS trusted_devices_user_idx
  ON public.trusted_devices(user_id, trusted_until DESC);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trusted_devices_owner_all ON public.trusted_devices;
CREATE POLICY trusted_devices_owner_all ON public.trusted_devices
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── Backup codes ─────────────────────────────────────────────────────────
-- 10 single-use 8-character codes generated at enrolment. We hash with the
-- pgcrypto crypt() function (bf algorithm) so a DB compromise leaks bcrypt
-- hashes, not usable codes.
CREATE TABLE IF NOT EXISTS public.mfa_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_backup_codes_user_idx ON public.mfa_backup_codes(user_id) WHERE used_at IS NULL;

ALTER TABLE public.mfa_backup_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mfa_backup_codes_owner_all ON public.mfa_backup_codes;
CREATE POLICY mfa_backup_codes_owner_all ON public.mfa_backup_codes
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- pgcrypto for crypt(); already provisioned by Supabase but keep the guard.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- ─── RPCs ─────────────────────────────────────────────────────────────────

-- is_device_trusted(p_device_id) → boolean
-- Returns true if the calling user has a non-expired trusted_devices row for
-- this device_id. Used by the MFA challenge gate to skip the prompt.
CREATE OR REPLACE FUNCTION public.is_device_trusted(p_device_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT trusted_until INTO v_row
    FROM public.trusted_devices
   WHERE user_id = auth.uid()
     AND device_id = p_device_id
   LIMIT 1;
  IF v_row.trusted_until IS NULL THEN RETURN false; END IF;
  IF v_row.trusted_until < now() THEN RETURN false; END IF;
  -- Touch last_seen_at on every successful trust check.
  UPDATE public.trusted_devices
     SET last_seen_at = now()
   WHERE user_id = auth.uid() AND device_id = p_device_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_device_trusted(uuid) TO authenticated;

-- register_trusted_device — call after a successful MFA verify if the user
-- ticked "trust this device". Upserts so re-verifying refreshes the window.
CREATE OR REPLACE FUNCTION public.register_trusted_device(
  p_device_id uuid,
  p_label text,
  p_ip_hash text,
  p_user_agent text,
  p_days integer DEFAULT 30
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trusted_devices
    (user_id, device_id, label, ip_hash, user_agent, trusted_until)
  VALUES
    (auth.uid(), p_device_id, p_label, p_ip_hash, p_user_agent, now() + make_interval(days => p_days))
  ON CONFLICT (user_id, device_id) DO UPDATE
    SET trusted_until = EXCLUDED.trusted_until,
        last_seen_at = now(),
        label = EXCLUDED.label,
        ip_hash = EXCLUDED.ip_hash,
        user_agent = EXCLUDED.user_agent;
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_trusted_device(uuid, text, text, text, integer) TO authenticated;

-- generate_mfa_backup_codes — wipes existing unused codes and inserts 10
-- fresh hashed codes. Returns the plaintext codes ONCE so the UI can show
-- them; never readable again after the call.
CREATE OR REPLACE FUNCTION public.generate_mfa_backup_codes()
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codes text[] := ARRAY[]::text[];
  v_code text;
  v_i integer;
BEGIN
  -- Delete any existing rows so re-generating cleanly resets.
  DELETE FROM public.mfa_backup_codes WHERE user_id = auth.uid();
  FOR v_i IN 1..10 LOOP
    -- 8 hex chars, grouped 4-4 for readability ("a1b2-c3d4").
    v_code := encode(gen_random_bytes(2), 'hex') || '-' || encode(gen_random_bytes(2), 'hex');
    v_codes := array_append(v_codes, v_code);
    INSERT INTO public.mfa_backup_codes(user_id, code_hash)
      VALUES (auth.uid(), crypt(v_code, gen_salt('bf')));
  END LOOP;
  RETURN v_codes;
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_mfa_backup_codes() TO authenticated;

-- consume_mfa_backup_code — verifies a backup code and marks it used. Returns
-- true on success, false otherwise. Rate limit + audit handled at the call
-- site (auth flow); this is just the storage layer.
CREATE OR REPLACE FUNCTION public.consume_mfa_backup_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
    FROM public.mfa_backup_codes
   WHERE user_id = auth.uid()
     AND used_at IS NULL
     AND code_hash = crypt(p_code, code_hash)
   LIMIT 1;
  IF v_id IS NULL THEN RETURN false; END IF;
  UPDATE public.mfa_backup_codes SET used_at = now() WHERE id = v_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.consume_mfa_backup_code(text) TO authenticated;

COMMENT ON TABLE public.trusted_devices IS
  'Opt-in remember-this-device list keyed on a client-generated UUID. Skips '
  'the MFA challenge on subsequent sign-ins from the same device for the '
  'configured window (default 30 days). Carries no auth privilege of its own.';
COMMENT ON TABLE public.mfa_backup_codes IS
  'Single-use 8-character recovery codes generated at MFA enrolment. Hashed '
  'with bcrypt; plaintext is shown once at generation and never recoverable.';
