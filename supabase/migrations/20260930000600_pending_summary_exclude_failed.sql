-- =============================================================================
-- pending_payouts_summary(): remove 'failed' from the Pending set
--
-- Follow-up to 20260930000000. The original version included 'failed' batches
-- so that all-items-failed batches would surface in the Pending KPI for the
-- operator to patch. Operator convention on this platform is different:
-- a batch that finished in status='failed' is treated as a cancelled /
-- closed-out event and MUST NOT count toward outstanding payables. Genuinely
-- partial batches (some items succeeded, some still failing) stay covered by
-- 'partially_processed' — those DO contribute their unpaid item remainder.
--
-- Reverts the pending set to the original operator-facing definition:
--   pending_approval, pending_second_approval, approved, funded,
--   processing, partially_processed
--
-- Also removes 'failed' from the outstanding-items adjustment (partially_processed
-- keeps it; failed no longer applies because failed batches drop off entirely).
--
-- Zero impact on approval / funding / dispatch. Purely a KPI-set change.
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
        'partially_processed'
      )
  ),
  outstanding_by_batch AS (
    SELECT
      pb.id,
      pb.payment_date,
      CASE
        WHEN pb.status = 'partially_processed' THEN
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
