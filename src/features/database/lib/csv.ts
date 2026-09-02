import type { FieldMeta, RecordRow } from '../types';

export function exportToCSV(fields: FieldMeta[], records: RecordRow[], tableName: string) {
  const visibleFields = fields
    .filter((f) => !f.is_hidden && !f.is_system)
    .sort((a, b) => a.position - b.position);

  const header = visibleFields.map((f) => escapeCSV(f.name)).join(',');
  const rows = records.map((record) =>
    visibleFields
      .map((f) => {
        const val = record[f.pg_column_name];
        if (val == null) return '';
        if (Array.isArray(val)) return escapeCSV(val.join(', '));
        if (typeof val === 'object') return escapeCSV(JSON.stringify(val));
        return escapeCSV(String(val));
      })
      .join(','),
  );

  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tableName || 'export'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function csvToRecords(
  headers: string[],
  rows: string[][],
  fields: FieldMeta[],
): Record<string, any>[] {
  const fieldByName = new Map(fields.map((f) => [f.name.toLowerCase(), f]));

  const columnMap: (FieldMeta | null)[] = headers.map(
    (h) => fieldByName.get(h.toLowerCase()) ?? null,
  );

  return rows.map((row) => {
    const record: Record<string, any> = {};
    row.forEach((val, i) => {
      const field = columnMap[i];
      if (!field || field.is_system || !val) return;
      record[field.pg_column_name] = coerceValue(val, field);
    });
    return record;
  });
}

function coerceValue(val: string, field: FieldMeta): any {
  switch (field.ui_type) {
    case 'Number':
    case 'Decimal':
    case 'Currency':
    case 'Percent':
    case 'Rating':
    case 'Duration':
    case 'Year':
    case 'AutoNumber': {
      const n = Number(val);
      return isNaN(n) ? null : n;
    }
    case 'Checkbox':
      return val.toLowerCase() === 'true' || val === '1';
    case 'MultiSelect':
      return val.split(',').map((s) => s.trim()).filter(Boolean);
    case 'JSON':
      try { return JSON.parse(val); } catch { return val; }
    default:
      return val;
  }
}
