-- ─────────────────────────────────────────────────────────────────
-- Payments polish — consolidated, idempotent, safe to re-run.
--
-- Three independent fixes bundled into one file so an operator can
-- paste it whole into the Supabase SQL Editor and walk away:
--
--   1. Extend the `manual_resolution_method` CHECK on batch_items so
--      operators can mark a failed item as **cancelled / voided**.
--      Without this, the Resolve dialog throws
--      "violates check constraint batch_items_manual_resolution_method_check".
--
--   2. Provide `batch_paid_amount_ngn(batch_id)` and
--      `paid_total_in_period(start, end)` so spend totals exclude
--      cancelled / paid-externally items. Manually-resolved items
--      didn't actually move money on Paystack — counting them as
--      platform expense double-counts (paid externally) or invents
--      expense (cancelled).
--
--   3. Recreate `transactions_view` as **item-level only** — one row
--      per dispatched batch_item, no batch aggregate row. This
--      mirrors Paystack's own Transfers view: amount + fee as
--      columns on the same row, beneficiary, date, status. Batch-
--      lifecycle rows (draft / approved / funded / partial) belong
--      on the Payments module, not the ledger.
-- ─────────────────────────────────────────────────────────────────


-- ── 1. Extend manual_resolution_method CHECK ─────────────────────
ALTER TABLE public.batch_items
  DROP CONSTRAINT IF EXISTS batch_items_manual_resolution_method_check;

ALTER TABLE public.batch_items
  ADD CONSTRAINT batch_items_manual_resolution_method_check
  CHECK (
    manual_resolution_method IS NULL
    OR manual_resolution_method IN (
      'bank_transfer',
      'cash',
      'cheque',
      'other',
      'cancelled',
      'voided'
    )
  );

COMMENT ON CONSTRAINT batch_items_manual_resolution_method_check
  ON public.batch_items IS
  'Allowed manual resolution methods. ''cancelled'' / ''voided'' write off the '
  'item entirely — no money moved, excluded from spend totals.';


-- ── 2a. batch_paid_amount_ngn(batch_id) ──────────────────────────
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


-- ── 2b. paid_total_in_period(start, end) ─────────────────────────
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


-- ── 3. transactions_view: item-level only ────────────────────────
--
-- Drops any batch-aggregate row that may have been re-introduced
-- by a previous migration. Every emitted row corresponds to an
-- actual dispatched batch_item — what Paystack would call a
-- transfer. Manually-resolved items still appear (so audit history
-- is preserved); the resolution is exposed via two extra columns
-- the UI can read to render a "Paid externally" / "Cancelled"
-- pill instead of just the raw Paystack outcome.

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
WHERE bi.paystack_reference IS NOT NULL
   OR bi.is_manually_resolved = true;  -- cancelled items keep their audit row

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Item-level ledger. One row per dispatched batch_item (or '
  'manually-resolved item). NO batch-aggregate rows — those live '
  'on payment_batches and surface in the Payments module. '
  'is_manually_resolved + manual_resolution_method exposed so the UI '
  'can render a "Paid externally" / "Cancelled" pill on top of the '
  'underlying Paystack status.';

NOTIFY pgrst, 'reload schema';
