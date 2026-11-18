-- =============================================================================
-- Task module rebuild — Phase 2: shell and spaces.
--
-- Phase 1 already created tk_spaces with RLS that intentionally makes an
-- archived space fully read-only (section 10.10 of the master prompt:
-- "archived spaces can still be read ... but nobody can edit them"). That is
-- correct for ordinary edits, but it also blocks the one action Phase 2
-- needs to be reversible (behaviour rule 10.6: "archive instead of delete,
-- with an eight-second undo"): once archived_at is set, the standard
-- tk_spaces UPDATE policy's USING clause (tk_can_edit_space, which requires
-- archived_at IS NULL) can never again select that row, so nobody — not
-- even an admin — could ever clear archived_at back to NULL through a plain
-- UPDATE. A dedicated SECURITY DEFINER function is the standard way to grant
-- one specific, narrow action without reopening the row to ordinary edits.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tk_set_space_archived(p_space_id uuid, p_archived boolean)
RETURNS public.tk_spaces
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.tk_spaces;
  v_allowed boolean;
BEGIN
  SELECT (
    public.tk_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.tk_space_members sm
      WHERE sm.space_id = p_space_id AND sm.user_id = auth.uid() AND sm.role = 'editor'
    )
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'You do not have permission to archive this space.';
  END IF;

  UPDATE public.tk_spaces
  SET archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
  WHERE id = p_space_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Space not found.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tk_set_space_archived(uuid, boolean) TO authenticated;
