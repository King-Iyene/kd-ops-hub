import type { FieldMeta, RecordRow } from '../types';

export function exportToCsv(fields: FieldMeta[], records: RecordRow[], tableName: string) {
  const exportFields = fields
    .filter((f) => !f.is_hidden && f.ui_type !== 'ID')
    .sort((a, b) => a.position - b.position);

  const header = exportFields.map((f) => escapeCsv(f.name)).join(',');

  const rows = records.map((r) =>
    exportFields
      .map((f) => {
        const val = r[f.pg_column_name];
        if (val == null) return '';
        if (Array.isArray(val)) return escapeCsv(val.join(', '));
        return escapeCsv(String(val));
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

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
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

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);
  return { headers, rows };
}
