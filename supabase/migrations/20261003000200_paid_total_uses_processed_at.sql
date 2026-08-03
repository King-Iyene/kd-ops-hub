-- =============================================================================
-- Migration: 20261003000200_paid_total_uses_processed_at.sql
-- =============================================================================
-- ROOT CAUSE of the Dashboard vs Payments "this month" total mismatch:
-- paid_total_in_period filtered by payment_batches.payment_date — an
-- editable, user-set target/scheduled date, NOT when the money actually
-- moved. A batch can have payment_date far in the future (confirmed: several
-- June/July payroll batches carry payment_date = 2026-08-25 while their
-- items' processed_at shows they were actually paid in early July) — a
-- date-picker default drifting forward, not corrected before submit. Every
-- KPI reading off payment_date inherits that error.
--
-- The only trustworthy "when was this paid" signal is batch_items.processed_at
-- — set exactly once, at the moment a transfer is confirmed succeeded
-- (webhook or reconciliation), for either provider. Switching the filter to
-- that column makes "Paid this month" mean what it says, and stops drifting
-- out of sync with the Dashboard's "Total Disbursed" tile (which uses
-- created_at — a separate, real fix would align that too, but processed_at
-- is the correct source of truth for "paid," not created_at either).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.paid_total_in_period(
  p_start date,
  p_end   date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(bi.amount_ngn), 0)::numeric
  FROM   public.batch_items bi
  JOIN   public.payment_batches pb ON pb.id = bi.batch_id
  WHERE  bi.status = 'succeeded'
    AND  COALESCE(bi.is_manually_resolved, false) = false
    AND  pb.deleted_at IS NULL
    AND  bi.processed_at IS NOT NULL
    AND  bi.processed_at >= p_start::timestamptz
    AND  bi.processed_at <  p_end::timestamptz;
$$;

NOTIFY pgrst, 'reload schema';
