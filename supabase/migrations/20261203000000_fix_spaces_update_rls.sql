-- Fix: allow soft-deleting project_spaces (folders).
-- The existing UPDATE policy lacks WITH CHECK, so Postgres falls back to the
-- USING clause of the SELECT policy which requires deleted_at IS NULL — making
-- it impossible to set deleted_at on a row.  Re-create the UPDATE policy with
-- WITH CHECK (true) so the updated row passes even when deleted_at is set.

DROP POLICY IF EXISTS "spaces_update" ON public.project_spaces;

CREATE POLICY "spaces_update"
  ON public.project_spaces FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.space_members sm
      WHERE sm.space_id = id AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (true);

-- Also create a SECURITY DEFINER function so the app can soft-delete a space
-- even before this migration is applied (belt-and-suspenders).
CREATE OR REPLACE FUNCTION public.soft_delete_space(space_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE project_spaces
     SET deleted_at = now()
   WHERE id = space_id;
END;
$$;
