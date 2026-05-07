-- Re-create transactions_view with paystack_raw exposed.
--
-- Why: the Transactions page now uses the same fee-resolution chain as
-- BatchDetail and the receipt — paystack_fee_ngn first, paystack_raw.fee
-- (kobo) as a fallback when the column is null but the webhook payload
-- has the fee, and a calculated estimate as a last resort. Without
-- paystack_raw on the view, the middle step is dead because the client
-- can't see the JSONB blob.
--
-- Idempotent — DROP VIEW IF EXISTS / CREATE VIEW is the same pattern
-- the original migration uses.

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
  bi.paystack_raw                                                        AS paystack_raw,
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

NOTIFY pgrst, 'reload schema';

COMMENT ON VIEW public.transactions_view IS
  'One row per actual money movement (dispatched batch_item). Mirrors '
  'Paystack''s Transfers view: amount + fee as columns on the same row, '
  'beneficiary, date, status. paystack_raw is exposed so client-side '
  'code can fall back to the kobo fee inside the webhook payload when '
  'the structured fee column is still null.';
