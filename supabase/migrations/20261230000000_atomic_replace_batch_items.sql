-- Root cause of a real production incident: editing an existing payment
-- batch (NewPaymentBatch.tsx) deleted its batch_items up front, then
-- re-inserted the edited list as a SEPARATE, unchecked statement. When that
-- second insert failed (e.g. during a database slowdown), the delete had
-- already committed — the batch was left with a header saying "N
-- beneficiaries" and zero actual batch_items rows, with the UI reporting
-- "Draft updated" success the whole time because the insert's error was
-- never checked. Six real batches were wiped this way with no way to
-- recover the original beneficiary data (no backup/audit trail captured it).
--
-- Fix: replace the delete-then-insert sequence with ONE atomic operation.
-- A PL/pgSQL function body is a single transaction — if anything inside
-- raises, every change made so far in the call (including the delete) is
-- rolled back automatically. A failed save can now only ever leave a batch
-- exactly as it was before the save attempt — never half-deleted.

CREATE OR REPLACE FUNCTION public.replace_batch_items(
  p_batch_id UUID,
  p_items JSONB,
  p_beneficiary_count INTEGER,
  p_total_amount NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_role() NOT IN ('super_admin', 'admin', 'finance', 'operations') THEN
    RAISE EXCEPTION 'Not authorized to edit payment batch items';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payment_batches WHERE id = p_batch_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  -- Never touch a batch that has already had any item dispatched to a
  -- payment provider — editing a batch is only meant for drafts/undispatched
  -- items, matching the same guard the 20261229000000 dedup migration used.
  IF EXISTS (
    SELECT 1 FROM public.batch_items
    WHERE batch_id = p_batch_id
      AND (paystack_reference IS NOT NULL OR flutterwave_reference IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot replace items: batch % already has dispatched items', p_batch_id;
  END IF;

  DELETE FROM public.batch_items WHERE batch_id = p_batch_id;

  INSERT INTO public.batch_items (
    batch_id, contractor_id, employee_id, item_type, full_name, bank_name,
    account_number, amount_ngn, gross_amount_ngn, wht_rate, wht_amount_ngn,
    reference, status
  )
  SELECT
    p_batch_id,
    NULLIF(elem->>'contractor_id', '')::uuid,
    NULLIF(elem->>'employee_id', '')::uuid,
    COALESCE(elem->>'item_type', 'adhoc'),
    elem->>'full_name',
    elem->>'bank_name',
    elem->>'account_number',
    (elem->>'amount_ngn')::numeric,
    NULL,
    0,
    0,
    elem->>'reference',
    'pending'
  FROM jsonb_array_elements(p_items) elem;

  -- Re-check against what we actually just inserted, not what the caller
  -- claimed — a mismatch here (e.g. the client miscounted) rolls back too.
  IF (SELECT COUNT(*) FROM public.batch_items WHERE batch_id = p_batch_id) <> p_beneficiary_count THEN
    RAISE EXCEPTION 'Inserted item count does not match expected beneficiary count for batch %', p_batch_id;
  END IF;

  UPDATE public.payment_batches
  SET beneficiary_count = p_beneficiary_count,
      total_amount = p_total_amount
  WHERE id = p_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_batch_items(UUID, JSONB, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_batch_items(UUID, JSONB, INTEGER, NUMERIC) TO authenticated;
