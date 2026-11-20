-- Rolls back 20261431000200_screenshot_storage_cleanup.sql.
-- Drops the trigger, the orphan-listing function and the queue. Files already removed from the bucket are not restorable.
DROP TRIGGER IF EXISTS time_screenshots_queue_object_delete ON public.time_screenshots;
DROP FUNCTION IF EXISTS public.queue_screenshot_object_delete();
DROP FUNCTION IF EXISTS public.timetrack_orphan_screenshot_objects(integer, interval);
DROP TABLE IF EXISTS public.storage_delete_queue;
NOTIFY pgrst, 'reload schema';
DROP INDEX IF EXISTS public.time_screenshots_storage_path_idx;
