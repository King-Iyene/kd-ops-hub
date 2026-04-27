-- Supersedes 20260628000000 (which added a total_fees_ngn column approach).
--
-- Instead of a fees column on the batch row, Paystack transfer fees are now
-- surfaced as separate "charge" rows — one per succeeded batch_item that has
-- a recorded fee. This mirrors how the Paystack ledger/dashboard looks, where
-- you see:
--   Transfer: KDOps Quick Pay              ₦50.00
--   Charge for transfer: TRF_xxx           ₦10.00
--
-- Only succeeded items with paystack_fee_ngn > 0 produce a charge row, so
-- refunded fees (from failed transfers) are excluded.
-- parent_batch_id is NULL for regular batch rows and set to the parent batch
-- UUID for charge rows, so the UI can navigate correctly on row click.

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS

-- ── Payment batch rows (the actual money movement) ──────────────────────────
SELECT
  pb.id,
  pb.created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'payment_batch' END AS txn_type,
  COALESCE(pb.payment_description, pb.name, 'Payment batch') AS description,
  COALESCE(pb.payment_category, 'contractor_payment') AS category,
  pb.total_amount AS amount_ngn,
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

-- ── Charge rows (one per succeeded transfer with a recorded Paystack fee) ───
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
  AND bi.status = 'succeeded';

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Real money movement — payment batches, quick pays, and Paystack charge rows. '
  'Charge rows mirror the Paystack ledger: one row per succeeded transfer with a recorded fee. '
  'parent_batch_id is non-null for charge rows and points to the owning batch.';
