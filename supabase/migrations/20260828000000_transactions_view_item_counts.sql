-- Add per-batch succeeded/failed item counts to transactions_view.
--
-- Audit gap this closes:
--   When a batch finishes with 99 succeeded transfers and 1 failure, its
--   batch.status becomes 'partially_processed'. Filtering Transactions by
--   "Processed" status hid those batches entirely — auditors lost sight of
--   the 99 successful payments because they were buried under a partial
--   parent. Surfacing succeeded/failed counts on the batch row lets the UI
--   show "99 of 100 succeeded" and treat partial batches as part of the
--   completed audit set.

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
  (SELECT COUNT(*)::int FROM public.batch_items bi
     WHERE bi.batch_id = pb.id AND bi.status = 'succeeded')           AS succeeded_count,
  (SELECT COUNT(*)::int FROM public.batch_items bi
     WHERE bi.batch_id = pb.id AND bi.status = 'failed')              AS failed_count,
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
  NULL::int                                                                 AS succeeded_count,
  NULL::int                                                                 AS failed_count,
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
  'succeeded_count / failed_count expose per-batch item progress so the UI can '
  'show "99 of 100 succeeded" on partial batches and group them with completed '
  'work for audit views.';
