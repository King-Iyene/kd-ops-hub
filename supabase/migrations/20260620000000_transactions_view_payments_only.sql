-- =============================================================================
-- KDOps — Transactions view: payments only (no expenses)
--
-- Expenses were previously included in this view, which caused double-counting:
-- a fuel/repair expense paid via a payment batch would appear once as an
-- 'expense' row and again as a 'payment_batch'/'transfer' row.
--
-- The Transactions module is now scoped strictly to real money movement —
-- payment batches (including quick pays) and their individual transfer items.
-- Expenses remain visible in the Expenses module only.
-- =============================================================================

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS

-- Payment batches (bulk + quick pay)
SELECT
  pb.id,
  pb.created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'payment_batch' END AS txn_type,
  COALESCE(pb.payment_description, pb.name, 'Payment batch') AS description,
  COALESCE(pb.payment_category, 'contractor_payment') AS category,
  pb.total_amount AS amount_ngn,
  pb.status,
  pb.id::text AS reference,
  pb.created_by,
  NULL::uuid AS contractor_id,
  NULL::uuid AS employee_id,
  pb.name AS batch_name,
  pb.beneficiary_count,
  pb.payment_date,
  pb.approved_by,
  pb.rejection_reason,
  pb.notes
FROM public.payment_batches pb

UNION ALL

-- Individual batch item transfers (for drill-down)
SELECT
  bi.id,
  bi.created_at,
  'transfer' AS txn_type,
  COALESCE(bi.full_name, 'Transfer') AS description,
  'contractor_payment' AS category,
  bi.amount_ngn,
  CASE
    WHEN bi.status = 'succeeded' THEN 'processed'
    WHEN bi.status = 'failed'    THEN 'failed'
    WHEN bi.status = 'retry'     THEN 'processing'
    ELSE 'pending'
  END AS status,
  COALESCE(bi.paystack_reference, bi.reference, bi.id::text) AS reference,
  NULL::uuid AS created_by,
  bi.contractor_id,
  NULL::uuid AS employee_id,
  NULL AS batch_name,
  NULL::int AS beneficiary_count,
  NULL::date AS payment_date,
  NULL::uuid AS approved_by,
  bi.failure_reason AS rejection_reason,
  NULL AS notes
FROM public.batch_items bi;

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Real money movement only — payment batches and individual Paystack transfers. Expenses are excluded to prevent double-counting when a reimbursement is paid via a batch.';
