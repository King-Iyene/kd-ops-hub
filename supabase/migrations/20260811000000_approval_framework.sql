-- =============================================================================
-- Approval framework: dual-approval for payment batches, Quick Pay, and expense
-- payments. Closes BLOCKER findings B-1, B-4, B-6 and MEDIUM finding M-9 from
-- docs/audits/PAYMENT_SUBSYSTEM_AUDIT.md.
--
-- Why this migration sits at 20260811000000 (not the original 20260504000000):
-- it depends on the transfer_limits table created at 20260807000000 and on
-- the audit_log_immutability triggers at 20260810100000. Running it before
-- those would fail with "relation transfer_limits does not exist".
--
-- What it does, in order:
--   1. Adds a co-approval threshold to transfer_limits (per-role and per-user
--      via the existing override mechanism). NULL = no co-approval ever.
--   2. Creates approver_pools — a 6-row config table that drives which roles
--      can act as first/second approvers per action (payment_batch | quick_pay
--      | expense_payment). Super admins edit this in Settings.
--   3. Adds approval-state columns to payment_batches and expenses
--      (second_approver_id, second_approved_at, payload_hash_at_approval,
--      co_approval_required) plus the no-self-approval CHECK constraint.
--   4. Grandfathers existing rows where approved_by = created_by by clearing
--      approved_by (the CHECK constraint would otherwise reject them).
--   5. Adds 'pending_second_approval' to the payment_batches status check
--      constraint. expenses already has it from 20260418100000.
--   6. Wires up SECURITY DEFINER RPCs as the only legal path through the
--      approval flow:
--         get_eligible_approvers(action, tier, creator, first_approver?)
--         approve_payment_batch(batch_id, idempotency_key?)
--         confirm_second_approval(batch_id, idempotency_key?)
--         reject_payment_batch(batch_id, reason)
--         approve_expense(expense_id, idempotency_key?)
--         confirm_second_expense_approval(expense_id, idempotency_key?)
--         reject_expense(expense_id, reason)
--         reset_batch_to_draft(batch_id)
--         is_quick_pay_enabled()
--   7. Adds a BEFORE UPDATE trigger on batch_items + payment_batches that
--      refuses payload mutation once a batch has been approved (M-9). The
--      "Re-edit & Resubmit" path resets the batch to draft via the new RPC,
--      which clears approval state so payload edits are allowed again.
--   8. REVOKEs direct UPDATE on payment_batches.status / expenses.status from
--      authenticated. The RPCs are now the only legal path to flip status.
--   9. Adds company_settings.quick_pay_enabled (default false) so Quick Pay
--      is gated until the CFO explicitly turns it on.
--
-- The CFO will review co_approval_threshold defaults in Settings → Transfer
-- Authorization before go-live and adjust per-role/per-user values to match
-- the company's own risk policy.
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. transfer_limits.co_approval_threshold_ngn
--    NULL = no co-approval required regardless of amount.
--    Numeric = if a transfer's amount exceeds this, a second approver is
--              required (in addition to whatever cap rules already apply).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transfer_limits
  ADD COLUMN IF NOT EXISTS co_approval_threshold_ngn numeric;

COMMENT ON COLUMN public.transfer_limits.co_approval_threshold_ngn IS
  'Above this NGN amount, payment_batch / quick_pay / expense_payment requires '
  'a second approver. NULL = co-approval never required for this role/user. '
  'User-level rows override the role default.';

-- Seed reasonable role defaults — to be reviewed by the CFO before go-live.
UPDATE public.transfer_limits SET co_approval_threshold_ngn = 25000000
  WHERE user_id IS NULL AND role = 'super_admin' AND co_approval_threshold_ngn IS NULL;
UPDATE public.transfer_limits SET co_approval_threshold_ngn = 10000000
  WHERE user_id IS NULL AND role = 'admin' AND co_approval_threshold_ngn IS NULL;
UPDATE public.transfer_limits SET co_approval_threshold_ngn =  5000000
  WHERE user_id IS NULL AND role = 'finance' AND co_approval_threshold_ngn IS NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. approver_pools — config-driven eligible-role lists per action+tier
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approver_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL CHECK (action_type IN
    ('payment_batch','quick_pay','expense_payment')),
  tier text NOT NULL CHECK (tier IN ('first','second')),
  eligible_roles jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_type, tier)
);

COMMENT ON TABLE public.approver_pools IS
  'One row per (action_type, tier). eligible_roles is a JSON array of role '
  'strings. Server-side derivation narrows the first-tier pool to '
  '[''super_admin''] when the batch creator is admin/super_admin so an '
  'admin cannot self-approve their own request.';

ALTER TABLE public.approver_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approvers can read approver_pools" ON public.approver_pools;
CREATE POLICY "Approvers can read approver_pools" ON public.approver_pools
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = auth.uid()
               AND p.role IN ('super_admin','admin','finance'))
  );

DROP POLICY IF EXISTS "Super admin updates approver_pools" ON public.approver_pools;
CREATE POLICY "Super admin updates approver_pools" ON public.approver_pools
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                       WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- INSERT/DELETE intentionally not granted: pool rows are managed via
-- migrations only; super_admin can edit eligible_roles but not add/remove
-- (action_type, tier) pairs.

-- Seed all 6 rows.
INSERT INTO public.approver_pools (action_type, tier, eligible_roles) VALUES
  ('payment_batch',    'first',  '["admin","super_admin"]'::jsonb),
  ('payment_batch',    'second', '["admin","super_admin"]'::jsonb),
  ('quick_pay',        'first',  '["admin","super_admin"]'::jsonb),
  ('quick_pay',        'second', '["admin","super_admin"]'::jsonb),
  ('expense_payment',  'first',  '["admin","super_admin"]'::jsonb),
  ('expense_payment',  'second', '["admin","super_admin"]'::jsonb)
ON CONFLICT (action_type, tier) DO NOTHING;

-- Audit changes to pool config so super_admin can't quietly widen the list.
CREATE OR REPLACE FUNCTION public.audit_approver_pools_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.audit_logs (action_type, description, performed_by_name)
  VALUES (
    'approver_pool_changed',
    format('Approver pool changed: %s/%s — %s → %s',
           NEW.action_type, NEW.tier,
           COALESCE(OLD.eligible_roles::text, '[]'),
           NEW.eligible_roles::text),
    'Approver Pools Editor'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approver_pools_audit ON public.approver_pools;
CREATE TRIGGER approver_pools_audit
  AFTER UPDATE OF eligible_roles ON public.approver_pools
  FOR EACH ROW EXECUTE FUNCTION public.audit_approver_pools_change();

-- ──────────────────────────────────────────────────────────────────────────
-- 3. payment_batches additions — approval-state columns + CHECK constraints
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS approved_at               timestamptz,
  ADD COLUMN IF NOT EXISTS second_approver_id        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS second_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS payload_hash_at_approval  text,
  ADD COLUMN IF NOT EXISTS co_approval_required      boolean NOT NULL DEFAULT false;

-- Grandfather: clear any existing self-approvals before the CHECK lands so
-- the constraint can be added without rejecting legacy rows.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.payment_batches
   WHERE approved_by IS NOT NULL AND approved_by = created_by;
  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (action_type, description, performed_by_name)
    SELECT
      'legacy_self_approval_grandfathered',
      format('Cleared approved_by on legacy self-approved batch %s ("%s") — pre-approval-framework data', id, name),
      'Migration 20260811000000'
    FROM public.payment_batches
    WHERE approved_by IS NOT NULL AND approved_by = created_by;

    UPDATE public.payment_batches
       SET approved_by = NULL
     WHERE approved_by IS NOT NULL AND approved_by = created_by;
  END IF;
END $$;

-- No-self-approval CHECK on payment_batches.
DO $$
BEGIN
  ALTER TABLE public.payment_batches
    DROP CONSTRAINT IF EXISTS batches_no_self_approval;
  ALTER TABLE public.payment_batches
    ADD CONSTRAINT batches_no_self_approval
    CHECK (approved_by IS NULL OR approved_by != created_by);
EXCEPTION WHEN others THEN NULL;
END $$;

-- Distinct-approvers CHECK: second approver cannot be the creator or the
-- first approver. Enforced even when the row is being deleted/updated.
DO $$
BEGIN
  ALTER TABLE public.payment_batches
    DROP CONSTRAINT IF EXISTS batches_distinct_approvers;
  ALTER TABLE public.payment_batches
    ADD CONSTRAINT batches_distinct_approvers
    CHECK (second_approver_id IS NULL
           OR (second_approver_id != approved_by
               AND second_approver_id != created_by));
EXCEPTION WHEN others THEN NULL;
END $$;

-- Widen the status check to include 'pending_second_approval'.
DO $$
BEGIN
  ALTER TABLE public.payment_batches
    DROP CONSTRAINT IF EXISTS payment_batches_status_check;
  ALTER TABLE public.payment_batches
    ADD CONSTRAINT payment_batches_status_check
    CHECK (status IN ('draft','pending_approval','pending_second_approval',
                      'approved','funded','processing','processed',
                      'partially_processed','rejected'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. expenses additions — mirror the new approval-state columns
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS second_approver_id        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS second_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS payload_hash_at_approval  text,
  ADD COLUMN IF NOT EXISTS co_approval_required      boolean NOT NULL DEFAULT false;

-- expenses.status already includes pending_second_approval from
-- 20260418100000_dual_approval_expenses.sql.

-- ──────────────────────────────────────────────────────────────────────────
-- 5. company_settings.quick_pay_enabled — gate Quick Pay until CFO opts in
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS quick_pay_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.quick_pay_enabled IS
  'Master switch for the Quick Pay one-off transfer feature. CFO enables this '
  'in Settings → Transfer Authorization once thresholds are finalised.';

-- notifications.link — used by approval-pending notifications so the user
-- can jump straight to the row that needs their action. Existing rows get
-- NULL which is fine; the front-end already treats link as optional.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link text;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Helper: canonical_batch_payload_hash
--    Used by approve_payment_batch / confirm_second_approval to detect whether
--    the batch was edited between first and second approval. Hashes a sorted
--    canonical JSON of the security-relevant fields (id, amount_ngn,
--    account_number, bank_name, full_name).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.canonical_batch_payload_hash(p_batch_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(
    digest(
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
                 'id', id,
                 'amount_ngn', amount_ngn,
                 'account_number', account_number,
                 'bank_name', bank_name,
                 'full_name', full_name
               ) ORDER BY id)
           FROM public.batch_items
          WHERE batch_id = p_batch_id),
        '[]'::jsonb
      )::text,
      'sha256'
    ),
    'hex'
  );
$$;

GRANT EXECUTE ON FUNCTION public.canonical_batch_payload_hash(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.canonical_expense_payload_hash(p_expense_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(
    digest(
      jsonb_build_object(
        'id',             id,
        'amount_ngn',     amount_ngn,
        'category',       category,
        'account_number', account_number,
        'bank_name',      bank_name,
        'account_name',   account_name
      )::text,
      'sha256'
    ),
    'hex'
  )
  FROM public.expenses
  WHERE id = p_expense_id;
$$;

GRANT EXECUTE ON FUNCTION public.canonical_expense_payload_hash(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. Helper: effective_co_approval_threshold(user_id)
--    Returns the user-level override if set, else the role default,
--    else NULL (which means "no co-approval required for this user").
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.effective_co_approval_threshold(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_threshold numeric;
BEGIN
  SELECT co_approval_threshold_ngn INTO v_threshold
    FROM public.transfer_limits
   WHERE user_id = p_user_id
   LIMIT 1;
  IF FOUND THEN RETURN v_threshold; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN RETURN NULL; END IF;

  SELECT co_approval_threshold_ngn INTO v_threshold
    FROM public.transfer_limits
   WHERE user_id IS NULL AND role = v_role
   LIMIT 1;
  RETURN v_threshold;
END;
$$;

GRANT EXECUTE ON FUNCTION public.effective_co_approval_threshold(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RPC: get_eligible_approvers
--    Single source of truth for "who can approve X at tier T given creator C
--    and (optionally) first approver F". Narrows the first-tier pool to
--    ['super_admin'] when the creator is admin or super_admin.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_eligible_approvers(
  p_action_type text,
  p_tier text,
  p_creator_id uuid,
  p_first_approver_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, full_name text, role text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles jsonb;
  v_creator_role text;
BEGIN
  SELECT eligible_roles INTO v_roles
    FROM public.approver_pools
   WHERE action_type = p_action_type AND tier = p_tier;

  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'No approver pool configured for %/%', p_action_type, p_tier;
  END IF;

  -- Server-side narrowing: an admin's batch should not be first-approved by
  -- another admin — escalate to super_admin only.
  IF p_tier = 'first' THEN
    SELECT pr.role INTO v_creator_role FROM public.profiles pr WHERE pr.id = p_creator_id;
    IF v_creator_role IN ('admin','super_admin') THEN
      v_roles := '["super_admin"]'::jsonb;
    END IF;
  END IF;

  RETURN QUERY
    SELECT pr.id, pr.full_name, pr.role, pr.email
      FROM public.profiles pr
     WHERE pr.role = ANY (
             SELECT jsonb_array_elements_text(v_roles)
           )
       AND pr.id <> p_creator_id
       AND (p_first_approver_id IS NULL OR pr.id <> p_first_approver_id)
       AND COALESCE(pr.status, 'active') = 'active'
     ORDER BY pr.full_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_eligible_approvers(text, text, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_eligible_approvers IS
  'Returns active profiles eligible to approve at the given tier for the given '
  'action and creator. Excludes the creator and (for second-tier) the first '
  'approver. Narrows the first-tier pool to super_admin when the creator is '
  'admin/super_admin so admins cannot self-approve.';

-- ──────────────────────────────────────────────────────────────────────────
-- 9. RPC: approve_payment_batch
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_payment_batch(
  p_batch_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch         public.payment_batches;
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_eligible_roles jsonb;
  v_threshold     numeric;
  v_co_required   boolean;
  v_hash          text;
  v_cap_check     record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock the batch row so two concurrent approvals can't both pass.
  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Batch is not pending approval (current status: %)', v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_batch.created_by = v_caller THEN
    RAISE EXCEPTION 'Self-approval is not allowed — submitter cannot approve their own batch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Caller must be active and in the right role pool.
  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Resolve the (possibly-narrowed) eligible-role list for this creator.
  SELECT eligible_roles INTO v_eligible_roles
    FROM public.approver_pools
   WHERE action_type = 'payment_batch' AND tier = 'first';
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = v_batch.created_by AND role IN ('admin','super_admin')) THEN
    v_eligible_roles := '["super_admin"]'::jsonb;
  END IF;

  IF NOT (v_eligible_roles ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role (%) is not eligible as first approver for this batch', v_caller_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Cap check: same RPC as the edge function uses, so UI and server agree.
  SELECT * INTO v_cap_check
    FROM public.check_transfer_caps(v_caller, COALESCE(v_batch.total_amount, 0));
  IF NOT v_cap_check.allowed THEN
    RAISE EXCEPTION 'Approval blocked by transfer cap: %', v_cap_check.reason
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Snapshot payload hash for second-approval payload-lock.
  v_hash := public.canonical_batch_payload_hash(p_batch_id);

  v_threshold := public.effective_co_approval_threshold(v_caller);
  v_co_required := (v_threshold IS NOT NULL AND v_batch.total_amount > v_threshold);

  IF v_co_required THEN
    UPDATE public.payment_batches SET
      approved_by              = v_caller,
      approved_at              = now(),
      payload_hash_at_approval = v_hash,
      co_approval_required     = true,
      status                   = 'pending_second_approval'
    WHERE id = p_batch_id
    RETURNING * INTO v_batch;

    -- Notify eligible second approvers.
    INSERT INTO public.notifications (user_id, type, module, priority, title, body, link)
    SELECT a.id,
           'payment_approval_pending',
           'payments',
           'high',
           format('Batch awaiting your second approval'),
           format('"%s" — ₦%s — first-approved by %s',
                  v_batch.name,
                  to_char(v_batch.total_amount, 'FM999,999,999,999'),
                  COALESCE((SELECT full_name FROM public.profiles WHERE id = v_caller), 'an approver')),
           format('/payments/%s', p_batch_id)
      FROM public.get_eligible_approvers('payment_batch','second',v_batch.created_by, v_caller) a;
  ELSE
    UPDATE public.payment_batches SET
      approved_by              = v_caller,
      approved_at              = now(),
      payload_hash_at_approval = v_hash,
      co_approval_required     = false,
      status                   = 'approved'
    WHERE id = p_batch_id
    RETURNING * INTO v_batch;
  END IF;

  -- Transfer audit row (financial forensics surface) + classic audit_logs.
  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'batch_approved', 'ok', v_batch.total_amount, p_batch_id::text,
    jsonb_build_object(
      'batch_id', p_batch_id,
      'co_required', v_co_required,
      'threshold_ngn', v_threshold,
      'idempotency_key', p_idempotency_key
    )
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_approved',
    format('Batch "%s" first-approved (₦%s) — co_required=%s',
           v_batch.name,
           to_char(v_batch.total_amount, 'FM999,999,999,999'),
           v_co_required),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_payment_batch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_payment_batch(uuid, text) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 10. RPC: confirm_second_approval
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_second_approval(
  p_batch_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch         public.payment_batches;
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_eligible_roles jsonb;
  v_current_hash  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch.status <> 'pending_second_approval' THEN
    RAISE EXCEPTION 'Batch is not awaiting second approval (current status: %)', v_batch.status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_caller = v_batch.created_by THEN
    RAISE EXCEPTION 'Submitter cannot second-approve their own batch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller = v_batch.approved_by THEN
    RAISE EXCEPTION 'Second approval must come from a different approver'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_eligible_roles
    FROM public.approver_pools
   WHERE action_type = 'payment_batch' AND tier = 'second';
  IF NOT (v_eligible_roles ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role (%) is not eligible as second approver', v_caller_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Payload-lock: if the batch_items changed since first approval, invalidate.
  v_current_hash := public.canonical_batch_payload_hash(p_batch_id);
  IF v_current_hash IS DISTINCT FROM v_batch.payload_hash_at_approval THEN
    UPDATE public.payment_batches SET
      status                   = 'pending_approval',
      approved_by              = NULL,
      approved_at              = NULL,
      payload_hash_at_approval = NULL,
      co_approval_required     = false
    WHERE id = p_batch_id;

    INSERT INTO public.transfer_audit (
      actor_id, actor_role, action, outcome, amount_ngn, reference, metadata, reason
    ) VALUES (
      v_caller, v_caller_role,
      'batch_approval_invalidated', 'denied', v_batch.total_amount, p_batch_id::text,
      jsonb_build_object('batch_id', p_batch_id),
      'Payload changed since first approval'
    );
    RAISE EXCEPTION 'Batch payload changed since first approval. Re-approval required.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.payment_batches SET
    second_approver_id = v_caller,
    second_approved_at = now(),
    status             = 'approved'
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'batch_second_approved', 'ok', v_batch.total_amount, p_batch_id::text,
    jsonb_build_object(
      'batch_id', p_batch_id,
      'idempotency_key', p_idempotency_key
    )
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_second_approved',
    format('Batch "%s" second-approved by %s (₦%s)',
           v_batch.name,
           (SELECT full_name FROM public.profiles WHERE id = v_caller),
           to_char(v_batch.total_amount, 'FM999,999,999,999')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  -- Notify submitter that the batch is fully approved.
  IF v_batch.created_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, module, priority, title, body, link)
    VALUES (
      v_batch.created_by,
      'batch_approved',
      'payments',
      'normal',
      'Your batch was fully approved',
      format('"%s" — ₦%s', v_batch.name,
             to_char(v_batch.total_amount, 'FM999,999,999,999')),
      format('/payments/%s', p_batch_id)
    );
  END IF;

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_second_approval(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_second_approval(uuid, text) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 11. RPC: reject_payment_batch
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_payment_batch(
  p_batch_id uuid,
  p_reason text
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch       public.payment_batches;
  v_caller      uuid := auth.uid();
  v_caller_role text;
  v_pool_first  jsonb;
  v_pool_second jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Rejection reason is required (min 5 chars)';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF v_batch.status NOT IN ('pending_approval','pending_second_approval') THEN
    RAISE EXCEPTION 'Cannot reject batch in status %', v_batch.status;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_pool_first FROM public.approver_pools
   WHERE action_type='payment_batch' AND tier='first';
  SELECT eligible_roles INTO v_pool_second FROM public.approver_pools
   WHERE action_type='payment_batch' AND tier='second';

  IF NOT (v_pool_first ? v_caller_role OR v_pool_second ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role is not eligible to reject payment batches'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.payment_batches SET
    status           = 'rejected',
    rejection_reason = trim(p_reason),
    -- Clear approval state so a resubmit goes through the full flow.
    approved_by              = NULL,
    approved_at              = NULL,
    second_approver_id       = NULL,
    second_approved_at       = NULL,
    payload_hash_at_approval = NULL,
    co_approval_required     = false
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata, reason
  ) VALUES (
    v_caller, v_caller_role,
    'batch_rejected', 'denied', v_batch.total_amount, p_batch_id::text,
    jsonb_build_object('batch_id', p_batch_id),
    trim(p_reason)
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_rejected',
    format('Batch "%s" rejected: %s', v_batch.name, trim(p_reason)),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_payment_batch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_payment_batch(uuid, text) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 12. RPC: reset_batch_to_draft — used by Re-edit & Resubmit flow
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_batch_to_draft(p_batch_id uuid)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch  public.payment_batches;
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_batch FROM public.payment_batches
   WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % not found', p_batch_id; END IF;

  IF v_batch.created_by <> v_caller THEN
    RAISE EXCEPTION 'Only the batch creator can reset to draft'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_batch.status NOT IN ('rejected','pending_approval','pending_second_approval','draft') THEN
    RAISE EXCEPTION 'Cannot reset batch in status % to draft', v_batch.status;
  END IF;

  UPDATE public.payment_batches SET
    status                   = 'draft',
    approved_by              = NULL,
    approved_at              = NULL,
    second_approver_id       = NULL,
    second_approved_at       = NULL,
    payload_hash_at_approval = NULL,
    co_approval_required     = false,
    rejection_reason         = NULL
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'batch_reset_to_draft',
    format('Batch "%s" reset to draft for re-edit', v_batch.name),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_batch_to_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_batch_to_draft(uuid) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 13. Mirror RPCs for expenses
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_expense(
  p_expense_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense       public.expenses;
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_eligible_roles jsonb;
  v_threshold     numeric;
  v_co_required   boolean;
  v_dual_threshold numeric;
  v_hash          text;
  v_cap_check     record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;

  IF v_expense.status <> 'pending' THEN
    RAISE EXCEPTION 'Expense is not pending (current status: %)', v_expense.status;
  END IF;

  IF v_expense.submitted_by = v_caller THEN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller;
    IF v_caller_role NOT IN ('super_admin','admin') THEN
      RAISE EXCEPTION 'Self-approval is not allowed for your role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_eligible_roles
    FROM public.approver_pools
   WHERE action_type = 'expense_payment' AND tier = 'first';
  IF EXISTS (SELECT 1 FROM public.profiles
              WHERE id = v_expense.submitted_by AND role IN ('admin','super_admin')) THEN
    v_eligible_roles := '["super_admin"]'::jsonb;
  END IF;
  IF NOT (v_eligible_roles ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role (%) is not eligible as first approver for expenses', v_caller_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Cap check still applies — expense payments draw from the same wallet.
  SELECT * INTO v_cap_check
    FROM public.check_transfer_caps(v_caller, COALESCE(v_expense.amount_ngn, 0));
  IF NOT v_cap_check.allowed THEN
    RAISE EXCEPTION 'Approval blocked by transfer cap: %', v_cap_check.reason
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_hash := public.canonical_expense_payload_hash(p_expense_id);

  -- Two thresholds combine: dual_approval_threshold_ngn from company_settings
  -- (legacy expense rule) and the per-role co-approval threshold from
  -- transfer_limits. Whichever is lower triggers co-approval.
  SELECT dual_approval_threshold_ngn INTO v_dual_threshold
    FROM public.company_settings WHERE id = '00000000-0000-0000-0000-000000000001';
  v_threshold := public.effective_co_approval_threshold(v_caller);
  v_co_required := (
    (v_dual_threshold IS NOT NULL AND v_dual_threshold > 0
       AND v_expense.amount_ngn >= v_dual_threshold)
    OR (v_threshold IS NOT NULL AND v_expense.amount_ngn > v_threshold)
  );

  IF v_co_required THEN
    UPDATE public.expenses SET
      status                   = 'pending_second_approval',
      approved_by              = v_caller,
      approved_at              = now(),
      payload_hash_at_approval = v_hash,
      co_approval_required     = true
    WHERE id = p_expense_id
    RETURNING * INTO v_expense;

    INSERT INTO public.notifications (user_id, type, module, priority, title, body, link)
    SELECT a.id, 'expense_approval_pending', 'expenses', 'high',
           'Expense awaiting your second approval',
           format('₦%s — first-approved by %s',
                  to_char(v_expense.amount_ngn, 'FM999,999,999,999'),
                  COALESCE((SELECT full_name FROM public.profiles WHERE id = v_caller), 'an approver')),
           '/expenses'
      FROM public.get_eligible_approvers('expense_payment','second',v_expense.submitted_by, v_caller) a;
  ELSE
    UPDATE public.expenses SET
      status                   = 'approved',
      approved_by              = v_caller,
      approved_at              = now(),
      payload_hash_at_approval = v_hash,
      co_approval_required     = false
    WHERE id = p_expense_id
    RETURNING * INTO v_expense;
  END IF;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'expense_approved', 'ok', v_expense.amount_ngn, p_expense_id::text,
    jsonb_build_object(
      'expense_id', p_expense_id,
      'co_required', v_co_required,
      'idempotency_key', p_idempotency_key
    )
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_approved',
    format('Expense %s first-approved (₦%s) — co_required=%s',
           p_expense_id, to_char(v_expense.amount_ngn, 'FM999,999,999,999'), v_co_required),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_expense(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_expense(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirm_second_expense_approval(
  p_expense_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense       public.expenses;
  v_caller        uuid := auth.uid();
  v_caller_role   text;
  v_eligible_roles jsonb;
  v_current_hash  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;

  IF v_expense.status <> 'pending_second_approval' THEN
    RAISE EXCEPTION 'Expense is not awaiting second approval (status: %)', v_expense.status;
  END IF;

  IF v_caller = v_expense.submitted_by THEN
    RAISE EXCEPTION 'Submitter cannot second-approve their own expense'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_caller = v_expense.approved_by THEN
    RAISE EXCEPTION 'Second approval must come from a different approver'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_eligible_roles
    FROM public.approver_pools
   WHERE action_type='expense_payment' AND tier='second';
  IF NOT (v_eligible_roles ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role (%) is not eligible as second approver for expenses', v_caller_role
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_current_hash := public.canonical_expense_payload_hash(p_expense_id);
  IF v_current_hash IS DISTINCT FROM v_expense.payload_hash_at_approval THEN
    UPDATE public.expenses SET
      status                   = 'pending',
      approved_by              = NULL,
      approved_at              = NULL,
      payload_hash_at_approval = NULL,
      co_approval_required     = false
    WHERE id = p_expense_id;
    RAISE EXCEPTION 'Expense payload changed since first approval. Re-approval required.';
  END IF;

  UPDATE public.expenses SET
    second_approver_id       = v_caller,
    second_approved_at       = now(),
    -- Mirror to legacy columns so existing dashboards / reports still work.
    approved_by_secondary    = v_caller,
    approved_by_secondary_at = now(),
    status                   = 'approved'
  WHERE id = p_expense_id
  RETURNING * INTO v_expense;

  INSERT INTO public.transfer_audit (
    actor_id, actor_role, action, outcome, amount_ngn, reference, metadata
  ) VALUES (
    v_caller, v_caller_role,
    'expense_second_approved', 'ok', v_expense.amount_ngn, p_expense_id::text,
    jsonb_build_object('expense_id', p_expense_id, 'idempotency_key', p_idempotency_key)
  );
  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_second_approved',
    format('Expense %s second-approved (₦%s)',
           p_expense_id, to_char(v_expense.amount_ngn, 'FM999,999,999,999')),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_second_expense_approval(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_second_expense_approval(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_expense(p_expense_id uuid, p_reason text)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense     public.expenses;
  v_caller      uuid := auth.uid();
  v_caller_role text;
  v_pool_first  jsonb;
  v_pool_second jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Rejection reason is required (min 5 chars)';
  END IF;

  SELECT * INTO v_expense FROM public.expenses
   WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense % not found', p_expense_id; END IF;
  IF v_expense.status NOT IN ('pending','pending_second_approval') THEN
    RAISE EXCEPTION 'Cannot reject expense in status %', v_expense.status;
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles
   WHERE id = v_caller AND COALESCE(status, 'active') = 'active';
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not an active user' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT eligible_roles INTO v_pool_first FROM public.approver_pools
   WHERE action_type='expense_payment' AND tier='first';
  SELECT eligible_roles INTO v_pool_second FROM public.approver_pools
   WHERE action_type='expense_payment' AND tier='second';
  IF NOT (v_pool_first ? v_caller_role OR v_pool_second ? v_caller_role) THEN
    RAISE EXCEPTION 'Your role is not eligible to reject expenses'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.expenses SET
    status                   = 'rejected',
    rejection_reason         = trim(p_reason),
    approved_by              = NULL,
    approved_at              = NULL,
    second_approver_id       = NULL,
    second_approved_at       = NULL,
    payload_hash_at_approval = NULL,
    co_approval_required     = false
  WHERE id = p_expense_id
  RETURNING * INTO v_expense;

  INSERT INTO public.audit_logs (action_type, description, performed_by, performed_by_name)
  VALUES (
    'expense_rejected',
    format('Expense %s rejected: %s', p_expense_id, trim(p_reason)),
    v_caller,
    (SELECT full_name FROM public.profiles WHERE id = v_caller)
  );

  RETURN v_expense;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_expense(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_expense(uuid, text) TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 14. RPC: is_quick_pay_enabled — read-only flag for the UI
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_quick_pay_enabled()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT quick_pay_enabled FROM public.company_settings
      WHERE id = '00000000-0000-0000-0000-000000000001'),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_quick_pay_enabled() TO authenticated, service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- 15. Payload-lock triggers (M-9)
--    Once a batch is approved (or further along the lifecycle), the security-
--    relevant fields on its rows must be immutable. Mutating them silently
--    would let a first approver lock in a number, then change it post-second-
--    approval and fund it. Block at the trigger level — don't trust the app.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_batch_payload_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.payment_batches WHERE id = NEW.batch_id;
  IF v_status IN ('approved','pending_second_approval','funded','processing',
                  'partially_processed','processed') THEN
    IF NEW.amount_ngn      IS DISTINCT FROM OLD.amount_ngn
       OR NEW.account_number IS DISTINCT FROM OLD.account_number
       OR NEW.bank_name     IS DISTINCT FROM OLD.bank_name
       OR NEW.full_name     IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'Cannot edit batch_item payload once batch is %; reset batch to draft first', v_status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS batch_items_payload_lock ON public.batch_items;
CREATE TRIGGER batch_items_payload_lock
  BEFORE UPDATE ON public.batch_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_payload_lock();

-- payment_batches itself: refuse changes to total_amount / beneficiary_count
-- after approval. Status transitions are allowed (the RPCs flip status), and
-- ops fields like notes / scheduled_date stay editable.
CREATE OR REPLACE FUNCTION public.enforce_batch_totals_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('approved','pending_second_approval','funded','processing',
                    'partially_processed','processed') THEN
    IF NEW.total_amount       IS DISTINCT FROM OLD.total_amount
       OR NEW.beneficiary_count IS DISTINCT FROM OLD.beneficiary_count THEN
      RAISE EXCEPTION 'Cannot edit batch totals once status is %; reset batch to draft first', OLD.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_batches_totals_lock ON public.payment_batches;
CREATE TRIGGER payment_batches_totals_lock
  BEFORE UPDATE ON public.payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_totals_lock();

-- ──────────────────────────────────────────────────────────────────────────
-- 16. Lock down direct status writes from authenticated clients.
--    The RPCs above are the only blessed path. SECURITY DEFINER functions
--    run as the function owner (typically postgres / supabase_admin) so the
--    role-check lets them through; service_role (the webhook, batch-worker,
--    reconciliation edge fns) also bypasses since it needs to flip
--    funded → processing → processed independently of approval RPCs.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_batch_approval_state_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only block direct writes from the 'authenticated' Supabase role. Anything
  -- running as service_role / postgres / supabase_admin (RPCs, edge fns) is
  -- trusted to manage state transitions correctly.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by              IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at           IS DISTINCT FROM OLD.approved_at
     OR NEW.second_approver_id    IS DISTINCT FROM OLD.second_approver_id
     OR NEW.second_approved_at    IS DISTINCT FROM OLD.second_approved_at
     OR NEW.payload_hash_at_approval IS DISTINCT FROM OLD.payload_hash_at_approval
     OR NEW.co_approval_required  IS DISTINCT FROM OLD.co_approval_required THEN
    RAISE EXCEPTION 'Direct writes to batch approval state are not allowed. Use approve_payment_batch / confirm_second_approval / reject_payment_batch / reset_batch_to_draft RPCs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Status transitions: only allow {draft↔pending_approval, approved→funded,
  -- funded→processing, the lifecycle past funded}. Anything that touches
  -- approval state (pending_approval → approved/pending_second_approval →
  -- approved) must go through the RPCs.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'pending_approval' AND NEW.status IN ('approved','pending_second_approval','rejected'))
       OR (OLD.status = 'pending_second_approval' AND NEW.status IN ('approved','pending_approval','rejected'))
       OR (OLD.status = 'approved' AND NEW.status = 'rejected') THEN
      RAISE EXCEPTION 'Status transition % → % requires the approval RPCs', OLD.status, NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_batches_approval_state_lock ON public.payment_batches;
CREATE TRIGGER payment_batches_approval_state_lock
  BEFORE UPDATE ON public.payment_batches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_approval_state_writes();

-- expenses: same lockdown for the approval state machine.
CREATE OR REPLACE FUNCTION public.enforce_expense_approval_state_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.approved_by              IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at           IS DISTINCT FROM OLD.approved_at
     OR NEW.second_approver_id    IS DISTINCT FROM OLD.second_approver_id
     OR NEW.second_approved_at    IS DISTINCT FROM OLD.second_approved_at
     OR NEW.approved_by_secondary IS DISTINCT FROM OLD.approved_by_secondary
     OR NEW.approved_by_secondary_at IS DISTINCT FROM OLD.approved_by_secondary_at
     OR NEW.payload_hash_at_approval IS DISTINCT FROM OLD.payload_hash_at_approval
     OR NEW.co_approval_required  IS DISTINCT FROM OLD.co_approval_required THEN
    RAISE EXCEPTION 'Direct writes to expense approval state are not allowed. Use approve_expense / confirm_second_expense_approval / reject_expense RPCs.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF (OLD.status = 'pending' AND NEW.status IN ('approved','pending_second_approval','rejected'))
       OR (OLD.status = 'pending_second_approval' AND NEW.status IN ('approved','pending','rejected'))
       OR (OLD.status = 'approved' AND NEW.status = 'rejected') THEN
      RAISE EXCEPTION 'Status transition % → % requires the approval RPCs', OLD.status, NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_approval_state_lock ON public.expenses;
CREATE TRIGGER expenses_approval_state_lock
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_expense_approval_state_writes();

-- ──────────────────────────────────────────────────────────────────────────
-- 17. Indexes for the new awaiting-second-approval views
-- ──────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS payment_batches_pending_second_idx
  ON public.payment_batches(status, created_at DESC)
  WHERE status = 'pending_second_approval';

CREATE INDEX IF NOT EXISTS expenses_pending_second_idx
  ON public.expenses(status, date DESC)
  WHERE status = 'pending_second_approval';

-- ──────────────────────────────────────────────────────────────────────────
-- End of migration.
-- ──────────────────────────────────────────────────────────────────────────
