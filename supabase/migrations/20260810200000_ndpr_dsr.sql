-- =============================================================================
-- NDPR (Nigeria Data Protection Regulation) — Data Subject Requests
--
-- Two tables back the privacy flows:
--
--   consent_log              — append-only record of every user accepting
--                              the terms / privacy policy at sign-up or
--                              when policies change (the consent banner).
--   data_subject_requests    — Right-to-access / Right-to-erasure / Right-
--                              to-portability tickets. Created by the
--                              user, processed by a super_admin.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- consent_log
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- For pre-signup consents (the public Join form), user_id may be null and
  -- we capture the email instead so we can reconcile after activation.
  email text,
  policy text NOT NULL,         -- 'privacy' | 'terms' | 'cookies'
  policy_version text NOT NULL, -- e.g. '2026-05-02'
  ip_hash text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_log_user_idx ON public.consent_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consent_log_email_idx ON public.consent_log(lower(email)) WHERE email IS NOT NULL;

ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_log_owner_read ON public.consent_log;
CREATE POLICY consent_log_owner_read ON public.consent_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS consent_log_admin_read ON public.consent_log;
CREATE POLICY consent_log_admin_read ON public.consent_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.role IN ('super_admin','admin'))
  );

DROP POLICY IF EXISTS consent_log_owner_insert ON public.consent_log;
CREATE POLICY consent_log_owner_insert ON public.consent_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Anonymous (sign-up form) inserts — email-keyed only.
DROP POLICY IF EXISTS consent_log_anon_insert ON public.consent_log;
CREATE POLICY consent_log_anon_insert ON public.consent_log
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND email IS NOT NULL);

-- ──────────────────────────────────────────────────────────────────────────
-- data_subject_requests
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type text NOT NULL
    CHECK (request_type IN ('access','erasure','rectification','portability','restriction')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','rejected','cancelled')),
  reason text,                        -- user-supplied context (esp. erasure)
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_notes text,
  artifact_path text,                 -- storage path for export bundles
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS dsr_user_idx ON public.data_subject_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dsr_status_idx ON public.data_subject_requests(status, created_at DESC);

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Users see + create their own. Cannot update / delete (status is admin-only).
DROP POLICY IF EXISTS dsr_owner_read ON public.data_subject_requests;
CREATE POLICY dsr_owner_read ON public.data_subject_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS dsr_owner_insert ON public.data_subject_requests;
CREATE POLICY dsr_owner_insert ON public.data_subject_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Super admin reads all + processes them.
DROP POLICY IF EXISTS dsr_admin_all ON public.data_subject_requests;
CREATE POLICY dsr_admin_all ON public.data_subject_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

COMMENT ON TABLE public.data_subject_requests IS
  'NDPR Article 25 — data subject access / erasure / portability tickets. '
  'User self-service creates a row; super_admin processes it via Settings → '
  'Privacy & Compliance. Hard delete is replaced by anonymisation to '
  'preserve audit trail integrity.';
