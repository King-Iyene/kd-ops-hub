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
import { useCreateField, useCreateRecord, useFields } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import type { UIType } from '../types';

interface ImportCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportCsvDialog({ open, onOpenChange }: ImportCsvDialogProps) {
  const { activeTableId, activeBaseId } = useDatabaseUI();
  const { data: existingFields } = useFields(activeTableId);
  const createField = useCreateField();
  const createRecord = useCreateRecord();

  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);
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
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsed || !activeTableId || !activeBaseId) return;
    setImporting(true);
    setError('');

    try {
      const existingFieldNames = new Set(
        (existingFields ?? []).map((f) => f.name.toLowerCase()),
      );
      const fieldNameToColumn = new Map(
        (existingFields ?? []).map((f) => [f.name.toLowerCase(), f.pg_column_name]),
      );

      // Create fields for columns that don't exist
      for (const header of parsed.headers) {
        if (!existingFieldNames.has(header.toLowerCase())) {
          const newField = await createField.mutateAsync({
            table_id: activeTableId,
            name: header,
            ui_type: 'SingleLineText' as UIType,
          });
          fieldNameToColumn.set(header.toLowerCase(), newField.pg_column_name);
          existingFieldNames.add(header.toLowerCase());
        }
      }

      // Create records
      for (const row of parsed.rows) {
        const record: Record<string, any> = {};
        parsed.headers.forEach((header, i) => {
          const colName = fieldNameToColumn.get(header.toLowerCase());
          if (colName && row[i] !== undefined && row[i] !== '') {
            record[colName] = row[i];
          }
        });
        await createRecord.mutateAsync({
          baseId: activeBaseId,
          tableId: activeTableId,
          record,
        });
      }

      onOpenChange(false);
      setCsvText('');
      setParsed(null);
    } catch (err: any) {
      setError(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }, [parsed, activeTableId, activeBaseId, existingFields, createField, createRecord, onOpenChange]);

  const handleClose = useCallback(
    (val: boolean) => {
      if (!val) {
        setCsvText('');
        setParsed(null);
        setError('');
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
          <DialogTitle className="text-[#374151]">Import CSV</DialogTitle>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3">
            <textarea
              className="w-full h-40 text-xs font-mono border border-[#E7E7E9] rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-[#3366FF] resize-none"
              placeholder="Paste CSV text here..."
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              style={{ backgroundColor: '#F9F9FA', color: '#374151' }}
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
              <span className="text-xs" style={{ color: '#6A7184' }}>
                or paste above
              </span>
            </div>
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs" style={{ color: '#6A7184' }}>
              <FileText size={14} />
              <span>
                {parsed.headers.length} columns, {parsed.rows.length} rows
                {previewRows.length < parsed.rows.length && ` (showing first ${previewRows.length})`}
              </span>
            </div>
            <div className="overflow-x-auto border border-[#E7E7E9] rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: '#F9F9FA' }}>
                    {parsed.headers.map((h, i) => (
                      <th
                        key={i}
                        className="text-left px-3 py-2 font-semibold border-b border-r border-[#E7E7E9] whitespace-nowrap"
                        style={{ color: '#374151' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className="hover:bg-[#F9F9FA]">
                      {parsed.headers.map((_, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-1.5 border-b border-r border-[#E7E7E9] whitespace-nowrap max-w-[200px] truncate"
                          style={{ color: '#374151' }}
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
              style={{ color: '#3366FF' }}
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
              style={{ backgroundColor: '#3366FF' }}
              className="text-white"
            >
              Preview
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing}
              style={{ backgroundColor: '#3366FF' }}
              className="text-white gap-1"
            >
              {importing && <Loader2 size={13} className="animate-spin" />}
              Import {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
