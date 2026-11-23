# KDOps Database: UX and performance research

Written 2026-11-22. Read-only research; nothing in the app was changed.

How to read this: every "What the best products do" item names the product and cites a page that was opened. Where the docs were silent I say "not documented" instead of guessing. Statements about KDOps come from reading `GridView.tsx`, `LinkCellRenderer.tsx`, `useBatchedLinks.ts`, `DatabaseSidebar.tsx`, `TableTabBar.tsx` and `docs/airtable-compatible-platform-plan.md` in the current working tree (including uncommitted changes).

## Summary

The products that feel premium all do the same few things. They give you one fast way to jump anywhere (Airtable and Baserow: Ctrl+K; Airtable also Ctrl+J for tables; Teable: a Ctrl+K palette that also searches commands and recent items). They keep the grid cheap by rendering only what is on screen and by loading link and lookup data in bulk per column, not per cell. They never let a cell grow past its box: chips stop at the cell edge and the rest becomes a `+N` count. They open the full record only from an explicit expand icon or the Space key, never from a plain cell click. And they treat computed fields (formula, rollup, lookup) as read-only and keep them correct by tracking dependencies, not by storing text. KDOps already has several of these in place (row virtualization with TanStack Virtual, a footer that scrolls with the columns, batched link loading, fit-to-width chips, table search in the sidebar). The biggest remaining gaps are: no column virtualization, a summary footer computed only over loaded rows with a hand-rolled fixed-position dropdown, a stack of three bottom strips (summary row, "New row" row, status bar) that can collide with bulk-action and other floating bars, no command palette, a 43-tab table strip, hard-coded colours (including Airtable's own blue `#2D7FF9`), computed fields computed in the browser, and no single date/number formatter.

---

## 1. Navigation with many bases and many tables

### What the best products do

- **Airtable.** One keyboard shortcut per level: Ctrl/Cmd+K opens the quick base switcher (home screen or inside a base), Ctrl/Cmd+J opens the table switcher for the current base, Ctrl/Cmd+Shift+K opens the view switcher. Tables live in a tab bar; any table can be hidden from the bar ("to reduce clutter") and a hidden table is still reachable through search, linked records and the API. Source: https://support.airtable.com/docs/airtable-keyboard-shortcuts and https://support.airtable.com/docs/tables-overview . The switcher's internal search and ordering are not documented in the pages I could open.
- **SeaTable.** Same tab-bar idea, and it admits the weakness: with many tables "the header can become confusing". Fix: hide rarely used tables (a header note shows how many are hidden), a drop-down arrow beside the last visible tab opens the full list with an eye icon per table, and tabs can be dragged so the common ones stay left. Source: https://seatable.com/help/hide-tables-seatable/
- **NocoDB.** Left sidebar tree, not tabs. Many-to-many junction tables are hidden by default (Settings > Admin > Data Display > "Show M2M Tables" toggles them). Folders group tables, documents and dashboards in the sidebar, with Expand all / Collapse all, drag to move, "Move to..." menu; deleting a folder does not delete the tables, and folders only change the sidebar, not permissions. Bases can be starred (a "Starred" heading) and there are personal bookmarks with their own search and folders (paid plans). Sources: https://nocodb.com/docs/product-docs/bases/actions-on-base , https://nocodb.com/docs/product/bases/folders , https://nocodb.com/docs/product/bases/bookmarks
- **Baserow.** A workspace switcher at the top of the sidebar plus an "All workspaces" page where each workspace can be expanded or collapsed, with Expand all / Collapse all and an Expanded/Compact toggle. A search icon in the sidebar (or Ctrl/Cmd+K) searches database names, table names and even cell text, and lands you on the database, table or row. Source: https://baserow.io/user-docs/intro-to-workspaces
- **Teable.** A Ctrl/Cmd+K command palette: type a name to jump to a table or view, empty search shows "Recently visited", typing `>` limits it to commands (create table, create folder, settings), and if nothing matches it offers to create a table with that name or search inside the current table. Folders in the resource list can hold sub-folders; the docs advise keeping them shallow. Source: https://help.teable.ai/en/basic/base
- **Grist.** The page list can be trimmed to useful pages only; the helper tables stay available on a separate "Raw Data" page that lists every table. Sources: https://support.getgrist.com/raw-data/ , https://support.getgrist.com/newsletters/2022-05/

### What KDOps has now

`DatabaseSidebar.tsx` already has starred bases, a base search box, and `BaseTableList` with a "Find in N tables" box when a base has more than 8 tables. `TableTabBar.tsx` is a 38px tab strip with `overflow-x-auto`, drag-to-reorder (dnd-kit) and a hidden-tables set. For the finance base that means 43 tabs in one scrolling row. No Ctrl+K / Ctrl+J palette.

### Recommendation for KDOps

1. Make the sidebar the primary table navigator for bases with more than about 8 tables and stop showing a full tab strip: show only the open table plus up to 5 recently used tables as tabs, followed by a "Tables (43)" button that opens a searchable popover (the SeaTable drop-down pattern, with the Airtable "hide" concept).
2. Add one command palette on Ctrl+K: sections "Recent", "Tables in this base", "Bases", "Actions" (`>` prefix like Teable). Ctrl+J can be an alias that opens it pre-filtered to tables. Fuzzy match on name; show the base colour/icon and "in KDS Finances" as a subtitle.
3. Group tables with folders or auto-groups: "Core", "Planner", "Archive / Copies", and hide junction (`jn_`), copy, WIP and outdated tables behind a "Show system tables" toggle (NocoDB's M2M toggle is the model). Show a muted "N hidden" row at the end of the list so nothing feels lost.
4. Pin/favourite tables per user (a star on hover), shown at the top of the table list and first in the palette.
5. Keep the base switcher as a dropdown with search + starred section, since 14 bases in a flat list is the problem called out in the plan.

---

## 2. Grid footer / summary bar

### What the best products do

- **Airtable.** A summary bar at the bottom of the grid with one cell under every field. Click the cell, pick a function. Functions depend on field type: any non-computed field gets Empty/Filled/Percent; numeric fields get Sum (default), Average, Min, Max, Range, Median, Std Dev, Histogram; date fields get Earliest/Latest/Date range; checkbox gets Checked/Unchecked and percents; linked records get Unique. Non-numeric fields have no default, the cell is blank until you choose. If you select a range of cells, the bar summarises only the selection. In grouped views it shows a separate summary per group plus the whole-field total. Not available in Kanban. Source: https://support.airtable.com/docs/using-the-summary-bar-in-airtable-views
- **Baserow.** Footer row at the bottom of each Grid column. Same click-to-choose menu. Summaries are computed on the visible (filtered) rows. With grouping, the footer covers all visible rows and each group header shows only its row count; statistics appear only in the main footer. Lookup fields are excluded; Link-to-table, multiple select and file fields cannot use Unique/Distribution. Source: https://baserow.io/user-docs/footer-aggregation
- **NocoDB.** "Field summary" footer, off by default, configured per grid view; filters change the result. With no values, Sum shows 0 and Min/Max/Average show nothing. Selection-scoped summaries are calculated only over loaded rows, and if a selection reaches rows not loaded the footer falls back to the full-table summary rather than show a partial number. Source: https://nocodb.com/docs/product-docs/fields/field-summary-footer
- Label/value format: none of the three documents a label format. Airtable shows the function name and the value in the cell; Percent Unique is shown as both ratio and percent (0.25 / 25%).

### What KDOps has now

`SummaryRow` in `GridView.tsx` (line 202) is already inside the scroll container with `sticky bottom-0`, a Sigma cell at left, per-column cells with frozen-column offsets, a click-to-choose dropdown, tabular numerals and a "LABEL value" layout. Weak points visible in the code:
- It is computed over `records` (what is loaded), while the status bar says "N of M loaded" when `hasMore`. The footer number can silently be wrong for the whole table; NocoDB handles this by falling back to the full-table summary.
- Below the virtual rows there are three stacked strips: a "New row" row (`rowHeightPx` high), the sticky summary row (33px), and then outside the scroller a 36px status bar. A bulk-actions bar and "Loading more records" strip are also rendered. Each one is a separate layout rule, which is how overlaps happen.
- The dropdown is rendered with `fixed` position from `getBoundingClientRect()` and a full-screen `z-[9998]` backdrop; it does not reposition on scroll and fights other z-index layers.
- Group headers show summaries as text pills ("Sum: 1,200") rather than aligned under their columns.

### Recommendation for KDOps

1. One bottom layout, in this order inside a flex column: scroll area (flex-1, min-h-0) then a single footer container (`shrink-0`) holding (a) the summary row and (b) one thin status line. Do not put the footer inside the scroller as a sibling of the virtual rows; make the scroller's horizontal scroll drive the footer through `transform: translateX(-scrollLeft)` (or `position: sticky; left`), so the footer never sits on top of the native horizontal scrollbar and never overlaps it. Move "New row" into the top of the scroller after the last row, or into the status line as "+ New record".
2. Replace the hand-rolled fixed dropdown with the app's Popover (Radix) anchored to the cell; it handles collision, scroll and z-index.
3. Compute server-side when `hasMore` (a single `select sum(col)` per column with the active filters), and label it plainly. If you cannot, show "partial" with an info tooltip, like NocoDB's fallback.
4. Group aggregates: keep one row per group header aligned to the columns (a mini summary row under the group header), the way Airtable does, instead of text pills.
5. Default functions: Sum for currency/number (as Airtable), blank for others; format value with the field's own number format (see section 7).
6. When a cell range is selected, replace the status line text with Sum/Avg/Count (you already have `selectionStats`).

---

## 3. Linked-record cells

### What the best products do

- **Airtable.** Links are chips; clicking in the cell reveals a `+` that opens the record picker; an `x` on a chip removes the link; "expand any linked record to see all its details". The number of chips that fit per row height is controlled by row height (Short/Medium/Tall/Extra tall: "taller rows show more ... linked records"). Chip counts/`+N` overflow are not documented. Sources: https://support.airtable.com/docs/linking-records-in-airtable , https://support.airtable.com/docs/airtable-grid-view
- **Baserow.** Coloured tokens per link; `x` removes; click on a token opens that row's enlarged (expanded) view, which can stack; `+` opens a "row select modal" with a search bar, paging arrows, column-width/hide/reorder controls and a `+` at the bottom to create and link a new row. "Limit selection to a view" restricts what the picker offers. Overflow behaviour is not documented. Source: https://baserow.io/user-docs/link-to-table-field
- **NocoDB.** The older Links field shows only a count in the grid; clicking opens a Linked Records modal of cards with search, unlink and "link more records"; the `<>` icon on a card expands that record and also previews a record before linking. Newer "Link to another record" replaces it. Source: https://nocodb.com/docs/product-docs/fields/field-types/links-based/links
- **Notion.** Relation cells show linked pages; you can control which properties of the linked page appear ("Shown in relation"); property visibility can be "Always show / Hide when empty / Always hide"; a relation can be limited to 1 page. Source: https://www.notion.com/help/relations-and-rollups

### What KDOps has now

`LinkChips` (uses `ResizeObserver` and `chipsThatFit`) already shows as many chips as fit plus `+N`, wraps up to 12 in taller rows, has a tooltip with all labels, and shows a skeleton pill while loading. A click on the cell opens `LinkPopover` (width `w-96`) for picking. This matches the plan.

### Recommendation for KDOps

1. Keep the current rule. Make the `+N` badge itself clickable and have it open a popover listing all linked items (each a chip with an expand icon); do not make it open the picker.
2. Click on a chip = open the expanded record of the linked row (Baserow behaviour). Click on empty cell space or the `+` = picker. Click on the cell never opens the full record; only the expand icon at the left of the row number or Space does (see section 6).
3. Picker design to copy: search at top (debounced, server-side `ilike` on the primary column), list of cards with checkmarks, a "Create new" row at the bottom that creates and links in one step, and a "limit to view" option stored on the field (Baserow).
4. Never show a raw ID; keep the skeleton, then "Unnamed record" (already done in `fetchLabels`).
5. Per-field option "show these fields of the linked record on the chip/card" (Notion "Shown in relation") for later.

---

## 4. Performance patterns for big grids

### What the best products do

- **Canvas vs DOM.** Glide Data Grid draws on an HTML canvas. Its authors first built a virtualized DOM grid and report: "Once you need to load/unload hundreds of DOM elements per frame nothing can save you". Cells are drawn on demand; data comes from a `getCellContent(col,row)` callback so the grid is agnostic about loading; if loading is slow you push updates later through the grid ref. It supports millions of rows, frozen columns, resizable columns, and multi-select. No benchmark numbers are published. Source: https://raw.githubusercontent.com/glideapps/glide-data-grid/main/README.md . APITable (Airtable-style open source) also chose canvas/Konva for smooth scrolling (via search result; not independently confirmed).
- **DOM virtualization.** AG Grid renders 10 extra rows above and below the viewport by default (`rowBuffer`), caps rendered rows at 500 unless disabled, virtualizes columns too (renders columns within 200px of the viewport) and warns not to switch virtualization off because every cell's formatter then runs up front. The buffer is measured in pixels from the default row height, so taller rows need a larger buffer. Source: https://www.ag-grid.com/react-data-grid/virtual-dom/
- **TanStack Virtual.** Headless virtualizer; vertical or horizontal axis, combine both for a grid; items absolutely positioned with `translateY`. Source: https://tanstack.com/virtual/latest/docs/introduction
- **react-window.** Notes that overscan should be kept small ("too much overscanning hurts performance"), uses a fixed or variable size grid, and that all rows should use inline `style` for positioning. Source: https://web.dev/articles/virtualize-long-lists-react-window
- **Retool Table.** Custom virtualizer; handles over 100,000 rows and hundreds of columns; claims constant performance from 100 to 100,000 rows (no measurements given). Source: https://retool.com/blog/supercharging-the-retool-table
- **Airtable.** Its SDK docs and forum state data is loaded on demand when a component mounts and unloaded when it unmounts; the engineering blog describes "View Projection" (only the fields a view needs are loaded) and a bug where cells rendered before the data was backfilled. Support's performance article says: delete unneeded lookups/rollups/formulas, avoid `NOW()` in formulas (use `TODAY()`), and that edits wait behind queued API writes. Sources: https://community.airtable.com/development-apis-11/should-my-airtable-apps-slow-down-as-my-base-gets-bigger-6816 , https://medium.com/airtable-eng/the-curious-case-of-the-missing-cell-8ff47d745de7 (summary from search; page itself returned 403), https://support.airtable.com/docs/troubleshooting-airtable-performance
- **Notion.** Official tips: hide unneeded properties, avoid filters/sorts on formula or rollup properties, filter on `Created time` for huge databases, one database per page. Hard limits: 250,000 rows, 500 properties per database. WASM SQLite in a Worker (OPFS) cut page navigation time about 20 percent (28 to 33 percent for slow-network regions), but initial load got slower (the WASM library is a few hundred KB and blocked boot) until it was loaded asynchronously; they also race the cache against the API so slow disks do not hurt p95. Sources: https://www.notion.com/help/optimize-database-load-times-and-performance , https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite
- **Bulk fetching of links.** PostgREST can embed related rows (including through junction tables) in one request and `in.(...)` filters let you fetch many ids at once. Source: https://docs.postgrest.org/en/stable/references/api/resource_embedding.html . Baserow stores field dependencies in the database and updates dependent formulas in order from that table, rather than expanding every formula inline. Source: https://gitlab.com/baserow/baserow/-/merge_requests/418 (title/summary only, via search).
- Not found: Baserow's and NocoDB's internal page sizes, Teable's grid approach (its README only says "millions of rows", with no benchmark). I will not quote numbers for them.

### What KDOps has now

`GridView.tsx` uses `useVirtualizer` for rows with `overscan: 10`, a passive scroll listener for infinite load (`5 * rowHeight` from the bottom), resize via `requestAnimationFrame`, and the new `useBatchedLinks` hook which does one `useQueries` query per link field per chunk of record ids, using `.in('source_id', ids)` on the junction table, then one label lookup per 100 target ids, with `staleTime` 60s. This is the right pattern. Gaps:
- Every row renders every column (no column virtualization). With many columns that is rows x columns DOM cells.
- Rows use `onMouseEnter/onMouseLeave` that set inline `style.backgroundColor` on every hover; hover triggers style recalculation on a wide row. Prefer CSS `:hover` with a class.
- The batched query key contains `ids.join(',')`, a long string repeated per chunk and per field; hash it or key by `(field, chunkIndex, firstId, lastId)`.
- Summaries compute with `reduce` over `records` on every change of `records` (including each loaded page); fine for a few thousand rows but not for 5,000+ with many columns. Memoize per column and compute only for the changed column.
- Plan says "all rows" fetch up to 5,000.

### Recommendation for KDOps

1. Stay on DOM + TanStack Virtual (cheaper than switching to canvas, which would mean rewriting every cell editor and renderer), but add **column virtualization** (`horizontal: true` virtualizer with `overscan` of about 3 columns, always render frozen columns) and cap the visible column count when a table has more than about 25 columns. Keep a fixed row height per density setting; do not measure rows dynamically.
2. Put one `ResizeObserver` per grid, not per cell, and give chip cells a fixed width from the column definition so `chipsThatFit` needs no per-cell observer (width is already known).
3. Use CSS for hover/selection (`:hover`, `data-selected`), `contain: layout paint` and `will-change: transform` on the rows layer; avoid layout reads (`getBoundingClientRect`) inside render.
4. Fetch plan per page (100 to 200 rows): one query for the rows, then in parallel one per link/lookup column, then one label query per linked table. Prefetch the next page when the user is within 2 screens of the end (not 5 rows), and keep a fixed-size "skeleton" row for rows not loaded yet so scroll height is stable (Glide's `getCellContent` model).
5. Optimistic updates for cell edits and drag-reorder; mark pending cells with a subtle dot, roll back with a toast on error.
6. Measure first (the plan says so): record a Chrome Performance trace of scroll on Expenses and report scripting vs rendering time per frame before changing anything. Target: no long task above 50 ms during scroll and a steady 60 fps on 3,350 rows x 15 columns.
7. Hide unused columns per view by default on very wide tables (Notion/Airtable "hide fields" is also a performance lever) and fetch only visible columns (`select=` the visible set, as Airtable's View Projection does).

---

## 5. Formula, rollup and lookup fields

### What the best products do

- **Airtable.** Computed fields recalculate on the server whenever source records change; the support article on performance says each change to a linked field can ripple into lookups, rollups and formulas on the other table, and long chains or `NOW()` formulas are expensive. Array functions work only on rollups or lookup inputs. Sources: https://support.airtable.com/docs/troubleshooting-airtable-performance , https://support.airtable.com/docs/formula-field-reference (could not open the page; summary from the search result)
- **Baserow.** Server-side. Field dependencies are stored in a table; formula updates are ordered by that dependency table, so only the affected fields and rows are recomputed; time-based formulas (`now()`) are refreshed by a periodic background task, not by events. User docs say formula fields update in real time. Source: https://gitlab.com/baserow/baserow/-/merge_requests/418 (via search); https://baserow.io/user-docs/formula-field-overview
- **Teable.** Backend module `calculation` with a reference service that resolves affected records and computes in topological order; a recent release makes computed fields retry after temporary recalculation timeouts to reduce stale values. Source: https://codeclimate.com/github/teableio/teable/apps/nestjs-backend/src/features/calculation/reference.service.ts and https://newreleases.io/project/github/teableio/teable/release/release.2026-09-03T13-21-49Z.2922 (code-analysis snippets; not an official design doc).
- **Grist.** Formula columns are Python, evaluated in a sandboxed data engine alongside SQLite; cells update when the cells they reference change; there is a formula timer for slow ones. Dependency graph internals are not documented on the pages I could open. Source: https://raw.githubusercontent.com/gristlabs/grist-core/main/README.md
- **Notion.** Rollup is configured with relation + property + calculation + number format; you cannot roll up a rollup (to avoid loops); sorting by a rollup works only when it outputs a number. Source: https://www.notion.com/help/relations-and-rollups
- **Storage in Postgres.** A generated column cannot read other rows or other tables, and must use immutable functions; a stored generated column is computed on write and occupies storage; the virtual kind (computed on read) is a PostgreSQL 18 feature. So a generated column can implement a single-row formula, but not rollups, lookups or anything across a link. Source: https://www.postgresql.org/docs/current/ddl-generated-columns.html
- **Read-only look.** None of the docs I could open states the visual treatment; common practice in these products is a muted background or an icon in the column header, no edit cursor, and a "this field is computed" hint on click.

### What KDOps has now

Lookup/Rollup/Formula/Count are metadata only and computed in the browser (`formula.ts`, `computations.ts`); imported formulas are stored as text columns (the `Name` column on Expenses is editable text).

### Recommendation for KDOps

1. Decide per field class:
   - **Single-row formula (A + B, text, date math)**: Postgres generated column, stored (works on any Supabase PG version), or a `BEFORE INSERT OR UPDATE` trigger when the expression is not immutable. The value is then correct for UI, API and automations, and sort/filter work in SQL.
   - **Rollup/lookup/count across links**: a trigger on the junction table and on the source column that recomputes only the affected parent rows, backed by a stored column; keep a dependency list in `nc_meta` (the Baserow idea) so a change to one field touches only its dependents; run heavy recomputes in a queue and show a "recalculating" state.
   - **Time-based (`NOW()`, `TODAY()`)**: refresh on a schedule or compute on read; never trigger on each row (Airtable and Baserow both treat these as special).
2. Until the server side exists, make the client rule strict: a computed cell is not editable, has a formula badge in the header, a muted background tint, a tooltip "Calculated from ...", and Enter/typing does nothing except open a read-only preview. This also fixes the imported "text formula" problem by tagging those columns as computed in metadata.
3. Show computed values from stored columns on first paint, and only recompute in the browser for rows being edited (optimistic preview), then reconcile.
4. Forbid cycles (Notion's rule) and cap formula depth at about 5 for finance tables.

---

## 6. Field creation and record expand

### What the best products do

- **Baserow.** A `+` button after the last header cell opens a small field-creation panel: pick type from a dropdown, enter a name, click Create. Other entry points: "Insert left/right" and "Duplicate field (with or without data)" from the column menu. Not inline, but light. Source: https://baserow.io/user-docs/adding-a-field
- **Airtable.** The `+` in the header opens a popover with field name, type search (all types listed with icons), a description link and per-type options below; a "customize field type" or "Add" button creates it. (Support articles did not open here; behaviour is well known but not confirmed from a fetched page.)
- **Record expand.** Baserow: expand icon next to the row number (or select the row and press Enter); it opens a modal/panel with all fields vertically, arrow buttons for previous/next row, comments panel at right, closes with Esc. Source: https://baserow.io/user-docs/enlarging-rows . NocoDB: hover the index column and click expand, or select a cell and press Space; it opens as a modal (fields left, comments right; a product-feed copy of the docs says a right-side drawer on desktop, a centered modal on shared views, full-screen drawer on mobile), has Previous/Next buttons that follow the view's filters, sorts and grouping, and a "Copy record URL" button for deep links. Sources: https://nocodb.com/docs/product-docs/records/expand-record . Airtable: Space expands the active record, Shift+Space expands the active cell, Esc closes, Cmd+Shift+comma/period moves to previous/next record. Source: https://support.airtable.com/docs/airtable-keyboard-shortcuts

### Recommendation for KDOps

1. Field creation: a 320px popover anchored under the `+` header cell (not a dialog). Name input autofocused; below it a searchable list of types with icons (Text, Number, Currency, Date, Select, Checkbox, Link, Formula...). Pick a type, the popover grows to show only the 2 or 3 settings that matter (currency symbol, link target table, select choices) and a primary "Create field" button. Enter = create. "Advanced options" opens the full `CreateFieldDialog` for the rare cases. Add "Insert left/right" and "Duplicate" in the column menu.
2. Record expand: only via (a) the explicit expand icon in the row-number cell that appears on hover, (b) Space on a selected cell, (c) the `+N`/chip click inside a link cell for the linked row. Use a right-hand side panel on wide screens (keeps the grid visible, no overlap, easy to compare) and a full-screen sheet on mobile. Include previous/next buttons that follow the current sort/filter, Esc to close, and a copyable URL that reopens the panel.
3. Never open a record from a single click on a text cell; that is the interaction that makes grids feel "sticky".

---

## 7. Date, number and currency formatting

### What the best products do

- **Airtable dates.** Five per-field display formats: Local, Friendly, US, European, ISO; a separate "Include time" toggle; times are stored in GMT and by default shown in each viewer's time zone, with "Use the same time zone for all collaborators" to lock a field to one zone (default GMT/UTC). The timezone lock applies only to date-time fields; changing the zone can alter stored timestamps. Sources: https://support.airtable.com/docs/timezones-and-locales and the date-field search result (https://support.airtable.com/articles/7730575816-timezones-and-locales-in-airtable)
- **Airtable numbers and currency.** Per field: currency symbol, precision, "Allow negative numbers", thousands separator toggle, large-number abbreviation, custom thousands and decimal separators, a live example value in the field editor. Applies to Number, Currency, Percent, Duration and to formula/lookup/rollup fields formatted as those types. Source: https://community.airtable.com/t5/announcements/new-formatting-options-for-number-fields/ba-p/166311 and https://support.airtable.com/docs/number-based-fields-in-airtable
- **Notion dates.** Date property stores start, optional end and a time zone; display formats include Full date, Short date, ISO and Relative ("Today"/"Yesterday"). The official page did not open (404), so these names come from third-party guides and are unconfirmed. Source: https://matthiasfrank.de/en/notion-updates/ui-update-expanded-date-format-options/
- **Notion rollups.** A rollup has its own number format and decimal places. Source: https://www.notion.com/help/relations-and-rollups
- **Baserow/NocoDB:** per-field date format and number format exist; I did not open pages that give exact options, so I do not list them here.

### Recommendation for KDOps (also matches section 4.4 of the plan)

1. One `lib/format.ts` with `formatDate(value, field, ws)`, `formatDateTime`, `formatRelative`, `formatNumber`, `formatCurrency`, used by cells, footer summaries, chips, cards, exports and record history. A lint rule bans `toLocaleDateString()` in `src/features/database`.
2. Default `2 Mar 2026` (never `02/03/2026`), with time only when the field includes time: `2 Mar 2026, 2:15 pm`. Date-only fields never show time or a zone; and a date-only value must be stored as a plain `date` (no timezone shift). Date-time stored as `timestamptz`, shown in the workspace timezone (Africa/Lagos) unless the field sets its own; timezone only in the tooltip.
3. Relative text only for "edited/created" style fields and card timestamps (under about 7 days: "12 min ago", "Yesterday, 4:30 pm"); the tooltip always shows the exact date, time and zone.
4. Currency cells: right-aligned, `font-variant-numeric: tabular-nums`, one symbol/precision per field, thousands separator on, negatives with a leading minus and (optionally) red, never mixed with the raw `603,123.664` style. Footer and chips reuse the same formatter. A field editor with a live preview line copies Airtable's best touch.
5. Field-level options stored in field metadata: `dateFormat` (friendly/ISO/US/EU/local), `includeTime`, `timeFormat` (12h/24h), `timezone` (workspace/fixed), `precision`, `currency`, `thousands`, `negativeStyle`, `abbreviate`.

---

## 8. Other things that make these products feel premium

Each item is tied to a source where I found one; the rest are standard practice and marked as such.

- **Keyboard first.** Airtable documents arrows to move, Shift+arrows to select a range, Enter or F2 to edit, Cmd+C/X/V on ranges (pasting one value into a range fills it), Cmd+arrows to jump to the table edge, Space to expand, Shift+Enter to insert a record below, Page Up/Down by screen, Cmd+F for in-view find, Cmd+/ for the shortcut list, undo/redo with Cmd+Z / Cmd+Y. KDOps already has a shortcuts dialog and undo/redo buttons; adding Cmd+arrows, Space-to-expand and Shift+Enter would close the gap. Source: https://support.airtable.com/docs/airtable-keyboard-shortcuts
- **Row density.** Airtable has four row heights (Short is default, Medium, Tall, Extra tall), and taller rows reveal more text and chips; a view's row height can be locked. KDOps has `ROW_HEIGHTS`; add a compact density as the default and make chip wrapping and text wrapping depend on it. Source: https://support.airtable.com/docs/airtable-grid-view
- **Drag handles.** Airtable: hold Alt/Opt while dragging to duplicate a record or field; Alt+Up/Down moves a record. Show a six-dot handle on hover for rows and column headers. Source: https://support.airtable.com/docs/airtable-keyboard-shortcuts
- **Empty and zero states.** Teable's palette offers "Create table 'X'" when a search finds nothing; copy this idea for any search (create the thing or search elsewhere). Source: https://help.teable.ai/en/basic/base
- **Recently visited.** Teable's palette lists recently visited items when the query is empty. Source: same.
- **Personal bookmarks.** NocoDB lets each user bookmark workspaces, tables, views and more in a flyout with folders and search; bookmarks clean themselves up when the target is deleted. Source: https://nocodb.com/docs/product/bases/bookmarks
- **Hide instead of delete.** Airtable and SeaTable hide tables and show how many are hidden; the hidden tables remain searchable. Notion has "Deleted properties" with restore. Sources: https://support.airtable.com/docs/tables-overview , https://seatable.com/help/hide-tables-seatable/ , https://www.notion.com/help/optimize-database-load-times-and-performance
- **Shared deep links.** NocoDB's "Copy record URL" reopens the exact record. Source: https://nocodb.com/docs/product-docs/records/expand-record
- **Cache-then-confirm loading.** Notion shows cached data immediately and races it against the network; for KDOps, `staleTime` plus `placeholderData: keepPreviousData` in TanStack Query gives the same feel without WASM. Source: https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite
- **Tokens and dark mode.** Standard practice, not from a fetched page: one token set (surface, ink, accent, semantic, radius, shadow), no raw hex in components. The plan already measured about 4,984 hard-coded colour classes versus about 101 token uses; `#2D7FF9` appears in `DatabaseSidebar.tsx` too (`focus-within:border-[#2D7FF9]`, active table `bg-[#2D7FF9]/10`).

---

## Prioritised list: 15 highest-value changes for KDOps

Effort: S = under a day, M = a few days, L = a week or more.

1. **Single footer container with one clear layout (summary row + status line), horizontally synced to the grid and never overlapping the scrollbar, bulk bar or "load more"** (fixes the overlap complaint). Effort M.
2. **Make the table list scale: recent tabs plus a searchable "Tables (43)" popover, with junction/copy/WIP tables hidden behind a toggle and a "N hidden" row.** Effort M.
3. **Ctrl+K command palette (recent, tables, bases, actions) with Ctrl+J as the table filter.** Effort M.
4. **One format module for dates, numbers and currency, with per-field options and a lint ban on inline `toLocaleDateString()`.** Effort M.
5. **Computed fields are read-only everywhere (badge, tint, tooltip, no editor), including imported text formulas tagged as computed.** Effort S.
6. **Click on a chip opens the linked record, click on `+N` opens a list popover, click on the cell opens the picker; full record only via the expand icon or Space; expanded record as a right side panel with prev/next and a deep link.** Effort M.
7. **Footer sum/average computed on the server for the whole filtered set (with a "partial" label when not possible) and aligned group aggregates.** Effort M.
8. **Column virtualization and CSS-only hover/selection styles, plus a Performance trace baseline (60 fps, no task over 50 ms while scrolling Expenses).** Effort M.
9. **Replace the hand-rolled summary dropdown and other `fixed` + `z-[9998]` overlays with the shared Popover so nothing collides.** Effort S.
10. **Inline "add field" popover (name + searchable type list + 2 or 3 key settings), with the full dialog as "Advanced".** Effort M.
11. **Move computed values into the database: generated columns for single-row formulas, trigger-maintained stored columns for rollups/lookups, dependency table in `nc_meta`.** Effort L.
12. **Replace hard-coded colours and `#2D7FF9` with KDOps design tokens; dark mode from tokens only.** Effort L.
13. **Per-user pinned tables and bases (star on hover), pinned section at the top of the sidebar and first in the palette.** Effort S.
14. **Keyboard parity with Airtable: Space expands, Shift+Enter inserts below, Cmd+arrow edge jumps, Cmd+F in-view find, Cmd+/ shortcut list.** Effort S.
15. **Prefetch next page earlier, stable skeleton rows, per-page batched link/lookup queries with short hashed query keys, and fetch only visible columns.** Effort M.

---

## Source list (pages that were opened)

- Airtable: https://support.airtable.com/docs/using-the-summary-bar-in-airtable-views , https://support.airtable.com/docs/tables-overview , https://support.airtable.com/docs/airtable-keyboard-shortcuts , https://support.airtable.com/docs/airtable-grid-view , https://support.airtable.com/docs/timezones-and-locales , https://support.airtable.com/docs/troubleshooting-airtable-performance , https://support.airtable.com/docs/quick-base-switcher
- NocoDB: https://nocodb.com/docs/product/bases/bookmarks , https://nocodb.com/docs/product-docs/bases/actions-on-base , https://nocodb.com/docs/product/bases/folders , https://nocodb.com/docs/product-docs/fields/field-types/links-based/links , https://nocodb.com/docs/product-docs/records/expand-record , https://nocodb.com/docs/product-docs/fields/field-summary-footer
- Baserow: https://baserow.io/user-docs/intro-to-workspaces , https://baserow.io/user-docs/footer-aggregation , https://baserow.io/user-docs/link-to-table-field , https://baserow.io/user-docs/enlarging-rows , https://baserow.io/user-docs/adding-a-field
- Teable: https://help.teable.ai/en/basic/base , https://github.com/teableio/teable
- SeaTable: https://seatable.com/help/hide-tables-seatable/
- Grist: https://raw.githubusercontent.com/gristlabs/grist-core/main/README.md , https://support.getgrist.com/raw-data/
- Notion: https://www.notion.com/help/relations-and-rollups , https://www.notion.com/help/optimize-database-load-times-and-performance , https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite
- Glide Data Grid: https://raw.githubusercontent.com/glideapps/glide-data-grid/main/README.md
- AG Grid: https://www.ag-grid.com/react-data-grid/virtual-dom/
- TanStack Virtual: https://tanstack.com/virtual/latest/docs/introduction
- react-window: https://web.dev/articles/virtualize-long-lists-react-window
- Retool: https://retool.com/blog/supercharging-the-retool-table
- PostgreSQL: https://www.postgresql.org/docs/current/ddl-generated-columns.html
- PostgREST: https://docs.postgrest.org/en/stable/references/api/resource_embedding.html

## Gaps and caveats

- Pages that failed to open (403/404) and were only seen as search summaries: Airtable engineering post on View Projection (Medium, 403), Airtable formula/lookup articles (404), Notion date help (404), Baserow MR 284 and MR 418 (404; title and summary seen in search results), Rows.com grid post (opened but contained only a checklist of questions, no design details).
- Not found in any official source: Airtable's grid cell chip-count rule, Airtable's table-switcher internals, Baserow's and NocoDB's grid page sizes, whether Teable's grid is canvas or DOM, Rows.com's grid architecture. Do not treat the sections that rely on these as proven.
- Numbers I do cite: AG Grid `rowBuffer` default 10 and 500 rendered-row cap and 200px column buffer; Notion 250,000 rows, 500 properties, 20 percent navigation improvement (28/31/33 percent in Australia/China/India); Retool over 100,000 rows. Everything else is described without invented figures.
- Postgres virtual generated columns are a PG18 feature and the stored variety works on all versions; confirm the Supabase project's Postgres version before choosing.
