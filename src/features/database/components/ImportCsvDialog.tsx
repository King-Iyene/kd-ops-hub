import { useState, useCallback, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { parseCsv } from '../lib/csv';
import { useFields, useBulkCreateRecords } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import { supabase } from '@/lib/supabase';
import { UI_TYPE_TO_PG_TYPE, VIRTUAL_TYPES } from '../types';
import type { UIType, FieldMeta } from '../types';

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

  if (nonEmpty.every((v) => BOOL_VALUES.has(v.trim().toLowerCase()))) return 'Checkbox';
  if (nonEmpty.every((v) => !isNaN(Number(v.trim())) && v.trim() !== '')) return 'Number';
  if (nonEmpty.every((v) => {
    const t = v.trim();
    if (ISO_DATE_RE.test(t) || US_DATE_RE.test(t)) {
      const d = new Date(t);
      return !isNaN(d.getTime());
    }
    return false;
  })) return 'Date';
  if (nonEmpty.every((v) => EMAIL_RE.test(v.trim()))) return 'Email';
  if (nonEmpty.every((v) => URL_RE.test(v.trim()))) return 'URL';

  const unique = new Set(nonEmpty.map((v) => v.trim()));
  if (unique.size < 20 && unique.size < nonEmpty.length * 0.5) return 'SingleSelect';

  return 'SingleLineText';
}

function inferColumnTypes(headers: string[], rows: string[][]): UIType[] {
  return headers.map((_, colIdx) => {
    const sample = rows.slice(0, 100).map((r) => r[colIdx] ?? '');
    return inferColumnType(sample);
  });
}

// Deduplicate headers: empty → "Column N", dupes → append _2, _3, etc.
function deduplicateHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  return headers.map((h, i) => {
    let name = h.trim();
    if (!name) name = `Column ${i + 1}`;
    const lower = name.toLowerCase();
    const count = counts.get(lower) ?? 0;
    counts.set(lower, count + 1);
    if (count > 0) name = `${name}_${count + 1}`;
    return name;
  });
}

function coerceValue(raw: string, uiType: UIType): any {
  if (raw === undefined || raw === '') return null;
  switch (uiType) {
    case 'Number':
    case 'Decimal':
    case 'Currency':
    case 'Percent': {
      const n = Number(raw);
      return isNaN(n) ? null : n;
    }
    case 'Checkbox': {
      const v = raw.toLowerCase().trim();
      return v === 'true' || v === '1' || v === 'yes';
    }
    case 'Rating': {
      const n = parseInt(raw, 10);
      return isNaN(n) ? null : Math.max(0, Math.min(5, n));
    }
    default:
      return raw;
  }
}

const FIELD_TYPE_OPTIONS: UIType[] = [
  'SingleLineText', 'LongText', 'Number', 'Decimal', 'Date', 'DateTime',
  'Checkbox', 'Email', 'URL', 'PhoneNumber', 'SingleSelect', 'JSON',
];

interface ImportCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ImportPhase = 'idle' | 'fields' | 'records' | 'done';

export function ImportCsvDialog({ open, onOpenChange }: ImportCsvDialogProps) {
  const { activeTableId, activeBaseId } = useDatabaseUI();
  const { data: existingFields, refetch: refetchFields } = useFields(activeTableId);
  const bulkCreate = useBulkCreateRecords();

  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnTypes, setColumnTypes] = useState<UIType[]>([]);
  const [importing, setImporting] = useState(false);
  const [phase, setPhase] = useState<ImportPhase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [error, setError] = useState('');
  const [startTime, setStartTime] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCsvText('');
      setParsed(null);
      setColumnTypes([]);
      setError('');
      setProgress({ done: 0, total: 0, label: '' });
      setPhase('idle');
      setImporting(false);
      cancelledRef.current = false;
    }
  }, [open]);

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
    result.headers = deduplicateHeaders(result.headers);
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
      result.headers = deduplicateHeaders(result.headers);
      setParsed(result);
      setColumnTypes(inferColumnTypes(result.headers, result.rows));
    };
    reader.readAsText(file);
  }, []);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsed || !activeTableId || !activeBaseId) return;
    setImporting(true);
    setError('');
    cancelledRef.current = false;
    setStartTime(Date.now());

    try {
      // ── Phase 1: Resolve existing fields and plan new ones ──
      setPhase('fields');
      const existingPgColumns = new Set(
        (existingFields ?? []).map((f) => f.pg_column_name),
      );
      const existingNames = new Set(
        (existingFields ?? []).map((f) => f.name.toLowerCase()),
      );
      const fieldNameToColumn = new Map(
        (existingFields ?? []).map((f) => [f.name.toLowerCase(), f.pg_column_name]),
      );

      // Collect new fields to create
      const newFields: Array<{
        name: string;
        pgCol: string;
        uiType: UIType;
        options: Record<string, any>;
        headerIdx: number;
      }> = [];

      for (let hi = 0; hi < parsed.headers.length; hi++) {
        const header = parsed.headers[hi];
        if (fieldNameToColumn.has(header.toLowerCase())) continue;

        let pgCol = toSnakeCase(header);
        // Deduplicate pg column name
        if (existingPgColumns.has(pgCol)) {
          let suffix = 2;
          while (existingPgColumns.has(`${pgCol}_${suffix}`)) suffix++;
          pgCol = `${pgCol}_${suffix}`;
        }
        // Deduplicate display name
        let displayName = header;
        if (existingNames.has(displayName.toLowerCase())) {
          let suffix = 2;
          while (existingNames.has(`${displayName}_${suffix}`.toLowerCase())) suffix++;
          displayName = `${displayName}_${suffix}`;
        }

        const uiType = columnTypes[hi] ?? ('SingleLineText' as UIType);
        const options: Record<string, any> = {};
        if (uiType === 'SingleSelect') {
          options.choices = [...new Set(
            parsed.rows.map((r) => r[hi]?.trim()).filter(Boolean)
          )].map((v) => ({ title: v, color: null }));
        }

        newFields.push({ name: displayName, pgCol, uiType, options, headerIdx: hi });
        existingPgColumns.add(pgCol);
        existingNames.add(displayName.toLowerCase());
        fieldNameToColumn.set(header.toLowerCase(), pgCol);
      }

      if (cancelledRef.current) throw new Error('Import cancelled');

      // ── Phase 1a: Bulk insert field metadata ──
      if (newFields.length > 0) {
        setProgress({ done: 0, total: newFields.length, label: `Creating ${newFields.length} fields...` });

        const metadataRows = newFields
          .filter((f) => !VIRTUAL_TYPES.includes(f.uiType))
          .map((f, i) => ({
            table_id: activeTableId,
            name: f.name,
            pg_column_name: f.pgCol,
            ui_type: f.uiType,
            pg_type: UI_TYPE_TO_PG_TYPE[f.uiType] ?? 'TEXT',
            options: f.options,
            position: 100 + i,
            width: 180,
            is_primary: false,
            is_required: false,
            is_unique: false,
            is_system: false,
            is_hidden: false,
            description: null,
            default_value: null,
          }));

        // Bulk insert all metadata in one request
        const { error: metaError } = await supabase
          .schema('nc_meta')
          .from('fields')
          .insert(metadataRows);

        if (metaError) throw new Error(`Field metadata: ${metaError.message}`);

        // ── Phase 1b: Bulk add PG columns in one DDL call ──
        // Get table context
        const [baseRes, tableRes] = await Promise.all([
          supabase.schema('nc_meta').from('bases').select('schema_name').eq('id', activeBaseId).single(),
          supabase.schema('nc_meta').from('tables').select('pg_table_name').eq('id', activeTableId).single(),
        ]);
        if (baseRes.error) throw baseRes.error;
        if (tableRes.error) throw tableRes.error;

        const schemaName = baseRes.data.schema_name;
        const tableName = tableRes.data.pg_table_name;

        const ddlColumns = newFields
          .filter((f) => !VIRTUAL_TYPES.includes(f.uiType))
          .map((f) => ({
            columnName: f.pgCol,
            columnType: UI_TYPE_TO_PG_TYPE[f.uiType] ?? 'TEXT',
          }));

        if (ddlColumns.length > 0) {
          const { data: ddlData, error: ddlError } = await supabase.functions.invoke('ddl-executor', {
            body: {
              action: 'bulkAddColumns',
              schemaName,
              tableName,
              columns: ddlColumns,
            },
          });

          if (ddlError) {
            let message = ddlError.message || 'Failed to create columns';
            if (ddlData && typeof ddlData === 'object' && ddlData.error) message = ddlData.error;
            throw new Error(message);
          }
          if (ddlData && typeof ddlData === 'object' && ddlData.success === false) {
            throw new Error(ddlData.error || 'DDL execution failed');
          }
        }

        setProgress({ done: newFields.length, total: newFields.length, label: 'Fields created' });
      }

      if (cancelledRef.current) throw new Error('Import cancelled');

      // ── Phase 2: Insert records in batches ──
      setPhase('records');
      const allRecords = parsed.rows.map((row, rowIdx) => {
        const record: Record<string, any> = { nc_order: rowIdx + 1 };
        parsed.headers.forEach((header, i) => {
          const colName = fieldNameToColumn.get(header.toLowerCase());
          if (colName && row[i] !== undefined && row[i] !== '') {
            record[colName] = coerceValue(row[i], columnTypes[i] ?? 'SingleLineText');
          }
        });
        return record;
      });

      setProgress({ done: 0, total: allRecords.length, label: 'Importing records...' });
      await bulkCreate.mutateAsync({
        baseId: activeBaseId,
        tableId: activeTableId,
        records: allRecords,
        onProgress: (done, total) => {
          if (cancelledRef.current) return;
          setProgress({ done, total, label: `${done} of ${total} rows` });
        },
      });

      // ── Phase 3: Refresh ──
      setPhase('done');
      await refetchFields();
      // Brief delay for PostgREST schema cache reload (DDL executor already sent NOTIFY)
      await new Promise((r) => setTimeout(r, 500));

      onOpenChange(false);
    } catch (err: any) {
      if (err.message === 'Import cancelled') {
        setError('Import cancelled.');
      } else {
        setError(err.message || 'Import failed.');
      }
    } finally {
      setImporting(false);
      setPhase('idle');
    }
  }, [parsed, activeTableId, activeBaseId, existingFields, columnTypes, bulkCreate, onOpenChange, refetchFields]);

  const elapsed = importing && startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

  // Show first 5 columns in preview table, rest in compact list
  const PREVIEW_COLS = 5;
  const previewHeaders = parsed ? parsed.headers.slice(0, PREVIEW_COLS) : [];
  const previewRows = parsed ? parsed.rows.slice(0, 5) : [];
  const remainingHeaders = parsed ? parsed.headers.slice(PREVIEW_COLS) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[#374151] dark:text-[hsl(200,25%,88%)]">Import CSV</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3">
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
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                <FileText size={14} />
                <span>
                  {parsed.headers.length} columns, {parsed.rows.length} rows
                </span>
              </div>

              {/* Data preview — first 5 columns × first 5 rows */}
              <div className="overflow-x-auto border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F9F9FA] dark:bg-[hsl(200,25%,13%)]">
                      {previewHeaders.map((h, i) => (
                        <th
                          key={i}
                          className="text-left px-3 py-2 font-semibold border-b border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] whitespace-nowrap text-[#374151] dark:text-[hsl(200,25%,88%)]"
                        >
                          <div className="truncate max-w-[140px]">{h}</div>
                          <select
                            className="mt-1 text-[10px] font-normal bg-transparent border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1 py-0.5 text-[#6A7184] dark:text-[hsl(200,20%,55%)]"
                            value={columnTypes[i] ?? 'SingleLineText'}
                            onChange={(e) => {
                              const next = [...columnTypes];
                              next[i] = e.target.value as UIType;
                              setColumnTypes(next);
                            }}
                          >
                            {FIELD_TYPE_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </th>
                      ))}
                      {remainingHeaders.length > 0 && (
                        <th className="text-left px-3 py-2 font-normal text-[10px] border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] whitespace-nowrap text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                          +{remainingHeaders.length} more
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-[#F9F9FA] dark:hover:bg-[hsl(200,25%,15%)]">
                        {previewHeaders.map((_, ci) => (
                          <td
                            key={ci}
                            className="px-3 py-1.5 border-b border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] whitespace-nowrap max-w-[140px] truncate text-[#374151] dark:text-[hsl(200,25%,88%)]"
                          >
                            {row[ci] ?? ''}
                          </td>
                        ))}
                        {remainingHeaders.length > 0 && (
                          <td className="px-3 py-1.5 border-b text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">…</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Column mapping — compact list for remaining columns */}
              {remainingHeaders.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-[#166EE1] hover:underline">
                    All column mappings ({parsed.headers.length})
                  </summary>
                  <div className="mt-2 max-h-48 overflow-y-auto border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg divide-y divide-[#E5E5E5] dark:divide-[hsl(200,25%,18%)]">
                    {parsed.headers.map((h, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="flex-1 truncate text-[#374151] dark:text-[hsl(200,25%,88%)]">{h}</span>
                        <select
                          className="text-[10px] bg-transparent border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded px-1 py-0.5 text-[#6A7184] dark:text-[hsl(200,20%,55%)]"
                          value={columnTypes[i] ?? 'SingleLineText'}
                          onChange={(e) => {
                            const next = [...columnTypes];
                            next[i] = e.target.value as UIType;
                            setColumnTypes(next);
                          }}
                        >
                          {FIELD_TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Progress bar */}
              {importing && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                    <span>{progress.label}</span>
                    <span>{elapsed}s</span>
                  </div>
                  <div className="w-full h-2 bg-[#E5E5E5] dark:bg-[hsl(200,25%,18%)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#166EE1] rounded-full transition-all duration-300"
                      style={{ width: progress.total > 0 ? `${Math.round((progress.done / progress.total) * 100)}%` : '0%' }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#6A7184] dark:text-[hsl(200,20%,55%)]">
                    <span>
                      {phase === 'fields' && 'Creating fields...'}
                      {phase === 'records' && `${progress.done} / ${progress.total} rows`}
                      {phase === 'done' && 'Finishing up...'}
                    </span>
                  </div>
                </div>
              )}

              {!importing && (
                <button
                  className="text-xs hover:underline"
                  style={{ color: '#166EE1' }}
                  onClick={() => setParsed(null)}
                >
                  Back to input
                </button>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          {importing ? (
            <Button variant="outline" size="sm" onClick={handleCancel} className="gap-1">
              <X size={13} /> Cancel
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
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
              {importing
                ? 'Importing...'
                : `Import ${parsed.rows.length} row${parsed.rows.length !== 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
