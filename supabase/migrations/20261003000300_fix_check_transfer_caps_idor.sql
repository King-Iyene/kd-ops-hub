-- Fix: check_transfer_caps let ANY authenticated user pass an arbitrary
-- p_user_id and get back that user's cap usage, and — with p_intent=true —
-- write a fabricated 'intent' row into their transfer_audit ledger. The
-- function is SECURITY DEFINER, so it bypasses transfer_audit's RLS
-- entirely; nothing inside the function body ever checked p_user_id against
-- auth.uid(). This let any logged-in user read another user's rolling
-- 24h/30-day transfer volume, or spam bogus 'intent' rows to inflate a
-- victim's apparent usage and trip their daily/monthly cap (DoS), or pollute
-- their audit trail.
--
-- Fix: re-check the caller against p_user_id, mirroring the guard already
-- used by set_transfer_limit/delete_transfer_limit and soft_delete_employee.
-- Self-checks (p_user_id = auth.uid()) are always allowed. Cross-user checks
-- require the caller to be super_admin/admin/finance (the same roles RLS
-- already lets read transfer_audit directly). Trusted server-side callers
-- (paystack-transfer, flutterwave-transfer, batch-worker) invoke this with
-- the service_role key and are exempted via current_user.

CREATE OR REPLACE FUNCTION public.check_transfer_caps(
  p_user_id         uuid,
  p_amount_ngn      numeric,
  p_intent          boolean  DEFAULT false,
  p_action          text     DEFAULT 'initiate_transfer',
  p_check_batch_cap boolean  DEFAULT false,
  p_ip_hash         text     DEFAULT NULL,
  p_user_agent      text     DEFAULT NULL
)
RETURNS TABLE (
  allowed            boolean,
  reason             text,
  applied_limit_kind text,
  applied_limit_ngn  numeric,
  used_today_ngn     numeric,
  used_month_ngn     numeric,
  intent_audit_id    uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid;
  v_caller_role  text;
  v_role         text;
  v_single       numeric;
  v_daily        numeric;
  v_monthly      numeric;
  v_batch        numeric;
  v_max_single   numeric;
  v_used_today   numeric := 0;
  v_used_month   numeric := 0;
  v_intent_id    uuid    := NULL;
  v_limit_found  boolean := false;
BEGIN
  -- ── 0. Authorization: caller may only check their own caps unless they're
  --      a trusted server-side caller or hold an approver role. ────────────
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    v_caller := auth.uid();

    IF v_caller IS NULL OR p_user_id IS DISTINCT FROM v_caller THEN
      SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller;

      IF v_caller_role IS DISTINCT FROM ALL (ARRAY['super_admin','admin','finance']) THEN
        RAISE EXCEPTION 'Not authorized to check another user''s transfer caps'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  -- ── 1. Sanity: positive amount required ──────────────────────────────────
  IF p_amount_ngn IS NULL OR p_amount_ngn <= 0 THEN
    RETURN QUERY SELECT
      false, 'Amount must be positive'::text,
      NULL::text, NULL::numeric, 0::numeric, 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  -- ── 2. Platform ceiling (company_settings.max_single_transfer_ngn) ───────
  SELECT max_single_transfer_ngn INTO v_max_single
    FROM public.company_settings
   WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_max_single IS NOT NULL AND v_max_single > 0 AND p_amount_ngn > v_max_single THEN
    RETURN QUERY SELECT
      false,
      format('Single transfer exceeds platform maximum of ₦%s',
             to_char(v_max_single, 'FM999,999,999,999'))::text,
      'platform_single'::text,
      v_max_single,
      0::numeric,
      0::numeric,
      NULL::uuid;
    RETURN;
  END IF;

  -- ── 3. Resolve limits: user override (unexpired) wins, else role default ──
  --
  --   M-2 fix: filter expires_at IS NULL OR expires_at > now() so expired
  --   overrides fall through to the role default automatically.
  SELECT single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn, single_batch_limit_ngn
    INTO v_single, v_daily, v_monthly, v_batch
    FROM public.transfer_limits
   WHERE user_id = p_user_id
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;

  IF FOUND THEN
    v_limit_found := true;
  ELSE
    -- User override not found or expired — resolve role and try role default.
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;

    IF v_role IS NULL THEN
      RETURN QUERY SELECT
        false, 'No transfer limits configured for this user'::text,
        NULL::text, NULL::numeric, 0::numeric, 0::numeric, NULL::uuid;
      RETURN;
    END IF;

    SELECT single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn, single_batch_limit_ngn
      INTO v_single, v_daily, v_monthly, v_batch
      FROM public.transfer_limits
     WHERE user_id IS NULL AND role = v_role
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT
        false,
        format('No transfer limits configured for role %s', v_role)::text,
        NULL::text, NULL::numeric, 0::numeric, 0::numeric, NULL::uuid;
      RETURN;
    END IF;

    v_limit_found := true;
  END IF;

  -- Resolve v_role for audit row if not yet set (user-override path).
  IF v_role IS NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  END IF;

  -- ── 4. Single-transfer cap ────────────────────────────────────────────────
  IF v_single IS NOT NULL AND p_amount_ngn > v_single THEN
    RETURN QUERY SELECT
      false,
      format('Single-transfer cap of ₦%s exceeded (this transfer: ₦%s)',
             to_char(v_single, 'FM999,999,999,999'),
             to_char(p_amount_ngn, 'FM999,999,999,999'))::text,
      'single'::text,
      v_single,
      0::numeric,
      0::numeric,
      NULL::uuid;
    RETURN;
  END IF;

  -- ── 5. Batch cap (only when p_check_batch_cap = true) ────────────────────
  IF p_check_batch_cap AND v_batch IS NOT NULL AND p_amount_ngn > v_batch THEN
    RETURN QUERY SELECT
      false,
      format('Single-batch cap of ₦%s exceeded (this batch: ₦%s)',
             to_char(v_batch, 'FM999,999,999,999'),
             to_char(p_amount_ngn, 'FM999,999,999,999'))::text,
      'batch'::text,
      v_batch,
      0::numeric,
      0::numeric,
      NULL::uuid;
    RETURN;
  END IF;

  -- ── 6. Rolling usage — count both 'ok' and 'intent' outcomes ─────────────
  --   B-5 fix: including 'intent' prevents a user from opening many concurrent
  --   intents to artificially inflate apparent headroom before any resolves.
  SELECT COALESCE(SUM(amount_ngn), 0) INTO v_used_today
    FROM public.transfer_audit
   WHERE actor_id = p_user_id
     AND outcome IN ('ok','intent')
     AND action IN ('initiate_transfer','bulk_transfer')
     AND created_at >= now() - interval '24 hours';

  SELECT COALESCE(SUM(amount_ngn), 0) INTO v_used_month
    FROM public.transfer_audit
   WHERE actor_id = p_user_id
     AND outcome IN ('ok','intent')
     AND action IN ('initiate_transfer','bulk_transfer')
     AND created_at >= now() - interval '30 days';

  -- ── 7. Daily cap ──────────────────────────────────────────────────────────
  IF v_daily IS NOT NULL AND (v_used_today + p_amount_ngn) > v_daily THEN
    RETURN QUERY SELECT
      false,
      format('Daily cap of ₦%s would be exceeded (already used ₦%s in last 24h)',
             to_char(v_daily, 'FM999,999,999,999'),
             to_char(v_used_today, 'FM999,999,999,999'))::text,
      'daily'::text,
      v_daily,
      v_used_today,
      v_used_month,
      NULL::uuid;
    RETURN;
  END IF;

  -- ── 8. Monthly cap ────────────────────────────────────────────────────────
  IF v_monthly IS NOT NULL AND (v_used_month + p_amount_ngn) > v_monthly THEN
    RETURN QUERY SELECT
      false,
      format('Monthly cap of ₦%s would be exceeded (already used ₦%s in last 30 days)',
             to_char(v_monthly, 'FM999,999,999,999'),
             to_char(v_used_month, 'FM999,999,999,999'))::text,
      'monthly'::text,
      v_monthly,
      v_used_today,
      v_used_month,
      NULL::uuid;
    RETURN;
  END IF;

  -- ── 9. Allowed — optionally record an intent audit row ───────────────────
  IF p_intent THEN
    INSERT INTO public.transfer_audit (
      actor_id,
      actor_role,
      action,
      outcome,
      amount_ngn,
      ip_hash,
      user_agent,
      metadata
    ) VALUES (
      p_user_id,
      v_role,
      p_action,
      'intent',
      p_amount_ngn,
      p_ip_hash,
      p_user_agent,
      jsonb_build_object(
        'check_batch_cap', p_check_batch_cap,
        'applied_single',  v_single,
        'applied_daily',   v_daily,
        'applied_monthly', v_monthly
      )
    )
    RETURNING id INTO v_intent_id;
  END IF;

  RETURN QUERY SELECT
    true,
    NULL::text,
    'within_caps'::text,
    v_single,
    v_used_today,
    v_used_month,
    v_intent_id;
END;
$$;

COMMENT ON FUNCTION public.check_transfer_caps IS
  'Single source of truth for transfer cap enforcement. '
  'Returns whether a transfer of p_amount_ngn is allowed for p_user_id. '
  'Callers may only check their own caps (p_user_id = auth.uid()) unless '
  'they hold an approver role (super_admin/admin/finance) or call with the '
  'service_role key. When p_intent=true, records an outcome=''intent'' row '
  'in transfer_audit so rolling usage is reserved until the transfer '
  'completes or abandons. When p_check_batch_cap=true, also validates '
  'single_batch_limit_ngn. Expired user overrides (expires_at <= now()) '
  'fall back to the role default. Supersedes the version from '
  '20260814000000_transfer_auth_b3_b5_m1_m5.sql (fixes an IDOR that let any '
  'authenticated user read or pollute another user''s transfer-cap ledger).';

REVOKE EXECUTE ON FUNCTION public.check_transfer_caps(uuid, numeric, boolean, text, boolean, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_transfer_caps(uuid, numeric, boolean, text, boolean, text, text)
  TO authenticated, service_role;
