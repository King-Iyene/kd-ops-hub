import { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { parseCsv } from '../lib/csv';
import { useCreateField, useBulkCreateRecords, useFields } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import type { UIType } from '../types';

function toSnakeCase(name: string): string {
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (/^[0-9]/.test(result)) result = 'f_' + result;
  return result.substring(0, 63);
}

// ---------------------------------------------------------------------------
// CSV type inference
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const BOOL_VALUES = new Set(['true', 'false', 'yes', 'no', '1', '0']);

function inferColumnType(values: string[]): UIType {
  const nonEmpty = values.filter((v) => v.trim() !== '');
  if (nonEmpty.length === 0) return 'SingleLineText';

  // Check boolean
  if (nonEmpty.every((v) => BOOL_VALUES.has(v.trim().toLowerCase()))) {
    return 'Checkbox';
  }

  // Check number
  if (nonEmpty.every((v) => !isNaN(Number(v.trim())) && v.trim() !== '')) {
    return 'Number';
  }

  // Check date
  if (nonEmpty.every((v) => {
    const t = v.trim();
    if (ISO_DATE_RE.test(t) || US_DATE_RE.test(t)) {
      const d = new Date(t);
      return !isNaN(d.getTime());
    }
    return false;
  })) {
    return 'Date';
  }

  // Check email
  if (nonEmpty.every((v) => EMAIL_RE.test(v.trim()))) {
    return 'Email';
  }

  // Check URL
  if (nonEmpty.every((v) => URL_RE.test(v.trim()))) {
    return 'URL';
  }

  // Check single-select: small cardinality
  const unique = new Set(nonEmpty.map((v) => v.trim()));
  if (unique.size < 20 && unique.size < nonEmpty.length * 0.5) {
    return 'SingleSelect';
  }

  return 'SingleLineText';
}

function inferColumnTypes(headers: string[], rows: string[][]): UIType[] {
  return headers.map((_, colIdx) => {
    const sample = rows.slice(0, 100).map((r) => r[colIdx] ?? '');
    return inferColumnType(sample);
  });
}

interface ImportCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportCsvDialog({ open, onOpenChange }: ImportCsvDialogProps) {
  const { activeTableId, activeBaseId } = useDatabaseUI();
  const { data: existingFields } = useFields(activeTableId);
  const createField = useCreateField();
  const bulkCreate = useBulkCreateRecords();

  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnTypes, setColumnTypes] = useState<UIType[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = useCallback(() => {
    if (!csvText.trim()) {
      setError('Please paste CSV text or upload a file.');
      return;
    }
    setError('');
    const result = parseCsv(csvText);
    if (result.headers.length === 0) {
      setError('No data found in CSV.');
      return;
    }
    setParsed(result);
    setColumnTypes(inferColumnTypes(result.headers, result.rows));
  }, [csvText]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setError('');
      const result = parseCsv(text);
      if (result.headers.length === 0) {
        setError('No data found in CSV.');
        return;
      }
      setParsed(result);
      setColumnTypes(inferColumnTypes(result.headers, result.rows));
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsed || !activeTableId || !activeBaseId) return;
    setImporting(true);
    setError('');

    try {
      const existingPgColumns = new Set(
        (existingFields ?? []).map((f) => f.pg_column_name),
      );
      const fieldNameToColumn = new Map(
        (existingFields ?? []).map((f) => [f.name.toLowerCase(), f.pg_column_name]),
      );

      // Create fields for columns that don't exist, deduplicating by pg_column_name
      for (let hi = 0; hi < parsed.headers.length; hi++) {
        const header = parsed.headers[hi];
        if (fieldNameToColumn.has(header.toLowerCase())) continue;

        let pgCol = toSnakeCase(header);
        if (existingPgColumns.has(pgCol)) {
          let suffix = 2;
          while (existingPgColumns.has(`${pgCol}_${suffix}`)) suffix++;
          pgCol = `${pgCol}_${suffix}`;
        }

        const inferredType = columnTypes[hi] ?? ('SingleLineText' as UIType);
        try {
          const newField = await createField.mutateAsync({
            table_id: activeTableId,
            name: header,
            ui_type: inferredType,
            ...(inferredType === 'SingleSelect'
              ? {
                  options: {
                    choices: [...new Set(parsed.rows.map((r) => r[hi]?.trim()).filter(Boolean))].map(
                      (v) => ({ title: v, color: null }),
                    ),
                  },
                }
              : {}),
          });
          fieldNameToColumn.set(header.toLowerCase(), newField.pg_column_name);
          existingPgColumns.add(newField.pg_column_name);
        } catch (err: any) {
          if (err?.message?.includes('duplicate') || err?.code === '23505') {
            fieldNameToColumn.set(header.toLowerCase(), pgCol);
          } else {
            throw err;
          }
        }
      }

      // Build all records for bulk insert
      const allRecords = parsed.rows.map((row) => {
        const record: Record<string, any> = {};
        parsed.headers.forEach((header, i) => {
          const colName = fieldNameToColumn.get(header.toLowerCase());
          if (colName && row[i] !== undefined && row[i] !== '') {
            record[colName] = row[i];
          }
        });
        return record;
      });

      setImportProgress({ done: 0, total: allRecords.length });
      await bulkCreate.mutateAsync({
        baseId: activeBaseId,
        tableId: activeTableId,
        records: allRecords,
        onProgress: (done, total) => setImportProgress({ done, total }),
      });

      onOpenChange(false);
      setCsvText('');
      setParsed(null);
      setColumnTypes([]);
    } catch (err: any) {
      setError(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }, [parsed, activeTableId, activeBaseId, existingFields, createField, bulkCreate, onOpenChange]);

  const handleClose = useCallback(
    (val: boolean) => {
      if (!val) {
        setCsvText('');
        setParsed(null);
        setColumnTypes([]);
        setError('');
        setImportProgress({ done: 0, total: 0 });
      }
      onOpenChange(val);
    },
    [onOpenChange],
  );

  const previewRows = parsed ? parsed.rows.slice(0, 5) : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-[#374151] dark:text-[hsl(200,25%,88%)]">Import CSV</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3">
            <textarea
              className="w-full h-40 text-xs font-mono border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-[#166EE1] resize-none bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)] text-[#374151] dark:text-[hsl(200,25%,88%)]"
              placeholder="Paste CSV text here..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={13} /> Upload .csv
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <span className="text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                or paste above
              </span>
            </div>
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
              <FileText size={14} />
              <span>
                {parsed.headers.length} columns, {parsed.rows.length} rows
                {previewRows.length < parsed.rows.length && ` (showing first ${previewRows.length})`}
              </span>
            </div>
            <div className="overflow-x-auto border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)]">
                    {parsed.headers.map((h, i) => (
                      <th
                        key={i}
                        className="text-left px-3 py-2 font-semibold border-b border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] whitespace-nowrap text-[#374151] dark:text-[hsl(200,25%,88%)]"
                      >
                        <div>{h}</div>
                        <select
                          className="mt-1 text-[10px] font-normal bg-transparent border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1 py-0.5 text-[#6A7184] dark:text-[hsl(200,20%,55%)]"
                          value={columnTypes[i] ?? 'SingleLineText'}
                          onChange={(e) => {
                            const next = [...columnTypes];
                            next[i] = e.target.value as UIType;
                            setColumnTypes(next);
                          }}
                        >
                          {(['SingleLineText', 'LongText', 'Number', 'Decimal', 'Date', 'DateTime', 'Checkbox', 'Email', 'URL', 'PhoneNumber', 'SingleSelect', 'JSON'] as UIType[]).map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-[#F9F9FA] dark:hover:bg-[hsl(200,25%,15%)]">
                      {parsed.headers.map((_, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-1.5 border-b border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] whitespace-nowrap max-w-[200px] truncate text-[#374151] dark:text-[hsl(200,25%,88%)]"
                        >
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              className="text-xs hover:underline"
              style={{ color: '#166EE1' }}
              onClick={() => setParsed(null)}
            >
              Back to input
            </button>
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleClose(false)} disabled={importing}>
            Cancel
          </Button>
          {!parsed ? (
            <Button
              size="sm"
              onClick={handleParse}
              style={{ backgroundColor: '#166EE1' }}
              className="text-white"
            >
              Preview
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing}
              style={{ backgroundColor: '#166EE1' }}
              className="text-white gap-1"
            >
              {importing && <Loader2 size={13} className="animate-spin" />}
              {importing && importProgress.total > 0
                ? `${importProgress.done} of ${importProgress.total} records`
                : `Import ${parsed.rows.length} row${parsed.rows.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
