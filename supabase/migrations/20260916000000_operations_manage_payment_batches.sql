-- =============================================================================
-- Let the Operations role prepare and manage payment batches.
--
-- Operations could already SELECT payment_batches / batch_items (added in
-- 20260608000000) so they could SEE payment data, but INSERT/UPDATE stayed
-- admin/finance-only — so giving Operations the UI routes alone would let them
-- open the batch builder and then fail on save. This grants Operations the
-- create/edit capability to match.
--
-- The money path stays guarded downstream and is deliberately NOT widened here:
--   • DELETE remains super_admin/admin only.
--   • Batch approval (approve_payment_batch / Approvals) stays APPROVER_ROLES,
--     so an Operations-prepared batch still needs a separate approver.
--   • Dispatch (paystack-transfer / batch-worker) and per-role transfer caps
--     (check_transfer_caps) are unchanged; caps fail closed, so no role can
--     move funds without an explicitly configured limit.
--
-- Idempotent — every CREATE is paired with a DROP IF EXISTS.
-- =============================================================================

-- ── payment_batches ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "batches_insert" ON public.payment_batches;
CREATE POLICY "batches_insert" ON public.payment_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "batches_update" ON public.payment_batches;
CREATE POLICY "batches_update" ON public.payment_batches
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

-- ── batch_items ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "batch_items_insert" ON public.batch_items;
CREATE POLICY "batch_items_insert" ON public.batch_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

DROP POLICY IF EXISTS "batch_items_update" ON public.batch_items;
CREATE POLICY "batch_items_update" ON public.batch_items
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );
