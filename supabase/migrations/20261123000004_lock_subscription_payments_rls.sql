-- HIGH finding from forensic review: subscription_payments shipped with
-- full open CRUD (USING(true) / WITH CHECK(true) on SELECT, INSERT, and
-- UPDATE) — a direct regression against 20261114000000_close_using_true_policies,
-- a migration written specifically to close this exact pattern on financial
-- tables 8 days earlier. Any authenticated user (driver, contractor, field
-- staff) could mark ledger rows paid, edit amount_ngn/amount_usd, or insert
-- fabricated payment rows with no author tracking. The Subscriptions page
-- (src/pages/Subscriptions.tsx) is already gated to APPROVER_ROLES
-- (super_admin/admin/finance) at the route level — this brings the table's
-- RLS in line with that, mirroring placement_payments' identical ledger
-- pattern (20261118000000_placements.sql).
DROP POLICY IF EXISTS "Authenticated users can read subscription payments" ON public.subscription_payments;
CREATE POLICY "Authenticated users can read subscription payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "Authenticated users can insert subscription payments" ON public.subscription_payments;
CREATE POLICY "Authenticated users can insert subscription payments"
  ON public.subscription_payments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));

DROP POLICY IF EXISTS "Authenticated users can update subscription payments" ON public.subscription_payments;
CREATE POLICY "Authenticated users can update subscription payments"
  ON public.subscription_payments FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance'))
  WITH CHECK (public.current_user_role() IN ('super_admin', 'admin', 'finance'));
