-- Fix overly-restrictive RLS policies that lock out finance and operations roles
-- from data they legitimately need to do their jobs.
--
-- Root cause: original payment_batches and batch_items policies were written
-- with role = 'admin' only. Later phases added finance/operations roles but
-- never updated these foundational policies, causing:
--   • Finance users → "Total Disbursed" and "Partners Paid" showing 0 on dashboard
--   • Finance users → Transactions page / Reports returning no batch data
--   • Operations users → Budget utilisation only counting their own expenses
--   • Operations users → Reports unable to show payment data

-- ── payment_batches ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage batches" ON public.payment_batches;

-- Finance and operations can SELECT (read); only admin/finance can mutate.
CREATE POLICY "batches_select" ON public.payment_batches
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

CREATE POLICY "batches_insert" ON public.payment_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY "batches_update" ON public.payment_batches
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY "batches_delete" ON public.payment_batches
  FOR DELETE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin')
  );

-- ── batch_items ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage batch items" ON public.batch_items;

CREATE POLICY "batch_items_select" ON public.batch_items
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );

CREATE POLICY "batch_items_insert" ON public.batch_items
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY "batch_items_update" ON public.batch_items
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance')
  );

CREATE POLICY "batch_items_delete" ON public.batch_items
  FOR DELETE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin')
  );

-- ── expenses ──────────────────────────────────────────────────────────────────
-- Operations managers need visibility over all expenses for team oversight
-- and correct budget-utilisation reporting on the dashboard.
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;

CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
  );
