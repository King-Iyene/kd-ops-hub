-- Add total_fees_ngn to transactions_view so the Transactions page
-- can display the actual Paystack transfer fees charged per batch.
--
-- Fees are stored per line-item in batch_items.paystack_fee_ngn
-- (populated by the transfer.success webhook). This subquery sums
-- them per batch so the UI can show a total without joining elsewhere.
-- Rows with paystack_fee_ngn = 0 (webhook not yet fired, or no fee) are
-- excluded from the sum so the column is 0 rather than NULL for those batches.

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS
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
  COALESCE(
    (SELECT SUM(bi.paystack_fee_ngn)
     FROM   public.batch_items bi
     WHERE  bi.batch_id = pb.id
       AND  bi.paystack_fee_ngn > 0),
    0
  ) AS total_fees_ngn
FROM public.payment_batches pb;

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Real money movement — payment batches and quick pays only. Individual transfer rows and expenses are excluded. Reference prefers the Paystack transfer reference for single-recipient batches. total_fees_ngn is the sum of actual Paystack transfer fees recorded in batch_items.';
