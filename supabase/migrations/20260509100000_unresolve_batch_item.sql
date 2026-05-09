-- ─────────────────────────────────────────────────────────────────
-- unresolve_batch_item — undo a manual resolution.
--
-- Operator asked for an Undo on Cancelled / Paid externally rows so
-- a misclick can be reversed without round-tripping through the
-- database team. Clears is_manually_resolved + the four resolution
-- columns and recomputes the parent batch's status.
--
-- Permissions match mark_batch_item_resolved — finance / admin /
-- super_admin only. The audit_log writes still happen on the front
-- end via logAudit so the trail captures both the resolution and
-- the un-resolution as separate audit events.
--
-- Why no time window:
--   The audit trail captures both actions cleanly. A 24-hour limit
--   would block legitimate undos for ops teams catching mistakes
--   on Monday after a Friday close-out, and the worst case
--   (operator un-cancels something that should have stayed
--   cancelled) is recoverable by re-cancelling.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.unresolve_batch_item(p_item_id uuid)
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
    RAISE EXCEPTION 'Only finance / admin / super_admin can undo a resolution'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT batch_id INTO v_batch_id FROM public.batch_items WHERE id = p_item_id;
  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Batch item not found' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.batch_items
  SET
    is_manually_resolved     = false,
    manual_resolution_at     = NULL,
    manual_resolution_by     = NULL,
    manual_resolution_method = NULL,
    manual_resolution_note   = NULL
  WHERE id = p_item_id;

  -- Recompute parent batch status now that this item is no longer
  -- counted as resolved. Bypasses the state-machine guard via the
  -- documented session GUC because we're applying a derived state.
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

GRANT EXECUTE ON FUNCTION public.unresolve_batch_item(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
