-- Screenshot image files were never deleted.
--
-- Retention (purge_old_activity_logs, 20261250000000) deletes time_activity_logs rows; time_screenshots rows go with
-- them (ON DELETE CASCADE), but the image files in the private bucket `timetrack-screenshots` stayed forever. The same
-- happens when an employee is deleted. (The Screenshots page's own "Remove selected" removes the file itself.)
--
-- Supabase blocks a direct DELETE on storage.objects (it must go through the Storage API), so the fix is a queue plus a
-- worker:
--   1. an AFTER DELETE trigger on time_screenshots queues the file path of every removed row in storage_delete_queue;
--      so only files whose row is ALREADY gone are ever queued, and the retention cutoff stays exactly as it was;
--   2. the timetrack-screenshot-cleaner edge function (daily, capped per run) removes queued files through the Storage
--      API, after re-checking that no time_screenshots row still points at the path;
--   3. timetrack_orphan_screenshot_objects() lists bucket objects that have NO row (files already left behind by past
--      purges, or uploads whose row insert failed). The cleaner removes them only when asked ({"sweep_orphans": true}).
--
-- Idempotent: CREATE ... IF NOT EXISTS / OR REPLACE; no existing row or object is touched.

CREATE TABLE IF NOT EXISTS public.storage_delete_queue (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket     text        NOT NULL,
  path       text        NOT NULL,
  queued_at  timestamptz NOT NULL DEFAULT now(),
  attempts   integer     NOT NULL DEFAULT 0,
  last_error text,
  UNIQUE (bucket, path)
);

-- Service role only: RLS on, no policies, no grants to the app roles.
ALTER TABLE public.storage_delete_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_delete_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storage_delete_queue TO service_role;

CREATE OR REPLACE FUNCTION public.queue_screenshot_object_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL AND OLD.storage_path <> '' THEN
    INSERT INTO public.storage_delete_queue (bucket, path)
    VALUES ('timetrack-screenshots', OLD.storage_path)
    ON CONFLICT (bucket, path) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_screenshot_object_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_screenshots_queue_object_delete ON public.time_screenshots;
CREATE TRIGGER time_screenshots_queue_object_delete
  AFTER DELETE ON public.time_screenshots
  FOR EACH ROW EXECUTE FUNCTION public.queue_screenshot_object_delete();

-- The orphan listing and the cleaner's "is it still referenced" check look rows up by path.
CREATE INDEX IF NOT EXISTS time_screenshots_storage_path_idx ON public.time_screenshots (storage_path);

-- Objects in the bucket with no time_screenshots row. A grace period (default 2 days) leaves out a file that was just
-- uploaded and whose row has not been inserted yet (the agent uploads, then inserts).
CREATE OR REPLACE FUNCTION public.timetrack_orphan_screenshot_objects(p_limit integer DEFAULT 1000, p_min_age interval DEFAULT interval '2 days')
RETURNS TABLE (name text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name, o.created_at
    FROM storage.objects o
   WHERE o.bucket_id = 'timetrack-screenshots'
     AND o.created_at < now() - p_min_age
     AND NOT EXISTS (SELECT 1 FROM public.time_screenshots s WHERE s.storage_path = o.name)
   ORDER BY o.created_at
   LIMIT greatest(least(coalesce(p_limit, 1000), 5000), 0)
$$;
REVOKE ALL ON FUNCTION public.timetrack_orphan_screenshot_objects(integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.timetrack_orphan_screenshot_objects(integer, interval) TO service_role;

COMMENT ON TABLE public.storage_delete_queue IS
  'Files to remove from Storage through the API after their database row is gone. Filled by triggers, drained by edge functions (service role only).';

NOTIFY pgrst, 'reload schema';
