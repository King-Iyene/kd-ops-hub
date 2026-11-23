# KDOps Database: field system parity with Airtable

Date: 2026-11-23. Read-only audit of `src/features/database` on branch `fix/database-updated-by-stamp`. No code changed, app and tests not run. Airtable facts not re-fetched here are marked "(general knowledge)".

Not repeated here, cited instead: `docs/database-field-types-research.md` (per-type option matrix, editor defects), `docs/database-field-design-research.md` (cell visuals, pill and chip specs), `docs/database-structure-spec.md` section 3 (server-side computed fields), `docs/database-ux-research.md`. **Several rows in `database-field-types-research.md` are now stale** because the code moved on: number format panel (`components/NumberFormatPanel.tsx`), rating max/icon/colour (`RatingOptionsPanel.tsx`), field defaults and validation (`FieldDefaultPanel.tsx`, `FieldValidationPanel.tsx`, `lib/fieldDefaults.ts`), attachment limits (`AttachmentOptionsPanel.tsx`), "allow multiple" on links (`CreateFieldDialog.tsx:785-796`), Duration in the expanded record, 12/24h and typed-duration parsing. This document only reports what the code does today.

## Summary

**Strong:** all 35 `UIType`s exist (`types/index.ts:1-36`); one shared number formatter (`lib/numberFormat.ts`) with precision 0-8, thousands, brackets, abbreviation, prefix/suffix; Duration with 5 formats and smart typing (`lib/duration.ts`); 40-colour select palette; per-field default and validation rules; rating icon/colour; attachment kind/size/count limits; 15 rollup functions; about 73 formula functions with live preview and autocomplete (`FormulaEditor.tsx`).

**Top 10 gaps (ranked by damage to real data first, then value):**
1. Airtable import stores Percent as Airtable's fraction (0.25) but KDOps Percent means whole numbers (25), so imported percents display 100 times too small (`ImportAirtableDialog.tsx:91`, `mapRecord` around :690; `numberFormat.ts:137`). Code-read, not run.
2. Airtable import loses the "link to one record" setting: it keeps `prefersSingleRecordLink` but the UI only reads `allowMultiple === false` (`ImportAirtableDialog.tsx:529`, `LinkCellRenderer.tsx:165`).
3. Airtable import drops collaborators (no mapping, falls to text), Count (becomes a static Number), Barcode and Button (text of a JSON object), and nearly all field options (number precision, date format, time zone, checkbox style, rating icon, formula result format) (`:83-115`, `:490-545`).
4. Lookups and rollups are fetched per cell (two queries per cell, junction capped at 200 rows, `select('*')`) and cannot be sorted, filtered, grouped or read by formulas (`useLinks.ts:173-191`, `useLookupRollup.ts`, `TableView.tsx:390-393`). Server fix is in the structure spec; the client batching is not.
5. Rollup `COUNT` counts linked records, not numeric values; `ARRAYJOIN` has a fixed ", " separator; no ARRAYUNIQUE-style formatting or rollup result format UI (`computations.ts:163,210`).
6. Formula engine: no `&&`, `||`, `!`; `IF`/`SWITCH` evaluate every branch; `<`/`>` convert strings to 0; `ISERROR` can never see a thrown error; divide by zero returns blank, not an error; missing RECORD_ID, CREATED_TIME, LAST_MODIFIED_TIME, REPT, CEILING, EVEN, ODD, COUNT, COUNTALL, ARRAYUNIQUE, ARRAYFLATTEN, ARRAYSLICE, SET_TIMEZONE, TONOW, FROMNOW, ERROR (`formula.ts:363-651,704-723`).
7. CSV import infers wrong types: 0/1 columns become Checkbox, phone numbers with a leading zero become Number and lose the zero, `dd/mm/yyyy` is read as month first, currency and percent text is not parsed, and Currency, Percent, Rating, Duration, MultiSelect are not selectable (`ImportCsvDialog.tsx:36-56,81-103,104-107`).
8. Button field only opens a URL, and its `{placeholder}` looks up `record[name]` where records are keyed by column name, so `{Field Name}` never resolves (`cell-renderers.tsx:973-1000`).
9. Links: reciprocal field is always created, always named after the source table, with no option to skip, rename or limit (`useLinks.ts:574-589`); no limit-to-view/filter; the in-cell picker cannot create a record (the version that can, `LinkedRecordPicker.tsx`, is not mounted anywhere).
10. Select options get a random colour on creation and there is no sort-alphabetically switch (`cell-editors.tsx:520,688`); Checkbox has no style options (`cell-renderers.tsx:371`); lookups render as joined plain text.

## 1. Field types

| Airtable capability | KDOps today | Gap | Value | Effort |
|---|---|---|---|---|
| Single line text, long text, email, URL, phone | All present; email/URL/phone validated and linked in cell (`cell-renderers.tsx:60-172`) | none | - | - |
| Long text with rich text | `richText` toggle; cell shows bold/italic/strike/code and lists from markdown marks (`:191-265`, `lib/inlineMarkdown.ts`); no headings, links, mentions | partial | L | L |
| Number, currency, percent | Present with shared formatter; Percent stored whole, bar optional | partial (storage differs from Airtable, see gap 1) | H | S |
| Duration | 5 formats, smart typing | none | - | - |
| Rating | max, icon, colour | none | - | - |
| Date, date and time | 5 formats, include time, 12/24h, show zone, default now; zone is one global `getTimezone()` (`lib/format.ts:129`), no per-field zone | partial | M | M |
| Checkbox with icon and colour | Fixed tick (`cell-renderers.tsx:371`) | partial | L | S |
| Single / multiple select | 40 colours, drag order, rename, allow-new switch, default option | partial (random colour, no alphabetical sort, stored by title) | M | S |
| Collaborator | `User` with allow-multiple; no notify (needs server) | partial | L | M |
| Attachment | thumbnails, lightbox, limits | partial (no per-file rename, no PDF/doc preview, not verified) | L | M |
| Linked record | Present, 1:1, 1:N, N:N, allow-multiple | partial (section 3) | H | M |
| Lookup, rollup, count, formula | Present (sections 4, 5) | partial | H | L |
| Created / modified time and by | Present; fixed format (`cell-renderers.tsx:610`); no "watch these fields" (server) | partial | L | S |
| Autonumber | `AutoNumber`, no start value or prefix | partial | L | S |
| Barcode | Plain text with an icon (`:960`); no scan, no drawn barcode | partial | L | M |
| Button | Label and URL only | partial | M | M |
| AI field | absent | missing | L | L |
| Extra in KDOps: Year, Time, JSON, Decimal, LinkedTasks, ID | present | n/a | - | - |

## 2. Per-type options

| Airtable option | KDOps today | Gap | Value | Effort |
|---|---|---|---|---|
| Number: precision, separators, abbreviation, negatives, prefix | `NumberFormatPanel.tsx:55-142`; no choice of decimal separator or locale; `locale`, `negative` keys in `FieldOptions` unused | partial | L | S |
| Currency: symbol and precision | ISO code list, precision; no custom symbol (`CreateFieldDialog.tsx:892`) | partial | L | S |
| Formula / rollup result format | Only read when `options.result` exists, which only the importer writes (`cell-renderers.tsx:768`, `LookupRollupCellRenderer.tsx:83`); no dialog | missing | H | S |
| Date: format, time, zone, default | see section 1 | partial | M | M |
| Select: colours, order, alphabetical, default | `FieldDefaultPanel.tsx`; no alphabetical | partial | M | S |
| Checkbox: icon, colour | none | missing | L | S |
| Attachment: preview, thumbnail size | Limits only | partial | L | S |
| Button: label, colour, action, open-URL formula | label, URL template | partial | M | M |
| Autonumber start; user notify | none | missing | L | S/M |

## 3. Linked records and import mapping

| Airtable capability | KDOps today | Gap | Value | Effort |
|---|---|---|---|---|
| Link to one vs many | `allowMultiple:false` honoured by the cell picker (`LinkCellRenderer.tsx:165-175`), editable in `EditFieldDialog.tsx:421-424`; importer does not set it (gap 2) | partial | H | S |
| Reciprocal field, choose to skip | Always created, named after source table, no `allowMultiple` copy (`useLinks.ts:574-589`) | partial | M | S |
| Limit records by view or filter | none in `LinkCellRenderer.tsx` or options | missing | M | M |
| Create record from link | In-cell picker has no create; `LinkedRecordPicker.tsx:61-80` has it but is unused | partial | H | S |
| Primary value shown in chip | Resolved through `useLinkDisplayLookup` and `recordDecorator.ts` | none | - | - |
| Lookup shows source type (pills, dates, numbers) | `formatDisplayValue` joins with ", " (`LookupRollupCellRenderer.tsx:28`) | partial | M | M |
| Import: collaborators, count, barcode, button | Not mapped or mapped to text/Number (`ImportAirtableDialog.tsx:103,109,112`) | missing | M | S |
| Import: rich text flag, formula result type, number/date/currency precision, checkbox and rating style | Not carried (`:490-545`; `options.result` only for rollup) | missing | M | S |
| Import: rollup function | Always SUM (`:981`); inference designed in structure spec 3.7 | missing | H | M |
| Import: percent scale | Not converted (gap 1) | wrong | H | S |
| Import: single-link setting | `prefersSingleRecordLink` kept, wrong key (gap 2) | wrong | H | S |
| CSV: type detection | Gap 7; ISO dates only safe (`ImportCsvDialog.tsx:36-56`); Rating clamped to 5 whatever the field max (`:97`) | partial | H | S |

## 4. Lookup and rollup

Airtable rollup functions: SUM, AVERAGE, MIN, MAX, COUNT (numeric), COUNTA, COUNTALL, AND, OR, XOR, CONCATENATE, ARRAYJOIN, ARRAYUNIQUE, ARRAYCOMPACT (general knowledge).

| Airtable capability | KDOps today | Gap | Value | Effort |
|---|---|---|---|---|
| SUM, AVG, MIN, MAX, COUNTA, COUNTALL | `computations.ts:163-225` | none | - | - |
| COUNT counts numbers only | Counts linked records (`:163`) | partial | M | S |
| AND, OR, XOR, CONCATENATE, ARRAYCOMPACT, ARRAYUNIQUE, ARRAYJOIN | Present; ARRAYJOIN separator fixed; result shown as joined text | partial | L | S |
| Extra: MEDIAN | present | n/a | - | - |
| Live and recomputed on edit | Computed live in the browser per cell, so always current while the app is open; imported text is ignored by the cell | partial | H | L |
| Sort, filter, group, footer, formula use of the value | None work (footer covers loaded rows only, `footerColumns.ts:9-20`) | missing | H | L (server) |
| Count field | `Count` type, `fn: 'COUNTALL'` (`EditFieldDialog.tsx:436`) | none | - | - |

Per-cell fetching: `useRecordLinks` keys on `[field, recordId]` (`useLinks.ts:161-192`); a column of 200 rows is 400 requests. `useBatchedLinks.ts` exists for link chips but lookups do not use it (not verified beyond the call sites).

## 5. Formula

| Airtable capability | KDOps today | Gap | Value | Effort |
|---|---|---|---|---|
| Operators + - * / & = != < > <= >= | Present; `=` is loose, `!=` strict, `<`/`>` numeric only (`formula.ts:704-723`) | partial | M | S |
| `&&`, `||`, `!` | Tokenizer has no such tokens (`:130`) | missing | M | S |
| Numeric: ABS CEILING EVEN EXP FLOOR INT LOG MAX MIN MOD ODD POWER ROUND ROUNDDOWN ROUNDUP SQRT SUM AVERAGE VALUE COUNT COUNTA COUNTALL | Has all but CEILING (has CEIL), EVEN, ODD, COUNT, COUNTALL | partial | L | S |
| Text: CONCATENATE ENCODE_URL_COMPONENT FIND LEFT LEN LOWER MID REPLACE REPT REGEX_* RIGHT SEARCH SUBSTITUTE T TRIM UPPER | Has all but REPT (has REPEAT) | partial | L | S |
| Logical: IF SWITCH AND OR NOT XOR BLANK TRUE FALSE ISERROR ERROR | `IF`/`SWITCH` are eager (`:423,427`); `ISERROR` only tests NaN (`:439`); no ERROR | partial | M | S |
| Date: DATEADD DATETIME_DIFF DATETIME_FORMAT DATETIME_PARSE DAY MONTH YEAR HOUR MINUTE SECOND IS_AFTER IS_BEFORE IS_SAME NOW TODAY WEEKDAY WEEKNUM WORKDAY WORKDAY_DIFF DATESTR TIMESTR | All present; `DATETIME_FORMAT` handles YYYY MM DD HH mm ss only, no 12-hour or zone tokens; `DATETIME_PARSE` ignores its format (`:481-512`) | partial | M | S |
| Date: SET_TIMEZONE SET_LOCALE TONOW FROMNOW | missing | missing | M | S |
| Array: ARRAYJOIN ARRAYUNIQUE ARRAYCOMPACT ARRAYFLATTEN ARRAYSLICE | Only ARRAYJOIN, and arrays are pre-joined to a string on field read (`:685-700`) | missing | M | M |
| Record: RECORD_ID CREATED_TIME LAST_MODIFIED_TIME | missing | missing | M | S |
| Field references `{Name}` | Supported by name, so renaming a field breaks formulas (structure spec 3.5 plans ids) | partial | M | M |
| Error handling | Parse failure or throw gives `#ERROR` with no message in the cell (`recordDecorator.ts:184-193`); editor preview shows the message | partial | M | S |
| Reading lookups or rollups | Not possible: they have no stored column (`TableView.tsx:390-393`) | missing | H | L (server) |

## 6. Cell and editor look

| Airtable capability | KDOps today | Gap | Value | Effort |
|---|---|---|---|---|
| Lookup/rollup cells typed by source | Plain joined text; numbers formatted, negatives red | partial | M | M |
| Barcode as drawn code | Icon plus text | partial | L | M |
| Button as coloured button | Fixed primary blue, 24px | partial | L | S |
| Created/modified time in field format | Fixed small grey text, ignores options | partial | L | S |
| Checkbox styles | Fixed | partial | L | S |
| Everything else (pills, rating, duration, attachments, chips) | Covered by `database-field-design-research.md`; not re-audited | none | - | - |

## Build next (client-side only, no migration of existing data)

Importer fixes change only future imports. Existing imported rows keep their values; a one-off correction of already-imported percents would be a data change and is excluded.

| # | Item | Files |
|---|---|---|
| 1 | Convert Airtable percent fractions to whole numbers on import | `components/ImportAirtableDialog.tsx` (mapRecord) |
| 2 | Import single-link setting as `allowMultiple:false` | `ImportAirtableDialog.tsx` (:529, :893-915) |
| 3 | Import maps collaborators to User, count to Count with its link, barcode to Barcode (text only), button to Button | `ImportAirtableDialog.tsx` (:83-115, :490-545) |
| 4 | Carry field options on import: precision, date format and time, checkbox and rating style, richText, formula result | `ImportAirtableDialog.tsx`, `types/index.ts` (add `result` to `FieldOptions`) |
| 5 | Formula and rollup result-format picker reusing `NumberFormatPanel` | `CreateFieldDialog.tsx`, `EditFieldDialog.tsx`, `NumberFormatPanel.tsx` |
| 6 | Formula: add `&&`, `||`, `!`, lazy `IF`/`SWITCH`, string comparison, `ISERROR` that catches errors, divide-by-zero as error | `lib/formula.ts`, `__tests__/formulaFunctions.test.ts` |
| 7 | Formula: add CEILING, EVEN, ODD, REPT, COUNT, COUNTALL, ERROR, ARRAYUNIQUE/COMPACT/FLATTEN/SLICE, TONOW, FROMNOW, SET_TIMEZONE, 12-hour DATETIME_FORMAT tokens | `lib/formula.ts`, `components/FormulaEditor.tsx` |
| 8 | Formula: RECORD_ID, CREATED_TIME, LAST_MODIFIED_TIME from system columns | `lib/formula.ts`, `lib/recordDecorator.ts`, `pages/TableView.tsx` (:390) |
| 9 | Rollup: COUNT counts numbers, ARRAYJOIN separator option, arrays shown as pills | `lib/computations.ts`, `components/grid/LookupRollupCellRenderer.tsx`, `CreateFieldDialog.tsx` (:867) |
| 10 | Lookup cell renders by source field type (select pills, dates, formatted numbers) | `components/grid/LookupRollupCellRenderer.tsx`, `cell-renderers.tsx` |
| 11 | Batch lookup/rollup link fetches per page instead of per cell | `hooks/useLookupRollup.ts`, `hooks/useBatchedLinks.ts`, `hooks/useLinks.ts` |
| 12 | CSV import: guard leading zeros and long digit strings, 0/1 as Number, day-first dates, strip currency and % text, add Currency/Percent/Rating/Duration/MultiSelect/Time/Year to the picker, rating max | `components/ImportCsvDialog.tsx`, `lib/csv.ts` |
| 13 | Create-record from the in-cell link picker (reuse `LinkedRecordPicker` logic) and an option to skip the reciprocal field | `components/grid/LinkCellRenderer.tsx`, `components/LinkedRecordPicker.tsx`, `hooks/useLinks.ts` (:574; new links only), `CreateFieldDialog.tsx` |
| 14 | Button: resolve `{Field Name}` by field name, colour option | `components/grid/cell-renderers.tsx` (:973), `CreateFieldDialog.tsx`, `EditFieldDialog.tsx` |
| 15 | Select: next unused colour, alphabetical sort switch; Checkbox style panel (icon, colour) | `components/grid/cell-editors.tsx` (:520, :688), `components/CheckboxOptionsPanel.tsx` (new, like `RatingOptionsPanel.tsx`), `cell-renderers.tsx` (:371) |

Needs server work, so excluded: computed values that sort, filter, group or feed formulas (structure spec section 3), rollup function inference from legacy text, user notify, last-modified "watch fields", AI field, field ids in formulas.

## Not verified

App not run; every behavioural claim is from reading code. Airtable import behaviour (percent as fraction, collaborator and barcode value shapes, `&&`/`||` support, function list) is general knowledge, not re-fetched. Attachment preview and rename parity were not read. Whether `useBatchedLinks` could serve lookups was judged from call sites only. SQL date parsing of `dd/mm/yyyy` strings on CSV import was not tested.
