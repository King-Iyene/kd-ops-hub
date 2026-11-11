-- Snapshot/restore system for payment batch beneficiaries.
--
-- Built in direct response to a real incident: a batch's beneficiary list
-- was permanently destroyed by a silent save failure, with no copy of the
-- original data anywhere in the system — the only possible recovery path
-- was a whole-database Supabase backup restore (all-or-nothing, affects
-- every other table too) or manual re-entry from an external source.
--
-- This adds an application-level safety net that doesn't depend on
-- Supabase's infrastructure at all: every time a batch's items are about
-- to be replaced (replace_batch_items — the exact moment of risk in the
-- original incident), the CURRENT items are saved as a snapshot first.
-- restore_batch_items_snapshot() lets an operator bring any snapshot back
-- in one click from inside the app, no SQL, no dashboard, no waiting.

CREATE TABLE public.batch_item_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          uuid NOT NULL REFERENCES public.payment_batches(id) ON DELETE CASCADE,
  items             jsonb NOT NULL,
  beneficiary_count integer NOT NULL,
  total_amount      numeric NOT NULL,
  reason            text NOT NULL DEFAULT 'before_edit',
  created_by        uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS batch_item_snapshots_batch_idx
  ON public.batch_item_snapshots (batch_id, created_at DESC);

ALTER TABLE public.batch_item_snapshots ENABLE ROW LEVEL SECURITY;

-- Mirrors who can see/manage the batch itself — no direct writes from the
-- client at all; only the SECURITY DEFINER functions below ever insert
-- into or read from this table on the app's behalf via RPC, but a plain
-- SELECT policy still lets the "History" UI list snapshots directly.
CREATE POLICY "batch_item_snapshots_select" ON public.batch_item_snapshots
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('super_admin', 'admin', 'finance', 'operations'));

GRANT SELECT ON public.batch_item_snapshots TO authenticated;

-- Replace replace_batch_items() to snapshot the batch's current items
-- before touching anything. Everything else about it is unchanged from
-- 20261230000000_atomic_replace_batch_items.sql.
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
DECLARE
  existing_count integer;
  existing_total numeric;
BEGIN
  IF public.current_user_role() NOT IN ('super_admin', 'admin', 'finance', 'operations') THEN
    RAISE EXCEPTION 'Not authorized to edit payment batch items';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payment_batches WHERE id = p_batch_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Batch % not found', p_batch_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.batch_items
    WHERE batch_id = p_batch_id
      AND (paystack_reference IS NOT NULL OR flutterwave_reference IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot replace items: batch % already has dispatched items', p_batch_id;
  END IF;

  -- Snapshot whatever is currently there, even if that's zero items (a
  -- cheap, harmless row — and it correctly records "there was nothing to
  -- lose at this point" rather than leaving a gap in the history).
  SELECT COUNT(*), COALESCE(SUM(amount_ngn), 0) INTO existing_count, existing_total
  FROM public.batch_items WHERE batch_id = p_batch_id;

  INSERT INTO public.batch_item_snapshots (batch_id, items, beneficiary_count, total_amount, reason, created_by)
  SELECT
    p_batch_id,
    COALESCE(jsonb_agg(to_jsonb(bi.*) ORDER BY bi.created_at), '[]'::jsonb),
    existing_count,
    existing_total,
    'before_edit',
    auth.uid()
  FROM public.batch_items bi
  WHERE bi.batch_id = p_batch_id;

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

  IF (SELECT COUNT(*) FROM public.batch_items WHERE batch_id = p_batch_id) <> p_beneficiary_count THEN
    RAISE EXCEPTION 'Inserted item count does not match expected beneficiary count for batch %', p_batch_id;
  END IF;

  UPDATE public.payment_batches
  SET beneficiary_count = p_beneficiary_count,
      total_amount = p_total_amount
  WHERE id = p_batch_id;
END;
$$;

-- Bring a past snapshot back as the batch's current items — one click,
-- fully atomic (same transactional guarantee as replace_batch_items: if
-- anything fails, nothing changes). Takes its own "before" snapshot first
-- too, so restoring is itself undoable.
CREATE OR REPLACE FUNCTION public.restore_batch_items_snapshot(p_snapshot_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap RECORD;
  existing_count integer;
  existing_total numeric;
BEGIN
  IF public.current_user_role() NOT IN ('super_admin', 'admin', 'finance', 'operations') THEN
    RAISE EXCEPTION 'Not authorized to restore payment batch items';
  END IF;

  SELECT * INTO snap FROM public.batch_item_snapshots WHERE id = p_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.payment_batches WHERE id = snap.batch_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Batch % not found', snap.batch_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.batch_items
    WHERE batch_id = snap.batch_id
      AND (paystack_reference IS NOT NULL OR flutterwave_reference IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Cannot restore: batch % already has dispatched items', snap.batch_id;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount_ngn), 0) INTO existing_count, existing_total
  FROM public.batch_items WHERE batch_id = snap.batch_id;

  INSERT INTO public.batch_item_snapshots (batch_id, items, beneficiary_count, total_amount, reason, created_by)
  SELECT
    snap.batch_id,
    COALESCE(jsonb_agg(to_jsonb(bi.*) ORDER BY bi.created_at), '[]'::jsonb),
    existing_count,
    existing_total,
    'before_restore',
    auth.uid()
  FROM public.batch_items bi
  WHERE bi.batch_id = snap.batch_id;

  DELETE FROM public.batch_items WHERE batch_id = snap.batch_id;

  INSERT INTO public.batch_items (
    batch_id, contractor_id, employee_id, item_type, full_name, bank_name,
    account_number, amount_ngn, gross_amount_ngn, wht_rate, wht_amount_ngn,
    reference, status
  )
  SELECT
    snap.batch_id,
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
  FROM jsonb_array_elements(snap.items) elem;

  UPDATE public.payment_batches
  SET beneficiary_count = snap.beneficiary_count,
      total_amount = snap.total_amount
  WHERE id = snap.batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_batch_items_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_batch_items_snapshot(UUID) TO authenticated;
