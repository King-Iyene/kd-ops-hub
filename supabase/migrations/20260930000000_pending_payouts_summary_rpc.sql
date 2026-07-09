-- =============================================================================
-- pending_payouts_summary()
--
-- Fixes the "Pending" KPI on the Payments dashboard, which was silently
-- truncating its total at the first 50 batches (the row-list LIMIT was being
-- reused for the aggregate). When more than 50 batches sit in pending states
-- the headline number understates the real liability, and — worse — it shifts
-- as batches move through the pipeline because the top-50 window changes
-- underneath. Finance was making funding decisions off a moving lower bound.
--
-- This RPC computes the totals against EVERY qualifying batch, no cap:
--
--   * total_amount           — money still to move across every batch that is
--                              past 'draft' and not yet fully closed.
--   * batch_count            — true count of those batches.
--   * month_pending_amount   — subset dated in the current calendar month.
--
-- Statuses included (money not yet fully out):
--   pending_approval, pending_second_approval, approved, funded,
--   processing, partially_processed, failed
--
-- Excluded (either done, cancelled by the operator, or not yet submitted):
--   draft, processed, completed, rejected, cancelled, archived (deleted_at)
--
-- Accuracy adjustment: for partially_processed / failed batches the RPC does
-- NOT re-add the original batch total (that would double-count the succeeded
-- half). It sums the OUTSTANDING batch_items — everything that is not
-- status='succeeded' and not is_manually_resolved=true.
--
-- Security: SECURITY INVOKER (respects the caller's RLS). Anyone who cannot
-- SELECT payment_batches / batch_items will get zeroes, exactly as they would
-- from the client-side query it replaces. No new data is exposed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pending_payouts_summary()
RETURNS TABLE (
  total_amount          numeric,
  batch_count           bigint,
  month_pending_amount  numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH pending_batches AS (
    SELECT
      b.id,
      b.status,
      b.total_amount,
      b.payment_date
    FROM public.payment_batches b
    WHERE b.deleted_at IS NULL
      AND b.status IN (
        'pending_approval',
        'pending_second_approval',
        'approved',
        'funded',
        'processing',
        'partially_processed',
        'failed'
      )
  ),
  -- For batches that already dispatched some money (partially_processed / failed),
  -- only the still-outstanding items are added to the liability. Everything
  -- earlier in the pipeline (pending_approval, approved, funded, processing)
  -- takes the batch total as-is because no items have closed yet.
  outstanding_by_batch AS (
    SELECT
      pb.id,
      pb.payment_date,
      CASE
        WHEN pb.status IN ('partially_processed', 'failed') THEN
          COALESCE((
            SELECT SUM(bi.amount_ngn)
            FROM public.batch_items bi
            WHERE bi.batch_id = pb.id
              AND bi.status <> 'succeeded'
              AND COALESCE(bi.is_manually_resolved, false) = false
          ), 0)
        ELSE
          COALESCE(pb.total_amount, 0)
      END::numeric AS effective_amount
    FROM pending_batches pb
  )
  SELECT
    COALESCE(SUM(effective_amount), 0)::numeric                      AS total_amount,
    COUNT(*)::bigint                                                 AS batch_count,
    COALESCE(
      SUM(effective_amount) FILTER (
        WHERE payment_date IS NOT NULL
          AND date_trunc('month', payment_date)
              = date_trunc('month', CURRENT_DATE)
      ),
      0
    )::numeric                                                       AS month_pending_amount
  FROM outstanding_by_batch;
$$;

GRANT EXECUTE ON FUNCTION public.pending_payouts_summary() TO authenticated;

COMMENT ON FUNCTION public.pending_payouts_summary() IS
  'Bank-grade Pending KPI feed for PendingPayoutsCard. Sums outstanding '
  'liability across ALL non-draft, non-closed batches — no LIMIT. Partially '
  'processed / failed batches contribute only their unpaid items, so the '
  'figure is the money still to move, not the historical batch face value.';
