-- Totals strip for each single-status payment batch tab (Draft, Processing,
-- Done, Partial, Failed, Cancelled, Rejected) — mirrors the existing
-- pending_payouts_summary() used for the "Awaiting Dispatch" KPI card, but
-- generic over any one DB status instead of the multi-status pending set.
--
-- Must be a server-side aggregate, not a client-side SUM over the loaded
-- page: the batch list UI pages at 250 rows, so summing only what's loaded
-- would silently truncate once a status tab crosses that count (the exact
-- class of bug pending_payouts_summary was introduced to avoid).

CREATE OR REPLACE FUNCTION public.payment_batches_status_summary(p_status text)
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
    COALESCE(SUM(b.total_amount), 0)::numeric AS total_amount,
    COUNT(*)::bigint AS batch_count
  FROM public.payment_batches b
  WHERE b.deleted_at IS NULL
    AND b.status = p_status;
$$;

GRANT EXECUTE ON FUNCTION public.payment_batches_status_summary(text) TO authenticated;
