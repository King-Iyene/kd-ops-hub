-- =============================================================================
-- KDOps — Transactions view: payment batches only (no transfers, no expenses)
--
-- Transfer rows (batch_items) were removed here because they are sub-items of
-- a payment batch and their amounts were already counted at the batch level,
-- causing double-counting and cluttering the transactions list.
--
-- The reference column now surfaces the Paystack transfer reference for
-- single-recipient batches (Quick Pays) so the reference matches what
-- appears in the Paystack dashboard.
-- =============================================================================

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
  pb.notes
FROM public.payment_batches pb;

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Real money movement — payment batches and quick pays only. Individual transfer rows and expenses are excluded. Reference prefers the Paystack transfer reference for single-recipient batches.';
