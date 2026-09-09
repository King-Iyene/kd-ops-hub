-- Make folders private by default and let admins see all folders.
-- 1. Set existing folders to private so only members/admins see them.
-- 2. Default new folders to is_private = true.
-- 3. Update SELECT policy so super_admin/admin roles always see every folder.

UPDATE public.project_spaces SET is_private = true WHERE is_private = false;

ALTER TABLE public.project_spaces ALTER COLUMN is_private SET DEFAULT true;

DROP POLICY IF EXISTS "spaces_visible" ON public.project_spaces;

CREATE POLICY "spaces_visible"
  ON public.project_spaces FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      -- Admins see everything
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'admin')
      )
      -- Owner/creator always sees their own
      OR owner_id = auth.uid()
      OR created_by = auth.uid()
      -- Members see folders they were added to
      OR EXISTS (
        SELECT 1 FROM public.space_members sm
        WHERE sm.space_id = id AND sm.user_id = auth.uid()
      )
    )
  );
