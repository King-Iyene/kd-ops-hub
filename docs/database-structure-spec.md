# KDOps Database: structure, links, computed fields, speed and customisation spec

Status: **design only, nothing built, no SQL was run.** Written 2026-11-23 by reading code, migrations and the research docs. It is meant to be implemented from.

Scope: `src/features/database`, `supabase/migrations`, `supabase/functions` (`ddl-executor`, `rest-api`). The polish work (editors, formatting, navigation, speed round 1) is on `feature/database-revamp` and is not repeated here.

How sure am I: statements tagged **(read)** come from code I opened this session. **(inferred)** means I joined several files and did not see it run. **(guess)** means I could not see the evidence and the first step of the plan checks it. I did not run the app, did not query the live database and did not open `rest-api` beyond its type table and pool setup.

Effort scale used throughout: **S** = up to 2 working days, **M** = 3 to 10 days, **L** = more than 10 days, for one developer working with Claude.

Files read: `docs/airtable-compatible-platform-plan.md`, `docs/database-ux-research.md`, `docs/database-field-types-research.md`, `docs/database-field-design-research.md`, `docs/database-speed-notes.md`; migrations `20260902000001_database_platform_nc_meta.sql`, `...0010_database_snapshots.sql`, `...0011_database_automations_and_extras.sql`, `20261128000003_fix_nc_meta_postgrest_exposure.sql`, `20261201000000_shared_view_password_security.sql`, `20261202000000_soft_delete.sql`, `20261205000000_flex_tables.sql` (header only), `20261222400000_automation_runs_and_scheduler.sql`; `lib/formula.ts`, `lib/computations.ts`, `lib/summaries.ts`, `lib/row-colors.ts`, `hooks/useLinks.ts`, `hooks/useRecords.ts`, `hooks/tableBootstrap.ts`, `hooks/useBatchedLinks.ts`, `hooks/useLookupRollup.ts`, `hooks/useRealtime.ts`, `hooks/useNavPrefs.ts`, `types/index.ts`, `components/ImportAirtableDialog.tsx` (link, lookup, rollup passes), `pages/SharedViewPage.tsx`, `supabase/functions/ddl-executor/index.ts` (createTable, linkedQuery), `rest-api/index.ts` (type tables, pool), `__tests__/formulaLinks.test.ts`; and the memory notes on the KDS Finances import, the backup schema and the REST API limits.

---

## 0. What the code reading changed in the design (read first)

These are facts that are not in the earlier plan and that shape everything below.

1. **Imported junction tables are per pair of tables, not per link field.** The importer names the junction `jn_<tableA>_<tableB>` (names sorted) and every link field between that pair writes into it (`ImportAirtableDialog.tsx` lines 853 and 1032). Two link fields between the same two tables cannot be told apart afterwards. **(read)**
2. **The "two rows" come from the importer replaying both sides.** For each link field it reads that field's jsonb array of Airtable ids and inserts `(source = this record, target = linked record)`. The inverse field has its own jsonb and inserts the mirror row. **(read)** That is why many-to-many links have two rows and why a one-sided link has one.
3. **The app writes one row, from either side.** `useLinkMutations.linkRecord` inserts `source_id = the record you are on`, whichever table that is. Readers use `source_id = X OR target_id = X` (`useLinks.ts` line 177, `useBatchedLinks.ts` lines 137 to 145, and the `linkedQuery` SQL in `ddl-executor`). So direction is not meaningful today and self-links cannot work. **(read)**
4. **`type` means different things in two places.** The importer sets `hm` when Airtable says `prefersSingleRecordLink` (a "single link" field), otherwise `mm`. `useCreateLink` uses `hm` for "one has many, foreign key column on the target". Cardinality metadata on imported fields is therefore not reliable. **(read)**
5. **Imported rollups all say SUM.** `ImportAirtableDialog.tsx` line 987: "Airtable API doesn't expose the rollup function; default to SUM". Any imported AVG, COUNT, MIN, MAX or ARRAYJOIN rollup is mislabelled. The legacy text column still holds Airtable's real answer, so the real function can be inferred (section 3.7). **(read)**
6. **`useCreateLink` only writes a `nc_meta.links` row for the forward field.** The reciprocal field gets none. Readers look up the junction by `field_id` (`useBatchedLinks.ts` line 69), so the reverse side of an app-created many-to-many link finds no junction and shows nothing. Imported links are fine because the importer upserts a `links` row per field. **(inferred from code, not seen running)** Also the junction name `<src>_<tgt>_jn` collides if two links join the same pair.
7. **Link filter and sort are not scalable.** They call `ddl-executor` `linkedQuery`, get a list of record ids back, and put them in the next request URL as `.in('id', ids)` or one `.neq` per id (`useRecords.ts` lines 435 to 445 and 657 to 667). A uuid costs 37 bytes in the URL, so a few hundred matches exceed common URL limits (estimate: about 100 to 400 ids depending on the proxy). Link sort fetches 5,000 rows and sorts in the browser, so anything past 5,000 rows is silently wrong. `linkCountIs/Gt/Lt` filter the legacy jsonb column with `filter(col,'eq',n)`, which compares a number to a jsonb array and cannot work. **(read)**
8. **Realtime invalidates the whole table.** Every `postgres_changes` event calls `invalidateQueries(['nc','records',base,table])` with no debounce (`useRealtime.ts`). An infinite query refetches every loaded page one after another, so with 34 pages loaded one edit by someone else costs 34 requests. **(read; the refetch-all-pages behaviour is TanStack Query's default, not checked in this repo's version)**
9. **Footer and group maths run on loaded rows only** (`summaries.ts` works on arrays handed to it), and the first page is 100 rows. Totals are wrong until every page is loaded. **(read)**
10. **Offset pagination has no tiebreaker.** `order(sortColumn)` with `range(from,to)` and no `id` in the ORDER BY: rows with equal sort values can repeat or vanish between pages. **(read)**
11. **Personal settings are in the browser.** Row colour rules, conditional formats and row height are in a zustand store persisted to `localStorage` per view (`lib/store.ts`); pinned tables and "show hidden tables" are `localStorage` too (`useNavPrefs.ts`). They do not follow the user to another device and are not shared. **(read)**
12. **Everything in `nc_meta` and every data table is "any signed-in user can do anything"** (`USING (true)` policies; `createTable` in `ddl-executor` lines 331 to 357). **(read)**
13. **The shared-view page reads the whole table.** `SharedViewPage.tsx` lines 88 to 96 selects `*` ordered by `nc_order` with no view filters and no hidden-field removal, with whatever session the viewer has. A view that hides columns or rows in the UI does not hide them from the network. **(read; whether an anonymous visitor can reach it depends on grants I could not see)**
14. **Deleting a record is not atomic and loses its links.** `useTrash.ts` inserts the row JSON into `nc_meta.trash`, then deletes the row in a second request; restore re-inserts the row JSON only. Link rows are not captured. **(read)**
15. **The browser formula engine and SQL disagree in places** (section 3.4): `=` is loose but `!=` is strict, `<` and `>` turn dates into 0, MIN and MAX turn blanks into 0, dates use the browser time zone, `/` by zero gives blank. Moving to SQL fixes some of these and changes results; the golden test in section 3.7 is how the owner sees exactly which rows change.
16. **`ddl-executor` uses a pool of one connection** (`new Pool(dbUrl, 1, true)`), `rest-api` a pool of two. Anything heavy must run in SQL inside Postgres, not as many small edge-function queries. **(read)**
17. **Deploy model constraint (CLAUDE.md):** everything merged to `main` deploys to the live Supabase project automatically, migrations and edge functions alike. So this spec installs machinery in migrations that is **inert until called**, and runs per-base changes through an explicit, logged, reversible step that is first rehearsed on a clone. "Safe to build autonomously" in section 6 means "merging only adds inert objects".

---

## 1. Honest gap table

Airtable and NocoDB columns are from my product knowledge and are not re-verified this session (the field-types research doc has fetched sources for field types only). Where I am unsure about NocoDB I say so. Status: **Have / Partial / Missing**.

### Data model

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Real typed tables per base | NocoDB: yes (real tables). Airtable: n/a | Each base is a Postgres schema, each table a real table with typed columns, metadata in `nc_meta` | Have | |
| Field type range | Airtable about 25 types incl. collaborator, button, AI. NocoDB similar | 34 UI types in `types/index.ts`. Rich text, button actions, AI and multi-collaborator are stubs or missing | Partial | M |
| Workspaces and bases | Airtable: workspaces with members. NocoDB: workspaces, bases | `nc_meta.workspaces` exists; one seeded workspace, no members table | Partial | M |
| Safe rename and type change | Airtable: formulas follow renames | Formula text refers to fields **by name** (`FieldRef.name`); renaming a field breaks formulas. Type conversion rules exist (`ConversionRule`) | Partial | S |
| Stable record ids, history, trash, snapshots | Both | Audit log, record history, trash (30 days), snapshots, `daily-backup`. Trash drops links (finding 14) | Have | S to fix links |

### Links

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Two-way many-to-many link | Both, one canonical store | Junction rows, direction-less, two rows per pair when imported, reverse side of app-created links may be empty (findings 1 to 6) | Partial | L |
| Several link fields between the same two tables | Both | Impossible to distinguish after import; name collision on app-created | Missing | L (part of links v2) |
| Cardinality enforced by the database | NocoDB: FK / junction rules. Airtable: "allow multiple" | `allowMultiple` is a UI option only; no constraint | Missing | M |
| Ordered linked records | Airtable keeps the order in the cell | No order column | Missing | S |
| Self-links (Employee to Manager) | Both | Cannot work with direction-less rows | Missing | M |
| Link filter, sort, group at scale | Both server-side | Id list in the URL, 5,000-row browser sort, jsonb count filters (finding 7) | Partial | M |
| Link writes through the API | Both | API skips link fields | Missing | M |
| Link labels in the same response as rows | Airtable: yes. NocoDB: yes | About 30 extra requests per page of 100 rows for 5 link fields (section 4.6) | Partial | M |

### Computed fields

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Formula function breadth | Airtable about 100. NocoDB less | 73 functions in `BUILTIN_FUNCTIONS` (counted from `formula.ts`) | Have (in the browser) | |
| Computed values correct for any writer (SQL, API, app) | Airtable: server recalculates and API returns values. NocoDB: formulas are evaluated in the query (my recollection, not verified) | Browser only; imported results are static text that SQL, API and app writes do not update | Missing | L |
| Dependency tracking and recalculation order | Airtable: yes (server) | None; no dependency table | Missing | L |
| Sort and filter on computed fields in SQL | Both | Impossible (no stored value) | Missing | L |
| Rollups and lookups across links | Both | Browser computes from loaded rows; Budget totals depend on what is loaded | Partial | L |
| Time-based formulas (TODAY, NOW) | Airtable: refreshed by the server | Browser only, evaluated at render | Partial | S to M |
| Formula editor with errors and preview | Both | Editor and validation exist (`FormulaEditor.tsx`, `validateFormula`) | Have | |

### Views and personal views

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| View types | Airtable: grid, form, calendar, gallery, kanban, timeline, list, gantt (some paid). NocoDB: grid, gallery, form, kanban, calendar (map: not sure) | Grid, kanban, form, calendar, gallery, timeline, gantt | Have | |
| Nested filters, sorts, groups, hidden fields, widths, order | Both | Stored in `nc_meta.views` (`filters`, `sorts`, `groups`, `field_order`, `field_visibility`, `field_widths`) | Have | |
| Personal views and per-user view settings | Airtable: personal views. NocoDB: personal vs collaborative | `nc_meta.views` has no owner or visibility column | Missing | M |
| Row colour and conditional format saved with the view | Both | In the browser store, per view, per device (finding 11) | Partial | S |
| Per-view field colour, bold, wrap, alignment | Airtable: some | Not stored | Missing | S |
| Locked view | Both | `is_locked` column exists | Partial | S |
| Server-side filter, sort, search, aggregates | Both | Filters and sorts are PostgREST calls; search ORs `ilike` over every text column; footer and groups run in the browser | Partial | L |

### Permissions

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Base roles (owner, editor, commenter, viewer) | Both | Any signed-in user can read and write everything (finding 12) | Missing | L |
| Field read-only or hidden per role | Airtable: enterprise tiers. NocoDB: yes (not sure which tier) | None; "read-only" exists only for computed types in the UI | Missing | L |
| Shared view link with password | Both | `nc_meta.shared_views`, bcrypt hash in an RPC. Does not apply the view's filters or hidden fields (finding 13) | Partial | M |
| Scoped API keys | Both | Platform-wide key, generic scopes | Partial | M |

### Collaboration

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Comments, notifications, presence, record history, audit log | Both | All exist (`RecordComments`, `NotificationsPanel`, `PresenceIndicator`, `RecordHistoryPanel`, `AuditLogDialog`) | Have | |
| Live updates from other people | Both patch cells in place | Whole-table invalidation (finding 8) | Partial | S |

### Automations

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Triggers and actions with run history | Both | Record created, updated, matches conditions, scheduled, inbound webhook; create, update, email, notify, if/else, delay, log; runs table | Have | |
| Find records, upsert, HTTP request, email trigger | Both | Missing (per the plan doc, section 5b) | Missing | M |
| Runs for API and SQL writes | Both | App writes only | Missing | M |

### Forms and interfaces

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Form view | Both | `FormView` with `form_config` (title, required, hidden, one condition per field) | Partial | M |
| Public form submit with validation | Both | Client insert from `SharedViewPage`; no server-side check | Partial | M |
| Interface or page builder | Airtable: Interfaces. NocoDB: not sure | None | Missing | L |

### Dashboards and charts

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Chart and number blocks, dashboards | Airtable: Dashboards and Interfaces. NocoDB: not sure | None. `recharts` is already a dependency | Missing | L |
| Column summaries in the grid footer | Both | Exists, loaded rows only (finding 9) | Partial | M |

### Import, export

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| CSV and Airtable import | Both | Both exist. Airtable import loses rollup function (finding 5), stores formulas as text, links as jsonb plus junction | Partial | M |
| Full-fidelity export (JSON, with links and computed specs), base templates | NocoDB: some. Airtable: base copy, templates | CSV only (shared view option); snapshots exist | Missing | M |

### API

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| CRUD with keys and webhooks | Both | `rest-api` plus webhooks with retry and replay | Have | |
| Airtable-shaped `/v0`, upsert, typecast, linked ids, meta API | Airtable: yes. NocoDB: its own shape | Gap list in the plan doc, section 3.1 | Missing | L |
| Generated per-base docs | NocoDB: swagger. Airtable: per-base API page | Developer Hub reference, not per base | Partial | M |

### Performance at 100k rows

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| First paint of a table | Both fast | About 2 requests to first rows after the speed work, **not measured** | Partial | |
| Server pagination with stable order | Both | Offset without tiebreaker (finding 10) | Partial | M |
| Indexes by field type | NocoDB: manual. Airtable: n/a | None created by `createTable` or `addColumn`; junction columns not indexed (I saw no index statement; **verify on live**) | Missing | S to M |
| Virtual scroll beyond a few thousand rows | Both | `useVirtualizer` over an ever-growing page list; link sort capped at 5,000 | Partial | M |
| Exact totals and aggregates | Both | Estimated count only | Partial | M |

### Customisation

| Capability | Airtable / NocoDB | KDOps today | Status | Effort |
|---|---|---|---|---|
| Per-user theme, density, formats that follow the user | Airtable: limited. NocoDB: limited | Light and dark follow the app; density in browser storage | Partial | M |
| Field colour and icon | Airtable: colours on select options, icons on fields (limited) | `options.icon` exists for some types | Partial | S |
| Templates for bases and tables | Both | None | Missing | M |
| Buttons and custom actions | Both | `Button` type exists, no actions (field-types research, item 15) | Partial | M |

---

## 2. Target data structure for links

### 2.1 Decision: one canonical row per link, no per-link views

Compared on what matters:

| | A. One canonical row (recommended) | B. Keep two rows |
|---|---|---|
| Write atomicity | One insert. Nothing to keep in sync | Two inserts that can diverge; a failed second insert leaves a one-way link |
| Uniqueness | Primary key `(source_id, target_id)` stops duplicates | Needs a unique constraint plus a rule that the mirror exists |
| Storage and index size | Half | Double |
| Reverse reads | One extra index `(target_id, source_id)`; same speed as forward | Same table, but queries need `OR` across two columns, which is the slow shape `linkedQuery` uses today |
| Self-links and two links between the same tables | Work, because direction is meaning (left field vs right field) and each link has its own table | Impossible to tell apart |
| Deleting a record | `ON DELETE CASCADE` on two foreign keys; one row per link | Two rows per link to cascade; mirror rows are easy to orphan |
| Cost of change | Convert in place (same column names), old readers keep working | None, but nothing improves |

**No view for the reverse direction.** One view per link would add one more object per link to the PostgREST schema cache and still needs `UNION` logic for "both directions", which is what makes the current query slow and ambiguous. Instead: a function `nc_meta.linked_ids(field_id, record_ids[])` picks the direction from metadata (section 2.3), and the records RPC (section 4.5) uses it. Nothing in the browser needs to know which side is "left".

**One storage mechanism.** Convert every link to a junction table, including foreign-key based `hm`/`oo`. Foreign-key links cannot be ordered, collide on the column name `<src>_id` when two links join the same pair, cannot be self-links and cannot be read by one generic function. Cost: one extra lookup for one-to-many reads, covered by the junction index.

### 2.2 Target schema (SQL sketch)

Same column names as today (`source_id`, `target_id`) so existing readers and writers keep working during the transition. `source_id` is always a record of the **left table** (the table that owns the forward field); `target_id` a record of the **right table**.

```sql
-- One junction per link (relationship), created by nc_meta.create_link(); example: Budget "Expenses" <-> Expenses "Month"
create table nc_x.lnk_5a1c9e02 (
  id         uuid primary key default gen_random_uuid(),   -- keep: existing jn_ tables already have id/created_at/... from createTable
  source_id  uuid not null references nc_x.budget(id)   on delete cascade,
  target_id  uuid not null references nc_x.expenses(id) on delete cascade,
  position   double precision not null default 0,          -- order of target records inside the source record's cell
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  nc_order   double precision
);
create unique index lnk_5a1c9e02_pair   on nc_x.lnk_5a1c9e02 (source_id, target_id);    -- no duplicates
create index        lnk_5a1c9e02_rev    on nc_x.lnk_5a1c9e02 (target_id, source_id);    -- reverse reads
create index        lnk_5a1c9e02_order  on nc_x.lnk_5a1c9e02 (source_id, position);     -- ordered forward reads
-- Cardinality by constraint, chosen per link by the owner (section 2.4):
create unique index lnk_5a1c9e02_one_per_target on nc_x.lnk_5a1c9e02 (target_id);       -- "an Expense has one Month"
--   single link on the left side (allowMultiple=false):  create unique index ... (source_id);
alter table nc_x.lnk_5a1c9e02 enable row level security;  -- same four policies as record tables, replaced by role policies later (section 5.8)
```

Existing `jn_*` tables keep their names (renaming is churn with no gain). The importer's shared `jn_<a>_<b>` is split into one table per link field during conversion (2.6). New links get `lnk_<first 8 hex of link_key>`.

Guard against old writers: a transitional `BEFORE INSERT` trigger swaps the two ids when they arrive reversed (the app writes `source_id = current record`, even from the right-hand table):

```sql
create function nc_fn.lnk_normalise() returns trigger language plpgsql as $$
declare l_tbl text := tg_argv[0]; r_tbl text := tg_argv[1]; is_left boolean; is_right boolean; tmp uuid;
begin
  if l_tbl = r_tbl then return new; end if;                        -- self-link: direction is as written
  execute format('select exists(select 1 from %s where id = $1)', l_tbl) into is_left  using new.source_id;
  if is_left then return new; end if;
  execute format('select exists(select 1 from %s where id = $1)', r_tbl) into is_right using new.source_id;
  if is_right then
    tmp := new.source_id; new.source_id := new.target_id; new.target_id := tmp;   -- reversed write: swap
  end if;
  return new;
end $$;
```
(The trigger is removed once all writers go through `nc_meta.set_links`, step 4 of section 6.)

### 2.3 Metadata

`nc_meta.links` is one row per field today (importer upserts one per field, `onConflict: 'field_id'`). Keep that, add columns (all additive, nullable or defaulted):

```sql
alter table nc_meta.links
  add column link_key          uuid,                -- same value on both sides' rows
  add column side              text check (side in ('left','right')),
  add column storage_version   int  not null default 0,        -- 0 = legacy shared/dual rows, 1 = canonical (this spec)
  add column cardinality       text check (cardinality in ('many_many','one_many','many_one','one_one')),
  add column junction_pg_table text,                -- the table that holds this link, so readers skip one lookup
  add column allow_multiple    boolean,             -- left-side "single link" option, enforced by index when true
  add column ordered           boolean not null default true;
```
`fields.options` keeps `relatedTableId` for compatibility. `fields.options.type` is no longer read once `cardinality` exists (finding 4).

Reader function (stable, security invoker so row access rules still apply):

```sql
create function nc_meta.linked_ids(p_field uuid, p_records uuid[])
returns table(record_id uuid, linked_id uuid, pos double precision)
language plpgsql stable as $$
declare l record;
begin
  select ln.side, ln.storage_version, ln.junction_pg_table, b.schema_name
    into l from nc_meta.links ln
    join nc_meta.fields f on f.id = ln.field_id
    join nc_meta.tables t on t.id = f.table_id
    join nc_meta.bases  b on b.id = t.base_id
   where ln.field_id = p_field;
  if l.storage_version = 0 then       -- legacy: either column, de-duplicated (works for mirrored and one-sided rows)
    return query execute format(
      'select distinct case when source_id = any($1) then source_id else target_id end,
                       case when source_id = any($1) then target_id else source_id end, 0::double precision
         from %I.%I where source_id = any($1) or target_id = any($1)', l.schema_name, l.junction_pg_table) using p_records;
  elsif l.side = 'left' then
    return query execute format('select source_id, target_id, position from %I.%I where source_id = any($1)', l.schema_name, l.junction_pg_table) using p_records;
  else
    return query execute format('select target_id, source_id, 0::double precision from %I.%I where target_id = any($1)', l.schema_name, l.junction_pg_table) using p_records;
  end if;
end $$;
```
The legacy branch is the same OR read the app does today, so switching readers to this function changes nothing visible before conversion.

### 2.4 Rules (integrity, deletes, ordering, uniqueness)

| Rule | Mechanism |
|---|---|
| No dangling links | Foreign keys to both record tables, `ON DELETE CASCADE`. Added `NOT VALID` first, then `VALIDATE CONSTRAINT` after orphans are moved to `nc_meta.link_quarantine` |
| No duplicate links | Unique index `(source_id, target_id)` |
| "One Month per Expense" and "single link" options | Unique index on `target_id` (one-to-many) or `source_id` (allow_multiple = false). **The owner confirms each one**, because a constraint can later reject a write. Imported `hm` flags are not trusted (finding 4); the audit proposes a cardinality from the data (every left record has at most one right record), the owner approves |
| Delete a record | Cascade removes its links. The cascade fires the junction triggers, so rollups recompute (section 3.5) |
| Delete a link field | `nc_meta.drop_link(field_id)`: refuses if a computed field depends on it (lists them), otherwise drops junction, both fields, both `links` rows |
| Drop a table | `ddl-executor dropTable` must call `drop_link` for every link touching it first. Today it does not know about junctions |
| Restore from trash | `nc_meta.trash.record_data` gets a sibling column `link_data jsonb` (`{fieldId: [ids]}`) written by one SQL function that copies the row and its links and deletes it in one transaction; restore re-inserts both |
| Order of linked records | `position` per `(source_id)`; reads `ORDER BY position, id`. Imported rows get `row_number() over (partition by source_id order by created_at, id)`. The right-hand side of a link orders by the right table's own order (it has no cell order) |
| Self-link | Allowed when both fields exist (forward "Manager", reverse "Reports"); direction is the field, not the column test |
| Two links between the same two tables | Two junction tables. This is why the importer's shared `jn_` is split (2.6) |

### 2.5 Retiring the legacy jsonb columns and `airtable_id`

**jsonb link columns** (the `multipleRecordLinks` columns, `pgType JSONB`, holding Airtable record ids). Where they are read today: `linkCountIs/Gt/Lt` filters, the formula `FieldRef` id-to-label lookup (`__linkLookup`, `useLinkDisplayLookup`, which loads up to 5,000 rows per related table) and possibly CSV export **(guess; grep before step 14)**. They are stale because the app writes only the junction. Retire in five stages, one per release, each reversible:

| Stage | What happens | Rollback |
|---|---|---|
| J0 audit | For every link field compare the Airtable-resolved set (`jsonb` ids joined to the right table by `airtable_id`) with the junction set. Report only-in-jsonb, only-in-junction, equal | Read-only |
| J1 reconcile | Rows with jsonb links and **no** junction rows are backfilled into the junction (the import evidence wins). Where both exist and differ, a row edited after the import date keeps the junction; older rows keep the Airtable set. Anything left over is a list for the owner | Junction rows added in J1 are tagged (`nc_order = -1` or a `created_by` marker) and removable |
| J2 stop reading | Link-count filters, formulas, `useLinkDisplayLookup` and export read through `nc_meta.linked_ids`. The jsonb columns are hidden (`is_hidden`, `is_system`) | Flip the field flags back |
| J3 freeze | `BEFORE INSERT OR UPDATE` trigger on the column: first 14 days only logs writers to `nc_meta.legacy_write_log` (finds any n8n flow, automation or function still writing it), then raises an error | `ALTER TABLE ... DISABLE TRIGGER` |
| J4 retire | Rename to `__retired_<name>`, keep 60 days with the backup schema, then drop with explicit approval | Rename back |

Do **not** drop the jsonb before the junction split in 2.6: it is the only evidence for which link field a shared-junction row belongs to.

**`airtable_id`.** Keep it. It is a cheap hidden text column, it is the only bridge from Airtable record ids to KDOps ids, it is how `rest-api` can keep answering old `rec...` ids (plan doc decision 2), and the importer needs it to re-run. Make it safe rather than remove it: `create unique index ... (airtable_id) where airtable_id is not null` (fails loudly if the import ever duplicated one), hide it from the field list, and add a counter `nc_meta.legacy_id_hits(table_id, day, hits)` bumped when the API resolves a `rec...` id. Retire only after 60 days with zero hits **and** the owner confirming no Airtable-era flow remains, by moving the ids to `nc_meta.record_aliases(table_id, record_id, alias)` first (so the information is kept, only the wide column goes).

### 2.6 Migration plan, provable on the copy

Target of proof: the copy base (schema `nc_kds_finances_1791739583444`, now renamed "Old KDS Financesss"). The memory note says not to change it without asking; this brief asks for it, but a safer way is to **rehearse on a throwaway clone of the copy** so the copy stays untouched:

```sql
select nc_meta.clone_base_for_rehearsal('afa79c02-05f6-4d2d-b241-9a9330ab5ff6');   -- creates schema nc_rehearsal_<ts>; CREATE TABLE ... (LIKE ... INCLUDING ALL) + INSERT ... SELECT; copies nc_meta rows with new ids; drop when done
```

Steps (each is a function, installed inert, called explicitly):

1. **Audit (read-only), run on live and copy.** `nc_meta.audit_links(base_id)` returns per link field: junction table, how many link fields share it (`select junction_table_id, count(*) from nc_meta.links group by 1 having count(*) > 1` is the shared-table test), row count, mirrored pairs (a,b) and (b,a), orphans, duplicates, self-pairs, rows whose source is in the right table, only-in-jsonb and only-in-junction counts. Output is a table the owner can read.
2. **Snapshot.** `backup_<base>_<date>` schema, same method as `backup_kds_finances_20261122`. Also `nc_meta.links_before` (copy of the rows being changed) so the metadata can be put back.
3. **Convert one link in one transaction, with a self-check, rolling back on any difference:**

```sql
-- nc_meta.convert_link_to_v2(p_field_id uuid, p_apply boolean default false) returns jsonb   -- placeholders in :caps
begin;
  -- the set the app shows today, direction-free and de-duplicated, as (left_id, right_id):
  create temp table _before on commit drop as
    select distinct l.id as source_id, r.id as target_id
      from :schema.:jn j
      join :schema.:left  l on l.id in (j.source_id, j.target_id)
      join :schema.:right r on r.id in (j.source_id, j.target_id) and r.id <> l.id;     -- self-link: handled separately, direction as written
  -- shared-junction split: keep only pairs this field's own jsonb claims (or that the app added after import)
  create temp table _mine on commit drop as
    select b.* from _before b
     where exists (select 1 from :schema.:left a, jsonb_array_elements_text(coalesce(a.:jsonb_col,'[]')) x
                    where a.id = b.source_id and exists (select 1 from :schema.:right t where t.id = b.target_id and t.airtable_id = x))
        or not exists (select 1 from :schema.:left a where a.id = b.source_id and jsonb_array_length(coalesce(a.:jsonb_col,'[]')) > 0);  -- approximate; the audit lists ambiguous cases for the owner
  create table :schema.:new_jn (like :schema.:jn including defaults);
  insert into :schema.:new_jn (source_id, target_id, position)
    select m.source_id, m.target_id, row_number() over (partition by m.source_id order by m.target_id) from _mine m;
  -- indexes, FKs (NOT VALID), unique(s) as in 2.2, normalise trigger
  -- SELF-CHECK: the result read through nc_meta.linked_ids must equal _mine, both directions
  if exists (select 1 from (select * from _mine except select * from <readback>) a)
     or exists (select 1 from (select * from <readback> except select * from _mine) b) then raise exception 'link conversion mismatch'; end if;
  update nc_meta.links set storage_version = 1, junction_pg_table = ':new_jn', ... where field_id in (:both_sides);
commit;   -- only when p_apply; otherwise rollback and return the counts
```
   The old `jn_` table is left in place (renamed `__retired_...` in a later step). Because the switch is one metadata update inside the same transaction, readers see either all-old or all-new.
4. **Prove it.** Acceptance on the rehearsal clone, all must hold: (a) for every link field and every record, the sorted array of linked ids from the legacy method equals the array from `linked_ids` (zero differences); (b) Budget "Expenses (actual)" computed from the browser path equals the SQL rollup (section 3) for every Budget row; (c) a delete of one Expense removes its link row and the Budget total changes by exactly its Cost; (d) `explain` for `linked_ids` on 100 ids uses the new index (no sequential scan of the junction); (e) unit tests with synthetic fixtures covering a shared junction with two fields, mirrored rows, one-sided rows, orphans, a self-link, reversed writes.
5. **Live.** Only after steps 1 to 4 pass and the owner approves: new snapshot, then convert **one** link first (Expenses to Month, the one that drives Budget), watch, then the rest in dependency order. Each step is its own call, logged to `nc_meta.structure_log(step, field_id, status, before_counts, after_counts, ran_by, ran_at)`.
6. **Rollback** for a converted link: `nc_meta.revert_link_v2(field_id)` points the `links` row back at the retained old table (`storage_version = 0`) and drops the new one. Valid until the old table is retired (60 days). For a bad conversion discovered later, restore from the snapshot schema.

Tests live in `supabase/tests/links_v2.sql` in the existing style (psql, `ON_ERROR_STOP`, everything rolled back; see `supabase/tests/agent_foundation.sql`).

---

## 3. Computed fields done properly

### 3.1 Options compared

| | (a) Generated columns | (b) Trigger-maintained stored columns + dependency graph | (c) Views / materialised views | (d) Compute on read in an edge function |
|---|---|---|---|---|
| Correct for SQL, API and app writes | Yes (single row) | Yes, all writers | Yes (views); no (materialised until refreshed) | Only for readers that go through the function; direct PostgREST reads and SQL do not |
| Rollups, lookups, counts across links | **No.** A generated column cannot read other rows or tables (Postgres docs, cited in `database-ux-research.md` section 5) | Yes | Yes | Yes |
| Formula reading another computed column | **No** (a generated column cannot reference another generated column), so chains must be inlined | Yes, ordered by level | Yes | Yes |
| Sort, filter, index, footer aggregate in SQL | Yes | Yes (plain columns) | Yes for views but the whole join is computed before sorting; materialised yes | No (must compute all rows first) |
| Changing a formula | `DROP COLUMN` + `ADD COLUMN` rewrites the table under an exclusive lock, and **destroys the imported text values** | Replace one function, then backfill | `CREATE OR REPLACE VIEW` cannot drop columns; dependants break | Redeploy |
| Non-immutable functions (TODAY, text-from-date) | Not allowed | Allowed (volatile ones are refreshed by a schedule) | Allowed | Allowed |
| Imported data kept | No | Yes, sidecar column and swap | n/a | n/a |
| 100k rows and a Budget with many children | Fine | Write cost only on change, reads are plain | Slow sorts on aggregated columns | Not viable |
| PostgREST and realtime | Read-only column for free | Normal column, realtime events on the parent row | View needs `security_invoker`, writes need a second name | Bypasses both |
| Complexity | Low | **High** (compiler, triggers, deps, repair) | Medium | Medium |

**Recommendation: (b) for every field whose value is a function of data** (single-row formulas, lookups, rollups, counts), with these refinements:

- Single-row formulas are computed by a `BEFORE INSERT OR UPDATE` row trigger, **not** a generated column. Reasons: they can read other computed columns in level order, they can read link labels (`Expenses.Name = {Month} & " — " & {Category}` reads a link; read in `__tests__/formulaLinks.test.ts`), they adopt the existing columns without dropping them, and changing a formula replaces a function instead of rewriting the table.
- Time-based fields (TODAY, NOW) are **volatile**: refreshed nightly by `pg_cron` (already used in this repo) at 00:05 Africa/Lagos (23:05 UTC), and displayed by the browser engine in between. They are excluded from SQL filters and the API in v1.
- (c) is used only where it fits: group and footer aggregates are computed by an RPC (section 4.4), not by views.
- (d) is rejected as the main path (pool of 1 or 2 connections, cold starts, cannot sort or filter). The same formula source of truth is still used by a TypeScript compiler that runs in the edge function **only to generate SQL**.
- Compilation always happens **server-side from the parsed AST with a whitelist of functions and quoted identifiers** (reusing `quoteIdent` from `ddl-guard-core`). Never accept SQL text from the browser: the trigger body would become a way to run arbitrary SQL as the table owner.

### 3.2 Metadata

```sql
create table nc_meta.field_compute (
  field_id     uuid primary key references nc_meta.fields(id) on delete cascade,
  kind         text not null check (kind in ('formula','lookup','rollup','count')),
  spec         jsonb not null,        -- formula: AST with field ids (not names); lookup/rollup: {link_field_id, target_field_id, fn}
  result_type  text not null,         -- numeric, text, date, timestamptz, boolean, text[]
  volatility   text not null default 'stable' check (volatility in ('stable','volatile')),
  eval_level   int  not null default 0,        -- topological level inside the table
  status       text not null default 'legacy' check (status in ('legacy','shadow','live','error')),
  legacy_column text,                 -- the imported text column, kept until retired
  prev_field   jsonb,                 -- fields row before conversion, for rollback
  compiled_sql text,                  -- inspection only; written by the server, never client-writable
  error        text,
  compiled_at  timestamptz
);
create table nc_meta.field_deps (
  field_id            uuid not null references nc_meta.fields(id) on delete cascade,   -- the computed field
  depends_on_field_id uuid not null references nc_meta.fields(id) on delete cascade,
  via_link_field_id   uuid references nc_meta.fields(id) on delete restrict,           -- null = same row
  primary key (field_id, depends_on_field_id, via_link_field_id)                       -- (use a unique index with coalesce for the null)
);
```
Rules enforced when a computed field is saved: no cycles (checked on the dependency graph), depth cap 5 for chains through links, rename-safe (the AST stores field ids, so renaming a field no longer breaks formulas). **Authority:** `fields.options` (`linkFieldId`, `rollupFieldId`, `fn`, `expression`) and `nc_meta.formulas/rollups/lookups` both hold configuration today; the importer writes both **(read)**. v2 reads `field_compute` only, filled from whichever the field has; the old tables become read-only legacy.

### 3.3 Generated objects (names, SQL sketches)

All generated code lives in a new schema `nc_fn` that is **not** exposed to PostgREST. Everything is produced by `nc_meta.rebuild_compute(table_id)`, callable only by `service_role` (`revoke ... from public, anon, authenticated`), invoked by `ddl-executor` when a computed field is created, edited or deleted (Super Admin only, like all DDL there).

1. **Row function** `nc_fn.t_<table8>_calc()` and trigger `nc_calc` (BEFORE INSERT OR UPDATE, FOR EACH ROW), one per table that has formulas:

```sql
-- generated for Expenses: Name = {Month} & " — " & {Category}
create or replace function nc_fn.t_242b8b70_calc() returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if current_setting('nc.compute_off', true) = 'on' then return new; end if;           -- kill switch
  -- level 0
  new.name := concat(
    (select string_agg(b.name, ', ' order by j.position)
       from nc_x.jn_budget_expenses j join nc_x.budget b on b.id = j.source_id
      where j.target_id = new.id),
    ' — ', new.category);
  return new;
end $$;
create trigger nc_calc before insert or update on nc_x.expenses
  for each row execute function nc_fn.t_242b8b70_calc();
```
   An explicit write to a computed column is overwritten by the trigger (computed wins). `rest-api` and the app also refuse such writes up front with a clear error; the database overwrite is the safety net.

2. **Rollup recompute** `nc_fn.r_<field8>(p_ids uuid[])`, one per rollup, locks parents in id order (avoids deadlocks) and writes only when the value changed:

```sql
-- Budget "Expenses (actual)" = SUM of linked Expenses.Cost
create or replace function nc_fn.r_9b3f0a11(p_ids uuid[]) returns void language plpgsql as $$
begin
  perform 1 from nc_x.budget where id = any(p_ids) order by id for update;
  perform set_config('nc.computing', 'on', true);
  update nc_x.budget p set expenses_actual = s.v
    from (select a.id, coalesce(sum(e.cost), 0) as v
            from nc_x.budget a
            left join nc_x.jn_budget_expenses j on j.source_id = a.id
            left join nc_x.expenses e           on e.id = j.target_id
           where a.id = any(p_ids) group by a.id) s
   where p.id = s.id and p.expenses_actual is distinct from s.v;
  perform set_config('nc.computing', 'off', true);
end $$;
```
   Because it is an ordinary `UPDATE` of the parent, the parent's own `nc_calc` trigger recomputes formulas that read this rollup (level order), and the parent's own rollup triggers fire for rollups of rollups. The depth cap and the acyclic check bound the cascade; `pg_trigger_depth() > 8` raises as a last guard.

3. **Statement-level feeders** (one batch recompute per statement, not per row; bulk inserts of 3,000 rows recompute each parent once):

```sql
create function nc_fn.trg_9b3f0a11_link_ins() returns trigger language plpgsql as $$
begin
  perform nc_fn.r_9b3f0a11((select array_agg(distinct source_id) from new_rows));        -- rollup on the left table
  perform nc_fn.touch_expenses((select array_agg(distinct target_id) from new_rows));    -- formulas on the right table that read the link label
  return null;
end $$;
create trigger nc_calc_ins after insert on nc_x.jn_budget_expenses
  referencing new table as new_rows for each statement execute function nc_fn.trg_9b3f0a11_link_ins();
-- same for DELETE (old table) and UPDATE (both tables).
create trigger nc_calc_cost after update of cost on nc_x.expenses            -- the rolled-up column changed
  referencing old table as old_rows new table as new_rows for each statement execute function nc_fn.trg_9b3f0a11_child_upd();
```
   `touch_<table>(ids)` is `update t set id = id where id = any(ids)` under `nc.computing = on`, which re-runs the row function. A rename of a Budget row (`name`) feeds the same way through an `AFTER UPDATE OF name` trigger on `budget`, so `Expenses.Name` follows a renamed month.

4. **`updated_at` must not lie.** The shared function `nc_meta.nc_update_timestamp()` gets one added condition: skip the `updated_at` bump when `current_setting('nc.computing', true) = 'on'`. Without it every Expense insert would mark its Budget month as "edited just now". The change is additive (the function is used by every `set_updated_at` trigger, so it ships in its own migration with a test).

5. **Volatile refresh** `nc_meta.refresh_volatile()` via `cron.schedule('nc-volatile', '5 23 * * *', ...)`.
6. **Drift check** `nc_meta.verify_computed(table_id)` recomputes into a temp table and diffs against stored values, weekly by `pg_cron`, writes `nc_meta.compute_drift_log`, optionally repairs. This is what keeps the design honest if someone disables a trigger or restores a backup.

### 3.4 Formula AST to SQL: what maps and what does not

The compiler is a new pure TypeScript module `src/features/database/lib/formulaSql.ts` (parser reused from `formula.ts`, which has no DOM dependencies **(read)**). Supabase function bundles do not reliably import from `src/`, so the compiler is copied into `supabase/functions/_shared/formula-sql.ts` by a script and a CI check fails when the two differ **(guess about the bundling limit; verify in step 6)**.

**It needs a type pass first**, because the browser engine is dynamically typed and SQL is not. Field types map to SQL types (Number, Currency, Percent, Decimal to `numeric`; text types and selects to `text`; Date to `date`; DateTime to `timestamptz`; Checkbox to `boolean`; MultiSelect to `text[]`; Links to the joined label text; Lookup and Rollup to the type of the function). Rules the compiler enforces and documents:

- Numeric operators treat blank as 0 (Airtable does the same; the JS engine's `toNumber` does too). Compiled as `coalesce(x, 0)`.
- Text operators treat blank as empty (`concat()` already does).
- Division by zero returns blank (as the JS engine does), compiled as `a / nullif(b, 0)`.
- `IF(c, a, b)`: both branches must have the same type or the formula is rejected with a message ("IF branches must both be text or both be numbers"). The JS engine allows mixed types; that is the most likely source of "formula no longer saves" and will be listed per field in the conversion report.
- Dates use the workspace time zone (`nc_meta.settings`, default `Africa/Lagos`), never the session or browser zone.

Mapping by group (counts are from my reading of the 73 functions in `BUILTIN_FUNCTIONS`, approximate):

| Group | Functions | SQL | Issue to handle |
|---|---|---|---|
| Maps cleanly (about 55) | ABS, CEIL, FLOOR, INT, SIGN, SQRT, POWER, EXP, UPPER, LOWER, TRIM, LEN, LEFT, RIGHT, MID, REPLACE, REPEAT, CONCAT, CONCATENATE, FIND, SEARCH, T, ARRAYJOIN, AND, OR, NOT, XOR, TRUE, FALSE, BLANK, IF, SWITCH, ISBLANK, SUM, AVERAGE, COUNTA, COUNTBLANK, MIN, MAX, ROUND, ROUNDUP, ROUNDDOWN, YEAR, MONTH, DAY, WEEKDAY, HOUR, MINUTE, SECOND, DATESTR, TIMESTR, WEEKNUM, IS_AFTER, IS_BEFORE, DATEADD, DATEDIFF, DATETIME_DIFF | `abs`, `ceil`, `floor`, `sqrt`, `power`, `exp`, `upper`, `lower`, `btrim`, `char_length`, `left`, `right`, `substr`, `overlay`, `repeat`, `concat`, `strpos`, `position`, `array_to_string`, `AND/OR/NOT`, `CASE`, `num_nonnulls`, `LEAST`/`GREATEST`, `extract`, `date_trunc`, interval arithmetic | MIN and MAX: the JS engine turns blanks into 0, SQL `LEAST` ignores them; compile with `coalesce(x,0)` to keep today's result, decide later. ROUND: JS rounds half toward +infinity (`Math.round(-2.5) = -2`), Postgres `round(numeric)` rounds half away from zero (-3); Airtable's behaviour is **(guess: half away from zero)**, the golden test decides. MOD: guard the zero divisor. DATEADD months: JS `setMonth` overflows (31 Jan + 1 month = 3 Mar), SQL clamps to month end. WEEKDAY: both Sunday = 0. WEEKNUM: both ISO. `SUM/AVERAGE/COUNTA/COUNTBLANK` here are variadic scalars (not array aggregates), so they expand to `+` and `num_nonnulls` |
| Maps with a small SQL helper (about 12) | SUBSTITUTE with occurrence, VALUE, ENCODE_URL_COMPONENT, WORKDAY, WORKDAY_DIFF, IS_SAME, DATETIME_FORMAT (literal format only), REGEX_MATCH, REGEX_EXTRACT, REGEX_REPLACE, LOG | `nc_fn.substitute_nth`, `nc_fn.to_num` (strips `,` currency symbols and `%`, as `VALUE` does), `nc_fn.url_encode`, `nc_fn.workday`, `nc_fn.workday_diff`, `date_trunc` by unit, `to_char` with a translated token map (YYYY, MM, DD, HH24, MI, SS; `dddd` becomes `FMDay`), `~`, `substring(... from ...)`, `regexp_replace` | JS and Postgres regular expressions differ (no named groups, other escapes; lookahead and lookbehind exist in Postgres). Validate every pattern at save time with `select '' ~ <pattern>` and reject on error. `LOG(a, b)`: JS is `log(a)/log(b)` with natural log by default; SQL `log(b, a)` has the base first, and Airtable's default base is 10 **(guess)**. Dynamic format strings (`DATETIME_FORMAT({x}, {fmt})`) are rejected |
| Does not map, or changes meaning (about 4, plus two operators) | NOW, TODAY (volatile, see 3.1), ISERROR (SQL has no error values; JS version only tests NaN), DATETIME_PARSE (JS ignores its format argument), operators `=` (loose) and `!=` (strict) | volatile refresh; `ISERROR` rejected with a message; `DATETIME_PARSE` only with a literal format | `=` and `!=` are inconsistent in the browser (`"1" = 1` true, `"1" != 1` true). SQL uses typed `=`. `<` and `>` in the browser convert both sides to numbers, so `{Date} > TODAY()` is always false today; typed SQL comparisons fix that, and the conversion report lists every row whose value changes |

Link fields inside formulas compile to a scalar subquery over the junction, `string_agg(<right table primary field>, ', ' order by position)`, and add a dependency edge with `via_link_field_id`, so renaming the linked record's primary field recomputes dependants (3.3, item 3).

### 3.5 Budget "Expenses (actual)" for each writer

Facts: Budget to Expenses is one-to-many; the junction `jn_budget_expenses` holds `source_id = Budget row`, `target_id = Expense row` (memory note, 2026-11-22). Triggers: junction `AFTER INSERT/DELETE/UPDATE` statement triggers, and `AFTER UPDATE OF cost` on `expenses`.

| Writer | What it does | What keeps the total correct |
|---|---|---|
| SQL, inserting an Expense and then its junction row (as the bank-statement load did) | two statements | The junction insert fires `trg_..._link_ins` for that statement: `r_9b3f0a11` sums the Budget row's children including the new Expense; `Expenses.Name` is re-touched so it gets the month. No manual recompute |
| REST API (today) | creates the Expense, **cannot write the link** (finding: link fields skipped) | The total is wrong because the link does not exist, not because the rollup is wrong. Fix is the API accepting linked ids (step 10 of section 6), writing the junction through `nc_meta.set_links` in the **same transaction** as the record, so there is no moment where the row exists without its Month |
| App cell edit of Cost | `UPDATE expenses SET cost` | `AFTER UPDATE OF cost` finds the parents through the junction and recomputes them |
| App moves an Expense to another month | junction delete + insert | Both parents recomputed (delete feeds the old month, insert the new) |
| Bulk import of 3,000 Expenses with links | statements of 100 to 1,000 rows | One recompute per affected parent per statement |
| Delete an Expense | row delete, cascade removes junction row | The cascade fires the junction delete trigger, parent recomputed |
| Someone disables a trigger or restores a backup | | `verify_computed` weekly finds and repairs the drift and logs it |

Optional, owner decision: a link by rule (`Month` derived from `Date`) so an Expense inserted by SQL or the API is attached to the right month without anyone writing the link. This is an `auto_link` setting on the link field: `{match: 'month_of', source_field: 'date', target_field: 'period'}`, applied by the same row trigger. Effort M, high value for the email-to-finance job.

### 3.6 Concurrency and cost

- Hot parent rows: two statements recomputing the same Budget month serialise on the row lock. For this workload (a handful of writes per day, bursts of a few hundred) that is invisible. Locks are taken in id order to prevent deadlocks.
- Recompute is a full re-aggregation of the parent's children, not a delta, so it can never drift from partial updates. It is O(children of that parent). If a parent ever has more than about 50,000 children and the rollup is SUM or COUNT, switch that one field to delta updates and rely on the weekly verification. I would not build deltas first (guess; measure before doing it).
- Realtime: a recompute updates the parent row, so open tabs see the new total. Realtime fan-out is per changed row, not per recompute statement.
- Automations, webhooks and the audit log do not fire for computed updates (they are fired by the app and edge functions, not by triggers).

### 3.7 Converting imported text columns without losing data

Per field, four states in `field_compute.status`: `legacy` (today), `shadow`, `live`, and `error`. Nothing changes for users until `live`.

1. **Type hygiene first.** Imported formula and rollup results are `TEXT`; some source columns (for example `Expenses.cost`) may also be text. **(guess; check `fields.pg_type` for every column a rollup sums)** Convert source columns to `numeric` using `nc_fn.to_num` after an audit that lists every value that does not parse. `ddl-executor alterColumnType` exists for this.
2. **Shadow.** Add a sidecar column `<col>__calc` of the result type, compile the field, install the triggers with the field in shadow mode (they fill the sidecar, not the legacy column), backfill every row.
3. **Golden compare.** `nc_meta.compare_computed(field_id)` compares sidecar to legacy for every row and returns mismatches. The legacy text column **is** the golden file: it holds Airtable's own result for each row at import time. Normalisation for the comparison: numbers via `to_num` with a tolerance of 0.005 (Airtable rounds for display); text trimmed; dates compared as dates. Gate: 100% of rows match, or every mismatch is explained (formula bug fixed, known behaviour change in 3.4, or "row edited after import, legacy is stale") and the owner accepts the list in the app's "Formula check" panel (new, small).
4. **Rollup function inference.** For imported rollups (all labelled SUM, finding 5) evaluate every candidate function (SUM, AVG, COUNT, COUNTA, MIN, MAX, ARRAYJOIN, CONCATENATE) against the legacy text and pick the one that matches every row that has at least one link; if none does, the field is flagged for the owner with the rows that differ.
5. **Swap (one transaction).** Rename `<col>` to `<col>__legacy_text`, rename `<col>__calc` to `<col>`, update `fields.pg_type` and `options.computed`, set `status = live`, store the old `fields` row in `prev_field`. Renames are metadata-only, so this is instant and lock-light.
6. **Keep the legacy column 30 days**, then drop with approval.

Order of conversion, lowest risk first: Budget "Expenses (actual)" (a rollup that was virtual, so nothing to lose), Expenses `Name`, Income computed columns (`net_kds_income`, `total_comm_payout`, `fx_rate_actual`, `month_type`, commission columns, from the memory note), the remaining Budget rollups, then Profit. The pilot is the single Budget rollup, because it is the owner's visible pain and has no imported value to protect.

### 3.8 Rollback

| Level | How |
|---|---|
| One field | `nc_meta.revert_computed(field_id)`: swap the two names back, restore `fields` from `prev_field`, regenerate the table function without the field, `status = legacy`. The browser path computes it again |
| One table or base, instantly | `nc_meta.set_compute(base_id, enabled boolean)`: `ALTER TABLE ... DISABLE TRIGGER nc_calc*` on every generated trigger. Stored values stop updating but stay; the client falls back to browser computation for any field not `live` |
| A bad conversion found later | Restore from the `backup_<base>_<date>` schema taken before the step |
| Migration level | Every conversion runs inside a transaction with the self-check; a failed check rolls back the whole step |

The kill switch and the per-field revert are tested in `supabase/tests/computed.sql` before anything is applied to live.

---

## 4. Speed architecture at scale

### 4.1 Where the time goes now (from the code, not measured)

- First rows: about 2 requests after the round-1 work (`database-speed-notes.md`), but the sign-in chain before the module opens is the biggest single item left (about 5 s of the measured 12 s, outside this module).
- Per page of 100 rows with 5 link fields (the Expenses table has Month, Employee, Monthly and Weekly Planner, KDS Profit): each link field runs `ceil(100/80) = 2` chunks, each chunk does 2 junction requests (by source and by target) plus at least 1 label request, so at least `5 x 2 x 3 = 30` requests on top of the 1 rows request. Reading all 34 pages of the 3,350-row table is about `34 + 34 x 30 = 1,054` requests **(estimate; chunk keys change as pages accumulate, so slightly worse)**.
- A realtime event with 34 pages loaded refetches 34 pages in sequence (finding 8).
- Footer and group totals cover only the loaded rows (finding 9).
- Page N costs `OFFSET (N-1) x 100`: Postgres walks and discards every earlier row. At 100k rows the last page walks 99,900 index entries each time (estimate: tens of milliseconds; keyset is constant).
- `count: 'estimated'` on every records request. For small tables PostgREST can return the exact count; for larger filtered results it is the planner's guess, and `getNextPageParam` stops loading when `fetched >= totalCount`, so a low estimate hides rows **(inferred; verify the estimate's behaviour on live)**.
- Search ORs `ilike '%x%'` over every text column: a sequential scan of 15 columns per request.

### 4.2 Targets

| Measure | Now (estimate) | Target |
|---|---|---|
| Requests to first rows with labels | 2 + about 30 | 1 (metadata and first page in one RPC, or 2 with the cached bootstrap) |
| Requests to scroll all of Expenses (3,350 rows) | about 1,050 | 34 (one per page) |
| One teammate's edit while viewing | up to 34 refetches | 0 (cell patched in place) or 1 |
| Footer total correctness | loaded rows only | exact over the filtered set, one request |
| Page 1,000 of a 100k table | offset scan | keyset, constant |
| Search across 15 text columns on 100k rows | sequential scans | one trigram index lookup |

All of these are targets to confirm by measuring (method in `database-speed-notes.md`, section 5); I have no measured numbers.

### 4.3 Server-side filter, sort, search, pagination: one RPC

`nc_meta.records_page` runs inside Postgres as the caller (`security invoker`, so RLS and roles keep applying) and builds one dynamic query from metadata. Dynamic SQL uses `format('%I')` for identifiers taken from `nc_meta.fields` (checked to exist in the table), `%L` or bound parameters for values, and a whitelist of operators.

```sql
create or replace function nc_meta.records_page(
  p_table_id   uuid,
  p_filter     jsonb   default '{"conjunction":"and","filters":[],"groups":[]}',  -- same shape as FilterGroup in types/index.ts
  p_sorts      jsonb   default '[]',          -- [{"field_id":"...","direction":"asc"}]
  p_search     text    default null,
  p_after      jsonb   default null,          -- keyset cursor from the previous call: {"k":[...sort values], "id":"..."}
  p_offset     int     default null,          -- scrollbar jumps only; ignored when p_after is set
  p_limit      int     default 100,
  p_field_ids  uuid[]  default null,          -- only the visible fields (projection); null = all
  p_with_links boolean default true,
  p_total      text    default 'estimate'     -- 'none' | 'estimate' | 'exact'
) returns jsonb language plpgsql stable;
-- returns {"rows":[{<columns>, "__links":{"<field_id>":[{"id":"...","label":"..."}]}}], "total":n, "next_after":{...}, "has_more":bool}
```

- **Filters:** `nc_meta.filter_to_sql(table_id, jsonb)` is a port of `applyFilter` / `applyFilterGroup` (every operator in `FilterOperator`) that also does what PostgREST could not: true nested OR/AND, link filters as `exists (select 1 from <junction> ...)` (no id lists in URLs), `linkCount*` as `(select count(*) ...)` on the junction, and filters on stored computed columns. Operators that cannot be expressed are rejected with a message instead of silently skipped (today `buildOrClauseFromFilters` drops `isBetween`, `containsAnyOf` and link counts inside OR groups).
- **Keyset:** `ORDER BY` is always `(sort keys..., id)`. The cursor predicate for sorts `[a asc, b desc]` is `(a, b, id) after (...)` expanded to `a > $1 OR (a = $1 AND b < $2) OR (a = $1 AND b = $2 AND id > $3)`. NULLs are explicit (`NULLS LAST`, `IS NOT DISTINCT FROM`) so predicate and ordering agree. Link-field sort becomes a join to an aggregate on the junction in the same query (no 5,000-row browser sort).
- **Stable order for ties:** the `id` tiebreaker also fixes finding 10 for the existing offset path (a one-line change in `useRecords.ts` that can ship first).
- **Total:** `none` while scrolling, `estimate` for the status text ("about 3,400 records"), `exact` only when the filtered table is small or the user asks. For large tables show "about".
- **Labels in the same call:** per link field a lateral subquery over `linked_ids` joined to the right table's primary field (2.3), ordered by `position`. This removes the ~30 requests per page.
- **Projection:** `p_field_ids` returns only the columns the view shows (Airtable calls this view projection, `database-ux-research.md` section 4).
- **Security note:** the RPC returns only fields the caller may see (section 5.8). For truly hidden fields the base tables must stop being directly selectable by clients; until then "hidden" is presentation only.

Client: `infiniteRecordsOptions` (`useRecords.ts`) gets a second implementation behind the flag `db.serverRecords` (per user, localStorage while testing, then `nc_meta.user_prefs`), falling back to today's path on error. `tableBootstrap.ts` can later fold the bootstrap request into `nc_meta.table_open(table_id, view_id)` returning fields, views and the first page.

### 4.4 Server-side aggregates for the footer and group headers

```sql
nc_meta.aggregate_rows(p_table_id uuid, p_filter jsonb, p_search text,
                       p_specs jsonb,            -- [{"field_id":"...","fn":"sum"}, {"field_id":"...","fn":"count_filled"}, ...]
                       p_group_field uuid default null, p_group_limit int default 50, p_group_after jsonb default null)
returns jsonb   -- {"total":{<field_id>:{<fn>:value}}, "groups":[{"value":..., "count":n, "aggs":{...}}], "next_group_after":{...}}
```
Functions mirror `summaries.ts`: count, filled, empty, percent filled and empty, sum, average, min, max, median (`percentile_cont(0.5)`), unique (`count(distinct)`), earliest, latest, checked, unchecked, range. One scan computes all footer cells (`select sum(a), count(b) filter (...), ...`). Group headers page by group value with the same keyset method. Counts and sums are exact for the whole filtered set, not the loaded rows. Cached by `(table, filter hash, specs)` for 30 s and dropped when a realtime event arrives. The same function feeds number and chart blocks (section 5.11).

### 4.5 Indexes by field type

Created by one function `nc_meta.ensure_indexes(table_id)` that `ddl-executor` runs after `addColumn` / `alterColumnType`, and a nightly job for tables above 10,000 rows. Tables under 20,000 rows use plain `CREATE INDEX` (milliseconds). Larger ones use `CREATE INDEX CONCURRENTLY` from the edge function (it cannot run inside a transaction).

| Field type | Index | Serves |
|---|---|---|
| Default order | `(nc_order, created_at, id)` | default view order and keyset paging |
| Number, Currency, Percent, Decimal, Duration, Rating, Year | btree | sort, range filters, min/max |
| Date, DateTime, CreatedTime, LastModifiedTime | btree | sort, range filters, calendar, timeline |
| SingleLineText, Email, URL, PhoneNumber, SingleSelect | btree (`text_pattern_ops` for starts-with) | sort, equals, starts with |
| Same text types, "contains" and global search | `gin (col gin_trgm_ops)` per searched column, or one `nc_search` column (concatenated text of searchable fields kept by the row trigger) with a single trigram GIN index | `ilike '%x%'`. Needs `create extension pg_trgm with schema extensions` (no such statement found in the migrations, so it is not yet installed **(guess)**) |
| MultiSelect (`text[]`) | `gin (col)` | contains, overlaps |
| Checkbox | none by default | low selectivity |
| Attachment, JSON, User (jsonb) | none | not filtered at scale |
| Stored computed columns | same as their result type | sort and filter on formulas and rollups, now possible |
| Links | the junction indexes in 2.2 | forward and reverse reads, link filters, link counts |

`nc_meta.field_index(field_id, kind, created_at)` records what exists so the app can show "Indexed" and the repair job is idempotent. Extra indexes cost write time and disk; the policy is by type, with an owner switch per field (`options.indexed`).

### 4.6 Caching and realtime

- **Server:** `aggregate_rows` and `records_page(total => 'exact')` results are cacheable by `(table, filter hash)` with a per-table version counter `nc_meta.table_versions(table_id, version)` bumped by a statement-level trigger (one counter upsert per statement, not per row). Clients revalidate cheaply by asking for the version.
- **Client cache:** keep TanStack Query, but key records by `(table, view signature, page index)` in a **sparse page map**, not an ever-growing infinite query. Evict pages more than about 10 pages from the viewport (`maxPages` of about 12, so about 1,200 rows in memory).
- **Realtime:** replace "invalidate everything" with: `UPDATE` payload patched into the matching row in cache (`payload.new`), `INSERT` and `DELETE` marked stale and refetched for visible pages only, 400 ms debounce, and events from the user's own writes ignored (matched by `updated_by` and a mutation id). If more than N events arrive in a second (a bulk import), show a "table changed, refresh" pill instead of refetching.
- **Computed fields over realtime:** a rollup recompute updates the parent row, which arrives as one more `UPDATE` payload and is patched like any other.

### 4.7 Virtual scrolling beyond 5,000 rows

Today the grid is virtualised (`useVirtualizer`, overscan 6) but its data is an infinite list that keeps every page and can reach 5,000 rows in the link-sort path. Target:

- The virtualizer's row count is the table's real total (or the filtered total), so the scroll bar is true.
- Rows not loaded render skeleton rows of fixed height (row heights are fixed per density already).
- On scroll stop (80 ms debounce) fetch the pages covering the visible window: by keyset from the nearest cached page if adjacent, by `p_offset` if the user jumped. Prefetch one page ahead in the scroll direction.
- Column virtualisation (horizontal virtualizer with about 3 columns of overscan, frozen columns always rendered) as in `database-ux-research.md` section 4 recommendation 1. Not done yet.
- Group headers page independently (section 4.4).

Effort: M for the windowed store, S for realtime patching, M for the records RPC and filter compiler, M for aggregates, S for indexes.

---

## 5. Customisation model

Common rules: every new column is additive with a default so the migration is inert; nothing writes on mount or render (CLAUDE.md); personal data lives under the user's id.

### 5.1 Personal versus collaborative views

Data: three additive columns on `nc_meta.views`.

```sql
alter table nc_meta.views
  add column owner_id   uuid references auth.users(id),                        -- null = collaborative
  add column visibility text not null default 'collaborative' check (visibility in ('collaborative','personal','locked')),
  add column created_by uuid references auth.users(id);
-- policy replaces "select true": a view is visible if it is collaborative/locked, or personal and mine
create policy views_select on nc_meta.views for select to authenticated
  using (visibility <> 'personal' or owner_id = auth.uid());
```
(`select_views` from the first migration must be dropped when this policy is added.) UI: view bar "New view" dialog gets a "Only me / Everyone" choice; personal views show a person icon; "Make collaborative" and "Duplicate as personal" in the view menu. Settings a person changes in a collaborative view (hide a field, resize a column) become a **personal overlay**: `nc_meta.view_overrides(view_id, user_id, field_visibility jsonb, field_widths jsonb, field_order jsonb, updated_at)`, so changing widths in the shared grid stops changing it for everyone (today `field_widths` is the shared row). Effort M.

### 5.2 Saved filters

`nc_meta.saved_filters(id, table_id, owner_id nullable, name, filter jsonb, visibility, position)`. UI: in the filter panel, "Save as filter" and a "Saved filters" dropdown that applies the filter to the current view without editing it (a quick filter), so one grid can serve "Unpaid", "This month", "Over 1M". Filters use the same `FilterGroup` JSON that `records_page` accepts. Effort S.

### 5.3 Per-view field order, visibility, width and colour

Order, visibility and width exist (`field_order`, `field_visibility`, `field_widths`). Add `field_styles jsonb` on views: `{fieldId: {color, bold, wrap, align, numberStyle}}` and a view-level `description`. UI: column header menu "Colour", "Wrap", "Align", "Bold"; applies to this view only. Effort S.

### 5.4 Row colouring and conditional formatting

Today both live in `useDatabaseUI` (zustand) persisted to `localStorage` under `kd-ops:db-view-ui:<view>` (finding 11), so a colour rule set on one screen is gone on another device and cannot be shared. Move them into the view: `views.row_colour_rules jsonb` (shape `RowColorRule[]` from `types/index.ts`) and `views.conditional_formats jsonb` (`ConditionalFormatRule[]`), plus `views.color_by jsonb` for "colour by select field" (rows and kanban cards). Rules evaluated by `evaluateRule` in the browser stay; the same rules compile through `filter_to_sql` to give row-count badges. Migration of the old browser rules is **user-initiated** ("Save these colours to the view" button), never automatic on load. Effort S to M.

### 5.5 Field colour and icon

`fields.options.color` and `options.icon` already exist for some types; make them universal (header icon and a tint for the column), picked in the field edit dialog. Select option colours keep `choices[].color`. No migration. Effort S.

### 5.6 Themes and density per user

`nc_meta.user_prefs(user_id uuid, scope text, prefs jsonb, updated_at timestamptz, primary key (user_id, scope))` with scopes `global`, `base:<id>`, `table:<id>`. Holds theme (follow system, light, dark), accent, density (compact, comfortable, spacious, which sets row height), date style, number locale, pinned tables and "show hidden tables" (moved from `localStorage`), recents, default grid frozen column count. Written **only when the user changes a setting** (debounced 1 s), read once at sign-in into the store, with `localStorage` as the offline fallback. UI: a "My preferences" popover in the top bar. Colour tokens already come from the theme (round 1); the accent maps to the tokens. Effort M.

### 5.7 Templates for new bases and tables

`nc_meta.templates(id, kind 'base'|'table', name, description, category, payload jsonb, is_builtin boolean, created_by, created_at)`. `payload` is the export of `nc_meta.export_definition(base_or_table_id)`: tables, fields (with stable keys instead of uuids), link definitions with `cardinality`, `field_compute` specs (AST with keys), views, optional sample rows. `apply_template` runs through `ddl-executor` (keeps the DDL guard) and remaps keys to new uuids. UI: "New base from template" gallery, "Save as template" on a base or table, built-ins seeded for the finance shape (Budget, Expenses, Income, Profit) once the owner is happy with it. The DDL stays in the edge function on purpose: re-implementing identifier validation in plpgsql would weaken the guard hardened on 2026-11-20. Effort M.

### 5.8 Roles, per-field permissions and read-only fields

```sql
create table nc_meta.base_members(base_id uuid, user_id uuid, role text check (role in ('owner','editor','commenter','viewer')), primary key (base_id, user_id));
create table nc_meta.field_permissions(field_id uuid, role text, access text check (access in ('hidden','read','edit')), primary key (field_id, role));
create function nc_meta.can_access(p_base uuid, p_need text) returns boolean language sql stable security definer set search_path = nc_meta as $$
  select exists (select 1 from nc_meta.base_members m where m.base_id = p_base and m.user_id = auth.uid()
                   and case p_need when 'read' then true when 'edit' then m.role in ('owner','editor') when 'admin' then m.role = 'owner' end)
      or exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;
-- each data table: using ((select nc_meta.can_access('<base uuid literal>','read'))) so it is evaluated once per statement
```
Rollout is staged because this changes who can do what: seed `base_members` with every current user as `editor` and every current admin as `owner`, change nothing visible, then switch the policies (a loop like `20261220200000_enable_rls_on_orphaned_base_tables.sql`) and `createTable` for new tables, then turn the roles UI on. Per-field `read` (read-only) is enforced by a generated check inside the table's `BEFORE UPDATE` function (`if new.col is distinct from old.col and not nc_meta.can_edit_field('<field uuid>') then raise exception ...`), only for fields that have a restriction. **Hidden fields**: `records_page` omits them, but a client with direct table access can still select the column. Real hiding needs tables not directly selectable by `authenticated`, which breaks realtime `postgres_changes` and the current direct reads; I recommend "read-only is enforced, hidden is presentation and API-enforced" for v1 and say so in the UI. Effort L.

### 5.9 Per-view sharing links

`nc_meta.shared_views` exists (token, bcrypt password via RPC, `allow_csv_download`, `is_enabled`). Add `expires_at`, `allow_edit boolean`, `hide_fields jsonb` (defaults to the view's hidden fields), `row_limit int`, `last_viewed_at`, `view_count`. Replace the direct table reads in `SharedViewPage.tsx` with `nc_meta.shared_view_page(token, password_proof, after, limit)`: `security definer`, checks token, enabled, expiry and password, applies **the view's filters and sorts and removes hidden and restricted fields on the server**, returns labels for links, and is the only thing the anonymous role can call. Public form submission becomes `nc_meta.submit_form(token, payload)` with server-side validation against `form_config` and a rate limit per token and IP. UI: share dialog gets expiry, password, "allow download", "allow edit", copy link, a list of existing links with revoke. Effort M.

### 5.10 Form builder

Today `form_config` has title, description, cover colour, submit label, success message, redirect URL, and per field required, hidden, description and **one** condition. Add: multiple conditions (AND/OR), sections and page breaks, default and prefilled values from URL parameters, submission limit and close date, notification email on submit, per-field help text, success redirect with the new record id, spam protection (honeypot field plus the per-token rate limit), embed code, "which fields this form can write" enforced by `submit_form`, and link pickers limited to a view. Data: `views.form_config` (jsonb, version key `v: 2`); no new table, one `nc_meta.form_submissions(id, view_id, record_id, submitted_at, ip_hash)` for limits and audit. UI: the existing form view editor gains a right-hand "Field settings" panel and a "Settings" tab. Effort M to L.

### 5.11 Interface and dashboard builder (chart and number blocks)

```sql
create table nc_meta.interfaces(id uuid primary key default gen_random_uuid(), base_id uuid references nc_meta.bases on delete cascade,
  name text, slug text, icon text, color text, visibility text default 'collaborative', owner_id uuid, created_at timestamptz default now());
create table nc_meta.interface_pages(id uuid primary key default gen_random_uuid(), interface_id uuid references nc_meta.interfaces on delete cascade,
  name text, position int, grid jsonb default '{"cols":12}');
create table nc_meta.interface_blocks(id uuid primary key default gen_random_uuid(), page_id uuid references nc_meta.interface_pages on delete cascade,
  kind text check (kind in ('number','chart','table','filter','text','record_list','button','record_detail')),
  config jsonb not null,   -- {table_id, view_id, filter, agg:{fn, field_id}, group_field_id, date_bucket, chart:'bar|line|pie|area', colour_by, limit, ...}
  x int, y int, w int, h int, position int);
```
Data for number and chart blocks comes from `aggregate_rows` (section 4.4) with a group field and optional date bucket (`date_trunc('month', ...)`), so a "Expenses by category this month" bar chart is one RPC call. Rendering uses `recharts` (already a dependency); layout uses `@dnd-kit` (already a dependency). Blocks respect roles and the viewer's filters. UI: new "Interfaces" entry beside Tables in the sidebar; edit mode with a block palette; dashboards are interfaces with only number and chart blocks. Effort L. Order inside it: number block, bar and line charts, table block with filters, then record detail and buttons.

---

## 6. Phased build plan (14 steps)

Ordering: speed and trust first (they change what every user feels and do not alter live structure), then links, then computed fields (which depend on links and a proven clone), then customisation, then permissions, then retire legacy.

**Autonomy key.** **A** = safe for me to build and merge autonomously: merging only adds inert objects (new functions, new tables, nullable columns) or changes the client behind a flag; nothing touches finance data or structure. **P** = needs your explicit approval before it runs: it changes live finance structure or data, installs triggers on live tables, changes who can access data, or deploys edge function behaviour (which also goes live on merge). Every step follows CLAUDE.md: branch, lint on changed files, tests for the area, `npm run build`, merge, confirm the Actions run.

| # | Step | Autonomy |
|---|---|---|
| 1 | Audit functions, rehearsal clone, golden harness | A |
| 2 | Records RPC, keyset paging, server aggregates, indexes (function only) | A |
| 3 | Grid windowing and realtime patching | A |
| 4 | Links v2: build and prove on the rehearsal clone | A |
| 5 | Links v2 on the live finance base | **P** |
| 6 | Computed engine: compiler, generated triggers, shadow mode, proven on the clone | A |
| 7 | Computed fields live on the finance base | **P** |
| 8 | Customisation foundation: personal views, preferences, colour rules in the view, saved filters | A |
| 9 | Safe sharing and form submission RPCs | A to build, **P** to switch `SharedViewPage` and forms over |
| 10 | API on the new foundation (links, computed, strict, upsert) | **P** (edge function) |
| 11 | Roles and field permissions | **P** |
| 12 | Interface and dashboard builder | A |
| 13 | Templates, full-fidelity export, importer v2 | A |
| 14 | Retire legacy (jsonb, browser compute, old link paths, localStorage prefs) | **P** |

### Step 1. Audit functions, rehearsal clone, golden harness (A, S to M)
- **Goal:** know the real shape of live data and have a safe place to prove every later step.
- **Touches:** migration `<ts>_structure_audit.sql` adding `nc_meta.audit_links(base_id)`, `nc_meta.audit_computed(base_id)`, `nc_meta.audit_indexes(base_id)`, `nc_meta.clone_base_for_rehearsal(base_id)`, `nc_meta.structure_log`; all `security definer`, `service_role` only, nothing calls them yet. `supabase/tests/structure_audit.sql`. A short `docs/database-structure-audit.md` filled in by running the read-only audits (needs a database session; I cannot run SQL in this task).
- **Tested:** SQL tests on a synthetic fixture (shared junction, mirrored rows, orphans, self-link, text numbers with currency symbols), rolled back, in the style of `supabase/tests/agent_foundation.sql`; against the copy base by running the audits (read-only).
- **Rollout:** functions only; the clone is a new schema that is dropped afterwards. Live finance base is read, not written.
- **Owner decides:** whether to rehearse on the copy itself ("Old KDS Financesss") or on a clone of it (I recommend the clone; the memory note says to leave the copy alone).
- **Also checks (the guesses):** PostgreSQL version and extensions (`pg_trgm`), whether junction columns have indexes, whether `Expenses.cost` and other summed columns are text, which fields share a junction, whether any self-link exists, how jsonb link columns are mapped to Links fields.

### Step 2. Records RPC, keyset, aggregates, indexes (A, M to L)
- **Goal:** the largest speed gain with no structure change: one request per page with labels, exact footer and group totals, correct filtering at any size.
- **Touches:** migration `<ts>_records_rpc.sql` (`nc_meta.records_page`, `filter_to_sql`, `linked_ids` legacy branch, `aggregate_rows`, `ensure_indexes`, `table_versions`); `src/features/database/hooks/useRecords.ts` (add an RPC implementation behind the `db.serverRecords` flag; add the `id` tiebreaker to the existing path now), new `hooks/useRecordsRpc.ts`, `hooks/useAggregates.ts`, `lib/filterTree.ts`; `grid/GridView.tsx` footer reads aggregates; `useBatchedLinks` is bypassed when the RPC supplies labels. `create extension pg_trgm` in its own migration.
- **Tested:** operator-by-operator parity table: for each `FilterOperator`, a fixture, expected ids from `applyFilter` semantics, and the SQL result; vitest for the cursor and client adapter; `supabase/tests/records_rpc.sql`; on the rehearsal clone compare ids and order from the old path and the RPC for 50 random filter and sort combinations on Expenses (must be identical except where the old path was wrong: ties, link counts, OR groups; those are listed). `explain` checks that keyset and trigram queries use indexes.
- **Rollout:** migration adds functions only (inert). Client flag off. You turn it on for yourself, compare on Expenses, then enable for everyone. `ensure_indexes` is a separate explicit call per table (adds indexes to live tables, reversible with `DROP INDEX`; I treat the index call as P for the finance base, small).
- **Owner decides:** whether to show "about N" for large filtered totals; whether the footer should show exact totals always.

### Step 3. Grid windowing and realtime patching (A, M)
- **Goal:** scroll smoothly past 5,000 rows, stop one teammate's edit from refetching the table.
- **Touches:** `hooks/useRealtime.ts` (patch, debounce, own-write filter), a sparse page store replacing `useInfiniteQuery` in the grid, `grid/GridView.tsx` virtualizer count, column virtualisation, `GridSkeleton`.
- **Tested:** unit tests for the page store (eviction, jump, prefetch), tests for event patching, a component test with 50,000 mocked rows; browser check against the rehearsal data with a performance trace (method in `database-speed-notes.md` section 5); Network panel shows 1 request per scrolled page.
- **Rollout:** client only, behind `db.windowedGrid`, default off, then on.
- **Owner decides:** the "table changed, refresh" pill instead of auto-refetch during bulk imports.

### Step 4. Links v2, build and prove on the clone (A, L)
- **Goal:** canonical links with constraints, indexes, order and a single write path.
- **Touches:** migration `<ts>_links_v2.sql` (columns on `nc_meta.links`, `nc_meta.link_quarantine`, `nc_fn.lnk_normalise`, `nc_meta.create_link`, `drop_link`, `set_links(field_id, record_id, target_ids[])`, `convert_link_to_v2`, `revert_link_v2`, `trash` link capture); `hooks/useLinks.ts` (`useCreateLink` creates one junction per link, reciprocal `links` row, `useLinkMutations` calls `set_links`), `useTrash.ts` (atomic delete with links), `ddl-executor` `dropTable` calls `drop_link` (edge function change, see step 5), `ImportAirtableDialog.tsx` (one junction per link field, one canonical row, `position`).
- **Tested:** `supabase/tests/links_v2.sql` (fixtures as in 2.6, self-check, cascade delete, reversed write, constraint violations give clear errors); vitest for `useLinks`; run the whole conversion on the rehearsal clone and pass the five acceptance checks in 2.6, including Budget total equality.
- **Rollout:** nothing converted; new links created by the app after merge already use v2 (needs the `ddl-executor` change, so the app-side creation stays behind `db.linksV2` until step 5 deploys it).
- **Owner decides:** cardinality per link (proposed by the audit), whether "allow multiple" becomes enforced, and the rule for J1 conflicts (junction wins for rows edited after import).

### Step 5. Links v2 on the live finance base (P, M)
- **Goal:** convert the junction tables (28 `jn_` tables are registered in the metadata; how many hold rows is settled by the audit) and retire the importer's shared tables.
- **Touches:** live `nc_kds_finances_1789949757826` junction tables and `nc_meta.links`; `ddl-executor` deploy (dropTable awareness).
- **Tested:** the proof from step 4 repeated on a fresh clone of live immediately before; per-link self-check inside each transaction.
- **Rollout:** new backup schema `backup_kds_finances_<date>`; convert Expenses to Month first; check Budget "Expenses (actual)" for every month against the browser value; then the rest in groups; each logged in `nc_meta.structure_log`. Jsonb stages J0 and J1 run here; J2 to J4 are step 14.
- **Owner decides:** go for each group of links; J1 leftovers list.

### Step 6. Computed engine, built and proven on the clone (A, L)
- **Goal:** formulas, lookups, rollups and counts computed in the database.
- **Touches:** migration `<ts>_computed_core.sql` (`field_compute`, `field_deps`, `compute_drift_log`, `nc_fn` schema, `nc_meta.rebuild_compute`, `revert_computed`, `set_compute`, `compare_computed`, `verify_computed`, `refresh_volatile`, helper functions `nc_fn.to_num`, `substitute_nth`, `url_encode`, `workday`, `workday_diff`, the modified `nc_update_timestamp` guard in its own migration); `src/features/database/lib/formulaSql.ts` and the `_shared` copy with a CI parity check; `ddl-executor` actions `compileComputed`, `rebuildCompute`; `components/FormulaEditor.tsx` shows the compile result and the type; new "Formula check" panel; `grid/cell-renderers` read-only badge for stored computed columns.
- **Tested:** unit tests for every function in section 3.4 (one case per function, including the null and zero rules, ROUND ties, month-end, time zone); a cross-test that evaluates each `formulaFunctions.test.ts` case in both engines and lists differences; `supabase/tests/computed.sql` (insert by SQL then link, cost update, move between months, bulk insert, cascade delete, rename of a linked primary field, kill switch, revert); on the rehearsal clone, shadow-mode run of every computed field with the golden compare report.
- **Rollout:** machinery inert; `ddl-executor` function deployed (P on its own as it is an edge function change, but it acts only when called).
- **Owner decides:** accept or fix each golden mismatch; rounding mode; whether `IF` with mixed types is rejected or cast to text; volatile fields in the API in v1 (I recommend no).

### Step 7. Computed fields live on the finance base (P, M)
- **Goal:** Budget totals and imported formulas correct for every writer.
- **Touches:** live Budget, Expenses, Income, Profit columns and triggers; `fields` rows; `field_compute`.
- **Tested:** step 6's suite on a fresh clone of live; compare report with zero unexplained rows before each swap.
- **Rollout:** order in 3.7: Budget "Expenses (actual)", Expenses `Name`, Income columns, remaining Budget rollups, Profit. Each swap is one transaction; legacy text kept 30 days; `set_compute` and `revert_computed` rehearsed first. After each, confirm one SQL-inserted test row (in the rehearsal clone, not live) updates the total.
- **Owner decides:** approve each field's compare report; the decision on the four owner and family salary rows is unrelated and stays open.

### Step 8. Customisation foundation (A, M)
- **Goal:** personal views, saved filters, colours saved with the view, per-user preferences.
- **Touches:** migration `<ts>_customisation.sql` (columns on `views`, `view_overrides`, `saved_filters`, `user_prefs`; the `views` select policy), `types/index.ts`, `hooks/useViews.ts`, new `hooks/useUserPrefs.ts`, `lib/store.ts` (read from prefs, write only on user action), `components/ViewBar.tsx`, `RowColorPanel.tsx`, `ConditionalFormatDialog.tsx`, `FilterPanel.tsx`, new `MyPreferencesPopover.tsx`.
- **Tested:** component tests for personal and collaborative flow; `supabase/tests/views_policy.sql` (user A cannot read user B's personal view); no write on mount asserted in tests; manual check in the app.
- **Rollout:** additive columns, default `collaborative`, so nothing changes until someone creates a personal view. The old browser colour rules keep working until "Save to the view".
- **Owner decides:** default density, whether personal views exist in the finance base.

### Step 9. Safe sharing and form submission (A to build, P to switch over, M)
- **Goal:** a shared view shows only its filters and fields; public forms are validated on the server.
- **Touches:** migration with `shared_view_page`, `submit_form`, `form_submissions`, new columns on `shared_views`; `pages/SharedViewPage.tsx`, `components/ShareViewDialog.tsx`, `views/FormView.tsx`.
- **Tested:** SQL tests for token, password, expiry, hidden fields never returned, filters applied, rate limit; component tests.
- **Rollout:** RPCs inert; switching the page over is the P part because it changes what existing share links show (they will stop showing rows and columns that were never meant to be shown).
- **Owner decides:** whether existing share links get an expiry date.

### Step 10. API on the new foundation (P, L)
- **Goal:** links and computed values readable, links writable, strict fields, upsert, runs automations.
- **Touches:** `supabase/functions/rest-api/` (split into modules as in the plan doc phase 1; add `/v0` routes), calls `nc_meta.records_page`, `set_links`, new `upsert_records`; `automation-runner` invoked for API writes.
- **Tested:** contract tests with an Airtable client library pointed at KDOps on the rehearsal clone; unit tests per module; SQL tests for `upsert_records` (record and links in one transaction, so a row never exists without its month).
- **Rollout:** deployed with `/v1` unchanged; finance-only key used for the first routine.
- **Owner decides:** URL scheme and id format (plan doc decisions 1 and 2), strict unknown fields on by default.

### Step 11. Roles and field permissions (P, L)
- **Goal:** replace "everyone can do everything".
- **Touches:** `base_members`, `field_permissions`, `can_access`, policies on every data table (loop), `createTable` in `ddl-executor`, roles UI in `BaseSettingsDialog.tsx`, field permission UI in `EditFieldDialog.tsx`.
- **Tested:** SQL tests per role and per operation on a fixture; run on the clone; a live dry run that lists who would lose access before switching.
- **Rollout:** seed first (everyone keeps their current access), then policies, then UI. Kill switch: a function that restores the open policies.
- **Owner decides:** who is owner, editor, commenter, viewer in each base; whether hidden fields are acceptable as presentation-level in v1.

### Step 12. Interface and dashboard builder (A, L)
- **Goal:** pages of number, chart and table blocks.
- **Touches:** migration for `interfaces`, `interface_pages`, `interface_blocks`; new `features/database/interfaces/` (editor, blocks, viewer), route in `DatabasePage.tsx`, sidebar entry.
- **Tested:** block config validation, aggregate block tests with fixtures, component tests, a screenshot check on the rehearsal clone.
- **Rollout:** new surface, nothing existing changes; hidden behind a flag until the first dashboard (Budget by month, Expenses by category) is reviewed.
- **Owner decides:** which dashboards first.

### Step 13. Templates, export, importer v2 (A, M)
- **Goal:** start bases from templates; export everything; re-importing from Airtable maps computed fields properly.
- **Touches:** `templates` table, `export_definition`, `apply_template`, `ImportAirtableDialog.tsx` (rollup function from `options` where available, link per field, formula to `field_compute`, no jsonb link column), new JSON export in the base menu.
- **Tested:** round trip: export a base, apply as a new base, compare structure and rows; importer test with a recorded Airtable payload.
- **Rollout:** additive.
- **Owner decides:** which built-in templates to ship.

### Step 14. Retire legacy (P, S to M, after 30 to 60 days of step 5 and 7 running)
- **Goal:** remove the old paths and columns.
- **Touches:** jsonb stages J2 to J4 (2.5), legacy text columns after the 30-day window, `useLinkDisplayLookup`, `ddl-executor` `linkedQuery`, `normalise` trigger, localStorage preference readers, browser compute for fields that are `live`, `computations.ts` paths no longer used.
- **Tested:** full test suite, `npm run build`, a search for readers of each removed column (the J3 log must be empty for 14 days).
- **Rollout:** each drop preceded by a backup schema and an explicit approval.
- **Owner decides:** the date; whether `airtable_id` moves to the alias table.

---

## 7. What I would do first tonight

All of this is safe: no live writes, nothing deployed.

1. Make the branch `feature/db-structure` from `feature/database-revamp`. Add the `id` tiebreaker to the existing sort in `useRecords.ts` (one line in two places) with a test: it fixes duplicated or missing rows on page boundaries today.
2. Debounce the realtime invalidation (about 400 ms) in `useRealtime.ts`: a ten-line change that removes the worst refetch storm before the proper patching in step 3.
3. Write the read-only audit migration (step 1: `audit_links`, `audit_computed`, `audit_indexes`, `clone_base_for_rehearsal`) with the synthetic-fixture SQL test. Merge only when the CI SQL run passes; it adds functions nobody calls.
4. With your OK, run the audit on KDS Finances and the copy (read only) to settle the guesses in this document: junction sharing, mirrored counts, column types behind rollups, indexes, Postgres version, `pg_trgm`.
5. Start `formulaSql.ts` with the type pass and the 55 clean functions plus unit tests; run each existing `formulaFunctions.test.ts` case through both engines and list the differences. No database needed.
6. Draft `records_page` and `filter_to_sql` on paper against the operator list in `types/index.ts`, and write the operator parity table that step 2 will be tested against.
7. Send me answers to these five questions (they unblock steps 4 to 7): rehearse on the copy or on a clone of it; accept "junction wins for rows edited after import" for the link reconcile; enforce "an Expense has one Month" with a constraint; keep `airtable_id` permanently; allow `IF` with mixed types to be cast to text or reject it.

## Where I am guessing (collected)

- Live junction tables may have no indexes; the plan assumes none until the audit says otherwise.
- Which link fields share a junction, and whether self-links exist, is unknown until the audit runs.
- The reverse side of an app-created many-to-many link showing nothing is inferred from code, not seen.
- Whether `Expenses.cost` and other summed columns are text, and the live Postgres version and installed extensions.
- The behaviour of `count: 'estimated'` on live, and that TanStack's infinite refetch is sequential in this repo's version.
- That Supabase function bundles cannot import from `src/` (reason for the copied compiler).
- Airtable's ROUND tie rule and default LOG base; NocoDB's feature set and formula evaluation, which are from memory.
- Whether anonymous users can reach shared views today.
- Where else the jsonb link columns are read (CSV export, rest-api, automation-runner), which I did not open.
- The effort estimates are mine and are meant to rank steps, not to commit dates.
