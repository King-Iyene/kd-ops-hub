-- Fixes a real RLS bug found while live-testing the new
-- recurring_schedules_director_restrict_* policies (20261105000200):
--
-- Every "director-only" RESTRICTIVE policy added so far (on batch_items in
-- 20260811184147_director_disbursements_v2.sql, and on recurring_schedules
-- in 20261105000200) classifies a row via:
--
--   NOT EXISTS (SELECT 1 FROM payment_batches b WHERE b.id = ... AND
--               b.payment_category IN (director categories))
--   OR current_user_role() = 'super_admin'
--
-- That subquery against payment_batches is itself subject to
-- payment_batches' OWN RESTRICTIVE SELECT policy, which hides director-
-- category rows from non-super-admins. So for an admin/finance user, the
-- subquery can never see the very row it needs to classify — EXISTS is
-- always false, NOT EXISTS is always true, and the policy always evaluates
-- to "allow", regardless of category. The check is self-blinding: it can
-- never actually detect the thing it exists to detect.
--
-- Confirmed live (BEGIN/ROLLBACK, role-switched to a real admin profile):
--   - recurring_schedules: admin could SELECT a schedule pointing at a
--     director_salary batch (n=1) — an ACTIVE leak.
--   - batch_items: admin currently cannot SELECT/UPDATE a director_salary
--     batch_item, but ONLY because the unrelated batch_items_select
--     PERMISSIVE policy independently requires the same (also-blinded)
--     parent-batch visibility, and Postgres additionally requires SELECT-
--     policy visibility to locate a row for UPDATE/DELETE. That's a
--     coincidence of two unrelated policies pointing the same way, not
--     protection from the RESTRICTIVE policy that's supposed to provide
--     it — if batch_items_select is ever refactored, this silently stops
--     protecting anything.
--
-- Fix: classify via a SECURITY DEFINER function, which (like
-- current_user_role() itself) runs with the function owner's privileges
-- and so is not subject to the caller's RLS on payment_batches — it can
-- always see the row it needs to classify, regardless of who's asking.

CREATE OR REPLACE FUNCTION public.is_director_disbursement_batch(p_batch_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payment_batches b
    WHERE b.id = p_batch_id
      AND b.payment_category IN ('director_salary', 'director_drawings', 'director_loan_repayment')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_director_disbursement_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_director_disbursement_batch(uuid) TO authenticated;

-- ── batch_items — replace the 4 self-blinding RESTRICTIVE policies ──────
DROP POLICY IF EXISTS "batch_items_director_disbursement_restrict_select" ON public.batch_items;
DROP POLICY IF EXISTS "batch_items_director_disbursement_restrict_insert" ON public.batch_items;
DROP POLICY IF EXISTS "batch_items_director_disbursement_restrict_update" ON public.batch_items;
DROP POLICY IF EXISTS "batch_items_director_disbursement_restrict_delete" ON public.batch_items;

CREATE POLICY "batch_items_director_disbursement_restrict_select" ON public.batch_items
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.is_director_disbursement_batch(batch_items.batch_id) OR public.current_user_role() = 'super_admin');

CREATE POLICY "batch_items_director_disbursement_restrict_insert" ON public.batch_items
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_director_disbursement_batch(batch_items.batch_id) OR public.current_user_role() = 'super_admin');

CREATE POLICY "batch_items_director_disbursement_restrict_update" ON public.batch_items
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_director_disbursement_batch(batch_items.batch_id) OR public.current_user_role() = 'super_admin');

CREATE POLICY "batch_items_director_disbursement_restrict_delete" ON public.batch_items
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_director_disbursement_batch(batch_items.batch_id) OR public.current_user_role() = 'super_admin');

-- ── recurring_schedules — replace the 4 leaking RESTRICTIVE policies ────
DROP POLICY IF EXISTS "recurring_schedules_director_restrict_select" ON public.recurring_schedules;
DROP POLICY IF EXISTS "recurring_schedules_director_restrict_insert" ON public.recurring_schedules;
DROP POLICY IF EXISTS "recurring_schedules_director_restrict_update" ON public.recurring_schedules;
DROP POLICY IF EXISTS "recurring_schedules_director_restrict_delete" ON public.recurring_schedules;

CREATE POLICY "recurring_schedules_director_restrict_select" ON public.recurring_schedules
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (NOT public.is_director_disbursement_batch(recurring_schedules.source_batch_id) OR public.current_user_role() = 'super_admin');

CREATE POLICY "recurring_schedules_director_restrict_insert" ON public.recurring_schedules
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.is_director_disbursement_batch(recurring_schedules.source_batch_id) OR public.current_user_role() = 'super_admin');

CREATE POLICY "recurring_schedules_director_restrict_update" ON public.recurring_schedules
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.is_director_disbursement_batch(recurring_schedules.source_batch_id) OR public.current_user_role() = 'super_admin');

CREATE POLICY "recurring_schedules_director_restrict_delete" ON public.recurring_schedules
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT public.is_director_disbursement_batch(recurring_schedules.source_batch_id) OR public.current_user_role() = 'super_admin');
