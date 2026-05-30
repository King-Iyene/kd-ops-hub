-- =============================================================================
-- Scope the Operations role to contractor batch payments only.
--
-- Operations prepares contractor disbursements. They should NOT see — and NOT
-- be able to touch — employee salary runs, salary advances, bonuses / prizes,
-- or Quick Pay one-offs (those are finance / admin work). The previous
-- policies allowed Operations to SELECT/INSERT/UPDATE any payment_batches row
-- as long as the role check passed.
--
-- This migration tightens SELECT / INSERT / UPDATE on payment_batches AND the
-- INSERT / UPDATE paths on batch_items so Operations is hard-capped at
--   batch_type = 'contractor' AND COALESCE(is_quick_pay, false) = false.
--
-- super_admin / admin / finance are unaffected.
-- batch_items_select already cascades via an EXISTS on the parent batch, so
-- transactions / contractor-profile / receipts views will automatically hide
-- non-contractor lines once the parent batch is invisible.
--
-- Idempotent: every CREATE is paired with a DROP IF EXISTS.
-- =============================================================================

-- ── payment_batches.SELECT ──────────────────────────────────────────────────
-- Keep all the existing rules (role + archived-batch visibility from
-- 20260926000000) and add the Operations contractor-only scope.
DROP POLICY IF EXISTS "batches_select" ON public.payment_batches;
CREATE POLICY "batches_select" ON public.payment_batches
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
    AND (
      deleted_at IS NULL
      OR public.current_user_role() IN ('super_admin', 'admin')
    )
    AND (
      public.current_user_role() <> 'operations'
      OR (
        batch_type = 'contractor'
        AND COALESCE(is_quick_pay, false) = false
      )
    )
  );

-- ── payment_batches.INSERT ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "batches_insert" ON public.payment_batches;
CREATE POLICY "batches_insert" ON public.payment_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
    AND (
      public.current_user_role() <> 'operations'
      OR (
        batch_type = 'contractor'
        AND COALESCE(is_quick_pay, false) = false
      )
    )
  );

-- ── payment_batches.UPDATE ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "batches_update" ON public.payment_batches;
CREATE POLICY "batches_update" ON public.payment_batches
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
    AND (
      public.current_user_role() <> 'operations'
      OR (
        batch_type = 'contractor'
        AND COALESCE(is_quick_pay, false) = false
      )
    )
  );

-- ── batch_items.INSERT ──────────────────────────────────────────────────────
-- Operations may only insert items into batches that are themselves in scope
-- for Operations (i.e. contractor, non-quick-pay). Without this, Operations
-- could in theory still add line items to an admin-owned salary batch by
-- knowing the batch_id. Other roles are unchanged.
DROP POLICY IF EXISTS "batch_items_insert" ON public.batch_items;
CREATE POLICY "batch_items_insert" ON public.batch_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
    AND (
      public.current_user_role() <> 'operations'
      OR EXISTS (
        SELECT 1 FROM public.payment_batches b
        WHERE b.id = batch_items.batch_id
          AND b.batch_type = 'contractor'
          AND COALESCE(b.is_quick_pay, false) = false
      )
    )
  );

-- ── batch_items.UPDATE ─────────────────────────────────────────────────────
-- Keep the existing rule from 20260924000000 (Operations may only edit items
-- on DRAFT batches), and add the contractor / non-quick-pay constraint.
DROP POLICY IF EXISTS "batch_items_update" ON public.batch_items;
CREATE POLICY "batch_items_update" ON public.batch_items
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
    OR (
      public.current_user_role() = 'operations'
      AND EXISTS (
        SELECT 1 FROM public.payment_batches b
        WHERE b.id = batch_items.batch_id
          AND b.status = 'draft'
          AND b.batch_type = 'contractor'
          AND COALESCE(b.is_quick_pay, false) = false
      )
    )
  );

-- batch_items.SELECT already cascades from payment_batches via an EXISTS check
-- (set up in 20260926000000), so we do NOT need to change it — items belonging
-- to a batch Operations cannot see are automatically hidden in transactions,
-- contractor profiles, receipts, etc.
