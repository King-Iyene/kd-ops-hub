-- =============================================================================
-- pending_batches_list(): the DEFINITIVE live pending set
--
-- Root-cause fix for the "KPI header says 36 batches, All tab says 39" mismatch.
--
-- Until now the Payments dashboard KPI was computed by pending_payouts_summary()
-- (an aggregate that correctly excludes fully-cancelled failed batches via
-- WHERE effective_amount > 0), but the row list under the sub-tabs was
-- populated by a SEPARATE client-side .select() with a different filter. That
-- gave the operator two different truths on the same card. The 4 failed
-- batches that kept re-appearing in Stuck came from the row-list query — the
-- KPI had already excluded them, but the list didn't know.
--
-- This RPC returns the SAME set of batches that pending_payouts_summary
-- aggregates over — namely: any non-archived batch in pending_approval,
-- pending_second_approval, approved, funded, processing, partially_processed,
-- or failed, WHOSE OUTSTANDING amount is > 0. Failed / partially_processed
-- batches whose items are all cancelled/succeeded drop out automatically.
--
-- The client now uses THIS for both the row list AND the sub-tab counts. The
-- KPI stat card continues to consume pending_payouts_summary(), and they
-- agree by construction because both derive from the same CTE.
--
-- Security: SECURITY INVOKER. RLS on payment_batches / batch_items still
-- gates who can see what.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pending_batches_list()
RETURNS TABLE (
  id                 uuid,
  name               text,
  status             text,
  effective_amount   numeric,
  beneficiary_count  integer,
  payment_date       date,
  created_at         timestamptz,
  approved_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH pending_batches AS (
    SELECT b.id, b.name, b.status, b.total_amount,
           b.beneficiary_count, b.payment_date, b.created_at, b.approved_at
      FROM public.payment_batches b
     WHERE b.deleted_at IS NULL
       AND b.status IN (
         'pending_approval', 'pending_second_approval',
         'approved',
         'funded', 'processing', 'partially_processed',
         'failed'
       )
  ),
  outstanding AS (
    SELECT pb.*,
           CASE
             WHEN pb.status IN ('partially_processed','failed') THEN
               COALESCE((
                 SELECT SUM(bi.amount_ngn)
                   FROM public.batch_items bi
                  WHERE bi.batch_id = pb.id
                    AND bi.status <> 'succeeded'
                    AND COALESCE(bi.is_manually_resolved, false) = false
               ), 0)
             ELSE COALESCE(pb.total_amount, 0)
           END::numeric AS effective_amount
      FROM pending_batches pb
  )
  SELECT id, name, status, effective_amount,
         beneficiary_count, payment_date, created_at, approved_at
    FROM outstanding
   WHERE effective_amount > 0
   ORDER BY payment_date ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.pending_batches_list() TO authenticated;

COMMENT ON FUNCTION public.pending_batches_list() IS
  'Definitive live pending set — same CTE as pending_payouts_summary. Row '
  'list + sub-tab counts + KPI all consume this so the header count and the '
  'list can never disagree again. Returns effective_amount (batch total for '
  'pre-dispatch statuses, outstanding items for partial/failed) instead of '
  'raw total_amount so downstream displays already reflect the correct money-'
  'to-move figure.';
