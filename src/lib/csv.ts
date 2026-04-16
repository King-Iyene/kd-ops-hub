/** Escape a single CSV cell. */
export const csvEscape = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
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
