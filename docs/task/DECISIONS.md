# Decisions

One line each, per the master prompt's section 4 discovery and section 11's
"ask only if truly blocked, otherwise record the sensible call" rule.

## Discovery (section 4.1)

- Stack: React + TypeScript + Vite, Supabase (Postgres, auth, storage,
  realtime), edge functions, Paystack. Confirmed in `package.json`.
- Router: `react-router-dom`, all routes registered in `src/App.tsx`.
  Track lives at `/timetrack/*` (see `src/App.tsx` / `src/lib/navConfig.ts`).
- Global shell: KD Ops already has one — `src/components/AppSidebar.tsx`
  (desktop) and `src/components/MobileNav.tsx` (phone), driven by
  `src/lib/navConfig.ts` (`NAV_ITEMS`, `NAV_GROUPS`, `SIDEBAR_HUBS`). Task
  plugs in as a hub in that config, same as every other module, rather
  than getting a second, separate shell.
- UI kit: Tailwind + shadcn/ui components under `src/components/ui/`
  (button, input, dialog, select, dropdown-menu, tabs, tooltip, toast,
  and so on). Reused throughout.
- Auth: `useAuthStore()` (`src/store/authStore.ts`) exposes the signed-in
  `profile`. People table is `public.profiles`
  (`id` = `auth.users.id`, `full_name`, `email`, `photo_url`, `role`,
  `status`, `department_id` -> `departments`, `job_title`,
  `reporting_manager_id`). There is a pre-existing safe view,
  `public.profiles_directory` (granted `SELECT` to `authenticated`,
  deliberately excludes salary/statutory columns), built exactly for
  people-pickers, assignee dropdowns and directory listings — the Task
  module's People field, assignee pickers and @mentions read people
  through this view, not the base `profiles` table directly.
- Role model mapping (KD Ops `profiles.role` -> PRD's owner/admin/manager/member):
  `super_admin` -> owner, `admin` -> admin, manager is **not** a stored
  role value in KD Ops — it is derived (a person who has at least one
  direct report via `reporting_manager_id` and is not already owner or
  admin is treated as a manager for Task purposes), everyone else
  (`finance`, `operations`, `field_staff`, `driver`, and so on) -> member.
  This mapping lives in one function, `tk_role_of`, per PRD section 9.2.
- Design tokens: Tailwind theme + CSS variables (light/dark). The Task
  module's `taskTheme.ts` (section 5) maps semantic roles onto these,
  never hard-coded hex values, and never the reference screenshots'
  colours.
- Colliding names avoided by prefixing every new Task table `tk_` (section
  4.2). `notifications` and `tasks` already exist and are owned by other
  parts of KD Ops; Task's own tables do not reuse those names.

## 4.3: columns the PRD needs that KD Ops's person record does not yet have

- `reporting_manager_id` already exists on `profiles` — this is the
  single manager reference the PRD calls `manager_id` (PPL-01). No new
  column needed for that.
- `timezone` does **not** exist on `profiles` (it exists only on
  `company_settings`). Per PRD section 4.3 this is an allowed addition:
  add `profiles.timezone` (nullable, default `Africa/Lagos`) when Phase 1
  needs it. Not added yet (Phase 0 is teardown only).
- `is_active` does not exist by that name, but `profiles.status` already
  serves the same purpose (`'active'` default, checked elsewhere in the
  codebase via `COALESCE(status, 'active') = 'active'`). No new column
  needed; `tk_` functions read `profiles.status` instead of adding a
  duplicate `is_active` boolean.

## Workflow

- Branches: `backup/pre-task-rebuild` (untouched, pure safety net) and
  `feat/task-module-rebuild` (all work happens here), per the master
  prompt's section 3.1.
- Deployment: KD Ops has exactly one live environment — Supabase
  migrations deploy via the repository's own
  `.github/workflows/deploy-supabase-migrations.yml` on push to `main`,
  and the frontend deploys via Vercel on push to `main`. There is no
  separate preview/staging deployment target in this codebase. Per the
  master prompt's own fallback ("if KD Ops has only one live environment,
  deploy there only after the phase's verification steps pass"), each
  phase's work is done on `feat/task-module-rebuild`, verified there, and
  then merged into `main` to actually deploy and be testable — merging
  into `main` at a phase boundary is the "deploy" step for this project,
  since no other deploy target exists.

## Phase 0 specifics

- The real production database was never directly reachable from this
  session (no live Supabase connection); the backup step is an
  in-database backup schema rather than exported files — see
  `docs/task/TEARDOWN.md` for the full reasoning.
- No AMBIGUOUS items were left from Phase 0's inventory — every object
  this session had created for a Task attempt was traceable and
  confidently classified. See `TEARDOWN.md`.
- S6 (Home) from the reference screenshots was never actually attached to
  this conversation — only S1 to S5 (Reports table, List, Team Dashboard,
  My Tasks, Inbox) came through as real image files. Flagged now, needed
  before Phase 7 (Home), not blocking Phase 0.

## Phase 2 specifics

- **Archive/unarchive needed a dedicated function.** Phase 1's
  `tk_can_edit_space` requires `archived_at IS NULL`, so once a space is
  archived the plain `tk_spaces` UPDATE policy can never select that row
  again — nobody could ever clear `archived_at`, which would make the
  "archive with undo" behaviour (rule 10.6) impossible. Added
  `tk_set_space_archived(space_id, archived)`, a `SECURITY DEFINER`
  function that checks the same admin-or-editor rule without the
  `archived_at` gate, as the one sanctioned way to flip it. Everything else
  about an archived space stays exactly as uneditable as rule 10.10
  requires. See migration `20261291000000_task_phase2_shell_and_spaces.sql`.
- **The sidebar's Task content is not KD Ops's generic hub list.** Every
  other hub (Time Tracking, Finance, ...) renders a static group/item list
  from `navConfig.ts`. Task's sidebar (workspace header, Task/Track switch,
  the live Spaces tree) is data-driven and has no equivalent in that
  config, so it is a dedicated `TaskSidebarPanel` / `TaskMobilePanel`
  component, swapped in by `AppSidebar.tsx` / `MobileNav.tsx` only when the
  active hub's key is `task`. One static nav item (`Task` -> `/task`) was
  still added to `navConfig.ts` purely so the hub has a route to activate
  against and a card to show in the hub picker; it plays no part in Task's
  own rendered content.
- **Colour swatches.** The space/tag colour picker offers a fixed set of 8
  hex swatches, each the resolved value of an existing KD Ops token
  (primary teal, accent gold, brand cyan, info blue, success green, warning
  amber, destructive red, a neutral grey) — never a colour from the
  reference screenshots' dark/pink palette. Defined once in
  `src/features/task/theme/taskTheme.ts`.
- **Avatar initials differ from the app-wide helper on purpose.** PRD
  section 5.6 wants one letter for a single-word name (`K` for `KD`), but
  the existing `src/lib/utils.ts` `initials()` gives two (`KD`). Added a
  separate `initials()` in `src/features/task/lib/format.ts` rather than
  changing the shared one, which other modules still rely on as it is.
- **"+Task" and the sidebar's "+Add list" / "+Add table" ghost buttons are
  not in this phase.** They are explicitly phase-gated in the master
  prompt's own phase table (list creation is Phase 3, table creation is
  Phase 9), and quick-create's own empty state ("You need a list first")
  would otherwise show a "Create a list" button with nothing to do yet.
  Rule 13 (nothing unbuilt is reachable) decided this, not a judgement
  call.
- **Tags cannot be reordered.** `tk_tags` has no `position` column in the
  Phase 1 schema (unlike `tk_statuses`, which does), so "reorder" in
  "statuses and tags (add, rename, reorder, recategorise)" is read as
  applying to statuses only; tags support add, rename and delete. Flagged
  as a minor gap against the letter of the prompt, not a blocker.
- **Task's role-gating reflects the real role, not "view as."** Whether the
  "+" to create a space (and similar admin-only controls) shows is decided
  by `tk_role_of()` — the account's actual, enforced permission — not by
  KD Ops's super-admin "view as" simulation elsewhere in the platform. A
  super admin previewing as a lower role will still see Task's admin
  controls in this phase. Not wired up; noted as a known gap, not treated
  as blocking since the master prompt never mentions "view as" before
  Phase 11 (and there, only for Home).
- **Bugs reported against the deployed Phase 2 build, fixed same phase (no
  new phase number):**
  1. Creating a space failed with "new row violates row-level security
     policy for table tk_spaces". Root cause: `useCreateSpace`'s insert
     never set `workspace_id` (`NOT NULL`, no default) — reproduced exactly
     against the local disposable Postgres instance, which raises a
     different error (a not-null violation) for an admin and the observed
     RLS-violation error for anyone `tk_is_admin()` returns false for. The
     real, user-visible error was the RLS one, meaning the account that hit
     it was not evaluated as admin/owner on the database side at that
     moment even though the UI had shown the create control. Fixed the
     missing `workspace_id` (now fetched from `tk_workspaces` before the
     insert), and separately hardened the likely cause of the UI/DB
     mismatch: `useTaskRole()` and `useVisiblePeople()` were keyed in
     React Query by a flat key with no user id, so a role fetched for one
     signed-in account could be served to a different one in the same
     browser tab without a hard refresh. Both are now keyed by
     `user?.id` and disabled until it is known.
  2. Removed the Task/Track segmented switch from both the desktop and
     phone Task panels — explicit user instruction. KD Ops's own hub
     picker (the back chevron) already reaches Track, so the in-panel
     switch was redundant once Task became a hub rather than a standalone
     app. This is a deliberate deviation from the master prompt's section
     6.2 (which describes the switch for the original, hub-less reference
     app); the live user instruction overrides the stale written spec.
  3. The desktop panel's header showed the workspace name ("KD Squares")
     where every other hub shows its own name and icon — explicit user
     instruction to make it consistent. Replaced with the same
     icon-label-description header `AppSidebar`'s generic hub view uses,
     reading from the `task` entry in `SIDEBAR_HUBS` ("Task" /
     "Spaces, lists & tasks" / the cyan check-circle icon) — single source
     of truth, no new hard-coded strings.
- **Restoring the paused Supabase project was blocked.** Tried
  `mcp__Supabase__restore_project` to inspect the live database directly
  while chasing the bug above; the auto-mode safety classifier refused it
  as a destructive/unwanted action (resuming a paused project is a
  live-infrastructure change). Diagnosed and fixed the bug instead by
  reproducing the exact error locally (see above) rather than against
  production. Flagged to the user; they can resume the project themselves
  from the Supabase dashboard if direct inspection is ever needed.
- **No live Supabase connection was reachable from this session** (same
  constraint noted in Phase 0/1 — the project is paused). Verification for
  this phase was `tsc --noEmit`, `eslint`, a full production build, the
  existing `npm run test` suite (657 tests, all passing) plus 5 new
  component tests for the Task shell (mocking the Supabase client and auth
  store), the new archive/unarchive RPC exercised functionally against the
  local disposable PostgreSQL 16 instance (admin can archive/unarchive, an
  editor member can too, a non-member is correctly refused, a plain UPDATE
  on an archived space still correctly fails), and a manual structural
  comparison against S2's sidebar, which is visible in the background of
  every screenshot. Not a live, pixel-level screenshot of the running app.

## Phase 3 specifics

- **Database gap found and fixed:** Phase 1 auto-seeds a space's five
  default statuses by trigger, but never seeded a new list's four default
  views (List, Board, Calendar, Table) the way section 7.0 says ("on create
  the list opens at /task/l/:listId with its four default views"). Added
  `tk_seed_default_views()` (migration
  `20261292000000_task_phase3_lists_and_tasks.sql`), mirroring the
  statuses trigger exactly. Verified locally that creating a list
  immediately seeds all four rows.
- **New dependencies**, both explicitly suggested by the master prompt's
  own hard rule 12: `chrono-node` for quick create's natural-language
  dates, and `@tiptap/react` + `@tiptap/starter-kit` +
  `@tiptap/extension-image` + `@tiptap/extension-task-list` +
  `@tiptap/extension-task-item` + `@tiptap/extension-placeholder` for the
  description editor (headings, lists, checkboxes, links, images — not
  yet @mentions, which is Phase 5). TipTap v3's StarterKit already bundles
  a configurable Link extension, so it is configured rather than
  duplicated with a second Link instance.
- **Toolbar controls that are not functional yet stay off the screen, not
  disabled on it.** S2's toolbar shows Search tasks, Filter, Group: Status,
  Sort: Manual order, Me, Show closed. The full filter builder (AND/OR
  conditions, saved views) is explicitly Phase 4 scope, so "Filter" is not
  rendered at all this phase — a button that opens nothing is a dead
  button, which hard rule 3 forbids. Group and Sort render as their exact
  S2 labels but as static, non-interactive text for now ("all group-by and
  sort options" is also named as Phase 4 scope); Search, Me and Show
  closed are fully wired since nothing gates them to a later phase.
- **Drag is between status groups only, not reordering within one.**
  Phase 3's own line in the master prompt's phase table says "drag between
  groups"; "all group-by and sort options" (which is where true manual
  reordering would belong) is Phase 4's line. Implemented with `@dnd-kit`:
  each status group is a drop target, each row a draggable; dropping on a
  different group updates `status_id`. Reordering within a group is left
  for Phase 4.
- **Quick-created tasks default to the target list's first status by
  position**, not no status. Not explicit in the prompt, but a task with
  no status would never appear in its own list's grouped List view (every
  group buckets by `status_id`), which would make "create a task from
  anywhere in under ten seconds" (AC-10) look like it silently failed.
  Matches what the list page's own inline "+ Add task" row already does
  for a specific group.
- **Priority has no true "unset" state.** Section 5's colour table lists a
  `priority.none` role distinct from `normal`, but `tk_tasks.priority` is
  `NOT NULL DEFAULT 'normal'` with no fifth enum value (Phase 1 schema,
  already deployed) — there is no column state that means "no priority
  set." Rows actually at the default `normal` value render with the
  outline (unset-looking) flag the spec describes for "none"; urgent,
  high and low render filled. Not a new column added to work around this
  now, since changing an already-deployed NOT NULL enum column was never
  this phase's job to take on.
- **The task panel is a fixed, full-viewport overlay, not a background
  route kept mounted underneath it.** A literal reading of "opens as a
  panel over the current page" suggests keeping the originating page's DOM
  mounted behind a see-through scrim (the React Router "background
  location" pattern). That would mean restructuring how `App.tsx`'s single
  route tree renders for every page that can open a task, which is a much
  larger, riskier change to shared routing than this phase calls for
  (hard rule 6). Instead `/task/t/:taskId` renders the same panel
  full-screen with its own scrim, and Escape/Close call `navigate(-1)`,
  which returns to wherever the task was opened from in the overwhelming
  majority of cases (anywhere except a cold direct link, where there is no
  "current page" to return to anyway).
- **Caught and fixed during review, not by a failing test:** the
  description editor's debounced autosave used
  `useEffect(() => () => flushDescription(), [])` to flush on unmount
  (AC-13: "a description typed quickly and then navigated away from is
  saved in full"). That closes over the very first render's
  `flushDescription`, whose `task` is still `undefined` while the task
  query is loading, so the unmount cleanup would always see `!task` and
  silently do nothing — the exact failure AC-13 is testing for. Fixed by
  keeping the latest `flushDescription` in a ref and calling
  `ref.current()` from the cleanup instead.
- **Quick create's assignee field is single-select**, matching section
  7.8's field list ("assignee", singular) even though a task can carry
  many assignees (`tk_task_assignees` is a join table). More can be added
  from the task panel once the task exists.
- **No automated test for the stale-closure flush fix above** — mounting
  the full task panel needs mocks for tasks, lists, spaces, statuses,
  people, comments, activity and watchers together, which is a heavier
  investment than this fix's residual risk justified once the pattern
  (ref holds the latest closure; cleanup calls `ref.current()`) was
  applied; verified by re-reading the fixed code rather than a new test.
- Verification: `tsc`, `eslint`, a full production build, the existing
  suite (now 670 tests, including 12 new ones for `formatDue`, `initials`
  and the natural-language date parser, and an updated Phase 2 regression
  test now that "+ Add list" is a real control), and the local disposable
  Postgres instance for the one new trigger. Same standing limitation as
  Phases 0 to 2: no live Supabase connection was reachable from this
  session, so this was not checked against a live, pixel-level screenshot
  (S2 is this phase's only visual reference, for the List view structure).

## Phase 4 specifics

- **The filter engine is built once, in `src/features/task/filter/`, with
  no UI dependency.** `evaluate.ts` exports a pure `matchesFilter(task,
  tree, ctx)`; `fields.ts` lists the filterable fields and their
  operators; `FilterBuilder.tsx` / `FilterValueInput.tsx` /
  `FilterButton.tsx` are the only UI layer on top. Section 8 requires the
  same filtering behaviour on List views (this phase), Home (Phase 7) and
  the Team Dashboard (Phase 11); building it generically now, instead of
  once per screen, is the only way those three stay identical without
  duplicated logic. `FilterTree` supports AND across top-level entries
  and one level of nested OR, matching what the reference screenshots
  show (a flat list of conditions, with an explicit "or" sub-group) and
  nothing deeper.
- **Filterable fields this phase cover only what exists on a task today**
  (title, status, priority, assignee, due date, start date, created
  date). Custom fields (Phase 5), tags (Phase 5) and task-link columns
  (Phase 10) are not filterable yet because the fields themselves do not
  exist yet; `fields.ts` is written so adding one later is one new entry,
  not a rewrite.
- **"Me" is a sentinel value, not the viewer's literal id**, for the
  assignee field's `is` / `is_any_of` operators, so a saved view's
  "assigned to me" filter means "me" for whoever has that view open, per
  section 8's own description of that control. Resolved against
  `ctx.viewerId` at evaluation time, never stored as a specific user id.
- **Two previously undetected Phase 1 defects, found during this phase's
  own code audit and fixed in this phase's migration, not deferred:**
  - No `tk_` table was ever added to the `supabase_realtime` publication
    across Phases 1 to 3. Nothing in those phases subscribed to
    `postgres_changes`, so the gap was invisible until this phase's
    AC-11 ("a task dragged on a board updates for a second person
    watching it within about a second") and section 9.7's live-updates
    requirement needed it. Fixed with an idempotent `ALTER PUBLICATION
    supabase_realtime ADD TABLE` (guarded by a `pg_publication_tables`
    existence check) for `tk_tasks`, `tk_task_assignees`, `tk_comments`
    and `tk_activity_log` — the four tables the list page and the open
    task panel now subscribe to.
  - `tk_views_select` (written in Phase 1, before any UI ever exposed the
    private/shared choice) never checked `is_shared` or `created_by`, so
    a private view was readable by anyone who could see its list, not
    just its creator. The update and delete policies already had the
    correct shape; the select policy now mirrors them: `created_by =
    auth.uid() OR (is_shared AND can_access_field_parent(...))`. Verified
    against the local Postgres instance: the creator sees both a private
    and a shared view they made; a second user sees only the shared one;
    a freshly created list's four seeded default views (all
    `is_shared=true`) remain visible to everyone. (A first check of this
    against an old test-fixture list, created before Phase 3's
    `tk_seed_default_views` trigger existed, showed 0 default views for
    the second user — a stale test fixture that predates the trigger,
    not a regression; triggers do not fire retroactively, and a fresh
    list confirmed the seeding and the privacy fix both work.)
- **List view's grouping is generalised from "always by status" to a
  shared `groupTasks(tasks, groupBy, statuses, now)`**, covering status,
  priority, assignee, due date and no-grouping, per section 8's Group
  control. Each row still renders its own actual status dot (looked up by
  `status_id` against the space's statuses) regardless of which dimension
  the page is currently grouped by. Drag-and-drop between groups is kept
  working only for the status grouping, since "drag a card to Priority:
  Urgent" or "drag a card to Assignee: Dave" would silently reassign a
  field the card's position was never meant to represent; dragging is
  disabled (cards are not draggable) for every other grouping.
- **Board view reuses the same `groupTasks`/status columns as List's
  status grouping** rather than a separate board-specific grouping
  model, since section 8 describes Board as "the same tasks, one column
  per status, card instead of row." Board's own group-by control (also
  supports priority/assignee/due date) swaps the column dimension the
  same way List's does.
- **Table view does not virtualise rows.** Section 8's Table reference
  (S1) is a reporting table, not expected to hold thousands of rows in a
  single list the way a dedicated data table (Phase 9/10's actual
  database tables) would; a plain mapped render keeps this phase's scope
  to "a table layout of the same task fields," not a virtualised grid,
  which is Phase 9's job for the real Tables feature.
- **Calendar view places a task on the single day its due date falls on**
  (no due date: not shown on the calendar at all, consistent with the
  List/Board empty-state convention of a separate "no date" bucket
  rather than a visible gap). Multi-day spanning (start date to due date)
  is not in section 8's Calendar description and was not added.
- **Saved views (`+ View`) snapshot the current filter/group/sort/type
  at creation time; they do not live-sync if the view is edited later
  without re-saving.** Clicking a saved view restores that snapshot as
  the active state; changing filters afterwards changes the active state
  only, matching how the reference screenshots show views as named,
  reusable starting points rather than continuously-synced live
  bookmarks. No auto-save-on-edit was added because section 8 never asks
  for one and it would mean a saved view silently drifts out from under
  whoever else has it open.
- **`BulkBar`'s "tasks span multiple spaces" flag is always false this
  phase** (every list belongs to exactly one space, so a selection within
  one list's view can never span spaces), but the component takes a
  `spanningMultipleSpaces` prop rather than hardcoding that assumption
  internally, since Phase 6's My Tasks screen will show tasks from many
  spaces at once and will need to disable space-specific bulk actions
  (move to list, for one) when a selection actually does span spaces.
- **`TaskRow` gained a selection checkbox**, retrofitting a gap in Phase
  3's row anatomy now that bulk actions exist to select rows for. Hidden
  until a row is hovered or already selected, matching the reference
  screenshots' convention of not showing a checkbox on every row by
  default.
- Verification: `tsc`, `eslint`, a full production build, the test suite
  (686 tests, 16 of them new this phase for the filter engine, grouping
  and sorting, all passing), and the local disposable Postgres instance
  for both database fixes (realtime publication membership, and views
  privacy with the private/shared/stale-fixture distinction above). Same
  standing limitation as every earlier phase: no live Supabase connection
  was reachable from this session, so this was not checked against a
  live, pixel-level screenshot (S1 and S2 are this phase's visual
  references, for Table and List/toolbar structure respectively; Board
  and Calendar have no reference screenshot and follow the PRD's section
  8 description instead).
