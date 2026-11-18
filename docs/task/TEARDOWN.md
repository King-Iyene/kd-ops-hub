# Phase 0 teardown record

## Database connection

This session has no live connection to the real KD Ops Supabase project (the
`Supabase` MCP tool in this environment points at unrelated projects). All
schema work in this repository, including this teardown, is written as a
migration file under `supabase/migrations/`, verified against a local
disposable PostgreSQL 16 instance (full replay of the real migration
history), and only takes effect in the real, single production database
when the migration is pushed to `main` and the repository's own
`deploy-supabase-migrations.yml` GitHub Actions workflow runs it. There is
no separate staging database for this project.

The teardown migration is `supabase/migrations/20261287000000_task_phase0_teardown.sql`.

## Backup

There is no way for this session to pull production rows out to a local
file: the only way this session can affect or read the real database is
through a migration that runs in the deploy pipeline. The equivalent given
that constraint: the teardown migration's first step copies every
TASK-ONLY table into a new `task_teardown_backup` schema inside the same
database (`CREATE TABLE task_teardown_backup.<name> AS SELECT * FROM
public.<name>`), with a row-count assertion per table that aborts the
entire migration (nothing commits) if a copy doesn't exactly match its
source. That schema is never dropped, so the data is recoverable for as
long as anyone wants it. This was verified locally against the replayed
migration history before being pushed.

## What was deleted (TASK-ONLY)

Tables (data backed up first, then dropped with CASCADE): `task_comments`,
`task_checklists`, `task_watchers`, `task_dependencies`, `task_time_entries`,
`task_templates`, `space_folders`, `space_statuses`, `saved_views`,
`task_activity`, `custom_field_definitions`, `custom_field_values`,
`custom_field_people`, `custom_field_task_links`, `space_tags`,
`task_space_tags`, `task_comment_reactions`, `dashboard_preferences`,
`workspace_members`, `workspaces`, `statuses`, and all eight `tm_*` tables
(`tm_spaces`, `tm_space_members`, `tm_statuses`, `tm_lists`, `tm_tasks`,
`tm_task_assignees`, `tm_task_watchers`, `tm_comments`).

Columns removed from the shared `tasks` table: `status_id`, `search_vector`
(and its GIN index).

Triggers removed from the shared `tasks` table: `trg_enforce_status_same_space`,
`trg_sync_task_status_fields`, `trg_enforce_subtask_depth`,
`trg_auto_watch_task_creator`. One trigger removed from the shared
`project_spaces` table: `trg_seed_default_statuses`.

Functions dropped: every function this session added for the two previous
Task rebuild attempts — `enforce_custom_field_cap`, `mirror_custom_field_value`,
`enforce_subtask_depth`, `can_view_dashboard_of`,
`set_dashboard_preferences_updated_at`, `notify_task_assignment`,
`notify_task_comment_watchers`, `workspace_role_of`, `is_workspace_member`,
`is_owner`, `is_admin`, `is_manager`, `is_manager_of`, `visible_people`,
`prevent_delete_status_in_use`, `seed_default_statuses`,
`enforce_status_same_space`, `sync_task_status_fields`,
`auto_watch_task_creator`, `auto_watch_task_assignee`,
`tm_can_access_space`, `tm_can_edit_space`, `tm_space_of_list`,
`tm_space_of_task`, `tm_can_access_task`, `tm_can_edit_task`,
`tm_seed_default_statuses`, `tm_sync_completed_at`,
`tm_enforce_subtask_depth`, `tm_auto_watch_creator`, `tm_auto_watch_assignee`.

Frontend: `src/pages/TaskApp.tsx` deleted outright. The `/task` route and
its import removed from `src/App.tsx`. The `taskModule` sidebar hub and nav
group removed from `src/lib/navConfig.ts`. Every dangling reference to the
now-gone `/task` route removed from `CommandPalette.tsx`, `MobileNav.tsx`,
`NotificationBell.tsx`, `AppLayout.tsx`, `Dashboard.tsx` and
`employee/TasksTab.tsx` (links/buttons removed rather than left pointing at
a dead route, consistent with "nothing unbuilt is reachable").

After this phase there is no Task entry point anywhere in KD Ops navigation.

## What was kept, and exactly why (read this before ever proposing to drop these)

`tasks` and `project_spaces` are **shared tables**, confirmed by grep before
writing the teardown: `tasks` is read directly by `Dashboard.tsx`,
`Goals.tsx`, `Projects.tsx`, `FlexTables.tsx` and `EmployeeProfile.tsx`;
`project_spaces` is read and written directly by `Projects.tsx`. Neither is
Task-only and neither was touched structurally beyond the specific
Task-only columns/triggers listed above.

`task_lists`, `task_assignees` and `space_members` are **not** read by any
module outside the old Task UI, but they are load-bearing for the *current,
live* row-level security on the shared `tasks` table. Read directly from
`20261279000000_task_prd_phase1_access_control.sql` before writing this
teardown:

- `tasks_select` / `tasks_insert` / `tasks_update` on the shared `tasks`
  table call `can_access_space(effective_space_for_task(list_id, project_id))`
  / `can_edit_space(...)`, plus a direct `EXISTS (... FROM task_assignees ...)`.
- `effective_space_for_task` calls `effective_space_for_list`, which queries
  `task_lists`.
- `can_access_space` / `can_edit_space` query `space_members` and
  `project_spaces`.

Dropping `task_lists`, `task_assignees` or `space_members`, or any of the
six functions `effective_space_for_list`, `effective_space_for_task`,
`can_access_space`, `can_edit_space`, `can_access_task`, `can_edit_task`,
would make every query against the shared `tasks` table error for every
module that reads it (Dashboard, Goals, Projects, FlexTables,
EmployeeProfile), because the policy expression itself would reference a
relation or function that no longer exists. All four tables and all six
functions are kept exactly as they were, untouched by this teardown.

This was verified after applying the teardown locally: as an authenticated
test user, reading and inserting into `tasks`, and reading `project_spaces`,
both still work correctly, and a non-member is still correctly denied.

`profiles`, `auth.users`, `reporting_manager_id`, `current_user_role()` and
`current_user_is_active()` are shared, pre-existing KD Ops infrastructure,
not created by any Task attempt, and were never touched.

## Intentional leftovers

Four enum types (`workspace_role`, `status_category`, `tm_status_category`,
`tm_task_priority`) are left in the schema, unused by anything reachable.
They are not dropped because the `task_teardown_backup` tables that hold
the real original data still use these exact types for their columns —
dropping a type that a table depends on requires `CASCADE`, which would
have torn into the backup this migration exists to protect. An unused
enum type has no runtime behaviour and is not reachable from the product.

## AMBIGUOUS (left untouched, listed for the owner)

None identified. Every object this session created for a Task module
attempt was traceable to one of the two rebuild attempts and classified
with confidence (see "What was deleted" and "What was kept" above). No
item required guessing.

## Old, pre-session Task module code (`src/pages/Tasks.tsx`,
`src/components/tasks/*`)

This code predates this session and is not reachable by any route after
this phase (the old `/tasks` route was already removed earlier in this
session, before the master rebuild prompt). It is left on disk, not
deleted, because two things outside the Task module import from it:
`Dashboard.tsx` imports `MyTasksWidget` from `src/pages/Tasks.tsx`, and
`PublicForm.tsx` imports `TaskFormPublic` from
`src/components/tasks/TaskFormPublic.tsx`. Removing the files would break
those two unrelated features. They are flagged here, not reused by the new
build, and kept purely as library code for those two call sites.

## Proof the app still works

- `npx tsc --noEmit` — clean.
- `npx eslint` on every touched file — clean.
- `npm run build` — succeeds.
- Local RLS test after applying the teardown migration: an authenticated
  user can read and insert into `tasks`; a non-member is still denied;
  `project_spaces` is still readable.
