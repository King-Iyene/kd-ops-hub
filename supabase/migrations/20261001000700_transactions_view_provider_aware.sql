-- =============================================================================
-- Migration: 20261001000700_transactions_view_provider_aware.sql
-- =============================================================================
-- ROOT CAUSE (found during a full sweep for other paystack-only assumptions,
-- prompted by the _derive_batch_status_from_items bug): transactions_view
-- filtered `WHERE bi.paystack_reference IS NOT NULL`. Every Flutterwave
-- transaction — succeeded, failed, or in-flight — is invisible on the
-- Transactions page because it uses flutterwave_reference instead.
--
-- FIX: broaden the WHERE clause to accept either provider's reference, and
-- surface a provider-aware reference + fee so the UI can show the right
-- values regardless of which rail moved the money. Adds a `provider` column
-- so the frontend can render a pill (as ProviderPill.tsx already supports).
--
-- Paystack rows are unaffected — COALESCE/CASE fall through to the exact
-- same values they had before for provider='paystack' (or NULL, the
-- pre-migration default).
-- =============================================================================

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS
SELECT
  bi.id,
  COALESCE(bi.processed_at, bi.created_at, pb.created_at)                AS created_at,
  CASE WHEN pb.is_quick_pay THEN 'quick_pay' ELSE 'transfer' END         AS txn_type,
  COALESCE(bi.full_name, 'Unknown recipient')                            AS description,
  COALESCE(pb.payment_category, 'transfer')                              AS category,
  bi.amount_ngn                                                          AS amount_ngn,
  -- Fee column stays named paystack_fee_ngn for backward compatibility with
  -- existing frontend code (Transactions.tsx, Reports.tsx) — it's now
  -- provider-aware under the hood: for Flutterwave items it surfaces
  -- flutterwave_fee_ngn instead. A future rename to a neutral column name
  -- is a separate, non-urgent frontend refactor.
  CASE
    WHEN bi.provider = 'flutterwave' THEN bi.flutterwave_fee_ngn
    ELSE bi.paystack_fee_ngn
  END                                                                     AS paystack_fee_ngn,
  bi.status                                                              AS status,
  COALESCE(bi.provider, 'paystack')                                      AS provider,
  CASE
    WHEN bi.provider = 'flutterwave' THEN COALESCE(bi.flutterwave_reference, bi.id::text)
    ELSE COALESCE(bi.paystack_reference, bi.id::text)
  END                                                                     AS reference,
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
   OR bi.flutterwave_reference IS NOT NULL;

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'One row per actual money movement (dispatched batch_item), provider-aware. '
  'Mirrors the providers'' own Transfers views: amount + fee as columns on the '
  'same row, beneficiary, date, status, provider. Batch-lifecycle states '
  '(draft/approved/funded/partial) live on payment_batches and are surfaced '
  'in the Payments module.';

NOTIFY pgrst, 'reload schema';
