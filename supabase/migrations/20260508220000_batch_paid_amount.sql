-- "Actual money moved" amount for a batch.
--
-- The user pointed out that manually-resolved items (paid via
-- another channel, OR cancelled with no payment) should NOT count
-- towards platform expense totals. The reasoning:
--
--   • cancelled / voided  — no money moved at all. Counting it as
--                           spend is plain wrong.
--   • paid externally     — money moved off-rail. The operator
--                           records that expense in their bank
--                           reconciliation; counting it on KDOps
--                           too would double-count.
--
-- Both cases are captured by the single condition
-- `is_manually_resolved = false` on the item row. So the actual
-- money-out total for a batch is:
--
--   SUM(items.amount_ngn) WHERE status='succeeded' AND NOT is_manually_resolved
--
-- We expose this as a STABLE function so the Transactions view and
-- any aggregation can call it cheaply. The `payment_batches.total_amount`
-- column stays as the originally-committed total (so "pending now"
-- and "exposure" calculations remain accurate at submission time).

CREATE OR REPLACE FUNCTION public.batch_paid_amount_ngn(p_batch_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_ngn), 0)::numeric
  FROM public.batch_items
  WHERE batch_id = p_batch_id
    AND status = 'succeeded'
    AND is_manually_resolved = false;
$$;

GRANT EXECUTE ON FUNCTION public.batch_paid_amount_ngn(uuid)
  TO authenticated, service_role;

-- ── Total paid in a period ────────────────────────────────────────
--
-- Convenience aggregator for the "paid this month" KPI. Sums every
-- batch_item that actually moved money — succeeded AND not manually
-- resolved — whose parent batch falls in the requested period.
-- Joins on payment_date so the figure tracks the operator's
-- intended pay date, not the create timestamp.

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
    AND  bi.is_manually_resolved = false
    AND  pb.deleted_at IS NULL
    AND  pb.payment_date >= p_start
    AND  pb.payment_date <  p_end;
$$;

GRANT EXECUTE ON FUNCTION public.paid_total_in_period(date, date)
  TO authenticated, service_role;

-- ── Update transactions_view so the batch row uses actual paid ─────
--
-- Recreates the view from 20260629000000 with one change: amount_ngn
-- on the batch row is now `batch_paid_amount_ngn(pb.id)` rather than
-- `pb.total_amount`. Fee charge rows already filter on
-- `status='succeeded'` so they correctly exclude cancelled items
-- (cancelled items keep status='failed' for audit).

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view
WITH (security_invoker = true) AS

-- ── Payment batch rows (real money out only) ────────────────────────
SELECT
  pb.id,
  pb.created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'payment_batch' END AS txn_type,
  COALESCE(pb.payment_description, pb.name, 'Payment batch') AS description,
  COALESCE(pb.payment_category, 'contractor_payment') AS category,
  public.batch_paid_amount_ngn(pb.id) AS amount_ngn,
  pb.status,
  COALESCE(
    (SELECT bi.paystack_reference
     FROM   public.batch_items bi
     WHERE  bi.batch_id = pb.id
       AND  bi.paystack_reference IS NOT NULL
     LIMIT  1),
    pb.id::text
  ) AS reference,
  pb.created_by,
  NULL::uuid AS contractor_id,
  NULL::uuid AS employee_id,
  pb.name AS batch_name,
  pb.beneficiary_count,
  pb.payment_date,
  pb.approved_by,
  pb.rejection_reason,
  pb.notes,
  NULL::uuid AS parent_batch_id

FROM public.payment_batches pb

UNION ALL

-- ── Charge rows (one per succeeded transfer with a recorded fee) ────
SELECT
  bi.id,
  COALESCE(bi.processed_at, pb.created_at)                                 AS created_at,
  'charge'::text                                                            AS txn_type,
  'Charge for transfer: ' ||
    COALESCE(bi.paystack_reference, bi.full_name, bi.id::text)             AS description,
  'paystack_fee'::text                                                      AS category,
  bi.paystack_fee_ngn                                                       AS amount_ngn,
  bi.status,
  COALESCE(bi.paystack_reference, bi.id::text)                             AS reference,
  pb.created_by,
  bi.contractor_id                                                          AS contractor_id,
  bi.employee_id                                                            AS employee_id,
  pb.name                                                                   AS batch_name,
  NULL::integer                                                             AS beneficiary_count,
  pb.payment_date,
  NULL::uuid                                                                AS approved_by,
  NULL::text                                                                AS rejection_reason,
  NULL::text                                                                AS notes,
  pb.id                                                                     AS parent_batch_id

FROM  public.batch_items       bi
JOIN  public.payment_batches   pb ON pb.id = bi.batch_id
WHERE bi.paystack_fee_ngn > 0
  AND bi.status = 'succeeded'
  AND bi.is_manually_resolved = false;

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Real money movement on the platform. Batch rows use batch_paid_amount_ngn() '
  'so cancelled / paid-externally items do not inflate spend. Charge rows mirror '
  'the Paystack ledger: one per succeeded fee. parent_batch_id is non-null for '
  'charge rows.';

NOTIFY pgrst, 'reload schema';
