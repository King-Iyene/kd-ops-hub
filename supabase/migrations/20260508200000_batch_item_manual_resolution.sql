-- Manual resolution flow for batch items.
--
-- Use case: a batch transfer fails (FCMB unreachable, account
-- dormant, recipient details wrong on file, etc.). The retry
-- window expires. The operator pays the recipient via their bank
-- app or a different rail and now has a real-world receipt
-- showing the money moved — but on the platform the batch is
-- stuck on "Partial" because one item is still status='failed'.
--
-- The fix: a `manual_resolution_*` set of columns on batch_items
-- captures that the item was resolved off-platform, by whom and
-- with what note. The `_derive_batch_status_from_items` function
-- counts manually-resolved items as "done" alongside succeeded
-- ones, so the batch lifts to 'processed' once everything is
-- accounted for.
--
-- We deliberately do NOT mutate the item's `status` column —
-- keeping it on 'failed' preserves the audit trail of the
-- original Paystack outcome. The resolution columns sit alongside
-- and the boolean drives the recompute. That way a finance
-- auditor reading the row still sees Paystack reported a failure;
-- the resolution metadata explains why the batch nevertheless
-- closed cleanly.

-- ── 1. Columns ────────────────────────────────────────────────────

ALTER TABLE public.batch_items
  ADD COLUMN IF NOT EXISTS is_manually_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_resolution_at  timestamptz,
  ADD COLUMN IF NOT EXISTS manual_resolution_by  uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS manual_resolution_note text,
  ADD COLUMN IF NOT EXISTS manual_resolution_method text
    CHECK (manual_resolution_method IS NULL OR manual_resolution_method IN (
      'bank_transfer', 'cash', 'cheque', 'other'
    ));

CREATE INDEX IF NOT EXISTS batch_items_manually_resolved_idx
  ON public.batch_items (batch_id)
  WHERE is_manually_resolved = true;

-- ── 2. Update the derive function ─────────────────────────────────
--
-- Re-creates the function from migration 20260506000000 (failed_status)
-- with one extra branch: a manually-resolved item now counts toward
-- v_succeeded so the batch lifts cleanly to 'processed' once every
-- item is either really succeeded OR manually resolved.

CREATE OR REPLACE FUNCTION public._derive_batch_status_from_items(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_succeeded int;
  v_failed int;
  v_pending int;
  v_unstarted int;
BEGIN
  SELECT count(*) INTO v_total FROM public.batch_items WHERE batch_id = p_batch_id;
  IF v_total = 0 THEN RETURN NULL; END IF;

  SELECT
    -- Succeeded == real Paystack success OR manually resolved.
    -- Both close the loop financially as far as the batch is
    -- concerned.
    count(*) FILTER (WHERE status = 'succeeded' OR is_manually_resolved = true),
    -- Failed-and-not-yet-resolved is what keeps the batch on
    -- 'failed' / 'partially_processed'. A failed-but-resolved
    -- item drops out of this count.
    count(*) FILTER (WHERE status IN ('failed','reversed') AND is_manually_resolved = false),
    count(*) FILTER (WHERE status IN ('pending','retry') AND paystack_reference IS NOT NULL),
    count(*) FILTER (WHERE paystack_reference IS NULL AND status NOT IN ('succeeded','failed','reversed'))
  INTO v_succeeded, v_failed, v_pending, v_unstarted
  FROM public.batch_items
  WHERE batch_id = p_batch_id;

  IF v_pending > 0 THEN
    RETURN 'processing';
  ELSIF v_unstarted > 0 AND v_succeeded > 0 THEN
    RETURN 'partially_processed';
  ELSIF v_unstarted > 0 AND v_succeeded = 0 THEN
    RETURN 'funded';
  ELSIF v_failed = v_total THEN
    RETURN 'failed';
  ELSIF v_failed > 0 THEN
    RETURN 'partially_processed';
  ELSE
    RETURN 'processed';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public._derive_batch_status_from_items(uuid)
  TO authenticated, service_role;

-- ── 3. RPC: mark a single failed item as manually resolved ────────
--
-- Single entry point so the UI doesn't need to know about the
-- column quartet. Called from BatchDetail's row action menu;
-- recomputes the parent batch's derived status afterwards so the
-- header pill updates without a round-trip.

CREATE OR REPLACE FUNCTION public.mark_batch_item_resolved(
  p_item_id uuid,
  p_method  text,
  p_note    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_batch_id    uuid;
  v_new_status  text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin', 'finance') THEN
    RAISE EXCEPTION 'Only finance / admin / super_admin can resolve a failed transfer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT batch_id INTO v_batch_id FROM public.batch_items WHERE id = p_item_id;
  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch item not found' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.batch_items
  SET
    is_manually_resolved     = true,
    manual_resolution_at     = now(),
    manual_resolution_by     = auth.uid(),
    manual_resolution_method = p_method,
    manual_resolution_note   = p_note
  WHERE id = p_item_id;

  -- Recompute the parent batch's status now that this item counts
  -- as done. Bypasses the state-machine guard via the documented
  -- session GUC because we're applying a derived state, not a
  -- user-facing transition.
  PERFORM set_config('kdops.allow_state_override', 'true', true);
  v_new_status := public._derive_batch_status_from_items(v_batch_id);
  IF v_new_status IS NOT NULL THEN
    UPDATE public.payment_batches
    SET status = v_new_status
    WHERE id = v_batch_id
      AND status IS DISTINCT FROM v_new_status;
  END IF;
  PERFORM set_config('kdops.allow_state_override', 'false', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_batch_item_resolved(uuid, text, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
