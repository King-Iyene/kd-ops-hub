-- transactions_view becomes a true item-level ledger.
--
-- Why this changes:
--   The old view emitted one row per payment_batch plus one row per fee. That
--   hid individual transfers behind a batch-level summary, so a 100-recipient
--   payroll batch became one line in Transactions instead of 100 audit-able
--   entries. When a batch was 'partially_processed', the 99 successful
--   transfers were invisible to anyone auditing per-payment activity.
--
-- New shape (matches accounting-ledger conventions):
--   * One row per dispatched batch_item — every actual money movement is its
--     own line, with its own status, amount, recipient, and Paystack ref.
--   * One row per Paystack fee charge (unchanged).
--   * No more synthetic batch summary row. Batch-level aggregation lives in
--     the Payments module which queries payment_batches directly.
--
-- "Dispatched" = paystack_reference IS NOT NULL. Items still in draft/pending
-- without a Paystack ref haven't moved money so they don't belong in a ledger.

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS

-- ── Transfer rows: one per dispatched batch_item ────────────────────────────
SELECT
  bi.id,
  COALESCE(bi.processed_at, bi.created_at, pb.created_at)                AS created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'transfer' END         AS txn_type,
  COALESCE(bi.full_name, 'Unknown recipient')                            AS description,
  COALESCE(pb.payment_category, 'transfer')                              AS category,
  bi.amount_ngn                                                          AS amount_ngn,
  bi.status                                                              AS status,
  COALESCE(bi.paystack_reference, bi.id::text)                           AS reference,
  pb.created_by                                                          AS created_by,
  bi.contractor_id                                                       AS contractor_id,
  bi.employee_id                                                         AS employee_id,
  pb.name                                                                AS batch_name,
  NULL::integer                                                          AS beneficiary_count,
  NULL::int                                                              AS succeeded_count,
  NULL::int                                                              AS failed_count,
  pb.payment_date                                                        AS payment_date,
  pb.approved_by                                                         AS approved_by,
  bi.failure_reason                                                      AS rejection_reason,
  bi.narration                                                           AS notes,
  bi.bank_name                                                           AS bank_name,
  bi.account_number                                                      AS account_number,
  COALESCE(bi.account_name, bi.full_name)                                AS account_name,
  NULL::text                                                             AS receipt_url,
  pb.id                                                                  AS parent_batch_id

FROM  public.batch_items     bi
JOIN  public.payment_batches pb ON pb.id = bi.batch_id
WHERE bi.paystack_reference IS NOT NULL

UNION ALL

-- ── Charge rows: one per succeeded transfer with a Paystack fee ─────────────
SELECT
  bi.id,
  COALESCE(bi.processed_at, pb.created_at)                               AS created_at,
  'charge'::text                                                         AS txn_type,
  'Charge for transfer: ' ||
    COALESCE(bi.paystack_reference, bi.full_name, bi.id::text)           AS description,
  'paystack_fee'::text                                                   AS category,
  bi.paystack_fee_ngn                                                    AS amount_ngn,
  bi.status                                                              AS status,
  COALESCE(bi.paystack_reference, bi.id::text)                           AS reference,
  pb.created_by                                                          AS created_by,
  bi.contractor_id                                                       AS contractor_id,
  bi.employee_id                                                         AS employee_id,
  pb.name                                                                AS batch_name,
  NULL::integer                                                          AS beneficiary_count,
  NULL::int                                                              AS succeeded_count,
  NULL::int                                                              AS failed_count,
  pb.payment_date                                                        AS payment_date,
  NULL::uuid                                                             AS approved_by,
  NULL::text                                                             AS rejection_reason,
  NULL::text                                                             AS notes,
  bi.bank_name                                                           AS bank_name,
  bi.account_number                                                      AS account_number,
  COALESCE(bi.account_name, bi.full_name)                                AS account_name,
  NULL::text                                                             AS receipt_url,
  pb.id                                                                  AS parent_batch_id

FROM  public.batch_items     bi
JOIN  public.payment_batches pb ON pb.id = bi.batch_id
WHERE bi.paystack_fee_ngn > 0
  AND bi.status = 'succeeded';

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Item-level ledger of money movements. One row per dispatched batch_item '
  '(succeeded, failed, or pending) plus one row per Paystack fee charge. Batch '
  'summaries live in payment_batches and are surfaced in the Payments module.';
