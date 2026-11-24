-- Rolls back 20261438000000_timetrack_project_members.sql (everyone sees every project again).
DROP TRIGGER IF EXISTS time_entries_project_guard ON public.time_entries;
DROP FUNCTION IF EXISTS public.time_entries_project_guard();
DROP FUNCTION IF EXISTS public.time_project_set_access(uuid, boolean, uuid[]);
DROP FUNCTION IF EXISTS public.time_project_recent_trackers(uuid, integer);
DROP FUNCTION IF EXISTS public.time_my_project_ids();
DROP FUNCTION IF EXISTS public.time_can_track_project(uuid);
DROP TABLE IF EXISTS public.time_project_members;
ALTER TABLE public.time_projects DROP COLUMN IF EXISTS assigned_only;
