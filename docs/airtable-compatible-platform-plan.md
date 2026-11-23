# KDOps Database: Airtable-compatible platform plan

Status: **plan only, nothing built.** Written 2026-11-22 after a read-through of the Database (`/data`) and Developer (`/developer`) modules, the edge functions behind them, the live finance base and the GitHub history.

## 1. Goal

Make KDOps Database a unique, polished Airtable-style product whose backend works like Airtable's:

1. **Drop-in API.** Stock Airtable client libraries and the n8n / Make / Zapier Airtable nodes work against KDOps by changing only the base URL.
2. **Finance base on the API.** KDS Finances (the live finance base) is updated through that API, including a daily job that reads email and writes rows straight into the finance tables.
3. **A UI with its own identity.** Faster, cleaner, easier to understand, and not a generic copy of Airtable or NocoDB.

Not in scope: splitting finance by company. Finance is one set of tables for now.

## 2. What exists today (verified)

### Architecture
- Each **base** is its own Postgres schema (`nc_<name>_<timestamp>`); each **table** is a real Postgres table with `id`, `created_at`, `updated_at`, `created_by`, `nc_order` plus one column per field. Metadata lives in the `nc_meta` schema (bases, tables, fields, views, links, formulas, rollups, lookups, audit_log, api_keys, webhooks, webhook_deliveries, automations, shared_views).
- Links / Lookup / Rollup / Formula / Count are **metadata only**. The browser computes them (`src/features/database/lib/formula.ts`, `computations.ts`). Links use junction tables (`jn_*`).
- The browser talks straight to PostgREST through supabase-js. New tables get "any signed-in user can do anything" row policies.

### Edge functions
| Function | Purpose | Note |
|---|---|---|
| `rest-api` (1,177 lines) | Public API, `kdops_` keys | Routes `/v1/bases[/…/tables[/…/records|fields]]` |
| `data-api` | Older JWT-based CRUD | Checks `owner_id` on bases; confirm it is still used |
| `ddl-executor` | Create/alter/drop schemas, tables, columns | Super Admin only; hardened 2026-11-20 (`_shared/ddl-guard-core.ts`) |
| `webhook-dispatcher`, `-retry-worker`, `-replay`, `-inflow` | Outbound signed webhooks with retries; inbound webhook to automations | Two separate webhook paths exist (see 3.4) |
| `automation-runner`, `batch-worker`, `data-retention-runner` | Not yet read |

### Developer Hub
9 tabs (Overview, Explorer, Reference, Keys, Webhooks, Connect Tools, Recipes, Module Guides, Troubleshooting). Docs are hard-coded in TSX files of 700 to 1,200 lines each.

### KDS Finances (the live finance base)
- Base `b211448d-ab7d-4cc8-8bf6-68ff09d62b81` (short ID `5Q0WaQCPYxBInxiYRVx7LN`, slug `kds-finances`). 71 tables in the metadata: 43 real plus 28 empty `jn_` junction tables. The app already hides the `jn_` tables (`useTables.ts`), so base cards and tabs show 43.
- A second copy, **KDS Financesss** (base `afa79c02-…`, re-imported 2026-10-11, 3,350 Expenses rows), has the same tables and field structure. It is not the live base; the first link used for this review pointed at it by mistake.
- Evidence KDS Finances is live: 3,360 Expenses rows, and its newest 10 were created 2026-10-18 05:33:12, the same second `King's API Key` was last used, so the REST API already writes here. The 4 seeded automations (2 enabled: Income → Profit, Expense → Profit) are on this base only.
- Expenses: 3,350 rows, 33 free-text categories, only 9 marked Paid/Done, rows dated up to Dec 2026. Primary column `Name` is a formula. `Month`, `Employee`, `Monthly/Weekly Finance Planner` and `[WIP] KDS Profit` are links. Every row keeps its original Airtable record ID in the hidden `airtable_id` column.
- Expense Submission field names end with a hidden tab character (for example `Expense Category\t`).

## 3. Gaps found

### 3.1 API versus Airtable
| Airtable | KDOps today |
|---|---|
| `/v0/{baseId}/{tableIdOrName}`, `app…`/`tbl…`/`rec…` IDs | `/v1/bases/…/tables/…`, short IDs |
| List: `pageSize` ≤100, `offset`, `fields[]`, `sort[]`, `maxRecords`, `view`, `filterByFormula`, `returnFieldsByFieldId` | `pageSize` ≤1000, `offset`, `sort`, own `filter=Field op value` |
| Create / update up to 10, `typecast`, `PUT` and `PATCH`, **upsert** (`performUpsert`) | Create / `PATCH` only; no typecast; no upsert; unknown field names silently create columns |
| Linked records as arrays of record IDs, read and write | Skipped |
| Formula / rollup / lookup values returned read-only | Skipped |
| Meta API: list, create bases and tables, create and update fields | Only list bases and tables; fields can be created, edited and deleted |
| Webhooks API | UI only |
| Scoped tokens limited to bases | Generic scopes; no per-base column on `api_keys` |
| Rate limit 5 requests/second/base | 100/min per key, counted per server instance |

### 3.2 Behaviour that matters for finance
- API writes do **not** trigger automations.
- Rows created by the API have no Month / Planner / Profit link, so they do not feed Budget totals.
- Select and currency values are not validated; typos create new values.
- Each request does about four metadata round trips before touching data; the pool is size 2.
- The only live key (`King's API Key`) is platform-wide with every scope.

### 3.3 Data problems on the finance base
(Seen first on the copy; Income, Expenses and Expense Submission have identical field counts in both bases. Re-check the visual items on KDS Finances.)
- Link cells show raw Airtable IDs (`recNt…`) and a "+162" overflow.
- Computed columns (Income NET / actual, Expenses actual) show ₦0 for most rows.
- Number formats are mixed: `603,123.664`, `₦8,500,000.00`, `NGN204,876,107.00`.
- Date cells show `02 Mar 2026, 12:45:00 am (...)`.
- Copy, WIP, outdated and personal tables (for example `Income copy`, `[OUTDATED] Recurring Expense`, `Phone Screen Time…`) are mixed in with real finance tables.
- A second copy named `KDS Financesss` exists and is easy to open by mistake; base cards for both show the same date.
- On Income, `Budget`, `Salaries` and `[WIP] KDS Profit` are plain text columns, not links.

### 3.4 Other
- Two outbound webhook code paths: `rest-api` sends inline with no retries or delivery IDs; `webhook-dispatcher` has deliveries, retries and replay.
- The `DH Form Submitted` webhook URL is pasted twice, so it cannot deliver.
- The repo is public.
- 30 open GitHub issues (#281 to #324) are auto-filed "migration deploy failed" notices; recent deploys on `main` succeed.
- No tests found for `rest-api`; one test file in the database module.

## 4. UI/UX review

### 4.1 What is wrong
- **Generic look.** Grid colours are hard-coded (`grid-tokens.ts`), including `#2D7FF9`, which is Airtable's own selection blue. About 4,984 hard-coded colour classes in the database and developer code versus about 101 theme-token uses. That is why "fix dark mode" commits keep recurring and why pages feel inconsistent.
- **Links show half.** Chips are cut off by `overflow-hidden`; raw IDs appear when a link cannot be resolved; each link cell runs its own queries (see 6.1).
- **Dates (reported by the user, confirmed in code).**
  - Base cards show `06/09/2026`, `11/10/2026`. After 30 days `getTimeAgo` falls back to `new Date(...).toLocaleDateString()` (`pages/EmptyState.tsx:31`), which depends on the browser locale and is ambiguous: `06/09/2026` could be 6 Sep or 9 Jun. No time is shown.
  - The "last update" on a base card is the base row's own `updated_at`. It most likely changes only when the base itself is edited, not when data inside it changes (verify), so it can say "old" for a base used today.
  - `DateCellRenderer` shows a full timestamp plus timezone in date columns (`02 Mar 2026, 12:45:00 am (...)`).
  - More than a dozen places format dates inline in different ways (`toLocaleDateString()` with and without options), so no two screens agree.
- **Numbers.** Currency and plain numbers are formatted differently across cells, footer and linked-record cards; negatives are only red.
- **Navigation.** 14 bases (including test bases) in a flat sidebar; table tabs overflow and truncate (43 tabs on the finance base); fallback base icon is a generic box.
- **Developer Hub.** Narrow centred column with large empty margins; payroll "bank details" warning on the API overview; docs promise per-module APIs that do not exist; four overlapping webhook mechanisms; key management duplicated in the database module.
- **Invalid class** in `ApiReference.tsx:607` (`bg-warning/10/20`).

### 4.2 Design direction (original, not an Airtable copy)
1. **Own identity.** Define KDOps tokens once (surface, ink, accent, semantic colours, radius, shadow, type scale). Start from the brand teal already used on the developer portal. Remove `#2D7FF9` and all raw hex / `hsl()` in components. Dark and light both come from tokens.
2. **Cells.**
   - Select / multi-select: soft pills with a deliberate palette, readable in dark mode.
   - Currency: right-aligned, tabular numerals, one format per field (symbol, decimals), negatives with a consistent sign style.
   - Dates: default `2 Mar 2026`; time only when the field includes time; timezone and relative text ("3 days ago") in the tooltip; per-field format respected.
   - Checkbox, rating, progress and status cells made distinctive and consistent.
   - Never show a raw ID: skeleton while loading, `Unnamed record` as fallback.
3. **Linked records.** Measure the cell width, show as many chips as fit plus a `+N` badge, open a popover with the full list; click a chip to expand the record.
4. **Navigation.** Sidebar tree (bases, then tables) with search and pinning; system, junction and archived tables hidden by default; command palette (Ctrl+K); breadcrumbs.
5. **Density and focus.** Row height setting, sticky primary column with expand button, calmer toolbar, clearer empty states.
6. **Developer Hub restructure.** About four areas: Start, Keys, Reference + Explorer, Webhooks and logs. Docs show the user's real base and table IDs and a copy-paste snippet. Docs data moved out of TSX into data files.

### 4.3 Airtable feature gaps
Present: 7 view types (grid, kanban, form, calendar, gallery, timeline, gantt), formulas, lookups, rollups, automations, comments, record history, trash, snapshots, find/replace, duplicate detection, share view, Airtable and CSV import, undo/redo, presence, freeze columns.

Missing or weak (verify each in the live app before building):
- **Tier 1:** multi-cell range selection, fill handle, copy/paste of ranges (only pasting multi-line text as new rows exists); upsert and field selection in the API; rich-text long text; multi-collaborator field.
- **Tier 2:** dashboards and charts (no chart code found); interface / page builder; personal versus collaborative views; view and field permissions; templates gallery for new bases.
- **Tier 3:** synced tables; AI fields; extensions; cross-base links.

### 4.4 Date and time standard (one rule, used everywhere)
- **One formatter module** (`formatDate`, `formatDateTime`, `formatRelative`) used by every screen; no inline `toLocaleDateString()`.
- **Unambiguous default:** `6 Sep 2026`, never `06/09/2026`. With time: `6 Sep 2026, 2:15 pm`. Per-field format options stay (including ISO and the numeric styles) for people who want them.
- **Recent items are relative** ("12 min ago", "Yesterday, 4:30 pm"), older ones absolute. Hovering always shows the exact date, time and timezone.
- **Date-only fields never show a time or timezone.** Date-time fields show the time; the timezone appears in the tooltip, not in the cell.
- **Workspace settings:** timezone (default Africa/Lagos), first day of week (Monday), currency (NGN), number style. Base cards, grid, record history, audit log, API responses in the UI and exports all follow them.
- **Real "last activity" on base and table cards:** the newest data change in the base, kept cheaply (a `last_activity_at` column updated by the existing write paths or a trigger), with who made it. Label it "Edited 2h ago by …".

## 5. Plan of work

Every phase follows `CLAUDE.md`: branch per change, lint and tests on changed files, `npm run build` before merge, no direct writes from screens on mount, migrations deploy through GitHub Actions only, confirm the deploy after merge.

### Phase 0: Decide and protect (small)
- Keep **KDS Finances** as the live base; archive (do not delete) the copy **KDS Financesss** after checking nothing unique is in it.
- Take a snapshot / backup of KDS Finances before any write work (snapshot migration and `daily-backup` workflow exist).
- Close or batch-close the stale `migration-deploy-failure` issues; remove stray `tsc_*.txt` and release-test folders from the working tree.
- Revoke or replace the platform-wide key once a scoped key exists (Phase 4).
- Fix the doubled webhook URL.
- **Done when:** one finance base, a restorable backup, clean issue list.

### Phase 1: Compatibility contract and test harness (small)
- Write the compatibility spec: exact routes, request and response shapes, error types.
- Choose URL and ID scheme (see section 6, decisions 1 and 2).
- Acceptance test: an Airtable client library pointed at KDOps with only the base URL changed must pass list, get, create, update, delete and upsert.
- Split `rest-api/index.ts` into modules (auth, routing, records, schema, errors) and add unit tests.
- **Done when:** the harness runs in CI and fails on today's API.

### Phase 2: Records parity (medium)
- New `/v0/{base}/{table}` routes beside the old `/v1` routes (nothing breaks).
- List options: `pageSize` ≤100, `offset`, `fields[]`, `sort[]`, `maxRecords`, `view`, `returnFieldsByFieldId`.
- `filterByFormula`, starting with the common subset (field comparisons, AND / OR / NOT, FIND / SEARCH, IS_BEFORE / IS_AFTER), growing from real use.
- Create (single and batch), `PATCH`, `PUT`, delete, **upsert** with `fieldsToMergeOn`, `typecast`.
- Reject unknown field names with Airtable's error (strict by default; `typecast` controls conversion).
- Airtable-style error types and status codes; `Retry-After` on rate limit.
- **Done when:** the harness passes for records on test bases.

### Phase 3: Links and computed values (large)
- Read and write linked records as arrays of record IDs through the junction tables.
- Return Lookup, Rollup, Formula and Count values read-only. Preferred approach: move the computation into a shared module the server can run (check `formula.ts` for browser-only dependencies), or store computed values and refresh on write.
- Resolve legacy `rec…` IDs through `airtable_id` so old Airtable flows keep working.
- Run automations (including webhooks) for API writes.
- **Done when:** an API-created Expense with a Month link appears in Budget totals identically to a UI-created one.

### Phase 4: Schema API, keys, safety (medium)
- Meta endpoints in Airtable's shape (list bases and tables with Airtable field type names such as `singleLineText`, `multipleRecordLinks`; create base, table and field; update table and field). Table and base creation reuses the `ddl-guard-core` rules and a dedicated permission.
- Token scopes named like Airtable's (`data.records:read`, `data.records:write`, `schema.bases:read`, `schema.bases:write`, `webhook:manage`), plus a per-base restriction column on `api_keys`.
- Audit log records the key ID; shared rate limit across server instances; optional idempotency key; batch limit and metadata caching to cut round trips.
- Tighten row policies on finance tables (currently any signed-in user can edit).
- **Done when:** a key limited to KDS Finances cannot see or touch any other base.

### Phase 5: Finance rollout (medium)
- Data cleanup on KDS Finances: resolve raw link IDs, normalise currency and date formats, archive copy / WIP / outdated / personal tables, review the two enabled profit automations (seeded from Airtable; not yet verified to work).
- Expenses first: add a source-message-ID field for the email job; fixed category list; clear meaning for Paid/Done; rule for matching existing planned rows (update instead of duplicate); currency rule.
- **Daily email job:** runs outside KDOps (n8n or Make, or a scheduled agent), searches the mailbox, and upserts rows into Expenses through the compatible API using a finance-only key. Written directly (no review table), so it ships with duplicate protection, a dry-run mode, a daily summary of what it wrote, and a one-step way to undo a day's rows.
- Then Income, then Expense Submission.
- **Done when:** a week of real email produces correct rows with no duplicates and totals that reconcile.

### Phase 5b: Routines (easy to create, easy to trust)

You are moving off Airtable to your own system, so routines (automations) are part of the product, not an add-on.

**Exists today** (`AutomationsDialog.tsx`, `automation-runner`, migration `20261222400000_automation_runs_and_scheduler.sql`):
- Triggers: record created, record updated, record matches conditions, scheduled (cron), inbound webhook (signed).
- Actions: create record, update record, send email, send notification, conditional (if / else), delay, log message.
- Run history, test run, run count, last error.

**Gaps for the email-to-finance routine and for Airtable parity** (verify each in the app before building):
- No "email received" trigger and no mailbox connection; no step that reads an email body or attachment.
- No "find records" or "upsert" action, so a routine cannot say "update the matching row, otherwise create one".
- No visible HTTP / webhook-call action in the action list; no "extract data from text / receipt" step (the `extract-receipt` function may help).
- API writes do not start routines (see Phase 3).

**Routine experience to build:**
- Start from templates ("Daily email to Expenses", "Overdue invoice reminder", "New row to Slack / email") and the Airtable routines that were moved over.
- Plain-language summary of each routine ("Every day at 7:00, find unpaid expenses older than 30 days and email me").
- **Dry run** that shows exactly which rows would be created or changed, then **Run for real**.
- Run history per routine with inputs, outputs, errors and a one-click undo for the rows a run created.
- Failure alerts, retry rules, pause / resume, and a daily summary email.
- Shared building blocks with the API: the same upsert and link logic from Phases 2 and 3, so UI routines and external callers behave the same.
- **Done when:** the daily Expenses email routine can be created in the UI from a template in a few minutes, dry-run, enabled, and its first week of runs is reviewable and reversible.

### Phase 6: UI/UX rebuild (large; can start in parallel after Phase 1)
Order inside the phase:
1. Tokens and theme (replace hard-coded colours; remove `#2D7FF9`).
2. Cells: number / currency, dates, selects, checkbox, status.
3. Linked-record chips and popover; never show raw IDs.
4. Sidebar tree, hidden system tables, command palette, table switching.
5. Toolbar simplification and density options.
6. Range selection, fill handle, range copy/paste.
7. Developer Hub restructure and personalised docs.
8. Dashboards / charts and the interface builder (Tier 2).
- **Done when:** a before / after screenshot review of Budget, Income and Expenses is approved, and dark and light both come from tokens.

### Phase 7: Speed (starts with measuring; runs alongside 5 and 6)
- **Measure first** (Lighthouse and a performance trace on Budget, Income, Expenses). No timing numbers have been captured yet.
- Link cells: replace one query per cell with one batched lookup per column per visible page.
- Server-side or stored totals for finance (rollups) instead of recomputing in the browser.
- Cap or page the "all rows" fetch (currently up to 5,000 rows) and virtualise; hide junction tables from metadata loads.
- Cache API metadata; reduce round trips per request.
- Split oversized files: `GridView.tsx` (2,189 lines), `AutomationsDialog.tsx` (1,992), `useRecords.ts` (1,367), `ImportAirtableDialog.tsx` (1,475), `cell-renderers.tsx` (1,160).
- **Done when:** agreed targets (for example first rows visible and time to scroll on Expenses) are met on the measured baseline.

### Phase 8: KDOps MCP server (optional, after the API)

An MCP server is **not required** to run the API or the routines. The compatible API is plain HTTPS, so n8n, Make, scripts and Airtable libraries call it directly.

An MCP server becomes useful when you want an **AI agent** to work with KDOps by itself, for example reading Gmail and deciding which rows to write. It would be a thin wrapper over the same API exposing tools such as `list_bases`, `list_records`, `create_records`, `upsert_records`, `update_records` and `get_schema`, using a scoped key.
- Build it only after Phases 2 to 4, so it inherits upsert, validation and per-base keys.
- Use the same key rules as the API (finance-only key, dry-run mode for writes).
- **Done when:** an AI client can read the Expenses schema and upsert a test row through the MCP tools with a key that cannot reach other bases.

## 6. Decisions needed

1. **Public URL.** Keep the Supabase function URL, or add a clean one (for example `api.kdsquares.com/v0`) through a Vercel rewrite. Recommended: clean domain.
2. **ID format.** Prefix current short IDs (`app…`, `tbl…`, `rec…`; reversible, no database change) versus keep as is. Recommended: prefix, and also accept old `rec…` IDs through `airtable_id`.
3. **`filterByFormula` depth.** Subset first, or full formula engine on the server. Recommended: subset first.
4. **Computed values in the API.** Share the browser engine, or store computed results. Needs a look at `formula.ts`.
5. **The copy `KDS Financesss`.** Recommended: archive it so it cannot be opened by mistake.
6. **Email job:** mailbox, scheduler (n8n / Make / agent), category list, Paid/Done meaning, USD handling.
7. **Brand direction** for the redesign (colours, typography, how far from Airtable).
8. **Date and number standard.** Recommended: `6 Sep 2026`, relative for recent, Africa/Lagos, Monday week start, NGN, with per-field overrides.
9. **Routine triggers to support first.** Recommended: scheduled, record events and inbound email; then API-written records.
10. **Who runs the email routine.** A fixed n8n / Make flow (predictable, no AI judgement) or an AI agent through a KDOps MCP (flexible categorising). Recommended: fixed flow first, MCP later.

## 7. Risks

- Direct writes into real finance data: mitigated by backup, dry run, duplicate keys, daily summary, undo path.
- Server-side formulas can drift from the browser's: use one shared module and test both.
- Table and base creation through the API changes database structure: strict guards, dedicated permission, audit.
- Large UI changes can regress the live app: ship behind a setting, one component family per branch, screenshot review.
- Running two API versions: keep `/v1` until clients are moved, then retire it.

## 9. Revamp A to Z checklist (user request, 2026-11-22)

The user decided to **pause the nightly Moniepoint routine and do the full revamp first**. The routine functions (`routine.*`) are designed but not built; they are rebuilt on the new foundation (Phase 5b). Nothing below is built yet.

Extra requirements added by the user:
- **Raenest USD rule:** Raenest expenses arrive in USD. A row stores the converted NGN amount in Cost; the Notes keep the real USD amount and the vendor (for example `Raenest  Expenses for 16-22 Nov ($121.21): HighLevel, Anthropic`). The rate source and its date are recorded so the figure can be checked.
- **Look and feel:** the current UI reads "baby-like" and old. Keep the side-based navigation (the user likes it) but make it scale: with many bases it must use a base switcher dropdown, search and pinning instead of a long flat list.
- **Computed fields must stay correct.** Correction (checked in code): the `Name` formula cell is already read-only (its editor is null); the highlighted "2026" in the user's screenshot was a text selection. The real defect was that the browser evaluated the formula without seeing links stored only in junction tables, so rows written outside the app showed `— Utilities & Bills` with the month missing. Fixed on the revamp branch by feeding the batched link data into the formula evaluation. A formula badge on formula columns is still to do.
- **Names must never be cut off:** wide primary column, tooltip with the full value, wrap option.

Master list (A to Z, in build order):

A. Protect: backup, archive the copy base, clean stale issues and stray files.
B. Foundations: design tokens, one date and number formatter, workspace settings (Africa/Lagos, Monday, NGN).
C. Grid cells: currency, dates, selects, checkbox, status; read-only computed cells; never-truncated names.
D. Linked records: fit-to-width chips, `+N` popover, no raw IDs.
E. Navigation: sidebar kept, base switcher dropdown with search and pins, table list with groups and hidden system tables, Ctrl+K, breadcrumbs.
F. Toolbar, density, empty states, base and table cards with real "edited 2h ago by ...".
G. Real computed fields: formulas, rollups and lookups computed in the database, not stored text; Budget totals stay correct for any writer.
H. Compatibility spec and test harness.
I. API records parity: `/v0` routes, field selection, sort, filterByFormula subset, upsert, typecast, strict fields, Airtable-style errors.
J. API links and computed values; API writes run automations.
K. Schema API, scoped per-base keys, rate limit, audit with key ID, tighter row policies.
L. Finance data cleanup on KDS Finances.
M. Routines UI: templates, plain-language summary, dry run, run history, undo, alerts.
N. Moniepoint and Raenest routines rebuilt on the new foundation (functions `routine.*`, USD to NGN conversion, one row per transaction, charges rolled up per day).
O. Income routine.
P. Range selection, fill handle, range copy and paste.
Q. Developer Hub restructure with personalised docs.
R. Dashboards, charts, interface builder.
S. Speed: measure first, batch link lookups, cap and virtualise rows, split oversized files.
T. Optional KDOps MCP server.

## 8. Not yet read

`automation-runner`, `batch-worker`, `data-retention-runner`, the content of Recipes / Explorer / Module Guides / Troubleshooting / WebhooksManager, the full `useRecords` hook, `vercel.json`, the `extract-receipt` function, and every base other than the two finance bases.
