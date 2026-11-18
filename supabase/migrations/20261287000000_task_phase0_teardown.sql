-- =============================================================================
-- Task module rebuild — Phase 0: teardown of every previous Task attempt
-- this session built, per explicit owner instruction ("delete everything
-- that is currently in the Task area, code and data, and replace it").
--
-- SAFETY: before any DROP, every TASK-ONLY table is copied in full into a
-- new `task_teardown_backup` schema inside the same database, with a
-- row-count assertion that aborts the whole migration if a copy doesn't
-- match. This is the backup step: there is no way for this session to pull
-- production rows out to a local file (no live DB connection other than
-- through this migration pipeline), so an in-database backup schema is
-- the faithful equivalent — verifiable in the same transaction, and left
-- in place afterwards (never dropped) so the data is recoverable.
--
-- WHAT IS NOT TOUCHED, AND WHY (read before changing this file):
-- `tasks`, `project_spaces`, `task_lists`, `task_assignees` and
-- `space_members` are kept. `tasks` and `project_spaces` are read
-- directly by other KD Ops modules (Dashboard, Goals, Projects,
-- FlexTables, EmployeeProfile) — confirmed by grep before writing this.
-- `task_lists`, `task_assignees` and `space_members` are NOT read by any
-- other module, but the CURRENT, LIVE row-level security on the shared
-- `tasks` table is implemented via can_access_task/can_edit_task, which
-- call effective_space_for_task -> effective_space_for_list (queries
-- task_lists) and can_access_space/can_edit_space (query space_members
-- and project_spaces) and can_access_task itself queries task_assignees
-- directly. Dropping any of those four tables, or the six functions
-- effective_space_for_list, effective_space_for_task, can_access_space,
-- can_edit_space, can_access_task, can_edit_task, would make every
-- query against the shared `tasks` table error immediately for every
-- module that reads it. Verified by reading the exact policy bodies in
-- 20261279000000_task_prd_phase1_access_control.sql before writing this
-- file. These six functions and four tables stay exactly as they are.
--
-- What IS removed from the shared `tasks` table: the status_id column,
-- the search_vector column (+ its index), and four triggers
-- (trg_enforce_status_same_space, trg_sync_task_status_fields,
-- trg_enforce_subtask_depth, trg_auto_watch_task_creator) — confirmed
-- none of these are referenced by the six kept functions or the
-- tasks_select/insert/update policies (which only read list_id,
-- project_id, created_by, assignee_id and task_assignees).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Backup every TASK-ONLY table into task_teardown_backup, verified.
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS task_teardown_backup;

DO $$
DECLARE
  tbls text[] := ARRAY[
    'task_comments', 'task_checklists', 'task_watchers', 'task_dependencies',
    'task_time_entries', 'task_templates', 'space_folders', 'space_statuses',
    'saved_views', 'task_activity',
    'custom_field_definitions', 'custom_field_values', 'custom_field_people', 'custom_field_task_links',
    'space_tags', 'task_space_tags', 'task_comment_reactions', 'dashboard_preferences',
    'workspace_members', 'workspaces', 'statuses',
    'tm_spaces', 'tm_space_members', 'tm_statuses', 'tm_lists', 'tm_tasks',
    'tm_task_assignees', 'tm_task_watchers', 'tm_comments'
  ];
  t text;
  src_count bigint;
  bak_count bigint;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TABLE IF EXISTS task_teardown_backup.%I', t);
      EXECUTE format('CREATE TABLE task_teardown_backup.%I AS SELECT * FROM public.%I', t, t);
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO src_count;
      EXECUTE format('SELECT count(*) FROM task_teardown_backup.%I', t) INTO bak_count;
      IF src_count IS DISTINCT FROM bak_count THEN
        RAISE EXCEPTION 'Phase 0 teardown aborted: backup row-count mismatch for % (source=%, backup=%)', t, src_count, bak_count;
      END IF;
      RAISE NOTICE 'task_teardown_backup.% : % rows backed up and verified', t, src_count;
    ELSE
      RAISE NOTICE '% does not exist, nothing to back up', t;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Remove the four Task-only triggers from the SHARED tasks table, and
--    the one Task-only trigger from the SHARED project_spaces table.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_enforce_status_same_space ON public.tasks;
DROP TRIGGER IF EXISTS trg_sync_task_status_fields ON public.tasks;
DROP TRIGGER IF EXISTS trg_enforce_subtask_depth ON public.tasks;
DROP TRIGGER IF EXISTS trg_auto_watch_task_creator ON public.tasks;
DROP TRIGGER IF EXISTS trg_seed_default_statuses ON public.project_spaces;

-- -----------------------------------------------------------------------------
-- 3. Remove the Task-only columns from the SHARED tasks table.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_tasks_search_vector;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS search_vector;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS status_id;

-- -----------------------------------------------------------------------------
-- 4. Drop every TASK-ONLY table (CASCADE clears their own policies,
--    triggers, indexes and foreign keys pointing at them).
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.tm_comments CASCADE;
DROP TABLE IF EXISTS public.tm_task_watchers CASCADE;
DROP TABLE IF EXISTS public.tm_task_assignees CASCADE;
DROP TABLE IF EXISTS public.tm_tasks CASCADE;
DROP TABLE IF EXISTS public.tm_lists CASCADE;
DROP TABLE IF EXISTS public.tm_statuses CASCADE;
DROP TABLE IF EXISTS public.tm_space_members CASCADE;
DROP TABLE IF EXISTS public.tm_spaces CASCADE;

DROP TABLE IF EXISTS public.workspace_members CASCADE;
DROP TABLE IF EXISTS public.workspaces CASCADE;
DROP TABLE IF EXISTS public.statuses CASCADE;

DROP TABLE IF EXISTS public.task_comment_reactions CASCADE;
DROP TABLE IF EXISTS public.task_space_tags CASCADE;
DROP TABLE IF EXISTS public.space_tags CASCADE;
DROP TABLE IF EXISTS public.dashboard_preferences CASCADE;

DROP TABLE IF EXISTS public.custom_field_people CASCADE;
DROP TABLE IF EXISTS public.custom_field_task_links CASCADE;
DROP TABLE IF EXISTS public.custom_field_values CASCADE;
DROP TABLE IF EXISTS public.custom_field_definitions CASCADE;

DROP TABLE IF EXISTS public.task_activity CASCADE;
DROP TABLE IF EXISTS public.saved_views CASCADE;
DROP TABLE IF EXISTS public.space_statuses CASCADE;
DROP TABLE IF EXISTS public.space_folders CASCADE;
DROP TABLE IF EXISTS public.task_templates CASCADE;
DROP TABLE IF EXISTS public.task_time_entries CASCADE;
DROP TABLE IF EXISTS public.task_dependencies CASCADE;
DROP TABLE IF EXISTS public.task_watchers CASCADE;
DROP TABLE IF EXISTS public.task_checklists CASCADE;
DROP TABLE IF EXISTS public.task_comments CASCADE;

-- -----------------------------------------------------------------------------
-- 5. Drop the now-orphaned TASK-ONLY functions. (effective_space_for_list,
--    effective_space_for_task, can_access_space, can_edit_space,
--    can_access_task, can_edit_task, current_user_role and
--    current_user_is_active are NOT in this list — they are load-bearing
--    for the shared tasks/project_spaces RLS and are kept.)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tm_auto_watch_assignee() CASCADE;
DROP FUNCTION IF EXISTS public.tm_auto_watch_creator() CASCADE;
DROP FUNCTION IF EXISTS public.tm_enforce_subtask_depth() CASCADE;
DROP FUNCTION IF EXISTS public.tm_sync_completed_at() CASCADE;
DROP FUNCTION IF EXISTS public.tm_seed_default_statuses() CASCADE;
DROP FUNCTION IF EXISTS public.tm_can_edit_task(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tm_can_access_task(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tm_space_of_task(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tm_space_of_list(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tm_can_edit_space(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tm_can_access_space(uuid) CASCADE;

DROP FUNCTION IF EXISTS public.auto_watch_task_assignee() CASCADE;
DROP FUNCTION IF EXISTS public.auto_watch_task_creator() CASCADE;
DROP FUNCTION IF EXISTS public.sync_task_status_fields() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_status_same_space() CASCADE;
DROP FUNCTION IF EXISTS public.seed_default_statuses() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_delete_status_in_use() CASCADE;
DROP FUNCTION IF EXISTS public.visible_people(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_manager_of(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_manager(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.workspace_role_of(uuid) CASCADE;

DROP FUNCTION IF EXISTS public.notify_task_comment_watchers() CASCADE;
DROP FUNCTION IF EXISTS public.notify_task_assignment() CASCADE;
DROP FUNCTION IF EXISTS public.set_dashboard_preferences_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.can_view_dashboard_of(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.enforce_subtask_depth() CASCADE;
DROP FUNCTION IF EXISTS public.mirror_custom_field_value() CASCADE;
DROP FUNCTION IF EXISTS public.enforce_custom_field_cap() CASCADE;

-- -----------------------------------------------------------------------------
-- 6. The four TASK-ONLY enum types (tm_task_priority, tm_status_category,
--    status_category, workspace_role) are deliberately NOT dropped here.
--    The backup tables created in step 1 (task_teardown_backup.tm_tasks,
--    .statuses, and so on) keep their original column types, which are
--    these enums — dropping the types would require CASCADE, which would
--    tear into the backup this migration exists to protect. An unused
--    enum type has no runtime cost and is not reachable from the product;
--    it is noted as an intentional leftover in docs/task/TEARDOWN.md.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 7. Confirm nothing of the old attempts remains (NOTICE only, not an
--    assertion, since this file is the removal itself).
-- -----------------------------------------------------------------------------
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM information_schema.tables
  WHERE table_schema = 'public' AND (
    table_name LIKE 'tm\_%' ESCAPE '\'
    OR table_name IN (
      'workspaces', 'workspace_members', 'statuses', 'task_comments', 'task_checklists',
      'task_watchers', 'task_dependencies', 'task_time_entries', 'task_templates',
      'space_folders', 'space_statuses', 'saved_views', 'task_activity',
      'custom_field_definitions', 'custom_field_values', 'custom_field_people',
      'custom_field_task_links', 'space_tags', 'task_space_tags',
      'task_comment_reactions', 'dashboard_preferences'
    )
  );
  RAISE NOTICE 'Phase 0 teardown complete. TASK-ONLY tables remaining in public schema: %', remaining;
END $$;
