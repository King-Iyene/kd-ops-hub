-- =============================================================================
-- Bulk "Remove selected" on the Screenshots page needs a DELETE policy on
-- both the metadata table and the storage object itself — neither existed
-- before (only INSERT/SELECT were granted), so the delete silently no-opped
-- under RLS. Admins (or anyone granted manage_activity_tracking) only.
-- =============================================================================

CREATE POLICY "time_screenshots_delete" ON public.time_screenshots
  FOR DELETE TO authenticated USING (public.time_has_capability('manage_activity_tracking'));

DROP POLICY IF EXISTS "timetrack_screenshots_delete" ON storage.objects;
CREATE POLICY "timetrack_screenshots_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'timetrack-screenshots' AND public.time_has_capability('manage_activity_tracking'));

NOTIFY pgrst, 'reload schema';
