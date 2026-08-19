-- Server-side wrong-password lockout, enforced by Supabase Auth itself via a
-- "Password Verification Hook" — not bypassable by talking to the Auth API
-- directly, unlike the existing client-side check (record-failed-login edge
-- function), which only runs if the browser code calls it. That client-side
-- check is left in place as-is (a harmless early UX warning); this hook is
-- the actual enforcement.
--
-- Same numbers already shown to users today: 5 wrong passwords locks the
-- account out for 15 minutes, "Forgot password" still works during lockout.
--
-- Docs: https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook
--
-- IMPORTANT — this migration alone does NOT turn the hook on. Supabase Auth
-- hooks are wired up in the dashboard, not via SQL:
--   Authentication → Hooks (Beta) → Password Verification Attempt → Enable
--   → select public.hook_password_verification_attempt
-- Until that's done, this function exists but Supabase Auth never calls it.

CREATE TABLE IF NOT EXISTS public.password_failed_verification_attempts (
  user_id            uuid PRIMARY KEY,
  attempts           integer NOT NULL DEFAULT 0,
  window_started_at  timestamptz NOT NULL DEFAULT now(),
  last_failed_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.password_failed_verification_attempts IS
  'Tracks wrong-password attempts per user for hook_password_verification_attempt. One row per user, upserted — never grows unbounded.';

ALTER TABLE public.password_failed_verification_attempts ENABLE ROW LEVEL SECURITY;
-- No policies — the hook function is SECURITY DEFINER (runs as the function
-- owner, bypassing RLS); nothing else should ever read/write this table.

CREATE OR REPLACE FUNCTION public.hook_password_verification_attempt(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id       uuid := (event->>'user_id')::uuid;
  v_valid         boolean := COALESCE((event->>'valid')::boolean, false);
  v_row           public.password_failed_verification_attempts%ROWTYPE;
  v_window_min    CONSTANT integer := 15;
  v_max_attempts  CONSTANT integer := 5;
  v_window_active boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  SELECT * INTO v_row
    FROM public.password_failed_verification_attempts
   WHERE user_id = v_user_id
   FOR UPDATE;

  v_window_active := v_row.user_id IS NOT NULL
    AND v_row.window_started_at > now() - make_interval(mins => v_window_min);

  -- Already locked out for this window — reject even a correct password.
  -- That's the point of a hard lockout: if an attacker is at 5 guesses,
  -- they don't get a 6th just because it happens to be right.
  IF v_window_active AND v_row.attempts >= v_max_attempts THEN
    RETURN jsonb_build_object(
      'decision', 'reject',
      'message', format(
        'Too many failed attempts. Try again in %s minutes, or use "Forgot password" to reset.',
        v_window_min
      )
    );
  END IF;

  IF v_valid THEN
    -- Correct password, not locked out — clear any tracked failures.
    DELETE FROM public.password_failed_verification_attempts WHERE user_id = v_user_id;
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  -- Wrong password — record it. Start a fresh window if the old one expired.
  IF v_window_active THEN
    UPDATE public.password_failed_verification_attempts
       SET attempts = attempts + 1, last_failed_at = now()
     WHERE user_id = v_user_id;
  ELSE
    INSERT INTO public.password_failed_verification_attempts (user_id, attempts, window_started_at, last_failed_at)
    VALUES (v_user_id, 1, now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET attempts = 1, window_started_at = now(), last_failed_at = now();
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
END;
$$;

-- Matches Supabase's documented grant pattern for auth hooks: only the
-- supabase_auth_admin role (which GoTrue uses internally) may call this or
-- touch its table. Ordinary app roles get nothing.
GRANT ALL ON TABLE public.password_failed_verification_attempts TO supabase_auth_admin;
REVOKE ALL ON TABLE public.password_failed_verification_attempts FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_password_verification_attempt(jsonb) FROM authenticated, anon, public;
