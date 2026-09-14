-- Admins/Super Admins get full access to the Task area: they can already
-- SEE every folder (private or not) via "spaces_visible"
-- (20261204000000_private_folders_admin_visibility.sql), but the UPDATE and
-- DELETE policies on project_spaces were never given the same bypass — an
-- admin who isn't the owner/creator/a space_member with role owner/admin of
-- a given folder still gets blocked by RLS when renaming, recoloring,
-- toggling privacy, or soft-deleting it (Tasks.tsx and Projects.tsx both
-- call project_spaces.update() directly for these actions).
--
-- Re-create both policies with the same admin/super_admin bypass already
-- used by "spaces_visible", so admins have full read+write access to every
-- folder regardless of ownership or membership.

DROP POLICY IF EXISTS "spaces_update" ON public.project_spaces;

CREATE POLICY "spaces_update"
  ON public.project_spaces FOR UPDATE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin')
    OR owner_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.space_members sm
      WHERE sm.space_id = id AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "spaces_delete" ON public.project_spaces;

CREATE POLICY "spaces_delete"
  ON public.project_spaces FOR DELETE TO authenticated
  USING (
    public.current_user_role() IN ('super_admin', 'admin')
    OR owner_id = auth.uid()
    OR created_by = auth.uid()
  );
