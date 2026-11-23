# Database module: loading and scrolling speed

Branch `feature/db-speed`. Everything below is **reasoned from the code. Nothing here was measured in a
browser**: the change was made in an environment that can build and unit-test the app but cannot run or
profile it. The expected gains are estimates. Section 5 says how to measure the real numbers.

## 1. What opening a table did before

Opening `/data/<base>/<table>` (addresses are short ids, so no lookup is needed to read them), after the
sign-in screen has finished:

```
t0  DatabasePage renders a spinner; slug query runs (async, no request) -> effect writes the store
t1  shell mounts. All of these start together:
      bases list, tables list                       (sidebar / tab bar / title)
      fields  select *                              useFields
      views   select *                              useViews
      records query -> queryFn first needs:
          bases?select=schema_name                  resolveBaseSchema
          tables?select=pg_table_name               resolveTableContext (not primed yet: the list is still loading)
          fields?select=id,pg_column_name,...       resolveFieldsMeta   (a second request for the same columns)
      realtime channel   -> tables?select=pg_table_name   again, nothing shared it
      record count       -> tables?select=pg_table_name   again
t2  ...only when the slowest of those answers: records request #1 (unfiltered, 100 rows)
t3  views arrive -> default view's saved filters/sorts go into the store -> the records key changes
    -> records request #2 (only matters when the default view has filters or sorts)
t4  after the first rows: link columns (batched), name lookup (up to 5000 rows per related table)
```

Critical path to the first rows: slug effect, then one round trip for the slowest of the metadata
requests, then one round trip for rows, and a third when the default view has a sort or filter. About
eight requests were sent before any row was asked for. The grid showed a generic skeleton until rows
arrived.

## 2. What it does now

```
t0  DatabasePage (layout effect, before the table screen even mounts):
      ONE request: tables ? pg_table_name, bases(schema_name), fields(*), views(*)   -> hooks/tableBootstrap.ts
      (short-id addresses need no slug request and no spinner frame)
t1  that request returns -> written into the TanStack caches for fields and views, and into the schema
    cache. Everything else that wanted the same data (useFields, useViews, records, realtime channel,
    record count, tab bar) joins the in-flight promise or finds the cache fresh: zero extra requests.
    In the same tick the FIRST PAGE of rows is requested, already using the default view's filters and
    sorts (known from the views in that same response). Headers + skeleton rows with the real column
    names paint now.
t2  first page returns -> rows paint. The table screen never sent its own unfiltered request, because
    it waits (a no-network wait) for the default view to be applied before asking for rows.
```

Critical path: one round trip for metadata, one for rows. About two requests before the first rows
instead of about eight, and no second rows request for views with sorts or filters.

| Change | What it saves (expected) |
|---|---|
| Combined table request (`tableBootstrap.ts`) with fallback to the old requests, run together | Collapses base-schema + table-name + two column requests + views (5 to 6 requests) into 1. Removes the "tables?select=pg_table_name x3" and "fields x2" duplicates. Fallback is used if PostgREST refuses the embed (ambiguous relationship etc.); it is then remembered for the session. |
| Request starts in `DatabasePage` layout effect | Starts the table's requests before the table screen mounts, and before a paint. |
| First page prefetched with the default view's filters/sorts; rows request held until the view is applied | Removes the unfiltered request that was thrown away when the default view had filters or sorts, and the visible re-load. |
| Short-id addresses resolve on first render; slugs resolve base, table and view in parallel | Removes a spinner frame and one async hop; for slug addresses turns up to 3 sequential round trips into 1. |
| `useBases` primes base schema names; `useTables` primes table names (already) | When the lists win the race, no schema/table lookup at all. |
| Hover/focus prefetch (`usePrefetchTable`) | A table you rest the pointer on for 120 ms has its metadata and first page in cache before the click. |
| Next page requested within about two screens of the end, once per page | Rows are usually there before the scrollbar reaches them (was 5 rows). |
| Filter/sort/search keeps the old rows (dimmed) until the new ones arrive | No skeleton flash on every keystroke in search. Never carried across tables. |
| Skeleton shows the real column names and widths | No empty screen; the frame is the same size as the real grid, so nothing jumps. |

## 3. Scrolling and re-render work

| Change | Why it matters |
|---|---|
| `useInfiniteRecords` returns a memoised row list | It built a new array every render, so everything downstream recomputed on every unrelated render. |
| Table screen subscribes to the settings it uses (`useShallow`), not the whole store | It re-rendered on every cell selection/edit, and passed new callbacks, so the whole grid re-rendered with it. |
| `lib/recordDecorator.ts` (per-row cache) | Formulas were re-evaluated for ALL loaded rows, and every row became a new object, each time a page arrived, a link chunk finished (dozens per table) or the names lookup grew. Now a row is rebuilt only when its raw data, its own link items or the names it refers to changed. |
| New memoised `GridRow` (`grid/GridRow.tsx`) | Selecting a cell re-rendered every visible row and cell (the grid subscribed to the selection and rebuilt about 30 rows x all columns). Now each row subscribes to a boolean "is the selection in me", so a selection change re-renders two rows. Callbacks given to rows have stable identity. |
| Row hover is CSS (`.kd-grid-row:hover`, appended to `src/index.css`) | Was `onMouseEnter`/`onMouseLeave` writing inline styles on the row element, for every row. Hovering now runs no JavaScript. |
| Cell aria labels cached per row object (`grid/cellAria.ts`) | Building a label parsed dates and JSON text for every cell of every row that scrolled into view, again each time it scrolled back. |
| `overscan` 10 to 6 | About 8 fewer rows of cells in the DOM while scrolling. |

Considered and **not** applied: `contain: layout paint` and `content-visibility` on rows or cells. Cell
editors, the validation bubble under a cell and popovers inside cells paint outside the row box and some
use fixed positioning; paint containment would clip them and layout containment would re-anchor fixed
children. Frozen columns (sticky inside the row) and the sticky summary footer are also easiest to keep
correct by not adding containment. Virtualisation already keeps the DOM small.

Behaviour notes (all intentional): in grouped views the row background after hover now returns to the
original transparent state (before, after one hover it stayed striped); the first page of a table whose
default view has filters is the filtered page.

## 4. What is not done / risks

* Not measured, not run in a browser (see top).
* Sign-in chain: the first ~5 s of the 12 s measured happen before the database screen exists (profile
  then user requests one after another in `useAuth`/`AuthGuard`, outside this module). Nothing here
  speeds that up; it is the largest single item left.
* `useLinkDisplayLookup` (up to 5000 rows per related table, for old Airtable-style ids) still runs after
  the first rows; not in this change's scope.
* The combined request relies on PostgREST embedding `bases`, `fields` and `views` from `tables`
  (foreign keys exist in the migrations). If the live schema cache refuses it, the code falls back to the
  old requests (run in parallel) and stops trying the embed for the session. Check the Network panel once.
* Hover prefetch is exported (`hooks/usePrefetchTable.ts`) but not wired into the sidebar or tab bar:
  `const prefetch = usePrefetchTable(); <button {...prefetch.handlersFor(baseId, table.id)}>`.

## 5. How to measure

Chrome, signed in, on the Expenses table (or any big one):

1. DevTools, Network tab: tick "Disable cache", filter `supabase.co`, clear the log.
2. Hard reload on `/data/<base>/<table>`. Note the number of requests and when the first `expenses`
   (rows) response finished. Before: roughly 80 requests and the last response near 12 s on the
   measured machine. Expect the metadata count to drop sharply and the rows request to start right after
   one `tables?select=...bases(...)` request.
3. Performance tab: click Record, reload, stop at first rows. Look at the Main thread for long tasks
   around the first paint, and at "Timings" for LCP.
4. Scrolling: Record while dragging the scrollbar from top to bottom for ~5 s. The FPS chart should stay
   green; in the flame chart look for `GridViewInner`/`GridRow` renders per frame (should be a handful of
   rows, not all). Rendering tab > "Paint flashing" shows only the rows entering the viewport repainting.
5. Selection: click different cells and check in React DevTools Profiler (Highlight updates) that only
   the old and new row flash.

Console snippet (paste after the page settles, or before a reload with "Preserve log"):

```js
(() => {
  const r = performance.getEntriesByType('resource')
    .filter((e) => e.name.includes('supabase.co'))
    .map((e) => ({
      start: Math.round(e.startTime),
      end: Math.round(e.responseEnd),
      ms: Math.round(e.duration),
      url: e.name.replace(/^https:\/\/[^/]+/, '').slice(0, 110),
    }))
    .sort((a, b) => a.start - b.start);
  console.table(r);
  console.log('requests:', r.length, 'last response at', Math.max(...r.map((x) => x.end)), 'ms');
  const rows = r.find((x) => /\/rest\/v1\/(?!bases|tables|fields|views|profiles)/.test(x.url) && x.url.includes('limit=100'));
  console.log('first rows request started at', rows && rows.start, 'ms, finished at', rows && rows.end, 'ms');
})();
```

(Paths are the PostgREST paths, so the first 100-row page shows up as the table's own name with
`limit=100`; the schema is sent as a header and is not in the URL.)
