-- =============================================================================
-- pending_pipeline_summary() — count + amount for the "awaiting payment"
-- stat tile on the Payments dashboard.
--
-- The tile previously showed ONLY the pending_approval count while its
-- sub-line displayed the outstanding amount from pending_payouts_summary
-- (which spans a wider set of statuses). Count and amount disagreed, and
-- operators wanted one clear "money still to move" pile that spans
-- approval + funding + pre-dispatch. This RPC covers exactly that:
--
--   pending_approval        — waiting for first approver
--   pending_second_approval — waiting for co-approver
--   approved                — approved, waiting for wallet funding
--   funded                  — wallet funded, about to dispatch
--
-- 'processing' and 'partially_processed' are excluded because those are
-- already moving on the Paystack rail — the "In processing" tile shows
-- them separately.
--
-- No LIMIT (matches the no-hidden-cap contract on the other Payments-
-- dashboard aggregates). SECURITY INVOKER so RLS still applies.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pending_pipeline_summary()
RETURNS TABLE (
  total_amount numeric,
  batch_count  bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(total_amount), 0)::numeric AS total_amount,
    COUNT(*)::bigint                        AS batch_count
  FROM public.payment_batches
  WHERE deleted_at IS NULL
    AND status IN (
      'pending_approval',
      'pending_second_approval',
      'approved',
      'funded'
    );
$$;

GRANT EXECUTE ON FUNCTION public.pending_pipeline_summary() TO authenticated;

COMMENT ON FUNCTION public.pending_pipeline_summary() IS
  'Count + face-value amount across the pre-dispatch pipeline: '
  'pending_approval, pending_second_approval, approved, funded. Feeds the '
  '"Pending payment" tile on the Payments dashboard.';
