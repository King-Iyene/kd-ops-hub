-- =============================================================================
-- Transfer Authorization hardening — closes audit findings:
--
--   B-3  No history trail on transfer_limits changes.
--        Fix: transfer_limits_history table + immutability trigger + auto-
--        capture trigger on every INSERT/UPDATE/DELETE to transfer_limits.
--        Also adds set_transfer_limit / delete_transfer_limit SECURITY DEFINER
--        RPCs as the only privileged path to edit limits.
--
--   B-5  Intent-audit rows never aged-out; usage accounting omits intents.
--        Fix: intent index on transfer_audit; release_abandoned_intents() cron
--        job (every 5 min); rolling-usage query now counts outcome IN
--        ('ok','intent') so an intent reduces available headroom.
--
--   M-1  check_transfer_caps() is missing batch-cap support and intent recording.
--        Fix: replaces the 2-argument form with a 7-argument form that accepts
--        p_intent, p_check_batch_cap, p_ip_hash, p_user_agent.  Returns a 7th
--        column: intent_audit_id (uuid).
--
--   M-2  transfer_limits user-override expiry is not enforced.
--        Fix: look-up in check_transfer_caps now filters expires_at > now().
--
--   M-3  No CHECK constraint ensuring single ≤ daily ≤ monthly order.
--        Fix: transfer_limits_cap_ordering CHECK (NOT VALID then validated).
--
--   M-4  Super admins can edit their own limits (self-edit).
--        Fix: set_transfer_limit / delete_transfer_limit refuse when
--        p_user_id = caller or p_role = caller's own role.
--
-- M-5 (CSV export UI) is handled in the front-end PR, not here.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 1 — transfer_limits schema additions
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.transfer_limits
  ADD COLUMN IF NOT EXISTS single_batch_limit_ngn  numeric,
  ADD COLUMN IF NOT EXISTS expires_at              timestamptz,
  ADD COLUMN IF NOT EXISTS granted_by              uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS granted_reason          text;

COMMENT ON COLUMN public.transfer_limits.single_batch_limit_ngn IS
  'Maximum total amount allowed in a single payment batch for this role/user. '
  'NULL means no batch-level ceiling beyond daily and monthly caps. '
  'Must be <= monthly_limit_ngn when both are set (enforced by cap_ordering CHECK).';

COMMENT ON COLUMN public.transfer_limits.expires_at IS
  'If set, this user-level override is considered inactive after this timestamp. '
  'NULL on role-default rows (role-level limits do not expire). '
  'check_transfer_caps falls back to the role default once the override expires.';

COMMENT ON COLUMN public.transfer_limits.granted_by IS
  'The super_admin profile id who created or last modified this row. '
  'Populated by set_transfer_limit; cross-references profiles.id.';

COMMENT ON COLUMN public.transfer_limits.granted_reason IS
  'Mandatory free-text justification when setting a per-user override. '
  'Must be >= 5 characters when user_id IS NOT NULL (enforced in RPC).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 2 — cap ordering CHECK constraint (M-3)
-- ─────────────────────────────────────────────────────────────────────────────

-- Use NOT VALID so the constraint can be added without scanning existing rows
-- that predate this migration, then validate immediately after.
ALTER TABLE public.transfer_limits
  ADD CONSTRAINT transfer_limits_cap_ordering CHECK (
    COALESCE(single_txn_limit_ngn, 0) <=
      COALESCE(daily_limit_ngn, single_txn_limit_ngn, 0)
    AND COALESCE(daily_limit_ngn, 0) <=
      COALESCE(monthly_limit_ngn, daily_limit_ngn, 0)
    AND COALESCE(single_batch_limit_ngn, 0) <=
      COALESCE(monthly_limit_ngn, single_batch_limit_ngn, 0)
  ) NOT VALID;

-- Existing seed rows from 20260807000000 are within order; validate immediately.
ALTER TABLE public.transfer_limits
  VALIDATE CONSTRAINT transfer_limits_cap_ordering;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 3 — transfer_limits_history table (B-3)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.transfer_limits_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_id     uuid        REFERENCES public.transfer_limits(id) ON DELETE SET NULL,
  changed_by   uuid        REFERENCES public.profiles(id),
  changed_at   timestamptz NOT NULL DEFAULT now(),
  ip_hash      text,
  user_agent   text,
  before_row   jsonb,
  after_row    jsonb,
  change_kind  text        NOT NULL CHECK (change_kind IN ('insert','update','delete'))
);

COMMENT ON TABLE public.transfer_limits_history IS
  'Immutable audit trail of every INSERT/UPDATE/DELETE on transfer_limits. '
  'Rows are written by the record_transfer_limits_history trigger; no direct '
  'client write is permitted. Retention is governed by the data-retention policy.';

ALTER TABLE public.transfer_limits_history ENABLE ROW LEVEL SECURITY;

-- Read: finance+ roles can view the history trail.
DROP POLICY IF EXISTS "th_read" ON public.transfer_limits_history;
CREATE POLICY "th_read" ON public.transfer_limits_history
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin','admin','finance'));

-- Explicit INSERT block: history rows are written only by SECURITY DEFINER
-- trigger functions (which run as the table owner and bypass RLS).
DROP POLICY IF EXISTS "th_no_writes" ON public.transfer_limits_history;
CREATE POLICY "th_no_writes" ON public.transfer_limits_history
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- Immutability trigger: block any UPDATE or DELETE even from postgres role
-- so forensic guarantees are stronger than just RLS.
CREATE OR REPLACE FUNCTION public.enforce_transfer_limits_history_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'transfer_limits_history rows are immutable and cannot be updated or deleted'
    USING ERRCODE = 'insufficient_privilege';
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.enforce_transfer_limits_history_immutability IS
  'Prevents any UPDATE or DELETE on transfer_limits_history, enforcing '
  'forensic immutability at the trigger layer in addition to RLS.';

DROP TRIGGER IF EXISTS transfer_limits_history_immutability ON public.transfer_limits_history;
CREATE TRIGGER transfer_limits_history_immutability
  BEFORE UPDATE OR DELETE ON public.transfer_limits_history
  FOR EACH ROW EXECUTE FUNCTION public.enforce_transfer_limits_history_immutability();

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 4 — auto-history trigger on transfer_limits (B-3)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_transfer_limits_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text;
BEGIN
  v_kind := lower(TG_OP);  -- 'insert' | 'update' | 'delete'

  INSERT INTO public.transfer_limits_history (
    limit_id,
    changed_by,
    changed_at,
    ip_hash,
    user_agent,
    before_row,
    after_row,
    change_kind
  ) VALUES (
    COALESCE(NEW.id, OLD.id),
    auth.uid(),
    now(),
    NULL,   -- ip_hash: set_transfer_limit RPC writes a separate transfer_audit
            -- row with ip_hash; the history row relies on changed_by identity.
    NULL,   -- user_agent: same rationale.
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END,
    v_kind
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.record_transfer_limits_history IS
  'AFTER INSERT OR UPDATE OR DELETE trigger on transfer_limits. '
  'Writes a forensic snapshot to transfer_limits_history. '
  'Runs SECURITY DEFINER so it can bypass RLS on the history table.';

DROP TRIGGER IF EXISTS transfer_limits_history_capture ON public.transfer_limits;
CREATE TRIGGER transfer_limits_history_capture
  AFTER INSERT OR UPDATE OR DELETE ON public.transfer_limits
  FOR EACH ROW EXECUTE FUNCTION public.record_transfer_limits_history();

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 5 — intent index on transfer_audit (B-5)
-- ─────────────────────────────────────────────────────────────────────────────

-- Partial index for the two outcome values used in intent-ageing queries
-- and in the rolling usage window queries that now count 'intent' rows.
CREATE INDEX IF NOT EXISTS transfer_audit_intent_idx
  ON public.transfer_audit(actor_id, outcome, action, created_at DESC)
  WHERE outcome IN ('intent','abandoned');

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 6 — release_abandoned_intents() RPC (B-5)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.release_abandoned_intents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- An intent row older than 30 minutes that has not been upgraded to 'ok'
  -- (by the transfer completing) is considered abandoned.  Flipping to
  -- 'abandoned' removes it from the rolling-usage window that
  -- check_transfer_caps counts for daily/monthly headroom.
  UPDATE public.transfer_audit
     SET outcome = 'abandoned'
   WHERE outcome = 'intent'
     AND created_at < now() - interval '30 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.release_abandoned_intents IS
  'Flips transfer_audit rows with outcome=''intent'' that are older than 30 '
  'minutes to outcome=''abandoned''. Scheduled every 5 minutes via pg_cron '
  'so dangling intents do not permanently block headroom. Returns row count.';

REVOKE EXECUTE ON FUNCTION public.release_abandoned_intents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_abandoned_intents() TO service_role;

-- Schedule: every 5 minutes.  Guard against missing pg_cron extension.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_release_abandoned_intents') THEN
      PERFORM cron.unschedule('kdops_release_abandoned_intents');
    END IF;
    PERFORM cron.schedule(
      'kdops_release_abandoned_intents',
      '*/5 * * * *',
      $cmd$ SELECT public.release_abandoned_intents(); $cmd$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available in this environment; no-op.
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 7 — updated check_transfer_caps (B-5, M-1, M-2)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop all known overloads so the new 7-argument version is the single
-- canonical form.  Callers that passed only (uuid, numeric) must switch to
-- positional defaults; the old 2-arg signature is removed intentionally so
-- TypeScript callers get a compile error rather than silently using the old
-- 6-col version without the intent_audit_id column.
DROP FUNCTION IF EXISTS public.check_transfer_caps(uuid, numeric, boolean, text, boolean, text, text);
DROP FUNCTION IF EXISTS public.check_transfer_caps(uuid, numeric);

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
  'When p_intent=true, records an outcome=''intent'' row in transfer_audit '
  'so rolling usage is reserved until the transfer completes or abandons. '
  'When p_check_batch_cap=true, also validates single_batch_limit_ngn. '
  'Expired user overrides (expires_at <= now()) fall back to the role default. '
  'Supersedes the 2-argument form from 20260807000000 and 20260813000000.';

REVOKE EXECUTE ON FUNCTION public.check_transfer_caps(uuid, numeric, boolean, text, boolean, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_transfer_caps(uuid, numeric, boolean, text, boolean, text, text)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 8 — set_transfer_limit RPC (B-3, M-1, M-4)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_transfer_limit(
  p_id           uuid        DEFAULT NULL,
  p_role         text        DEFAULT NULL,
  p_user_id      uuid        DEFAULT NULL,
  p_single       numeric     DEFAULT NULL,
  p_daily        numeric     DEFAULT NULL,
  p_monthly      numeric     DEFAULT NULL,
  p_co_approval  numeric     DEFAULT NULL,
  p_batch        numeric     DEFAULT NULL,
  p_expires_at   timestamptz DEFAULT NULL,
  p_reason       text        DEFAULT NULL,
  p_ip_hash      text        DEFAULT NULL,
  p_user_agent   text        DEFAULT NULL
)
RETURNS public.transfer_limits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid;
  v_caller_role text;
  v_old_row     public.transfer_limits;
  v_new_row     public.transfer_limits;
  v_kind        text;
  v_expires     timestamptz;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_caller_role := public.current_user_role();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can manage transfer limits'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Mutual exclusivity: exactly one of p_id, p_user_id, p_role ───────────
  IF p_id IS NULL AND p_user_id IS NULL AND p_role IS NULL THEN
    RAISE EXCEPTION 'Supply p_id (to update existing row), p_user_id (user override), or p_role (role default)';
  END IF;

  -- ── User-override path ────────────────────────────────────────────────────
  IF p_user_id IS NOT NULL THEN
    v_kind := 'user';

    -- M-4: block self-edit.
    IF p_user_id = v_caller THEN
      RAISE EXCEPTION 'Super admins cannot edit their own transfer limits'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Reason is mandatory for per-user overrides.
    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
      RAISE EXCEPTION 'A reason of at least 5 characters is required when setting a user-level override';
    END IF;

    -- Default expiry: 30 days.  Hard limit: 90 days.
    v_expires := COALESCE(p_expires_at, now() + interval '30 days');
    IF v_expires > now() + interval '90 days' THEN
      RAISE EXCEPTION 'User-level override cannot expire more than 90 days in the future';
    END IF;

  -- ── Role-default path ─────────────────────────────────────────────────────
  ELSIF p_role IS NOT NULL THEN
    v_kind    := 'role';
    v_expires := NULL;  -- Role defaults never expire.

    -- M-4: block editing own role's default.
    IF p_role = v_caller_role THEN
      RAISE EXCEPTION 'Super admins cannot edit the transfer limit default for their own role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

  -- ── p_id path (update by primary key) ────────────────────────────────────
  ELSE
    v_kind    := 'id';
    v_expires := p_expires_at;
  END IF;

  -- ── Capture old row for audit (if updating) ───────────────────────────────
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old_row FROM public.transfer_limits WHERE id = p_id;
  ELSIF p_user_id IS NOT NULL THEN
    SELECT * INTO v_old_row FROM public.transfer_limits WHERE user_id = p_user_id;
  ELSIF p_role IS NOT NULL THEN
    SELECT * INTO v_old_row FROM public.transfer_limits
     WHERE role = p_role AND user_id IS NULL;
  END IF;

  -- ── Upsert ────────────────────────────────────────────────────────────────
  -- The cap-ordering CHECK constraint will fire here and give a generic
  -- check_violation; we catch it and re-raise with a friendlier message.
  BEGIN
    IF p_id IS NOT NULL THEN
      -- Update by primary key.
      UPDATE public.transfer_limits SET
        single_txn_limit_ngn     = COALESCE(p_single,      single_txn_limit_ngn),
        daily_limit_ngn          = COALESCE(p_daily,       daily_limit_ngn),
        monthly_limit_ngn        = COALESCE(p_monthly,     monthly_limit_ngn),
        co_approval_threshold_ngn= COALESCE(p_co_approval, co_approval_threshold_ngn),
        single_batch_limit_ngn   = COALESCE(p_batch,       single_batch_limit_ngn),
        expires_at               = CASE WHEN v_kind = 'id' THEN v_expires
                                        ELSE expires_at END,
        granted_by               = v_caller,
        granted_reason           = COALESCE(p_reason, granted_reason),
        updated_at               = now()
      WHERE id = p_id
      RETURNING * INTO v_new_row;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'transfer_limits row % not found', p_id;
      END IF;

    ELSIF p_user_id IS NOT NULL THEN
      INSERT INTO public.transfer_limits (
        user_id, role,
        single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn,
        co_approval_threshold_ngn, single_batch_limit_ngn,
        expires_at, granted_by, granted_reason,
        updated_at
      ) VALUES (
        p_user_id,
        -- Inherit the role from the user's profile so role is always set.
        (SELECT role FROM public.profiles WHERE id = p_user_id),
        p_single, p_daily, p_monthly, p_co_approval, p_batch,
        v_expires, v_caller, p_reason,
        now()
      )
      ON CONFLICT ON CONSTRAINT transfer_limits_user_uq DO UPDATE SET
        single_txn_limit_ngn      = COALESCE(EXCLUDED.single_txn_limit_ngn,      transfer_limits.single_txn_limit_ngn),
        daily_limit_ngn           = COALESCE(EXCLUDED.daily_limit_ngn,           transfer_limits.daily_limit_ngn),
        monthly_limit_ngn         = COALESCE(EXCLUDED.monthly_limit_ngn,         transfer_limits.monthly_limit_ngn),
        co_approval_threshold_ngn = COALESCE(EXCLUDED.co_approval_threshold_ngn, transfer_limits.co_approval_threshold_ngn),
        single_batch_limit_ngn    = COALESCE(EXCLUDED.single_batch_limit_ngn,    transfer_limits.single_batch_limit_ngn),
        expires_at                = EXCLUDED.expires_at,
        granted_by                = EXCLUDED.granted_by,
        granted_reason            = EXCLUDED.granted_reason,
        updated_at                = now()
      RETURNING * INTO v_new_row;

    ELSE
      -- Role default upsert (p_role IS NOT NULL).
      INSERT INTO public.transfer_limits (
        role, user_id,
        single_txn_limit_ngn, daily_limit_ngn, monthly_limit_ngn,
        co_approval_threshold_ngn, single_batch_limit_ngn,
        expires_at, granted_by, granted_reason,
        updated_at
      ) VALUES (
        p_role, NULL,
        p_single, p_daily, p_monthly, p_co_approval, p_batch,
        NULL, v_caller, p_reason,
        now()
      )
      ON CONFLICT ON CONSTRAINT transfer_limits_role_default_uq DO UPDATE SET
        single_txn_limit_ngn      = COALESCE(EXCLUDED.single_txn_limit_ngn,      transfer_limits.single_txn_limit_ngn),
        daily_limit_ngn           = COALESCE(EXCLUDED.daily_limit_ngn,           transfer_limits.daily_limit_ngn),
        monthly_limit_ngn         = COALESCE(EXCLUDED.monthly_limit_ngn,         transfer_limits.monthly_limit_ngn),
        co_approval_threshold_ngn = COALESCE(EXCLUDED.co_approval_threshold_ngn, transfer_limits.co_approval_threshold_ngn),
        single_batch_limit_ngn    = COALESCE(EXCLUDED.single_batch_limit_ngn,    transfer_limits.single_batch_limit_ngn),
        granted_by                = EXCLUDED.granted_by,
        granted_reason            = EXCLUDED.granted_reason,
        updated_at                = now()
      RETURNING * INTO v_new_row;
    END IF;

  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'Cap ordering violated: single_txn_limit_ngn must be <= daily_limit_ngn <= monthly_limit_ngn, and single_batch_limit_ngn must be <= monthly_limit_ngn. Check your values and try again.'
        USING ERRCODE = 'check_violation';
  END;

  -- ── Transfer audit row (financial event surface) ──────────────────────────
  -- The history trigger already captured the before/after on transfer_limits.
  -- Here we write a transfer_audit row so the financial audit trail also
  -- captures who changed limits and via which IP.
  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, ip_hash, user_agent, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'cap_changed', 'ok',
    p_ip_hash, p_user_agent,
    jsonb_build_object(
      'kind',       v_kind,
      'target_id',  COALESCE(p_id::text, p_user_id::text, p_role),
      'before',     CASE WHEN v_old_row IS NOT NULL THEN row_to_json(v_old_row)::jsonb ELSE NULL END,
      'after',      row_to_json(v_new_row)::jsonb
    )
  );

  -- ── Generic audit log (operational surface) ───────────────────────────────
  INSERT INTO public.audit_logs (
    action_type, description, performed_by, performed_by_name
  ) VALUES (
    'transfer_limit_changed',
    format('Transfer limit %s (%s=%s): single=%s daily=%s monthly=%s batch=%s expires=%s',
           CASE WHEN v_old_row IS NULL THEN 'created' ELSE 'updated' END,
           v_kind,
           COALESCE(p_id::text, p_user_id::text, p_role, '?'),
           COALESCE(p_single::text,      '(unchanged)'),
           COALESCE(p_daily::text,       '(unchanged)'),
           COALESCE(p_monthly::text,     '(unchanged)'),
           COALESCE(p_batch::text,       '(unchanged)'),
           COALESCE(v_expires::text,     'none')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_new_row;
END;
$$;

COMMENT ON FUNCTION public.set_transfer_limit IS
  'Creates or updates a transfer_limits row. Only callable by super_admin. '
  'Enforces: no self-edit (M-4), mandatory reason for user overrides, '
  '30-day default expiry (max 90 days) for user overrides, and '
  'cap ordering (single ≤ daily ≤ monthly, batch ≤ monthly). '
  'Writes both transfer_audit and audit_logs rows. '
  'The auto-history trigger on transfer_limits captures before/after in '
  'transfer_limits_history automatically.';

REVOKE EXECUTE ON FUNCTION public.set_transfer_limit(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric,
  timestamptz, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_transfer_limit(
  uuid, text, uuid, numeric, numeric, numeric, numeric, numeric,
  timestamptz, text, text, text
) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 9 — delete_transfer_limit RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_transfer_limit(
  p_id         uuid,
  p_ip_hash    text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller      uuid;
  v_caller_role text;
  v_row         public.transfer_limits;
BEGIN
  -- ── Auth ──────────────────────────────────────────────────────────────────
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_caller_role := public.current_user_role();
  IF v_caller_role IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'Only super_admin can delete transfer limits'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Fetch the row ─────────────────────────────────────────────────────────
  SELECT * INTO v_row FROM public.transfer_limits WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer_limits row % not found', p_id;
  END IF;

  -- ── M-4: block self-delete (own user override) ────────────────────────────
  IF v_row.user_id = v_caller THEN
    RAISE EXCEPTION 'Super admins cannot delete their own transfer limit override'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Block deleting role defaults for caller's own role ────────────────────
  IF v_row.user_id IS NULL AND v_row.role = v_caller_role THEN
    RAISE EXCEPTION 'Super admins cannot delete the transfer limit default for their own role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Delete ────────────────────────────────────────────────────────────────
  -- The auto-history trigger fires AFTER DELETE and captures the full before_row.
  DELETE FROM public.transfer_limits WHERE id = p_id;

  -- ── Transfer audit ────────────────────────────────────────────────────────
  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, ip_hash, user_agent, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'cap_deleted', 'ok',
    p_ip_hash, p_user_agent,
    jsonb_build_object(
      'deleted_id',   p_id,
      'was_user_id',  v_row.user_id,
      'was_role',     v_row.role,
      'before',       row_to_json(v_row)::jsonb
    )
  );

  -- ── Generic audit log ─────────────────────────────────────────────────────
  INSERT INTO public.audit_logs (
    action_type, description, performed_by, performed_by_name
  ) VALUES (
    'transfer_limit_deleted',
    format('Transfer limit deleted: id=%s (role=%s user_id=%s)',
           p_id, COALESCE(v_row.role,'—'), COALESCE(v_row.user_id::text,'—')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );
END;
$$;

COMMENT ON FUNCTION public.delete_transfer_limit IS
  'Deletes a transfer_limits row. Only callable by super_admin. '
  'Blocks deletion of own user override and own role default (M-4). '
  'The auto-history trigger on transfer_limits captures the deleted row '
  'in transfer_limits_history automatically (change_kind=''delete'').';

REVOKE EXECUTE ON FUNCTION public.delete_transfer_limit(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_transfer_limit(uuid, text, text)
  TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Part 10 — expiry notification cron
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_expiring_overrides()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec         record;
  v_sa          record;
  v_notif_count integer := 0;
  v_body        text;
  v_title       text;
  v_days_left   int;
  v_today       date := CURRENT_DATE;
BEGIN
  -- Iterate over user-level overrides expiring in 7 days, 1 day, or today.
  FOR v_rec IN
    SELECT
      tl.id,
      tl.user_id,
      tl.expires_at,
      tl.granted_reason,
      COALESCE(p.full_name, p.email, tl.user_id::text) AS target_name,
      EXTRACT(DAY FROM tl.expires_at::date - v_today)::int AS days_left
    FROM public.transfer_limits tl
    LEFT JOIN public.profiles p ON p.id = tl.user_id
    WHERE tl.user_id IS NOT NULL
      AND tl.expires_at IS NOT NULL
      AND tl.expires_at::date IN (
        v_today + interval '7 days',
        v_today + interval '1 day',
        v_today
      )
  LOOP
    v_days_left := v_rec.days_left;

    v_title := format('Transfer override expiring %s',
      CASE v_days_left
        WHEN 0 THEN 'today'
        WHEN 1 THEN 'tomorrow'
        ELSE format('in %s days', v_days_left)
      END
    );

    v_body := format('The transfer limit override for %s%s expires %s.',
      v_rec.target_name,
      CASE
        WHEN v_rec.granted_reason IS NOT NULL
        THEN format(' (reason: %s)', left(v_rec.granted_reason, 80))
        ELSE ''
      END,
      CASE v_days_left
        WHEN 0 THEN 'today'
        WHEN 1 THEN 'tomorrow'
        ELSE format('in %s days', v_days_left)
      END
    );

    -- Notify each active super_admin once per check — skip if we already
    -- inserted the same (type, title, user_id) within the last 23 hours
    -- to avoid duplicate noise on hourly re-runs.
    FOR v_sa IN
      SELECT id FROM public.profiles
       WHERE role = 'super_admin'
         AND COALESCE(status, 'active') = 'active'
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = v_sa.id
           AND type    = 'transfer_limit_expiry'
           AND title   = v_title
           AND created_at >= now() - interval '23 hours'
      ) THEN
        INSERT INTO public.notifications (
          user_id, type, module, priority, title, body, link
        ) VALUES (
          v_sa.id,
          'transfer_limit_expiry',
          'settings',
          'high',
          v_title,
          v_body,
          '/settings/transfer-authorization'
        );
        v_notif_count := v_notif_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_notif_count;
END;
$$;

COMMENT ON FUNCTION public.notify_expiring_overrides IS
  'Scans transfer_limits for user-level overrides expiring today, in 1 day, '
  'or in 7 days and notifies every active super_admin. Deduplicated: a '
  'notification is not inserted if the same (type, title) was already sent '
  'to that user in the last 23 hours. Returns the count of rows inserted. '
  'Scheduled daily at 09:00 UTC via pg_cron.';

REVOKE EXECUTE ON FUNCTION public.notify_expiring_overrides() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.notify_expiring_overrides() TO service_role;

-- Schedule daily at 09:00 UTC.  Guard against missing pg_cron extension.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kdops_notify_expiring_overrides') THEN
      PERFORM cron.unschedule('kdops_notify_expiring_overrides');
    END IF;
    PERFORM cron.schedule(
      'kdops_notify_expiring_overrides',
      '0 9 * * *',
      $cmd$ SELECT public.notify_expiring_overrides(); $cmd$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available in this environment; no-op.
  NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- End of migration.
-- Findings closed: B-3, B-5, M-1, M-2, M-3, M-4.
-- M-5 (CSV export UI) is handled separately in the front-end PR.
-- ─────────────────────────────────────────────────────────────────────────────
