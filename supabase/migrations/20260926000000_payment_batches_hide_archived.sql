-- =============================================================================
-- Hide archived (soft-deleted) batches and their items from non-admin roles.
--
-- Today's batches_select / batch_items_select policies allow every payment
-- role (super_admin / admin / finance / operations) to SELECT, ignoring the
-- deleted_at flag. A user with a stale URL to an archived batch could still
-- load it server-side, even though the active list excluded it. This closes
-- the gap by adding a deleted_at predicate to the policies.
--
-- Visibility rules after this migration:
--   • super_admin / admin — see ALL batches including archived (needed for
--     forensics + restoration before the 90-day purge runs).
--   • finance / operations — see only batches where deleted_at IS NULL.
--   • Same rule cascades to batch_items via the parent batch.
--
-- Pure SELECT tightening — no INSERT/UPDATE/DELETE policy is touched, so no
-- existing flow (approval, dispatch, reconciliation) is affected. Idempotent.
-- =============================================================================

DROP POLICY IF EXISTS "batches_select" ON public.payment_batches;
CREATE POLICY "batches_select" ON public.payment_batches
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
    AND (
      deleted_at IS NULL
      OR public.current_user_role() IN ('super_admin', 'admin')
    )
  );

-- batch_items don't carry their own deleted_at; they inherit from the parent
-- batch. Drop and recreate the SELECT policy with an EXISTS check on the
-- parent so items belonging to archived batches stop appearing in queries
-- (contractor profile, transactions, reports, etc.) for non-admin roles.
DROP POLICY IF EXISTS "batch_items_select" ON public.batch_items;
CREATE POLICY "batch_items_select" ON public.batch_items
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations')
    AND EXISTS (
      SELECT 1 FROM public.payment_batches b
      WHERE b.id = batch_items.batch_id
        AND (
          b.deleted_at IS NULL
          OR public.current_user_role() IN ('super_admin', 'admin')
        )
    )
  );
