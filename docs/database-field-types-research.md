# KDOps Database: field types compared with Airtable, NocoDB, Baserow and Teable

Date: 2026-11-22. Research only. No code was changed.

## 1. Summary

KDOps Database already has 35 field types (the `UIType` list in `src/features/database/types/index.ts`). The list is not the problem. The problem is how little each type can be configured, and how rough a few editors look.

What I found, in plain words:

1. **Most numeric types have no settings.** Number, Percent and Decimal have no options screen at all. Currency only has a currency code and decimal places. Rating has a "max" value that the code reads, but the Add Field and Edit Field screens never show a box to set it. Decimal is hard-coded to 2 places. Airtable gives Number a format, presets, 0 to 8 decimals, thousands separators, large-number abbreviations and an allow-negative switch.
2. **The ugly Currency editor is a global CSS problem, not a Currency-only problem.** `src/index.css` lines 281-287 give every focused input a soft rounded glow (a 3px primary-colour `box-shadow`) and line 270 gives focused elements a rounded corner. Inside a grid cell that already has its own blue 2px outline, this draws a second, smaller, rounded box. The Currency editor adds a fixed symbol in front, so it looks like a "bubble" with the symbol beside it. Most other editors have the same defect. Details and fixes are in section 5.
3. **Text jumps when you start editing.** The grid cell already has 8px side padding (`GridCell.tsx` line 190). Almost every editor adds another 8px (`px-2`). So text moves 8px sideways, and numbers move 8px left, the moment you enter edit mode.
4. **Several real bugs sit beside the design gaps.** The Duration editor and renderer disagree about what "1:30" means. The Email, URL and Phone warning bubbles have a transparent background. The footer total for Currency shows the code ("NGN1,234.00") instead of the symbol. The Long Text field says "rich text" but shows `**bold**` as raw characters.
5. **Links are the biggest structural gap.** KDOps can pick one-to-one, one-to-many or many-to-many when a link is created, but has no "symmetric field" switch, no "limit to a view" and no "limit to one record" setting at the picker level, and none of these can be edited later.
6. **The Expanded Record view is weaker than the grid.** Currency, Percent and Decimal use one plain text box with no symbol or format. Duration, Year, Time and Phone fall through to a plain text box (Duration would show a raw number of seconds).

Competitor headline: Airtable is the benchmark for field options and polish. Baserow is ahead on Duration formats (10 formats incl. days) and number prefix/suffix with custom separators. NocoDB adds Barcode and QR Code fields, GeoData, button actions (URL, webhook, script, automation) and "limit selection by filter". Teable has the cleanest link model (two switches define the four relationship types, plus a "two-way" switch) and a Conditional Lookup/Rollup.

Research quality note (please read): several official pages could not be fetched or only gave summaries. Facts marked "(general knowledge)" come from my own background knowledge of those products and were not re-confirmed on the page. Teable's real help site is `help.teable.ai` (the `.io` address in the brief did not return pages). Items I could not confirm are called out in each section.

---

## 2. Master comparison table

Priority: P1 = fix or build first, P2 = next, P3 = later. Effort: S = under a day, M = a few days, L = a week or more.

| Field type | Airtable options | KDOps today | Gap | Pri | Effort |
|---|---|---|---|---|---|
| Single line text | Default value, 100,000 char limit | `SingleLineText`, maxLength 100000 in editor only, no options | No default value, no limit setting, no validation UI | P3 | S |
| Long text | Rich text toggle, @mention, AI text | `LongText`, `richText` toggle, markdown-style toolbar editor | Toggle does nothing visible; renderer prints `**` literally; no real rich text | P2 | L |
| Attachment | 5 GB per file, previews for images/PDF/docs/audio/video, rename, reorder, annotations | `Attachment`, thumbnails (3 shown), lightbox, manager dialog | `maxCount/maxSizeMB/allowedTypes` exist in types but have no UI; no rename/reorder check; no per-field limits | P2 | M |
| Checkbox | Icon and colour (paid) | Fixed tick box | No style options | P3 | S |
| Single select | Colour per option (40 colours), drag order, alphabetical toggle, colour toggle, one default | `SingleSelect`, 40 colours, drag order, rename | No default option, no sort toggle, new options get a random colour, values stored by title | P1 | M |
| Multiple select | Same as single, many defaults | `MultiSelect`, same as above | Same gaps; cell shows nothing while the popover is open | P1 | M |
| Collaborator / user | Allow multiple, notify on add | `User` (People), allow multiple | No notify option; no "only workspace members" scope shown | P3 | S |
| Date | 5 formats, include time, 12/24h, time zone lock, display zone, default to now, range 0000-9999 | `Date`/`DateTime`, 5 formats, include time, display tz, default to now | No 12/24h UI (`use12h` unused), no time zone choice, editor chosen by type not by "include time" | P1 | M |
| Phone number | Formats 10 digits as US | `PhoneNumber`, letters warning | No format/country option, no click-to-call confirmation | P3 | S |
| Email | One address, opens mail client | `Email`, link, validation | Editor traps the user on invalid value; warning bubble is transparent | P2 | S |
| URL | One URL, opens link | `URL`, shows domain only | No option to show full URL; same editor/bubble defects | P2 | S |
| Number | Format (integer/decimal), presets, 0-8 decimals, thousands + decimal separator, abbreviation, default, form range limit | `Number`, no options; renderer uses plain `toLocaleString()` | Entire option set missing | P1 | M |
| Decimal | (Airtable has one Number type) | `Decimal`, precision hard-coded to 2 | `precision` option exists but no UI | P1 | S |
| Currency | Symbol, significant digits, allow negative, default | `Currency`, 20 codes, precision 0-4 | No custom symbol, no allow-negative, no separators, editor symbol map is out of sync with the renderer | P1 | M |
| Percent | Stored as a fraction, formatted with %, default | `Percent`, forced progress bar, stored as whole numbers | No options; bar always on; storage differs from Airtable and from KDOps formulas | P1 | M |
| Duration | h:mm to h:mm:ss.sss | `Duration`, 5 formats, stored as seconds | Editor ignores the field format; "1:30" means different things; no smart entry | P1 | M |
| Rating | Max 1-10, icon (star, flag, thumb, etc.), colour | `Rating`, max read from options, yellow stars | No UI for max, icon, colour; editor stars are 16px but cell stars 14px | P1 | S |
| Formula | ~100 functions in 6 groups, result formatting | `Formula`, 45 functions, editor with field insert | Missing REGEX, date-compare, VALUE/INT/ROUNDUP and array functions; no result-format UI | P2 | L |
| Rollup | 16 aggregations, formatting | 9 functions, currency/number result read from options | No AND/OR/XOR/ARRAYJOIN/ARRAYSLICE etc.; no format UI | P2 | M |
| Count | Counts linked records | `Count` | Fine; no format | P3 | S |
| Lookup | Pulls field from link | `Lookup`, joined with commas | No per-type rendering (pills, dates) | P2 | M |
| Created time | Date format, time zone, display zone | `CreatedTime`, one fixed format | No format/time zone options | P2 | S |
| Last modified time | Plus "watch specific fields" | `LastModifiedTime` | No watch-fields option, no format options | P2 | M |
| Created by | Collaborator object | `CreatedBy` avatar and email | OK | P3 | S |
| Last modified by | Plus watch specific fields | `LastModifiedBy` | No watch-fields option | P3 | S |
| Autonumber | Unique incrementing number | `AutoNumber` (SERIAL) | No start value or prefix | P3 | S |
| Barcode | Barcode object, scanned in mobile app | `Barcode` is plain text with an icon | No barcode drawing, no format choice, no scan | P3 | M |
| Button | Open URL (with formula-built address), run script, label, colour | `Button`, label + URL template, fixed blue | No colour, no automation/webhook action, no disable rule | P2 | L |
| Linked record | Multiple on/off, limit to a view, limit by filter, symmetric field | `Links`, relation type chosen at creation (1:1, 1:N, N:N) | No symmetric switch, no limit to view/filter, cannot be edited after creation | P1 | L |
| AI field | AI text/field agents (AI credits) | None | Absent | P3 | L |
| JSON | (Not in Airtable) | `JSON` uses the long-text editor | No validation or pretty print | P3 | S |
| Year, Time | (Not in Airtable) | `Year`, `Time` | Year and Time have no options; fall to text box in Expanded Record | P3 | S |
| ID / UUID | Record ID via formula | `ID` | OK | P3 | S |
| Geo / progress / status | (NocoDB GeoData; Baserow none) | None | Absent | P3 | M |
| Linked Tasks (ClickUp) | n/a | `LinkedTasks` | KDOps-specific; fine | P3 | S |

---

## 3. One section per field type

Source key. Airtable: A-overview `https://support.airtable.com/docs/supported-field-types-in-airtable-overview`; A-number `https://support.airtable.com/docs/number-based-fields-in-airtable`; A-date `https://support.airtable.com/docs/date-and-time-field`; A-tz `https://support.airtable.com/docs/timezones-and-locales`. NocoDB: N-field-api `https://nocodb.com/docs/scripts/api-reference/field`; N-overview `https://nocodb.com/docs/product-docs/fields/fields-overview`. Baserow: B-overview `https://baserow.io/user-docs/baserow-field-overview`. Teable: T-field `https://help.teable.ai/en/basic/field.md`; T-format `https://help.teable.ai/en/basic/field/common/formatter`.

### 3.1 Single line text

- **Airtable** (A-overview): short text, 100,000 character limit; older bases may have a legacy "apply default value for all actions" switch. Default value is the only option. Cell shows one line with ellipsis. In the filter: is, contains, does not contain, is empty, etc. (general knowledge).
- **NocoDB** (N-overview): same, plus a "unique" setting on many types, which the docs warn can slow big tables.
- **Baserow** (B-overview): same. Teable (T-field): same.
- **KDOps today:** UI type `SingleLineText`. `TextCellEditor` (cell-editors.tsx L43-79), `TextCellRenderer` (cell-renderers.tsx L70-177). No options in Create/Edit dialogs. Validation rules (`required`, `minLength`, `maxLength`, `regex`) exist in `lib/validation.ts` but no screen sets them.
- **Recommended design:** options: default value, max length (validation), "required", "unique". Cell: one line, ellipsis, search highlight (already there). Editor: one outer outline, no inner box (see section 5). Expanded record: full-width input, same font size as the grid.

### 3.2 Long text (rich text)

- **Airtable** (https://support.airtable.com/docs/enabling-rich-text-in-the-long-text-field): "Enable rich text formatting" toggle. Rich text is stored and returned by the API as a Markdown variant. 100,000 character limit. @mention collaborators. AI text mode exists (https://support.airtable.com/docs/using-airtable-ai-in-fields). Rich text can only be used in forms when people submit, not when building them.
- **NocoDB** (N-field-api): `rich_text` true/false and `generate_text_using_ai`.
- **Baserow:** the overview page does not list a rich-text option (B-overview). Teable: not documented in what I could fetch.
- **KDOps today:** `LongText`, `richText` flag is saved. Editor is a floating panel with B, I, S, code, bullet and numbered buttons that insert `**`, `*`, `~~` characters (cell-editors.tsx L983-1067). Renderer prints plain text with list indentation only (cell-renderers.tsx L198-258), so `**bold**` shows as raw asterisks. Expanded record uses a plain textarea (ExpandedRowModal.tsx L163-181).
- **Recommended design:** options: "Rich text" (on/off), "Allow AI text" later. If off: plain textarea, no toolbar, no markdown. If on: a small rich editor (bold, italic, strike, code, bullets, numbered, links) that stores Markdown, and a renderer that shows real bold/italic in the cell (first line or 2/3/5 lines by row height) and the full text in the expanded record. Editor: keep the floating panel but use the app's primary colour token instead of the hard-coded `#2D7FF9`.

### 3.3 Attachment

- **Airtable** (https://support.airtable.com/docs/attachment-field): any file type; individual file limit 5 GB (the same page also mentions 1 GB on the Free plan, so check your plan); previews for JPEG, PNG, GIF, TIFF, WebP, HEIC, PDF, DOC, PPT, XLS, text, plus browser-playable audio and video. Grid cell shows thumbnails or icons. Expanded record shows the file name, with download, rename and remove icons on hover; files can be reordered by drag. Upload by "+" window, drag and drop (multiple files can create many records), public HTTPS link, Dropbox, mobile camera, API base64. URLs expire after about 2 hours. Comments/annotations on images and video. No attachment-count limit is stated.
- **NocoDB** (N-field-api): no options; files managed in the expanded modal. **Baserow:** "File" field (B-overview). **Teable:** "Attachment" in basic fields (T-field).
- **KDOps today:** `Attachment`, thumbnails for up to 3 files with "+N" (cell-renderers.tsx L490-581), hover enlarged preview, lightbox, `AttachmentManager` dialog. In the grid, edit mode shows a small "N files" label and opens the manager (cell-editors.tsx L894-928). `maxCount`, `maxSizeMB`, `allowedTypes` exist in `FieldOptions` but no dialog sets them.
- **Recommended design:** options: max files, max file size, allowed types (any, images only, documents, custom list), "show thumbnails as" (small/large). Cell: thumbnails keep their size; empty shows a "+" only on hover. Editor: open the manager as a popover anchored to the cell rather than a modal; keep the thumbnails visible behind it. Expanded record: large thumbnails with file name, rename, reorder, remove.

### 3.4 Checkbox

- **Airtable** (https://community.airtable.com/announcements-6/rating-field-and-new-checkbox-styles-1429): paid plans can change the icon and colour of Checkbox and Rating fields; default is a green tick style. The exact icon list is in images, not text. Default value can be set (general knowledge).
- **NocoDB** (N-field-api): `icon` (example "square") and `color` (hex). **Baserow/Teable:** boolean/checkbox without styles documented.
- **KDOps today:** `Checkbox` renders a 17px box with a tick (cell-renderers.tsx L368-389), clicking toggles in the grid, no editor (cell-editor-map returns null). Expanded record has `InlineCheckboxEditor`.
- **Recommended design:** options: style (tick, circle, star, heart, thumbs-up, flag) and colour (use the select palette), default checked or not. Cell: centred, same size across styles.

### 3.5 Single select and 3.6 Multiple select

- **Airtable** (https://support.airtable.com/docs/single-select-field, https://support.airtable.com/docs/multiple-select-field): add options by name; colour per option; toggles for colour-coding and alphabetical sorting; drag to reorder; one default for single select, any number for multiple; defaults apply to new records only. Up to 10,000 options per field and 500 fields per table. Only owners and creators can add options from the grid; editors and below can only pick existing ones, and there is no switch for "allow adding new options" (access is by permission). Merge duplicate options by converting to text and back. Filtering a view by an option makes new records in that view inherit it; the same applies to grouping. A form can limit the options it offers.
- **NocoDB** (N-field-api): `choices` array of title and colour hex. **Baserow:** single and multiple select (B-overview); Baserow's help page on colours was not retrievable. **Teable:** single and multiple select (T-field).
- **KDOps today:** colours: 40 named colours (10 hues x 4 shades) copied from Airtable's palette (`SELECT_COLORS`, types/index.ts L282-323). Create dialog: add option, drag to reorder, double-click to rename, colour popover with 8-column dot grid. Option order is the saved array order. Cell: pill 22px tall (select) or 20px (multi). Editor: popover with a search box ("Find an option"), pill list, "Create 'x'" row, Clear. New options typed in the grid get a random colour (cell-editors.tsx L514, L679). Stored value is the option title, so a rename needs a data update (not verified here).
- **Gaps:** no default option, no alphabetical toggle, no "allow new options" switch, no colour-coding off switch. While the popover is open the cell shows nothing (the trigger is an empty div, L549-551), whereas Airtable keeps the current pill visible.
- **Recommended design:** options: default option(s), "sort alphabetically", "colour-code options" (grey pills when off), "Allow people to add new options from a cell" (on by default; if off, the "Create" row disappears), "Use next unused colour" instead of random. Cell: pills as now. Editor: keep the current pill visible in the cell and attach the list below it; one outline only. Expanded record: pills with a plus button, same list.

### 3.7 Collaborator / user

- **Airtable** (https://support.airtable.com/docs/user-field-type): the collaborator type is called User. Options: "Allow adding multiple users" and "Notify users with base access when they're added" (added users start watching the record). Only people with base access can be picked. Forms have no notify setting.
- **NocoDB** (N-field-api): `allow_multiple_users`, `notify_user_when_added`. **Baserow:** "Collaborator" (B-overview). **Teable:** "User" (T-field).
- **KDOps today:** `User` with `allowMultiple`. Editor popover with search and checkmarks (cell-editors.tsx L1309-1484). Renderer shows up to 3 avatar + name chips (cell-renderers.tsx L1076-1122).
- **Recommended design:** add "Notify people when added" (writes to the existing notification store) and "limit to a group" later. Cell: avatar circles with name when there is room. Expanded record: avatar chips with a plus button (today it uses the read-only renderer, ExpandedRowModal.tsx L985-988, so people cannot be changed there).

### 3.8 Date (and Date & Time)

- **Airtable** (A-date, A-tz): formats Local (default, follows browser), Friendly ("January 15, 2023"), US, European, ISO. "Include time" toggle; time format 12-hour or 24-hour; "Use the same time zone for all collaborators" (only when time is on; off means each person sees their own time zone, on locks to a chosen zone); "Display time zone" shows the abbreviation (for example EST). Default to current date (date-only gets today; date-time gets the creation moment). Typing follows the format and accepts text forms like "Jan 15 2023"; a missing year means this year. Range 1/1/0000 to 12/31/9999, no BC. Seconds cannot be typed in the interface. Stored as ISO 8601 UTC. Editors can sort, filter, group.
- **NocoDB** (N-field-api): Date has `date_format`; DateTime has `date_format`, `time_format`, `12hr_format`, `timezone`, `display_timezone`, `use_same_timezone_for_all`. **Baserow** (https://baserow.io/user-docs/date-and-time-fields): European, US, ISO formats; include time; 12 or 24 hour; stored UTC, shown in the browser's zone (https://baserow.io/user-docs/working-with-timezones). **Teable** (T-format): US, European, Asian, ISO, year-month, month-day, year only, month only, day only; time 24h, 12h or hidden; time zone fixed or "viewer's location".
- **KDOps today:** `Date`, `DateTime`, `Year`, `Time`. Options: `dateFormat` (friendly, local, us, european, iso), `includeTime`, `displayTimezone`, `defaultToCurrentDate` (Create and Edit dialogs). `use12h` is in the type but no screen sets it. The editor is a calendar popover with Clear and Today (DateCellEditor L149-218) or a calendar + 12-hour boxes (DateTimeCellEditor L1121-1262). The editor is picked by `ui_type`, not by `includeTime`, so a Date field with "include time" on still opens the date-only picker. Time zone is the organisation zone from `getTimezone()`, with no per-field choice. Expanded record uses the browser's native date or datetime-local input (ExpandedRowModal.tsx L207-246). Ctrl+; inserts today. `TableView.tsx` L440 applies default-to-today on new rows.
- **Recommended design:** options: date format (add Asian and the "month only/year only" presets), include time, time format (12h/24h, finally using `use12h`), time zone mode (organisation zone, a specific zone, viewer's zone), show zone abbreviation, default to now. Cell: tabular numbers as now. Editor: let the user type a date (parse by format) as well as pick it; picker anchored to the cell, current value stays visible. Expanded record: same picker, not the browser's native control, so the format matches the grid.

### 3.9 Phone number

- **Airtable** (A-overview): formats 10-digit input as US/Canada numbers; formatting may not survive lookups in automations.
- **NocoDB/Baserow/Teable:** "validates phone number format" (N-overview, B-overview). No country option documented.
- **KDOps today:** `PhoneNumber` stored as text. Renderer makes a `tel:` link when 7 or more digits and flags letters (cell-renderers.tsx L150-174). Editor shows an amber ring and a "contains letters" bubble (cell-editors.tsx L406-444). The Expanded Record switch has `case 'Phone'`, which never matches the real type `PhoneNumber`, so it falls to the default text input (works, but the case is dead).
- **Recommended design:** option: "Default country code" and "Format as typed / international". Cell: link, as now. Keep the warning but give the bubble a real background (section 5).

### 3.10 Email

- **Airtable** (A-overview): one address per cell; click opens the mail app. **NocoDB/Baserow/Teable:** validated email.
- **KDOps today:** `Email`. Renderer: teal mailto link or warning triangle (cell-renderers.tsx L93-113). Editor L299-347: on invalid input it shows a red inset ring and bubble, and **refuses to commit on blur or Enter, so the editor cannot be left except with Escape**. Expanded record: `InlineEmailEditor` with a mail button.
- **Recommended design:** accept the value, show the warning triangle in the cell (the renderer already does this), and keep the editor closable. Option: "Required". Cell: link; editor: plain input.

### 3.11 URL

- **Airtable** (A-overview): one URL, click opens it. **Others:** validated URL.
- **KDOps today:** `URL`. Renderer shows only the domain and an open icon on hover (cell-renderers.tsx L115-148). Same invalid-value trap and transparent bubble as Email (cell-editors.tsx L349-402).
- **Recommended design:** option: "Show as: domain / full address / custom label". Fix the editor as for Email.

### 3.12 Number

- **Airtable** (A-number): Formatting tab: Format (integer or decimal), Presets, Decimal places, Thousands and decimal separators, "Show thousands separators" toggle, Large number abbreviation; a live Preview at the bottom. Numbers are not range-checked in the grid; a Range limit (minimum, maximum) applies only on interface forms (Team plan and up). Numbers with 15 or more digits are rounded. Default value is supported (legacy "apply default for all actions" on older bases). The same page notes that number, currency, percent and duration have no minimum/maximum setting. Negative numbers allowed (general knowledge: the number field's allow-negative toggle).
- **NocoDB** (N-field-api): Number (integer) with `locale_string`; Decimal with `precision` and `locale_string`. A "unique" setting. **Baserow** (https://baserow.io/user-docs/number-field): decimal places 0 to 10; allow negative toggle (off means negative input is saved as 0); prefix; suffix; thousand separator (comma or period) and decimal separator (period or comma); default value. **Teable** (T-format): decimal (0 to 5 places), percentage, currency.
- **KDOps today:** `Number`, no options. Renderer: `num.toLocaleString()` (cell-renderers.tsx L260-271), red when negative, right-aligned. Editor: right-aligned text input that strips non-numeric characters (cell-editors.tsx L81-108); the Add Field text calls it "An integer value" but decimals are accepted. `Decimal` shows exactly 2 decimals, always (L273-284). Pg type for Number is `NUMERIC`, for Decimal `NUMERIC(15,4)`.
- **Recommended design:** one shared "Number format" panel for Number, Decimal, Currency, Percent: format (integer, decimal), decimal places 0-8, separators (comma/period, space, none) and decimal separator, abbreviation (none, K, M, B), allow negative, prefix and suffix (Baserow-style), default value, plus a live preview line. Merge Decimal into Number later or keep it as an alias with precision. Cell: right-aligned, tabular figures. Editor: shows the raw number with the same alignment and padding as the cell; no thousands separators while typing; rounds to the field's decimals on commit.

### 3.13 Currency

- **Airtable** (A-number): Currency symbol (default $), number of significant digits, "Allow negative numbers" toggle, Default; one currency per field only.
- **NocoDB** (N-field-api): `locale` (for example en-US) and `code` (for example USD). **Baserow:** currency is a number with a prefix (use the Number field's prefix) (https://baserow.io/user-docs/number-field). **Teable** (T-format): currency symbol plus decimal places.
- **KDOps today:** `Currency` with `currencyCode` (20 codes in the dialog) and `precision` 0-4 (CreateFieldDialog.tsx L822-872; EditFieldDialog.tsx L787-830). Renderer uses `Intl.NumberFormat` with the narrow symbol, so "$", "₦", "€" (cell-renderers.tsx L298-331). Editor shows a fixed symbol from a 12-entry map, falling back to the three-letter code for the other 8 (cell-editors.tsx L110-113: KES, ZAR, GHS, SEK, PLN, TRY, RUB, MXN show "KES" etc.), and "CA$"/"A$" while the cell shows "$". The editor ignores precision (placeholder fixed at 0.00; no rounding on commit). The footer total uses the code as the symbol (GridView.tsx L154, gives "NGN1,234.00"). Expanded record uses a plain number box with no symbol (ExpandedRowModal.tsx L970-974). Formula and rollup results read `options.result.options.symbol`, which no screen sets.
- **Recommended design:** options: currency (full ISO list with search, plus "custom symbol"), decimal places 0-8, allow negative, thousands/decimal separators, symbol position (before/after), negative style (minus or parentheses), default. Cell: one shared formatter used by grid, expanded record, footer, formula and rollup, so every place shows the same text. Editor: a single outline, the symbol as plain muted text (no box), the number right-aligned, same padding as the cell. Expanded record: same number editor with a symbol prefix.

### 3.14 Percent

- **Airtable** (A-number): stored as a fraction (0.75 shows 75%); displays a percent sign; can show a progress bar (the rollup FAQ example shows a percentage with a progress bar); default value.
- **NocoDB** (N-field-api): `show_as_progress`. **Teable** (T-format): percentage format (0.25 shows 25%). **Baserow:** via number prefix/suffix.
- **KDOps today:** `Percent` stores whole numbers (50 means 50%). The cell always draws a coloured bar plus "50%" with colour breakpoints at 25, 50, 75 (cell-renderers.tsx L690-708). Formula percent results multiply by 100 (formatFormulaNumber, L796-799), which is the opposite storage convention. Editor: number input plus a fixed "%" (cell-editors.tsx L877-892); the cell changes from bar to input, so the layout jumps.
- **Recommended design:** options: decimal places, "Show as progress bar" (off by default, which also removes the layout jump), bar colour, "Stored as: whole number / fraction" (decide one and migrate). Cell: text "50%" right-aligned, optional thin bar. Editor: right-aligned number with the "%" as muted text, same padding.

### 3.15 Duration

- **Airtable** (https://support.airtable.com/docs/duration-field-type): formats h:mm, h:mm:ss, h:mm:ss.s, h:mm:ss.ss, h:mm:ss.sss (the support pages disagree slightly on which sub-second formats exist); fractional values round up when displayed. Use Number for days or longer.
- **Baserow** (https://baserow.io/user-docs/duration-field): 10 formats: h:mm, h:mm:ss, h:mm:ss.s, h:mm:ss.ss, h:mm:ss.sss, d h, d h:mm, d h:mm:ss, d h m, d h m s. Negative values supported. Smart entry: type "1h 30m", "3d 45s" or "1:23:45"; a bare number is read as seconds. **NocoDB** (N-field-api): `duration_format`, example `h:mm:ss`. **Teable:** not documented.
- **KDOps today:** `Duration` stored as integer seconds (`UI_TYPE_TO_PG_TYPE`: INTEGER, so no fractions). Five formats in the dialog (h:mm to h:mm:ss.sss). Renderer shows a clock icon plus the formatted value (cell-renderers.tsx L710-743). Editor always shows `HH:MM:SS` (cell-editors.tsx L257-295). **Bug:** a two-part entry "1:30" is read as minutes:seconds (90 seconds) by the editor, but the default `h:mm` renderer would display 90 seconds as "0:01" and treat 5400 seconds as "1:30". An empty cell opens as "00:00:00" and committing writes 0 instead of empty. Invalid text cancels silently. Expanded record falls to the default text input, so users see and type raw seconds.
- **Recommended design:** options: format (the 10 Baserow formats), "allow negative". Editor: accept "1:30" per the field's own format, plus "1h 30m" smart entry; empty stays empty; show the format as the placeholder. Cell: drop the clock icon or keep it small and muted so numbers align.

### 3.16 Rating

- **Airtable:** maximum from 1 to 10 (community post, general knowledge), default yellow star; paid plans can change symbol and colour (https://community.airtable.com/announcements-6/rating-field-and-new-checkbox-styles-1429). The symbol list (star, flag, thumbs up, heart in some sources) could not be confirmed on an official page.
- **Baserow** (https://baserow.io/user-docs/rating-field): max 1 to 10; colour choices; symbols include stars, hearts, thumbs up, flags; hover and click to set; select the cell and type a number; click the current symbol or press Backspace/Delete to clear; whole numbers only. **NocoDB** (N-field-api): `icon`, `max_value` (examples 5 and 10), `color`. **Teable** (T-format): an interactive icon bar; no number formatting.
- **KDOps today:** `Rating` reads `options.max` (default 5) and always draws yellow stars (cell-renderers.tsx L668-688). `ratingMax` exists as state in CreateFieldDialog.tsx L214 and `opts.max` is written at L361, but **no input is rendered for it**, and the Edit dialog has none. The Add Field list text says "A star rating (1-5)". Editor: stars are 16px with `px-2` (cell stars are 14px with no padding), so the stars jump; keyboard: arrows commit immediately and close the editor (cell-editors.tsx L446-489). Click the same star to clear (Airtable-like).
- **Recommended design:** options: max 1-10, icon (star, heart, thumbs-up, flag, circle), colour (reuse the select palette). Cell and editor use the same icon size (14px); hover preview in the cell without entering edit mode, as Baserow does; typing a digit sets the value; Backspace clears.

### 3.17 Formula

- **Airtable** (https://support.airtable.com/docs/formula-field-reference): operators `&`, comparison, arithmetic. Text: ARRAYJOIN, CONCATENATE, ENCODE_URL_COMPONENT, FIND, LEFT, LEN, LOWER, MID, REPLACE, REPT, RIGHT, SEARCH, SUBSTITUTE, T, TRIM, UPPER. Logical: AND, BLANK, ERROR, FALSE, IF, ISERROR, NOT, OR, SWITCH, TRUE, XOR. Numeric: ABS, AVERAGE, CEILING, COUNT, COUNTA, COUNTALL, EVEN, EXP, FLOOR, INT, LOG, MAX, MIN, MOD, ODD, POWER, ROUND, ROUNDDOWN, ROUNDUP, SQRT, SUM, VALUE. Date and time: CREATED_TIME, DATEADD, DATESTR, DATETIME_DIFF, DATETIME_FORMAT, DATETIME_PARSE, DAY, HOUR, IS_AFTER, IS_BEFORE, IS_SAME, LAST_MODIFIED_TIME, MINUTE, MONTH, NOW, SECOND, SET_LOCALE, SET_TIMEZONE, TIMESTR, TONOW, FROMNOW, TODAY, WEEKDAY, WEEKNUM, WORKDAY, WORKDAY_DIFF, YEAR. Array (rollup/lookup only): ARRAYCOMPACT, ARRAYFLATTEN, ARRAYJOIN, ARRAYUNIQUE, ARRAYSLICE. Record: CREATED_TIME, LAST_MODIFIED_TIME, RECORD_ID. Regex: REGEX_MATCH, REGEX_EXTRACT, REGEX_REPLACE. Multi-word field names go in `{}`. DATETIME_DIFF returns whole numbers (seconds by default). AI can help build a formula ("Generate formula").
- **NocoDB** (https://nocodb.com/docs/product-docs/fields/field-types/formula/formula-result-formatting): formula categories numeric, string, date, array, JSON, conditional/system; result formatting for number, currency, percent, date, date and time, time, checkbox (icon and colour) and others. **Baserow:** formulas incl. `datetime_format_tz`, `todate_tz`, `today() - field(...)`. **Teable:** formulas, with formatting only for date or number results (T-format).
- **KDOps today:** a parser and evaluator in `lib/formula.ts` with 45 built-in functions: ABS CEIL FLOOR ROUND SQRT POWER MOD MIN MAX LOG EXP; CONCAT CONCATENATE LEFT RIGHT MID LEN TRIM UPPER LOWER REPLACE SEARCH SUBSTITUTE REPEAT; IF AND OR NOT SWITCH ISBLANK ISERROR; NOW TODAY DATEADD DATEDIFF YEAR MONTH DAY WEEKDAY DATETIME_FORMAT DATETIME_PARSE BLANK; SUM COUNTA COUNTBLANK. A `FormulaEditor` with validation. Renderer handles numbers, booleans, ISO dates, JSON strings and `#ERROR`, and applies `options.result.type` of currency or percent (cell-renderers.tsx L780-862), but I found no screen that sets `options.result`.
- **Gaps:** missing REGEX_*, FIND, VALUE, INT, ROUNDUP/ROUNDDOWN, EVEN/ODD, AVERAGE, COUNT, XOR, TRUE/FALSE, ERROR, T, HOUR/MINUTE/SECOND, IS_AFTER/IS_BEFORE/IS_SAME, DATETIME_DIFF (named DATEDIFF), DATESTR/TIMESTR, WEEKNUM, WORKDAY, WORKDAY_DIFF, TONOW/FROMNOW, SET_TIMEZONE/SET_LOCALE, RECORD_ID/CREATED_TIME/LAST_MODIFIED_TIME, ARRAY* functions, ENCODE_URL_COMPONENT.
- **Recommended design:** options: expression, result format (number format panel from 3.12, date format from 3.8, checkbox style), "show as" for boolean. Add the missing functions in groups. Cell: formatted by result type, right-aligned for numbers. Expanded record: read-only, same format.

### 3.18 Rollup, 3.19 Count, 3.20 Lookup

- **Airtable** (https://support.airtable.com/docs/rollup-field-reference): rollup aggregation functions: AND, ARRAYCOMPACT, ARRAYFLATTEN, ARRAYJOIN, ARRAYSLICE, ARRAYUNIQUE, AVERAGE, CONCATENATE, COUNT (non-empty numbers), COUNTA (non-empty), COUNTALL (every linked record, even blank), MAX, MIN, OR, SUM, XOR. Result formatting follows the number-based field page (a rollup can show as a percentage with a progress bar). Count counts linked records; Lookup returns an array of the chosen field.
- **NocoDB** (N-field-api): `rollup_function` (example `sum`), `related_field_id`, `related_table_rollup_field_id`; Lookup uses `related_table_lookup_field_id`. **Baserow:** Count, Lookup, Rollup (B-overview); rollup of Duration with `sum` is documented. **Teable:** Lookup, Rollup, plus **Conditional lookup and Conditional rollup** (T-field), which look up records by a condition without a link field.
- **KDOps today:** `Rollup`, `Count`, `Lookup` read through a Links field (`lib/computations.ts`). Functions: SUM, AVG, COUNT, MIN, MAX, COUNTA, COUNTALL, CONCATENATE, ARRAY_UNIQUE. Note: KDOps COUNT counts all linked records, while Airtable's COUNT counts non-empty numbers only. Renderer: `LookupRollupCellRenderer.tsx` reads `options.result` for currency/number formatting; there is no screen to set it. Lookup joins values with commas (no per-type look). Create dialog: pick link field, target field, function.
- **Recommended design:** add AND, OR, XOR, ARRAYJOIN, ARRAYCOMPACT, ARRAYSLICE, MEDIAN (optional); rename KDOps `COUNT` semantics or document them; a "Format" section using the Number format panel (3.12). Lookup: show the looked-up field in its own style (pills for selects, dates formatted, avatars for people). Consider a Conditional Lookup (Teable) later.

### 3.21 Created time / 3.22 Last modified time / 3.23 Created by / 3.24 Last modified by

- **Airtable** (https://support.airtable.com/docs/last-modified-time-field): Last modified time and Last modified by default to "All editable fields", or "Specific fields" (computed fields are ignored). Formatting tab: date and time formats, "Use the same time zone for all collaborators", "Display time zone". Automation edits appear as "Automations". Created by never changes. Records edited before the field was added are populated from revision history.
- **NocoDB** (N-field-api): Created Time and Last Modified Time take `date_format`, `time_format`, `12hr_format`, `timezone`, `display_timezone`, `use_same_timezone_for_all`. **Baserow:** "Created on", "Last modified", "Created by", "Last modified by" (B-overview). **Teable:** the four system fields (T-field).
- **KDOps today:** `SystemCellRenderer` shows a fixed "6 Sep 2026, 2:15 pm" style via `formatDbDateTime` and an avatar + email for people (cell-renderers.tsx L583-655). No options. Not editable.
- **Recommended design:** options: date format, time format, time zone mode (same as Date), and for Last modified: watch "all fields" or "specific fields". Cell: same date style as Date fields so the grid reads consistently.

### 3.25 Autonumber and ID

- **Airtable** (A-number): unique, incrementing per record; deleted records leave gaps; renumber by deleting and recreating the field, or converting to another type and back; a new field follows the view's current sort order.
- **NocoDB/Baserow/Teable:** Autonumber, plus UUID (NocoDB, Baserow) (N-overview, B-overview, T-field).
- **KDOps today:** `AutoNumber` as SERIAL; `ID` shows the first 8 characters of the record id with a copy icon (cell-renderers.tsx L590-606, L617-623).
- **Recommended design:** options for Autonumber: start value and optional prefix (INV-0001). Add a "UUID" display option to ID. Cell: monospace, right-aligned.

### 3.26 Barcode (and QR code)

- **Airtable** (A-overview): a barcode object (text + type) that can be scanned with the mobile app camera; barcodes and QR codes.
- **NocoDB** (https://nocodb.com/docs/product-docs/fields/field-types/custom-types/barcode): Barcode and QR Code are generated from another field's value (sources: Formula, Single Line Text, Long Text, Phone, URL); formats include CODE128, EAN-13, UPC-A, CODE39 and ITF-14.
- **Baserow/Teable:** not in the lists I fetched.
- **KDOps today:** `Barcode` is a text value with a barcode icon (cell-renderers.tsx L980-991); editor is the plain text editor.
- **Recommended design:** options: format (CODE128, EAN-13, UPC-A, QR), "generate from field" (NocoDB style) or "typed value" (Airtable style). Cell: small rendered bars and the value. Expanded record: large barcode that can be printed. Scanning on mobile later.

### 3.27 Button

- **Airtable** (https://support.airtable.com/docs/button-field): label and colour set in the field config; actions: Open URL (address can be built from record values, for example with ENCODE_URL_COMPONENT; same-base links open in the same window, others in a new one), Run script (Team plan and up). Interface buttons are separate.
- **NocoDB** (https://nocodb.com/docs/tags/field-types, search summary only): opens a URL, runs a webhook, runs a script or runs an automation, with optional visibility conditions.
- **Baserow:** the page I fetched did not list a Button field. **Teable:** Button is in the "advanced fields" list (T-field); options not documented in my fetch.
- **KDOps today:** `Button` with `label` and a URL template using `{fieldName}` (cell-renderers.tsx L993-1026); a fixed blue (`#2D7FF9`) 24px button. Expanded record has its own button copy (ExpandedRowModal.tsx L1014-1034).
- **Recommended design:** options: label, colour (palette), action (open URL, run automation, call webhook, copy value, set a field value), "show only when" a field condition is met, confirm-before-run. Cell: button sized to the row, disabled look when the condition is false.

### 3.28 Linked record (Links)

- **Airtable** (https://support.airtable.com/docs/limiting-linked-record-selection-to-a-view): "Allow linking to multiple records" only controls the picker (multiple links can still arrive through automations or paste); "Limit record selection to a view" shows only that view's records in the picker, and a form can override it; "Filter by condition" is an alternative set on the field and shared by every form and view; synced on-demand tables cannot be limited; automations ignore these limits. "Create a symmetric field" is the reverse link (not covered by that page; general knowledge).
- **NocoDB** (https://nocodb.com/docs/product-docs/fields/field-types/links-based/link-to-another-record): relation types One-to-Many (Has-Many), Many-to-One (Belongs-to), Many-to-Many, One-to-One; creating a One-to-Many automatically adds the reverse Many-to-One field; self-referencing links work; "limit record selection" by view or by filter (filter version is a paid feature; each condition can be fixed or taken from the current record); limits affect the picker only, not API or paste; a custom display column can be chosen (Cloud); linked-record chips show the display value; the Linked Records modal has search, a card per record with expand and unlink, "+ New record", "Link more records". `limit_record_selection_view_id` and `related_base_id` (links to another base) appear in the API.
- **Baserow:** Link to table, Lookup, Count, Rollup (B-overview); multiple link fields to the same table allowed. **Teable** (https://help.teable.ai/en/basic/field/link.md): target table; "Create a back link field" (two-way, on by default; off gives a one-way link); "Allow linking to multiple records"; "Allow records to be selected more than once"; the two switches define one-to-one (both off), one-to-many (multiple on, reuse off), many-to-one (multiple off, reuse on) and many-to-many (both on). Links connect tables in the same Space only. Filtering the picker was not documented on the page I read.
- **KDOps today:** `Links`, created with `useCreateLink` (CreateFieldDialog.tsx L426-454): target table, relation type one-to-one, one-to-many or many-to-many. Stored as `options.relatedTableId` and `options.type` ('hm', 'bt', 'mm'). Cell shows up to 3 pills (max 140px) plus "+N" and a hover plus button (cell-renderers.tsx L904-978). Edit mode opens `LinkedRecordPicker` (cell-editors.tsx L936-944 note). No symmetric choice, no limit to view or filter, no edit after creation, no custom display field.
- **Recommended design:** options: target table, "Allow multiple records" (this is the missing "limit to one"), "Two-way link" switch, "Limit selection to a view" and "Limit by filter" (static or from this record), display field, "Allow adding new records from the picker". Show the relation type as a read-out ("Many to many") computed from the switches (Teable) instead of a three-button choice. Cell: pills. Editor: a picker anchored under the cell with search and checkmarks. Expanded record: cards with expand and unlink (NocoDB style).

### 3.29 AI field

- **Airtable** (https://support.airtable.com/docs/using-airtable-ai-in-fields): AI-enabled fields are called field agents; they run at the cell level to retrieve, analyse or generate data; they can use a web search or a URL; default type is Long text, and other AI-capable types exist; needs AI credits and workspace AI enabled; owners and creators build them, editors click "Generate". AI-enabled single select cannot use generated default values.
- **NocoDB:** the long text type has `generate_text_using_ai` (N-field-api). **Baserow:** "AI prompt" field (B-overview). **Teable:** an "AI or relational field types" mention, but no AI field in the type table (T-field).
- **KDOps today:** none. **Recommended design:** P3. A field with a prompt template using `{Field}` placeholders, a "Generate" button per cell, "Generate for all empty" bulk action, and a cost or usage note.

### 3.30 JSON, Year, Time, Decimal, geo, progress

- **NocoDB:** JSON ("structured data"), GeoData (latitude/longitude), Geometry, Year, Time, Decimal (`precision`) (N-overview and the field API page).
- **Airtable, Baserow, Teable:** no JSON, geo, or Year type in the lists fetched.
- **KDOps today:** `JSON` uses the long-text editor and a monospace renderer (cell-renderers.tsx L864-875); `Year` is a 4-digit input limited to 1000-9999; `Time` uses the browser's `<input type="time">` with step 1 (cell-editors.tsx L1264-1289), shown as 12-hour "3:05 PM" in the cell; `Decimal` described above. No geo.
- **Recommended design:** JSON: validate on commit, pretty-print in the expanded record, show "{ }" with key count in the cell. Time: add 12h/24h option. Year: fine as is. Geo and progress/status are P3 and only worth it if a real use appears.

---

## 4. Cross-cutting field-system gaps (not tied to one type)

- **Defaults and rules.** `FieldMeta` has `default_value`, `is_required` and `is_unique`, and `lib/validation.ts` supports required, min, max, min length, max length, regex, email and URL rules, but the Create/Edit dialogs have no screen for any of this (only `defaultToCurrentDate` is wired, TableView.tsx L440). Airtable and Baserow both offer default values; Airtable applies range limits only on forms (A-number).
- **Field-type picker.** Good grouping and search already (CreateFieldDialog.tsx L41-78). Add a live "Preview" line for numbers and dates (Airtable shows one at the bottom of the config window).
- **Footer summaries.** `SUMMARY_OPTIONS` (GridView.tsx L131-142) has sum, average, min, max, count, empty, filled and percent filled/empty, with sum/average/min/max for number-like types only. Add: median, range, unique count, earliest/latest for dates, checked/unchecked for checkbox. Fix the Currency symbol bug (GridView.tsx L154).
- **Unused option keys.** `negative`, `locale`, `use12h`, `prefix`, `maxCount`, `maxSizeMB`, `allowedTypes`, `format` (non-duration) are declared in `FieldOptions` but no screen writes them.
- **Expanded record parity.** ExpandedRowModal.tsx `renderEditor` (L953-1045) switches on `ui_type` with no Duration, Year, Time, PhoneNumber (dead `'Phone'` case at L1040), Percent/Currency formatting, or Date-with-time. These should reuse the same editors as the grid.
- **Commit safety.** Several editors commit on both Enter and blur (for example NumberCellEditor L98-102), which can run `onCommit` twice. `LongTextCellEditor` already has a `committedRef` guard (L988-1015); copy that pattern.

---

## 5. Editor visual defects

### 5.1 Root cause of the nested rounded box (Currency and others)

Three things stack up.

1. **Global focus styles** in `src/index.css`:
   - L267-273: `:focus-visible { outline: 2px solid ...; outline-offset: 2px; border-radius: var(--radius); box-shadow: 0 0 0 4px primary/0.12 }`.
   - L281-287: `input:not([checkbox...]):focus, select:focus, textarea:focus { outline: none; border-color: primary/0.5; box-shadow: 0 0 0 3px primary/0.12, 0 1px 2px ... }`.
   Tailwind utilities such as `outline-none` and `border-none` do not remove `box-shadow` or the rounded corner, so every grid-cell input gets a soft rounded halo.
2. **The grid cell already draws the edit outline.** `GridCell.tsx` L195-197 sets `boxShadow: inset 0 0 0 2px primary` on the cell, with `padding: 0 8px` (L190) and `overflow-hidden` (L184). The input sits inside that 8px padding, so its halo shows as a second, smaller, rounded box inside the blue outline.
3. **Editors add their own padding on top** (`px-2`), so the "inner box" is inset 16px from the cell edge and the text jumps (see 5.2).

For **Currency** specifically (`cell-editors.tsx` L115-147): the wrapper `div.flex.items-center.w-full.h-full` holds a fixed symbol `span.pl-2` (L128, `shrink-0`) and then an `input.w-full.h-full.px-2` (L142). The input has no `border-none` (the others have it), no `rounded-none`, and no inline `borderRadius: 0` (TextCellEditor sets `borderRadius: 0` at L76, which is why Text looks better). So the glow draws a rounded box around the number area, right next to the symbol, which reads as "a rounded element with the symbol, then the number".

I read the code only. I did not run the app and look at it, because the module needs a signed-in session. Treat the explanation as very likely but confirm it in the browser after the fix.

### 5.2 Defect list by editor (file `src/features/database/components/grid/cell-editors.tsx`)

| Editor (lines) | Defects | Fix |
|---|---|---|
| TextCellEditor (43-79) | `px-2` adds 8px on top of cell padding, so text jumps right 8px. No `line-height`, so height differs from the cell's `18px`. Focus halo from index.css (radius reset only). | Use `px-0`, `leading-[18px]`, add `shadow-none rounded-none` (or the global fix below). |
| NumberCellEditor (81-108), DecimalCellEditor (1069-1096) | `px-2` shifts the number 8px left from the renderer's right edge. No `tabular-nums` / `-0.01em` letter spacing (renderer has both), so digits shift. No `rounded-none`: rounded glow. | Same classes as Text, plus `tabular-nums` and `tracking-[-0.01em]`, `text-right`. |
| CurrencyCellEditor (115-147) | Wrapper + symbol + input with nested glow, symbol `pl-2` plus input `px-2` = 16px of extra inset, no `border-none`, no `rounded-none`. Symbol map out of sync (L110-113). Placeholder ignores precision. | One outer outline only: wrapper `flex items-center w-full h-full gap-1`; symbol `text-muted-foreground` with no padding and no background; input `flex-1 min-w-0 px-0 text-right bg-transparent border-0 rounded-none shadow-none outline-none`; use the same `Intl.NumberFormat` symbol the renderer uses. |
| PercentCellEditor (877-892) | Cell shows a bar and text but the editor shows an input plus "%" (layout jump). Text `px-2` + "%" `pr-2`. Fixed gray `#9AA2AF`. No tabular figures. | Make the renderer plain text by default (section 3.14); editor `px-0`, "%" as muted text with no padding. |
| DurationCellEditor (257-295) | `px-2` jump; always shows `HH:MM:SS` while the cell shows the field format; parse mismatch (see 3.15). | `px-0`; show the same format as the renderer; parse by the field's format. |
| Email (299-347), URL (349-402), Phone (406-444) | `px-2` jump. Inline `boxShadow: inset 0 0 0 2px red/amber` stacks with the global halo and the cell ring (triple outline). The error bubble uses `bg-transparent` (L341, L396, L438), so text overlays the rows below. Email/URL refuse to commit on invalid, trapping the editor. | `px-0`; show invalid state as red text colour, not a ring; bubble `bg-popover border shadow-md` with `z-50`; allow commit and flag the cell instead of blocking. |
| YearCellEditor (220-255), TimeCellEditor (1264-1289) | `px-2` jump; Time's native control adds its own icon and padding, with a different format (24h/locale) from the 12-hour cell. | `px-0`; use a simple text input with the same 12h/24h option as the field. |
| RatingCellEditor (446-489) | Stars 16px (cell: 14px), editor `px-2 gap-0.5` (cell has no padding), so stars move and grow. Root is `tabIndex=0` with `outline-none`, so global `:focus-visible` still adds the rounded 4px halo. Arrow keys commit and close on every press. | `px-0`, star size 14 to match, `focus-visible:shadow-none rounded-none`; arrows change the value without closing, Enter or Escape closes. |
| SelectCellEditor (496-647), UserCellEditor (1309-1484), LinkedTasksCellEditor (1486-1609) | The trigger is an empty `div` (L549-551 and equivalents), so the **cell goes blank while editing** (renderer content disappears) and the cell size looks different. Popover search `input` has its own border plus the global halo (double ring). | Render the current value in the trigger so nothing disappears; search input `shadow-none focus:border-primary`. |
| MultiSelectCellEditor (649-874) | Same blank-cell problem (L737 empty anchor); the dropdown is a manual `position: fixed` portal at `rect.bottom + 1` that does not follow scroll or flip near the bottom of the window (Popover does). Selected pills are repeated at the top of the dropdown. | Switch to the same Popover as single select; keep the selected pills in the cell. |
| DateCellEditor (149-218), DateTimeCellEditor (1121-1262) | Blank cell behind the popover; the time inputs have borders plus the global halo. Date opens even when "include time" is on. | Keep the value visible; choose editor by `includeTime`. |
| AttachmentCellEditor (894-928) | The cell switches from thumbnails to a paperclip label "N files" (content change, size jump) and opens a modal. Root `tabIndex=0` plus `outline-none` still gets the halo. | Keep thumbnails; open the manager anchored to the cell. |
| LongTextCellEditor (983-1067) | Floating panel has a hard-coded `#2D7FF9` 2px border (L1022) in addition to the cell's inset 2px ring (two separate outlines); textarea gets the global halo inside the panel; uses `rows={8}` and `minHeight 160`. | Panel `border-primary`, `ring-0` on the textarea (`shadow-none`); hide the cell's own ring while the panel is open, or accept the pair but match colours. |
| GridCell itself (`GridCell.tsx` L180-209) | While selected (not editing) the cell is focused programmatically (L170-173) with `tabIndex=0`, so the global `:focus-visible` rule can paint a 4px halo and rounded corners on the selected cell (inline `outline: 'none'` overrides only the outline). I have not confirmed this on screen. | Add `focus-visible:shadow-none rounded-none` to the cell, or the global fix below. |
| Expanded record `InlineNumberEditor`, `InlineTextEditor` etc. (ExpandedRowModal.tsx L69-205) | `rounded border` with `focus:border-[#2D7FF9]` plus the global 3px halo = double ring. | Use one focus style: either the border colour or the halo, not both. |

### 5.3 The recommended structure (all editors)

The rule: **one outline, owned by the cell. Editors draw no border, no ring, no rounded corner, no extra padding.**

- **Cell (already correct):** `padding: 0 8px`, 13px font, 18px line-height, inset 2px primary ring when editing.
- **Every inline editor input:**
  `className="w-full h-full min-w-0 px-0 bg-transparent border-0 rounded-none shadow-none outline-none focus:shadow-none focus:border-0 leading-[18px]"` and `style={{ fontSize: 13 }}`. Numbers add `text-right tabular-nums tracking-[-0.01em]`.
- **Prefix or suffix text (currency symbol, percent sign):** a `span` with `text-muted-foreground`, no padding, no background, no border, `shrink-0`, with `gap-1` on the flex parent.
- **Popup editors (select, date, people, links):** the trigger shows the same content as the renderer, so the cell looks unchanged; the popup carries its own border and shadow.
- **Fastest single fix:** in `src/index.css` add, after L287, a scoped override so the global "premium form input" look does not leak into the grid:
  `[data-cell-id] input:focus, [data-cell-id] textarea:focus, [data-cell-id] [tabindex]:focus-visible { box-shadow: none; border-radius: 0; outline: none; }`
  (`data-cell-id` is already set on every cell at GridCell.tsx L182.) Then remove `px-2` from the editors listed above. The Currency "bubble" disappears as soon as the global override is in.

---

## 6. Prioritised build list: the 25 most valuable field-system changes

1. **Fix editor visual defects** (global focus override scoped to the grid, remove `px-2`, `rounded-none`, matching font/line-height; Currency, Number, Percent, Duration, Rating first). P1, S.
2. **One shared Number format panel** for Number, Decimal, Currency, Percent: format, decimals 0-8, separators, abbreviation, allow negative, prefix/suffix, default, live preview; renderers read it. P1, M.
3. **One shared formatter used everywhere** (grid, expanded record, footer, formula, rollup, lookup). Fixes the footer "NGN" bug and the editor/renderer symbol mismatch. P1, S.
4. **Rating options UI**: max 1-10, icon, colour; editor and cell use the same icon size; keyboard fixes. P1, S.
5. **Duration**: parse by the field's own format, smart entry ("1h 30m"), keep empty as empty, add the d-based formats, show in the expanded record. P1, M.
6. **Percent**: decide storage (whole or fraction), progress bar as an option (off by default), editor with no layout jump. P1, M.
7. **Select and multi-select options**: default option, alphabetical toggle, "allow new options" toggle, next-unused colour, rename that updates stored values; keep the current pill visible while editing. P1, M.
8. **Date options**: 12h/24h (use `use12h`), time zone mode, typed-date entry, editor chosen by `includeTime`; native input replaced in the expanded record. P1, M.
9. **Links: "allow multiple records" (limit to one), two-way switch, limit selection to a view, limit by filter**, editable after creation. P1, L.
10. **Expanded record parity**: reuse the grid editors for Currency, Percent, Duration, Year, Time, Phone, People, Date with time. P1, M.
11. **Validation and default-value screen** in the field dialogs (required, min, max, length, regex, unique, default) using the existing `lib/validation.ts` and `default_value`. P2, M.
12. **Email, URL, Phone editors**: stop blocking commit on invalid, opaque error bubble, flag in the cell instead. P2, S.
13. **Rollup and lookup**: add AND, OR, XOR, ARRAYJOIN, ARRAYCOMPACT, ARRAYSLICE; formatting section; type-aware lookup rendering. P2, M.
14. **Formula**: add the missing functions (REGEX_*, VALUE, INT, ROUNDUP/DOWN, AVERAGE, DATETIME_DIFF alias, IS_AFTER/BEFORE/SAME, HOUR/MINUTE/SECOND, WEEKNUM, WORKDAY, SET_TIMEZONE, array functions) and a result-format selector. P2, L.
15. **Button actions**: colour, open URL, run an automation, call a webhook, copy value, show-only-when rule. P2, L.
16. **Long text**: make the rich-text toggle real (rich editor + rendered bold/italic) or hide the toggle. P2, L.
17. **Attachment options**: max files, max size, allowed types (types already exist); keep thumbnails while editing. P2, M.
18. **Created/Last modified time options**: format, time zone mode, "watch specific fields". P2, M.
19. **Footer summaries**: median, range, unique count, earliest/latest, checked/unchecked, plus the type-specific format. P2, M.
20. **Commit safety**: one-time commit guard for Enter then blur in all inline editors (copy the `committedRef` pattern at LongTextCellEditor L988). P2, S.
21. **Checkbox style** options (icon and colour). P3, S.
22. **People field**: "notify when added", editable in the expanded record. P3, S.
23. **Autonumber** start value and prefix; ID as UUID display. P3, S.
24. **Barcode** drawn as a real barcode/QR, with format choice (NocoDB model). P3, M.
25. **AI field** (prompt template with `{Field}` placeholders, per-cell Generate, bulk Generate). P3, L.

Not on the list on purpose: geo/map, progress/status and extra JSON tooling. Add them only when a real KDOps use shows up.

---

## 7. What was and was not verified

- **Code reading** (Part 2 and 3): done by reading the files named in the brief, plus `GridCell.tsx`, `index.css`, parts of `GridView.tsx` and `LookupRollupCellRenderer.tsx`. Line numbers are from the files as they are on branch `feature/database-revamp` today.
- **Not done:** I did not run the app, so the visual explanation in section 5 and the possible halo on the selected cell are code-based conclusions. No code or git state was changed.
- **Web research:** official pages were fetched for Airtable (field overview, number-based fields, date, linked-record limits, rollup reference, formula reference, single select, attachment, last modified time, rating/checkbox announcement), NocoDB (field API reference, Link to Another Record), Baserow (field overview, number, date and time, duration, rating) and Teable (field list, formatter, link). Search summaries only (no page text) were used for Airtable's rich text, collaborator, button, AI field and multiple select; the NocoDB barcode/button/formula pages; and Baserow's timezone page. Baserow single select colours, Baserow formula function list, NocoDB rollup function list and Teable per-type pages (rating, rollup, button, attachment) could not be retrieved, so those are marked as not documented here rather than guessed.
