-- =============================================================================
-- Transfer Safety: configurable high-value threshold + per-role/per-user caps
-- + per-action audit log (IP hash + UA).
--
-- Stage 1 of the Transfer Authorization rollout. No OTP / no dual-approval
-- here — the existing review→process flow stays intact. This migration adds:
--
--   1. company_settings.transfer_high_value_threshold_ngn — UI "high value"
--      flag threshold (default ₦1M, configurable in Settings).
--   2. transfer_limits — per-role and (optionally) per-user caps
--      (single, daily rolling, monthly rolling).
--   3. transfer_audit — every transfer-related action gets a row with the
--      actor, action, amount, IP hash (SHA-256), UA, and outcome.
--   4. check_transfer_caps(p_user, p_amount_ngn) RPC — single source of
--      truth for cap enforcement, called by the paystack-transfer edge fn.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Threshold setting
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS transfer_high_value_threshold_ngn numeric NOT NULL DEFAULT 1000000;

COMMENT ON COLUMN public.company_settings.transfer_high_value_threshold_ngn IS
  'Above this NGN amount, a single transfer is flagged "high value" in the UI. '
  'Configurable in Settings → Transfer Authorization. Does not block — it is a '
  'visual warning surfaced on batch review screens and audit reports.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Per-role / per-user transfer caps
--    A user-level row (user_id NOT NULL) overrides the role-level row for
--    that role. Use null user_id rows as the role default.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transfer_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Either role-level (user_id null) or user-level override (user_id set).
  role text CHECK (role IN ('super_admin','admin','finance')),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Caps in NGN. 0 means "no transfers allowed". null means "no cap".
  single_txn_limit_ngn numeric,
  daily_limit_ngn numeric,
  monthly_limit_ngn numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (role IS NOT NULL OR user_id IS NOT NULL)
);

-- One role-level row per role; one user-level row per user.
CREATE UNIQUE INDEX IF NOT EXISTS transfer_limits_role_default_uq
  ON public.transfer_limits(role) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transfer_limits_user_uq
  ON public.transfer_limits(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.transfer_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manages transfer_limits" ON public.transfer_limits;
CREATE POLICY "Super admin manages transfer_limits" ON public.transfer_limits
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                       WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "Approvers can read own transfer_limits" ON public.transfer_limits;
CREATE POLICY "Approvers can read own transfer_limits" ON public.transfer_limits
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  );

-- Seed sensible role defaults. Tune in Settings → Transfer Authorization.
INSERT INTO public.transfer_limits (role, single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn, notes)
VALUES
  ('super_admin', 50000000, 100000000, 500000000, 'Default cap for super admins'),
  ('admin',       10000000,  50000000, 200000000, 'Default cap for admins'),
  ('finance',      5000000,  20000000, 100000000, 'Default cap for finance')
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Transfer audit log — separate from generic audit_logs so we can index
--    tightly and retain longer (financial forensics).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transfer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  action text NOT NULL,                  -- initiate_transfer | bulk_transfer | verify_transfer | cap_blocked | etc.
  outcome text NOT NULL DEFAULT 'ok',    -- ok | denied | error
  amount_ngn numeric,                    -- single-transfer amount or batch total
  recipient_code text,                   -- Paystack recipient (single transfers)
  reference text,                        -- KDOps reference if known
  ip_hash text,                          -- SHA-256 of source IP, never raw IP
  user_agent text,
  -- Free-form details: which limit hit, paystack response stub, recipient count, etc.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,                           -- human-readable reason on denied/error
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transfer_audit_actor_idx ON public.transfer_audit(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transfer_audit_created_idx ON public.transfer_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS transfer_audit_outcome_idx ON public.transfer_audit(outcome) WHERE outcome <> 'ok';

ALTER TABLE public.transfer_audit ENABLE ROW LEVEL SECURITY;

-- Read: any approver/admin can see the trail (it's their accountability lens).
DROP POLICY IF EXISTS "Approvers can read transfer_audit" ON public.transfer_audit;
CREATE POLICY "Approvers can read transfer_audit" ON public.transfer_audit
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  );

-- Writes: only service role (the edge function) inserts. No update/delete
-- ever — audit immutability. Service role bypasses RLS so no insert policy
-- is required for it; we explicitly deny inserts from authenticated users.
DROP POLICY IF EXISTS "No client inserts into transfer_audit" ON public.transfer_audit;
CREATE POLICY "No client inserts into transfer_audit" ON public.transfer_audit
  FOR INSERT TO authenticated WITH CHECK (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. check_transfer_caps RPC
--    Returns a row { allowed boolean, reason text, applied_limit_kind text,
--    applied_limit_ngn numeric, used_today_ngn, used_month_ngn }.
--    Edge function calls this with security_definer so RLS is bypassed.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_transfer_caps(
  p_user_id uuid,
  p_amount_ngn numeric
)
RETURNS TABLE (
  allowed boolean,
  reason text,
  applied_limit_kind text,
  applied_limit_ngn numeric,
  used_today_ngn numeric,
  used_month_ngn numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_single numeric;
  v_daily  numeric;
  v_monthly numeric;
  v_used_today numeric;
  v_used_month numeric;
BEGIN
  -- Resolve actor role.
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN
    RETURN QUERY SELECT false, 'Unknown user', NULL::text, NULL::numeric, 0::numeric, 0::numeric;
    RETURN;
  END IF;

  -- Pick limits: user-level wins, role-level fallback. NULL caps = no limit.
  SELECT single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn
    INTO v_single, v_daily, v_monthly
    FROM public.transfer_limits
   WHERE user_id = p_user_id
   LIMIT 1;

  IF NOT FOUND THEN
    SELECT single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn
      INTO v_single, v_daily, v_monthly
      FROM public.transfer_limits
     WHERE user_id IS NULL AND role = v_role
     LIMIT 1;
  END IF;

  -- Compute usage from successful transfer_audit rows in the rolling windows.
  SELECT COALESCE(SUM(amount_ngn), 0)
    INTO v_used_today
    FROM public.transfer_audit
   WHERE actor_id = p_user_id
     AND outcome = 'ok'
     AND action IN ('initiate_transfer','bulk_transfer')
     AND created_at >= now() - interval '24 hours';

  SELECT COALESCE(SUM(amount_ngn), 0)
    INTO v_used_month
    FROM public.transfer_audit
   WHERE actor_id = p_user_id
     AND outcome = 'ok'
     AND action IN ('initiate_transfer','bulk_transfer')
     AND created_at >= date_trunc('month', now());

  -- Single-transfer cap.
  IF v_single IS NOT NULL AND p_amount_ngn > v_single THEN
    RETURN QUERY SELECT false,
      format('Single-transfer cap of ₦%s exceeded (this transfer: ₦%s)',
             to_char(v_single, 'FM999,999,999,999'),
             to_char(p_amount_ngn, 'FM999,999,999,999')),
      'single'::text, v_single, v_used_today, v_used_month;
    RETURN;
  END IF;

  -- Daily rolling cap.
  IF v_daily IS NOT NULL AND (v_used_today + p_amount_ngn) > v_daily THEN
    RETURN QUERY SELECT false,
      format('Daily cap of ₦%s would be exceeded (already used ₦%s in last 24h)',
             to_char(v_daily, 'FM999,999,999,999'),
             to_char(v_used_today, 'FM999,999,999,999')),
      'daily'::text, v_daily, v_used_today, v_used_month;
    RETURN;
  END IF;

  -- Monthly cap.
  IF v_monthly IS NOT NULL AND (v_used_month + p_amount_ngn) > v_monthly THEN
    RETURN QUERY SELECT false,
      format('Monthly cap of ₦%s would be exceeded (already used ₦%s this month)',
             to_char(v_monthly, 'FM999,999,999,999'),
             to_char(v_used_month, 'FM999,999,999,999')),
      'monthly'::text, v_monthly, v_used_today, v_used_month;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, NULL::text, NULL::numeric, v_used_today, v_used_month;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_transfer_caps(uuid, numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.check_transfer_caps IS
  'Returns whether a transfer of the given amount is allowed for the user, '
  'based on transfer_limits and recent transfer_audit usage. Used by the '
  'paystack-transfer edge function to enforce caps server-side.';
