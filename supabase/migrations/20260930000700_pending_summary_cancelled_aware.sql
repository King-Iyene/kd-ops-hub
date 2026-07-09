-- =============================================================================
-- pending_payouts_summary(): cancelled-aware failed-batch handling
--
-- Follow-up to 20260930000600. That version excluded status='failed' entirely
-- from Pending, but the correct operator model is more nuanced:
--
--   * Each batch_item in a failed / partially_processed batch has a manual
--     resolution flow (mark_batch_item_resolved / unresolve_batch_item).
--     Method='cancelled' + is_manually_resolved=true means "this recipient
--     will not be paid; write it off". The item's status column stays
--     'failed' for audit but the money is closed out.
--   * If EVERY item in a failed batch is cancelled that way, the batch has
--     no outstanding liability and MUST NOT appear in Pending.
--   * If ANY item remains uncancelled (still needs to be patched / retried),
--     the batch is still real payables and SHOULD appear.
--   * Undoing the cancel on any item re-adds its amount and pulls the batch
--     back into Pending automatically.
--
-- The rule for partially_processed is already exactly this (sum of items
-- where status <> 'succeeded' AND is_manually_resolved = false). This
-- version applies the SAME rule to failed batches, and drops any batch
-- whose effective_amount is 0 so a fully-resolved batch stops counting
-- against batch_count as well as against total_amount.
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
  outstanding_by_batch AS (
    SELECT
      pb.id,
      pb.status,
      pb.payment_date,
      CASE
        -- For failed / partially_processed we sum only items that are
        -- neither succeeded nor manually resolved. So a fully-cancelled
        -- batch drops to 0 and disappears from the filter below; undoing
        -- any cancel puts its amount back and it reappears.
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
  ),
  live AS (
    SELECT * FROM outstanding_by_batch WHERE effective_amount > 0
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
  FROM live;
$$;

GRANT EXECUTE ON FUNCTION public.pending_payouts_summary() TO authenticated;
