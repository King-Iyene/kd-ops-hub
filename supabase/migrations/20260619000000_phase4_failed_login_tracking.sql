-- ─────────────────────────────────────────────────────────────────────────
-- PHASE 4 — Login rate-limit + audit
--
-- Supabase Auth has built-in rate limits, but they're not configurable
-- and don't surface attempts to the audit trail. This migration adds a
-- `failed_login_attempts` table the Login page logs to via an edge
-- function. Used both as a soft rate-limiter (block after 5 attempts in
-- 15 minutes for the same email) and as a security trail visible to
-- admins.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_hash text,                         -- SHA-256 of IP, set by edge function
  user_agent text,
  reason text,                          -- 'invalid_credentials' | 'rate_limited' | other
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS failed_login_email_time_idx
  ON public.failed_login_attempts (email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS failed_login_time_idx
  ON public.failed_login_attempts (attempted_at DESC);

ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Only admins can read this. Writes happen via service-role from the
-- record-failed-login edge function (RLS doesn't apply to service-role).
DROP POLICY IF EXISTS "failed_login_admin_select" ON public.failed_login_attempts;
CREATE POLICY "failed_login_admin_select" ON public.failed_login_attempts
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin'));

NOTIFY pgrst, 'reload schema';
