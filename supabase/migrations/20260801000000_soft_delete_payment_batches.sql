-- ----------------------------------------------------------------------------
-- Soft-delete for payment_batches
--
-- Adds a `deleted_at` timestamp + `deleted_by` + `deletion_reason` triple so
-- finance/admin can remove batches without losing the audit trail. Once a
-- batch is soft-deleted it disappears from all the user-facing views (batch
-- list, payment schedule, transactions) but its data remains queryable for
-- audit and recovery. There is no hard delete from the UI.
--
-- Deletable statuses (enforced by RLS + UI):
--   draft, pending_approval, rejected, approved, funded
-- Non-deletable (money in flight or settled):
--   processing, processed, partially_processed
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_batches
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE INDEX IF NOT EXISTS payment_batches_deleted_at_idx
  ON public.payment_batches (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.payment_batches.deleted_at IS
  'Soft-delete timestamp. NULL = active; non-NULL = deleted, hidden from default views.';
COMMENT ON COLUMN public.payment_batches.deleted_by IS
  'profile.id of the user who soft-deleted the batch.';
COMMENT ON COLUMN public.payment_batches.deletion_reason IS
  'Required for funded/approved batches; optional for draft/pending_approval/rejected.';

-- ----------------------------------------------------------------------------
-- RPC: soft_delete_payment_batch
--   Centralizes the delete-eligibility rules so the UI cannot bypass them.
--   Allowed roles: admin, super_admin, finance.
--   Allowed statuses: draft | pending_approval | rejected | approved | funded.
--   For funded batches, a non-empty reason is required (operator must explain
--   the recall before the row is hidden).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_payment_batch(
  p_batch_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.payment_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_batch       public.payment_batches;
BEGIN
  -- Permission gate
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin', 'super_admin', 'finance') THEN
    RAISE EXCEPTION 'Only admin or finance roles can delete payment batches';
  END IF;

  -- Look up + lock the row
  SELECT * INTO v_batch
  FROM public.payment_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Payment batch not found';
  END IF;

  IF v_batch.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment batch is already deleted';
  END IF;

  IF v_batch.status NOT IN ('draft', 'pending_approval', 'rejected', 'approved', 'funded') THEN
    RAISE EXCEPTION 'Cannot delete a batch in status %. Money may already be in flight.', v_batch.status;
  END IF;

  IF v_batch.status IN ('approved', 'funded') AND (p_reason IS NULL OR length(btrim(p_reason)) < 5) THEN
    RAISE EXCEPTION 'A reason of at least 5 characters is required to delete an approved or funded batch';
  END IF;

  UPDATE public.payment_batches
  SET deleted_at = now(),
      deleted_by = auth.uid(),
      deletion_reason = btrim(p_reason)
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  -- Audit trail
  INSERT INTO public.audit_logs (action_type, description, performed_by)
  VALUES (
    'batch_deleted',
    format('Batch "%s" (status %s) deleted%s', v_batch.name, v_batch.status,
      CASE WHEN p_reason IS NOT NULL THEN ' — ' || p_reason ELSE '' END
    ),
    auth.uid()
  );

  RETURN v_batch;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_payment_batch(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_payment_batch IS
  'Soft-delete a payment_batch row. Caller must be admin/finance. Status must be one of draft/pending_approval/rejected/approved/funded. A reason is required for approved/funded.';

-- ----------------------------------------------------------------------------
-- Update transactions_view to exclude deleted batches
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.transactions_view;

CREATE VIEW public.transactions_view AS

-- Payment batch rows (the actual money movement)
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
  NULL::uuid AS parent_batch_id

FROM public.payment_batches pb
WHERE pb.deleted_at IS NULL

UNION ALL

-- Charge rows (Paystack transfer fees per succeeded transfer)
SELECT
  bi.id,
  COALESCE(bi.processed_at, pb.created_at) AS created_at,
  'charge'::text                            AS txn_type,
  'Charge for transfer: ' ||
    COALESCE(bi.paystack_reference, bi.full_name, bi.id::text) AS description,
  'paystack_fee'::text                      AS category,
  bi.paystack_fee_ngn                       AS amount_ngn,
  bi.status,
  COALESCE(bi.paystack_reference, bi.id::text) AS reference,
  pb.created_by,
  bi.contractor_id                          AS contractor_id,
  bi.employee_id                            AS employee_id,
  pb.name                                   AS batch_name,
  NULL::integer                             AS beneficiary_count,
  pb.payment_date,
  NULL::uuid                                AS approved_by,
  NULL::text                                AS rejection_reason,
  NULL::text                                AS notes,
  pb.id                                     AS parent_batch_id

FROM  public.batch_items     bi
JOIN  public.payment_batches pb ON pb.id = bi.batch_id
WHERE bi.paystack_fee_ngn > 0
  AND bi.status = 'succeeded'
  AND pb.deleted_at IS NULL;

GRANT SELECT ON public.transactions_view TO authenticated;

COMMENT ON VIEW public.transactions_view IS
  'Real money movement — payment batches, quick pays, and Paystack charge rows. Excludes soft-deleted batches.';
