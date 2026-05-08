-- ─────────────────────────────────────────────────────────────────
-- transactions_view: include ALL beneficiary attempts, not just
-- those with a Paystack reference.
--
-- Bug observed in production:
--   Failed batch_items often have NO paystack_reference because
--   Paystack rejected the request before assigning one (validation
--   failure, network error, account verification fail, etc). Those
--   rows store the failure with paystack_reference = NULL and the
--   id as the only identifier.
--
--   The previous filter (`paystack_reference IS NOT NULL OR
--   is_manually_resolved`) silently dropped them, so the operator
--   saw the Transactions ledger as a list of successes — exactly
--   the items they DON'T need to investigate. The failed ones,
--   which are the ones that need attention, were invisible.
--
-- The new filter says: include any item whose status indicates an
-- attempt was made — pending, processing, succeeded, failed,
-- reversed, retry — OR an item that was manually resolved. That
-- covers every row a finance operator might want to see, while
-- still excluding draft / unsubmitted items that haven't moved
-- toward dispatch.
-- ─────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view
WITH (security_invoker = true) AS
SELECT
  bi.id,
  COALESCE(bi.processed_at, bi.created_at, pb.created_at)             AS created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'transfer' END      AS txn_type,
  COALESCE(bi.full_name, 'Unknown recipient')                         AS description,
  COALESCE(pb.payment_category, 'transfer')                           AS category,
  bi.amount_ngn                                                       AS amount_ngn,
  bi.paystack_fee_ngn                                                 AS paystack_fee_ngn,
  bi.status                                                           AS status,
  COALESCE(bi.paystack_reference, bi.id::text)                        AS reference,
  pb.created_by                                                       AS created_by,
  bi.contractor_id                                                    AS contractor_id,
  bi.employee_id                                                      AS employee_id,
  pb.name                                                             AS batch_name,
  NULL::integer                                                       AS beneficiary_count,
  NULL::int                                                           AS succeeded_count,
  NULL::int                                                           AS failed_count,
  pb.payment_date                                                     AS payment_date,
  pb.approved_by                                                      AS approved_by,
  COALESCE(bi.manual_resolution_note, bi.failure_reason)              AS rejection_reason,
  bi.narration                                                        AS notes,
  bi.bank_name                                                        AS bank_name,
  bi.account_number                                                   AS account_number,
  COALESCE(bi.account_name, bi.full_name)                             AS account_name,
  NULL::text                                                          AS receipt_url,
  pb.id                                                               AS parent_batch_id,
  bi.is_manually_resolved                                             AS is_manually_resolved,
  bi.manual_resolution_method                                         AS manual_resolution_method

FROM  public.batch_items     bi
JOIN  public.payment_batches pb ON pb.id = bi.batch_id
WHERE pb.deleted_at IS NULL
  AND pb.status NOT IN ('draft', 'rejected');  -- exclude not-yet-real and explicitly-killed batches

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Item-level ledger. One row per attempted money movement (any '
  'batch_item past the draft stage, or any manually-resolved item). '
  'NO batch-aggregate rows. Failed items WITHOUT a paystack_reference '
  'still appear — those are the ones the operator needs to see most.';

NOTIFY pgrst, 'reload schema';
