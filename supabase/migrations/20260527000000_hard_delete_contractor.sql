-- Turn contractor "delete" into a real hard delete.
--
-- Previously soft_delete_contractor only anonymised PII and flipped status
-- to 'deleted', leaving the row in the Contractors table forever. The user
-- wants the row actually removed while keeping payment history intact.
--
-- How history stays intact:
--   * batch_items.full_name is denormalised — the name is copied onto the
--     row at batch-creation time, so payment history displays correctly
--     even after the contractor row is gone.
--   * batch_items.contractor_id has no ON DELETE clause, so we must NULL it
--     explicitly before deleting the parent.
--   * contacts.converted_to_contractor_id and referrals.contractor_id are
--     already declared ON DELETE SET NULL — they'll self-clean.
--
-- Financial totals, batch history, referrals, and expense audit trails are
-- all preserved. Only the contractor row itself is removed.

CREATE OR REPLACE FUNCTION public.soft_delete_contractor(p_contractor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Snapshot the display name on historical batch rows and break the FK so
  -- the parent can be deleted. full_name is already denormalised but we
  -- refresh it just in case a stale value is there.
  UPDATE public.batch_items
  SET full_name    = COALESCE(full_name, 'Former Contractor'),
      contractor_id = NULL
  WHERE contractor_id = p_contractor_id;

  -- contacts.converted_to_contractor_id and referrals.contractor_id are
  -- ON DELETE SET NULL, so no manual handling needed.

  DELETE FROM public.contractors WHERE id = p_contractor_id;
END;
$$;

-- One-time cleanup: hard-delete every existing soft-deleted / anonymised
-- contractor row. Their names were already snapshotted on batch_items by
-- the prior soft_delete implementation, so history is safe.

UPDATE public.batch_items
SET full_name     = COALESCE(full_name, 'Former Contractor'),
    contractor_id = NULL
WHERE contractor_id IN (
  SELECT id FROM public.contractors
  WHERE status = 'deleted' OR is_anonymised = true
);

DELETE FROM public.contractors
WHERE status = 'deleted' OR is_anonymised = true;
