-- =============================================================================
-- cancel_batch_bulk(): mark every unresolved item in a batch as cancelled
--
-- Root-cause fix for the "batch shows as pending even after ops calls it
-- cancelled" report. Operators used to rename a failed batch's title with
-- "(CANCELLED)" to signal it was closed, but the underlying batch_items
-- never got is_manually_resolved=true / method='cancelled' — so the KPI
-- correctly treated their amounts as still-owed.
--
-- This RPC lets a finance / admin / super_admin caller cancel every
-- outstanding item in a batch in one shot. Each item still flows through
-- mark_batch_item_resolved so all its guarantees (role check, audit trail,
-- batch-status sync) apply. Items that are already succeeded or already
-- resolved are skipped so the operation is idempotent.
--
-- Returns { batch_id, cancelled_count, skipped_count } so the UI can toast
-- an accurate summary.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cancel_batch_bulk(
  p_batch_id uuid,
  p_note     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role            text;
  v_uid             uuid := auth.uid();
  v_cancelled_count int  := 0;
  v_skipped_count   int  := 0;
  v_item            record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'cancel_batch_bulk: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_role
    FROM public.profiles
   WHERE id = v_uid
     AND COALESCE(status, 'active') = 'active';

  IF v_role IS NULL OR v_role NOT IN ('super_admin','admin','finance') THEN
    RAISE EXCEPTION 'cancel_batch_bulk: role % may not cancel a batch', COALESCE(v_role, '(none)')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Sanity: batch must exist and not be archived.
  PERFORM 1 FROM public.payment_batches
    WHERE id = p_batch_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cancel_batch_bulk: batch % not found or archived', p_batch_id;
  END IF;

  -- Walk every item that is not already succeeded and not already resolved.
  -- We route through the existing mark_batch_item_resolved RPC per item so
  -- audit + batch-status sync run exactly the same way they do from the UI.
  FOR v_item IN
    SELECT id
      FROM public.batch_items
     WHERE batch_id = p_batch_id
       AND status <> 'succeeded'
       AND COALESCE(is_manually_resolved, false) = false
  LOOP
    BEGIN
      PERFORM public.mark_batch_item_resolved(
        p_item_id => v_item.id,
        p_method  => 'cancelled',
        p_note    => COALESCE(p_note, 'Batch cancelled in bulk')
      );
      v_cancelled_count := v_cancelled_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped_count := v_skipped_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id',        p_batch_id,
    'cancelled_count', v_cancelled_count,
    'skipped_count',   v_skipped_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_batch_bulk(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_batch_bulk(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_batch_bulk(uuid, text) IS
  'Marks every unresolved item in a batch as cancelled (is_manually_resolved '
  '= true, method = "cancelled") in one call. Same role gate as the per-item '
  'RPC. Idempotent — already-succeeded or already-resolved items skip.';
