import { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, Check, AlertCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseCsv, matchFieldsByHeader, coerceValue } from '../lib/csv';
import { useFields, useCreateRecord } from '../hooks';
import { useDatabaseUI } from '../lib/store';
import type { FieldMeta } from '../types';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ImportStep = 'upload' | 'mapping' | 'importing' | 'done';

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { activeBaseId, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);
  const createRecord = useCreateRecord();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Map<number, FieldMeta>>(new Map());
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const reset = useCallback(() => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setRows([]);
    setMapping(new Map());
    setProgress(0);
    setImportedCount(0);
    setErrorCount(0);
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      if (!fields) return;
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers: h, rows: r } = parseCsv(text);
        setHeaders(h);
        setRows(r);
        setMapping(matchFieldsByHeader(h, fields));
        setStep('mapping');
      };
      reader.readAsText(file);
    },
    [fields],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleImport = useCallback(async () => {
    if (!activeBaseId || !activeTableId) return;
    setStep('importing');
    let imported = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const record: Record<string, any> = {};
      mapping.forEach((field, colIdx) => {
        const val = row[colIdx];
        if (val != null) {
          record[field.pg_column_name] = coerceValue(val, field);
        }
      });

      try {
        await new Promise<void>((resolve, reject) => {
          createRecord.mutate(
            { baseId: activeBaseId, tableId: activeTableId, record },
            { onSuccess: () => resolve(), onError: () => reject() },
          );
        });
        imported++;
      } catch {
        errors++;
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
      setImportedCount(imported);
      setErrorCount(errors);
    }
    setStep('done');
  }, [activeBaseId, activeTableId, rows, mapping, createRecord]);

  const updateMapping = useCallback(
    (colIdx: number, fieldId: string | '') => {
      setMapping((prev) => {
        const next = new Map(prev);
        if (fieldId === '') {
          next.delete(colIdx);
        } else {
          const field = fields?.find((f) => f.id === fieldId);
          if (field) next.set(colIdx, field);
        }
        return next;
      });
    },
    [fields],
  );

  const usedFieldIds = new Set([...mapping.values()].map((f) => f.id));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Upload size={16} className="text-[#3366FF]" />
            Import data
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4 pt-2">
            <div
              className="border-2 border-dashed border-[#E7E7E9] rounded-lg p-8 text-center cursor-pointer hover:border-[#3366FF] transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <FileSpreadsheet size={32} className="mx-auto mb-3 text-[#9AA2AF]" />
              <p className="text-[13px] text-[#374151] font-medium mb-1">
                Drop a CSV file here or click to browse
              </p>
              <p className="text-[11px] text-[#9AA2AF]">Supports .csv files</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-[#374151]">
                <span className="font-medium">{fileName}</span> — {rows.length} rows
              </p>
              <Button variant="ghost" size="sm" className="text-[12px] text-[#6A7184]" onClick={reset}>
                Change file
              </Button>
            </div>

            <div className="border border-[#E7E7E9] rounded-lg max-h-[300px] overflow-y-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-[#F9F9FA] border-b border-[#E7E7E9]">
                    <th className="text-left px-3 py-2 font-medium text-[#6A7184]">CSV Column</th>
                    <th className="text-left px-3 py-2 font-medium text-[#6A7184]">Maps to Field</th>
                    <th className="text-left px-3 py-2 font-medium text-[#6A7184]">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.map((h, i) => (
                    <tr key={i} className="border-b border-[#E7E7E9] last:border-0">
                      <td className="px-3 py-2 text-[#374151] font-medium">{h}</td>
                      <td className="px-3 py-2">
                        <select
                          className="w-full border border-[#E7E7E9] rounded px-2 py-1 text-[12px] bg-white text-[#374151]"
                          value={mapping.get(i)?.id ?? ''}
                          onChange={(e) => updateMapping(i, e.target.value)}
                        >
                          <option value="">— Skip —</option>
                          {(fields ?? [])
                            .filter((f) => !f.is_system)
                            .map((f) => (
                              <option
                                key={f.id}
                                value={f.id}
                                disabled={usedFieldIds.has(f.id) && mapping.get(i)?.id !== f.id}
                              >
                                {f.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-[#9AA2AF] truncate max-w-[120px]">
                        {rows[0]?.[i] || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                style={{ backgroundColor: '#3366FF' }}
                className="text-white"
                onClick={handleImport}
                disabled={mapping.size === 0}
              >
                Import {rows.length} rows
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="space-y-4 pt-4 pb-2 text-center">
            <div className="w-full bg-[#E7E7E9] rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: '#3366FF' }}
              />
            </div>
            <p className="text-[13px] text-[#374151]">
              Importing... {progress}% ({importedCount} of {rows.length})
            </p>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4 pt-4 pb-2 text-center">
            <div className="mx-auto w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Check size={20} className="text-green-600" />
            </div>
            <p className="text-[14px] font-medium text-[#374151]">Import complete</p>
            <p className="text-[12px] text-[#6A7184]">
              {importedCount} rows imported successfully
              {errorCount > 0 && (
                <span className="text-red-500 ml-1">
                  <AlertCircle size={12} className="inline -mt-0.5" /> {errorCount} errors
                </span>
              )}
            </p>
            <Button
              size="sm"
              style={{ backgroundColor: '#3366FF' }}
              className="text-white"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
