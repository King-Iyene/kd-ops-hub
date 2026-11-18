-- =============================================================================
-- Task module rebuild — Phase 4: task views and tools.
--
-- AC-11 ("a task dragged across a board updates for a second person
-- watching it within about a second") and section 9.7's live-updates
-- requirement need Postgres changes to actually reach connected clients.
-- No tk_ table was ever added to the supabase_realtime publication in
-- Phase 1 through 3 — none of those phases needed it yet. Add the tables
-- this phase's views and the open task panel subscribe to.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fix: tk_views_select never checked is_shared or created_by, so a private
-- view (created either by hand or now through this phase's "+ View"
-- dialog) was visible to anyone who could see the list or table, not just
-- its creator. Phase 1 built this before the UI ever exposed the private
-- or shared choice, so nothing surfaced it until now. The update and
-- delete policies already got this right — mirror the same shape here.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "tk_views_select" ON public.tk_views;
CREATE POLICY "tk_views_select" ON public.tk_views FOR SELECT TO authenticated USING (
  created_by = (select auth.uid()) OR (is_shared AND public.tk_can_access_field_parent(parent_type, parent_id))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tk_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tk_tasks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tk_task_assignees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tk_task_assignees;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tk_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tk_comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tk_activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tk_activity_log;
  END IF;
END;
$$;
