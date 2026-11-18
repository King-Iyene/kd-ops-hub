# Task module rebuild — progress

Read this file first if resuming after a conversation restart. It is the
memory of record; continue from the last phase marked **delivered**.

| Phase | Name | Status | Deployed | Notes |
|---|---|---|---|---|
| 0 | Teardown | delivered | yes (`4010e0f` on `main`) | See report below and `TEARDOWN.md` |
| 1 | Database foundation | delivered | yes (`01b38ba` on `main`, workflow run 44252109096, success) | See report below |
| 2 | Shell and spaces | not started | | |
| 3 | Lists and tasks, core | not started | | |
| 4 | Task views and tools | not started | | |
| 5 | Task panel extras, field engine | not started | | |
| 6 | My Tasks | not started | | |
| 7 | Home | not started | | Needs S6 screenshot (not yet received) |
| 8 | Notifications and Inbox | not started | | |
| 9 | Tables, part 1 | not started | | |
| 10 | Tables, part 2 | not started | | |
| 11 | Team Dashboard | not started | | |
| 12 | Command palette, shortcuts, phone polish | not started | | |
| 13 | Scheduled jobs, QA, final report | not started | | |

## Open items carried forward

- **S6 (Home) screenshot missing.** Only S1-S5 were ever attached to this
  conversation as real files. Needed before Phase 7.
- `tk_` prefix and `/task` route prefix are locked in (section 4.2 of the
  master prompt and `DECISIONS.md`).
- Role mapping locked in: `super_admin`->owner, `admin`->admin, has direct
  reports and not already owner/admin->manager, everyone else->member.
  See `DECISIONS.md`.
- `profiles.timezone` not yet added (allowed addition, PRD section 4.3) —
  add it when Phase 1 needs it.
- Deployment = merge `feat/task-module-rebuild` into `main` (no separate
  preview environment exists in this project). See `DECISIONS.md`.

## Phase 0 report

**Phase 0: Teardown, done.**

- Commit: (recorded after commit, see git log on `feat/task-module-rebuild`)
- Branches: `backup/pre-task-rebuild` (untouched), `feat/task-module-rebuild` (this work)

**What was removed:** every database object and frontend file created by
this session's two earlier Task rebuild attempts (full list in
`TEARDOWN.md`), with a verified in-database backup taken first. The `/task`
route, the Task sidebar entry, and every dangling link to it are gone.
There is no Task entry point anywhere in KD Ops navigation right now.

**What was kept, deliberately:** the shared `tasks` and `project_spaces`
tables (read by Dashboard, Goals, Projects, FlexTables, EmployeeProfile),
and four tables plus six functions that are load-bearing for the *current*
row-level security on the shared `tasks` table even though their content
is Task-specific (`task_lists`, `task_assignees`, `space_members`, and
`effective_space_for_list`, `effective_space_for_task`,
`can_access_space`, `can_edit_space`, `can_access_task`, `can_edit_task`).
Full reasoning and the exact policy text that proves the dependency is in
`TEARDOWN.md`.

**Verification done:**
- Applied the teardown migration against a local disposable PostgreSQL 16
  instance replaying the full real migration history first.
- After teardown, confirmed as a simulated authenticated user: reading
  and inserting into the shared `tasks` table still works; a non-member
  is still correctly denied; `project_spaces` is still readable.
- `npx tsc --noEmit`, `npx eslint` on every touched file, and
  `npm run build` all pass clean.

**Known gaps:** none for this phase's own scope.

**Decisions I made:** see `DECISIONS.md` — the role mapping, the
`profiles_directory` view discovery, the `tk_`/`/task` prefixes, the
branch-then-merge-to-main deployment approach (no separate preview
environment exists), and the S6 screenshot gap.

**Next:** Phase 1 — database foundation (section 9): every `tk_` table,
enum, helper function, RLS policy and trigger, the workspace row, the
dashboard template, the storage bucket, generated types. No screens.

## Phase 1 report

**Phase 1: Database foundation, done.**

- Commits: `ec9fcba` (`feat/task-module-rebuild`), merged to `main` as
  `01b38ba`.
- Deploy: GitHub Actions workflow run
  [44252109096](https://github.com/King-Iyene/kd-ops-hub/actions/runs/44252109096)
  (`Deploy Supabase Migrations`) — `success`.

**What was built:** the full `tk_` database foundation per section 9 of the
master prompt — 11 enum types; the `tk_workspaces` table seeded with the
single `KD Squares` row; every `tk_` table from sections 7.2-7.6 (spaces,
space members, statuses, tags, lists, tasks, assignees, watchers, task
tags, checklists and items, custom-field mirror tables for people/links,
data tables, fields, records, record mirror tables, forms, views,
dashboards and cards, comments, reactions, attachments, notifications,
activity log); the `tk_role_of` helper function deriving role from
`profiles.role`/`reporting_manager_id` (no new membership table, per the
master prompt); one SELECT policy plus separate INSERT/UPDATE/DELETE
policies per table; triggers for subtask-depth limits, same-space status
enforcement, completed-at sync, auto-watch on create/assign plus the
assignment notification, comment-watcher and mention notifications, status
change notifications, the 50-field cap and select-options-required
validation, polymorphic-parent cleanup, the custom-field and record-field
mirror triggers, search-vector sync, and activity logging; the dashboard
template row (`scope = 'template'`, name `Home`) with its 7 seeded cards
and the `tk_get_or_create_my_dashboard()` function that copies it per
user; the private `tk-attachments` storage bucket with its 3 RLS-scoped
policies. No screens, no nav entry, nothing reachable from the UI yet —
this phase is database-only.

**What you can test now:** there is no Task UI yet, so there is nothing to
click. "Testing" this phase means confirming the rest of KD Ops still
works exactly as before — Dashboard, Goals, Tables, Projects, Time
Tracker, Employee Profiles — since Phase 1 only adds new `tk_` objects and
touches nothing shared. I ran a full local verification (16/16 checks
passing) against a disposable PostgreSQL 16 instance replaying the real
migration history, covering role mapping, space creation and RLS
(including public vs. private spaces), list/task creation, auto-watch,
status-change side effects, cross-space status rejection, subtask-depth
limits, the people custom-field mirror, select-field option validation,
assignment notifications, personal dashboard seeding, dashboard visibility,
and the 50-field cap.

**Compare with:** none — no screens exist yet to compare against S1-S5.

**Known gaps:** none for this phase's own scope. `profiles.timezone` is
still the one allowed addition not yet made (not needed until a phase that
displays times).

**Decisions I made:**
- `tk_role_of` role mapping (`super_admin`->owner, `admin`->admin, has
  active direct reports and not already owner/admin->manager, else
  member) — recorded in `DECISIONS.md`.
- No `tk_workspace_members` table — workspace-level role comes from
  `tk_role_of` over existing `profiles` data, per the master prompt's own
  instruction not to add a membership table.
- Verification was done locally only (no staging environment exists in
  this project); production correctness was confirmed by the successful
  GitHub Actions deploy run above, not by a second live test pass.

**Next:** Phase 2 — shell and spaces.

Reply `continue` to start Phase 2, or tell me what to fix.
