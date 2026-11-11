-- "Duplicate batch" feature — clone an existing batch's beneficiaries into
-- a brand-new draft batch, in one atomic transaction (same pattern as
-- replace_batch_items: header counts are computed from what is ACTUALLY
-- copied, never trusted from the source's own stored header, so this can
-- never reproduce the "20 beneficiaries, 0 real rows" class of bug even if
-- the source batch being duplicated happens to be broken itself — it will
-- honestly show the real count, including zero.

CREATE OR REPLACE FUNCTION public.duplicate_payment_batch(p_source_batch_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source RECORD;
  new_batch_id uuid;
  copied_count integer;
  copied_total numeric;
BEGIN
  IF public.current_user_role() NOT IN ('super_admin', 'admin', 'finance', 'operations') THEN
    RAISE EXCEPTION 'Not authorized to duplicate a payment batch';
  END IF;

  SELECT * INTO source
  FROM public.payment_batches
  WHERE id = p_source_batch_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source batch % not found', p_source_batch_id;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount_ngn), 0)
    INTO copied_count, copied_total
  FROM public.batch_items
  WHERE batch_id = p_source_batch_id;

  new_batch_id := gen_random_uuid();

  INSERT INTO public.payment_batches (
    id, name, payment_date, period, notes,
    total_amount, beneficiary_count, batch_type,
    status, created_by
  ) VALUES (
    new_batch_id,
    source.name || ' (copy)',
    CURRENT_DATE,
    source.period,
    'Duplicated from "' || source.name || '".',
    copied_total,
    copied_count,
    source.batch_type,
    'draft',
    auth.uid()
  );

  INSERT INTO public.batch_items (
    batch_id, contractor_id, employee_id, item_type, full_name, bank_name,
    account_number, amount_ngn, gross_amount_ngn, wht_rate, wht_amount_ngn,
    reference, status
  )
  SELECT
    new_batch_id, contractor_id, employee_id, item_type, full_name, bank_name,
    account_number, amount_ngn, gross_amount_ngn, wht_rate, wht_amount_ngn,
    reference, 'pending'
  FROM public.batch_items
  WHERE batch_id = p_source_batch_id;

  RETURN new_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.duplicate_payment_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duplicate_payment_batch(uuid) TO authenticated;
