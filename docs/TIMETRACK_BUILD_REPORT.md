# In-house TimeCamp Replacement — Build Report

**Location:** `src/features/timetrack/` inside this repo (`King-Iyene/kd-ops-hub`)
**Status:** Feature-complete against the full gap list identified from the live TimeCamp
trial account. All modules below are built, migrated, deployed, and verified in CI.

## Why it lives in this repo, not a new one

A separate repo was considered at the start of this work, but building directly inside
`kd-ops-hub` turned out to be the right call rather than a workaround:

- The module reuses the existing `employees`, `projects`, `clients` and auth/role
  tables and the existing `time_has_capability()` / `useTimetrackCapabilities()`
  permission model instead of re-implementing them.
- It reuses existing infrastructure end-to-end: the Supabase project, its CI/CD
  (migrations + edge functions auto-deploy via GitHub Actions on push to `main`),
  storage buckets, the generic platform webhook system, and the PDF/CSV/email
  plumbing already in the codebase.
- Employees only ever sign into one app. A second repo would mean a second deploy
  pipeline, a second auth story, and either a duplicated employee directory or a
  cross-service sync job — real ongoing cost for no real benefit here.

If a standalone product is ever the goal (e.g. selling this as a separate SaaS
offering rather than running it as an internal module), the natural name for that
extraction would be **`timeforge`** or **`clockwork-suite`** — both free on GitHub
at the time of writing. That's a repo-split exercise for later, not a prerequisite
for this module being usable today.

## What was built

### Core tracking
- Timer-based and manual time entries, offline-safe (queues and syncs when back online)
- Weekly/daily/calendar views, duplicate-entry, tag assignment per entry
- Timesheet submission + multi-stage approvals workflow

### Reports
- Time: Summary, Detailed, By days, Pivot Table
- People: By tasks, By days and tasks, By days, By projects
- Finance: Billable/non-billable, Estimates, Revenues, Costs, Margin
- Location report, real-time activity dashboard

### Computer Activities / productivity monitoring
- Desktop capture agent: active window + idle-time detection + true domain/URL
  capture for browser windows (macOS `active-win` URL field)
- Site/app categorization, violation alerts, productivity scoring
- Screenshot capture with configurable interval and blurring
- **Real IP-based geofencing**: office-location CRUD, haversine distance check
  against `ipapi.co` IP geolocation, honestly labeled everywhere as IP-based
  (not device GPS) — matching TimeCamp's own real limitation
- Remote Work Detection page: off-hours + outside-geofence flags side by side

### Attendance
- Clock in/out with geolocation, calendar view, away-time tracking
- Kiosk mode for shared-device clock-in

### Expenses
- Separate, purpose-scoped `time_expenses` module (project/client-billable
  expenses with receipt upload + approval flow) — deliberately kept distinct
  from the pre-existing company-wide NGN reimbursement system at `/expenses`,
  which has no project/client linkage and serves a different purpose

### Data Export / Export Center
- On-demand CSV export (client-side, RLS-scoped)
- Scheduled/recurring exports: new `timetrack-export-runner` edge function,
  `pg_cron` + `pg_net` + Vault-secret wiring, CSV → private storage → signed
  URL → email delivery, daily/weekly/monthly scheduling

### Tags
- Standalone management page: create, rename, delete (with usage-count guard)

### Integrations
- Reuses the platform's existing generic outbound-webhook system rather than
  building a parallel one: new `time_entry.started/stopped/created/updated` and
  `timesheet.attendance_clocked_in/out` events, dispatched from the timer,
  manual-entry, and attendance clock-in/out code paths
- Thin `/timetrack/integrations` page that shows the module's events and any
  webhook already subscribed, linking straight into Developer Hub's existing
  Webhooks tab (deep-linkable via `?tab=webhooks`) rather than duplicating its
  CRUD UI

### Manage tools
- Projects, Planner, Billing Rates, Roles/permissions page
- Settings, agent configuration (capture policy, geofencing, screenshot policy)

## Database

21 migrations (`20261240000000` → `20261260000000`), all following this repo's
existing conventions: RLS on every table, `SECURITY DEFINER` trigger functions
with `search_path` pinned, singleton-row config tables, `NOTIFY pgrst, 'reload
schema'` at the end of each migration.

## CI/CD note

Mid-build, a real regression was found and fixed (not reported by anyone —
caught by routinely checking workflow status after each push): a newer
Supabase CLI version now requires `--yes` for non-interactive confirmation on
both `secrets set` and `functions deploy`. This was silently going to block
*every* future edge-function deployment in this repo, not just the ones this
work introduced. Fixed across all 35 pre-existing deploy steps plus the new one.

## What's intentionally not duplicated

- Expenses: the existing company-wide `/expenses` (NGN reimbursements) was
  left untouched; `time_expenses` is a separate, clearly-named module.
- Webhooks: no second webhook system — Time Tracking just adds events to the
  one that already exists.
- Tags deletion needed no new guard logic: `time_entry_tags` already has
  `ON DELETE CASCADE`; the UI usage-count warning is a courtesy, not a
  technical necessity.
