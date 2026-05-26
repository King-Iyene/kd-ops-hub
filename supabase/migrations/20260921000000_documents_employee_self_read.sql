-- =============================================================================
-- Let employees read documents that belong to them.
--
-- The documents table has an employee_id column, but the only SELECT policy
-- gates on role membership in visible_to_roles — so an employee can't see their
-- own contract / ID / certificate even though it's filed against them. Add a
-- self-read policy. RLS policies are OR-combined, so this only WIDENS access
-- (employees gain their own rows); the existing role-based policy is untouched.
-- Upload/edit/delete remain manager-only.
-- =============================================================================

DROP POLICY IF EXISTS "documents_select_own" ON public.documents;
CREATE POLICY "documents_select_own" ON public.documents
  FOR SELECT TO authenticated
  USING (employee_id = auth.uid() AND deleted_at IS NULL);
