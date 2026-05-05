-- transactions_view: pure item-level ledger that mirrors Paystack's Transfers view.
--
-- Why this changes:
--   The first version of this view emitted both a transfer row AND a separate
--   "charge" row for the Paystack fee on each succeeded transfer — so a
--   100-recipient batch produced ~200 rows in Transactions. Paystack's own
--   dashboard shows fees as COLUMNS on the transfer row (Amount | Transfer
--   fee | VAT | Stamp Duty | Beneficiary | Date | Channel | Status). This
--   matches that exactly.
--
--   * One row per dispatched batch_item (paystack_reference IS NOT NULL).
--   * paystack_fee_ngn surfaced as a column so the UI can show fee + VAT
--     + stamp duty in the same row as the transfer.
--   * Statuses limited to what actually happens to a transfer: pending,
--     processing, succeeded, failed, reversed. No more partial / funded /
--     approved / draft (those live on payment_batches and are batch-lifecycle,
--     not transaction-state).
--   * Charge rows removed entirely — VAT and stamp duty are computed client-
--     side from amount + paystack_fee_ngn so they stay in sync with the
--     fee schedule without needing another migration.

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS
SELECT
  bi.id,
  COALESCE(bi.processed_at, bi.created_at, pb.created_at)                AS created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'transfer' END         AS txn_type,
  COALESCE(bi.full_name, 'Unknown recipient')                            AS description,
  COALESCE(pb.payment_category, 'transfer')                              AS category,
  bi.amount_ngn                                                          AS amount_ngn,
  bi.paystack_fee_ngn                                                    AS paystack_fee_ngn,
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
WHERE bi.paystack_reference IS NOT NULL;

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'One row per actual money movement (dispatched batch_item). Mirrors '
  'Paystack''s Transfers view: amount + fee as columns on the same row, '
  'beneficiary, date, status. Batch-lifecycle states (draft/approved/funded/'
  'partial) live on payment_batches and are surfaced in the Payments module.';
