import { useState, useCallback } from 'react';
import { Search, Replace, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDatabaseUI } from '../lib/store';
import { useFields, useRecords, useUpdateRecord } from '../hooks';
import type { FieldMeta, RecordRow } from '../types';

interface SearchReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Match {
  recordId: string;
  fieldId: string;
  fieldName: string;
  pgColumn: string;
  value: string;
}

export function SearchReplaceDialog({ open, onOpenChange }: SearchReplaceDialogProps) {
  const { activeBaseId, activeTableId } = useDatabaseUI();
  const { data: fields } = useFields(activeTableId);
  const { data: recordsData } = useRecords({
    baseId: activeBaseId!,
    tableId: activeTableId!,
    page: 0,
    pageSize: 1000,
  });
  const updateRecord = useUpdateRecord();

  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('all');
  const [replacedCount, setReplacedCount] = useState(0);

  const textFields = (fields ?? []).filter(
    (f) =>
      !f.is_system &&
      ['SingleLineText', 'LongText', 'Email', 'PhoneNumber', 'URL'].includes(f.ui_type),
  );

  const findMatches = useCallback((): Match[] => {
    if (!searchText || !recordsData?.records) return [];
    const matches: Match[] = [];
    const search = caseSensitive ? searchText : searchText.toLowerCase();
    const targetFields = selectedFieldId === 'all' ? textFields : textFields.filter((f) => f.id === selectedFieldId);

    for (const record of recordsData.records) {
      for (const field of targetFields) {
        const val = record[field.pg_column_name];
        if (val == null) continue;
        const str = String(val);
        const compare = caseSensitive ? str : str.toLowerCase();
        if (compare.includes(search)) {
          matches.push({
            recordId: record.id,
            fieldId: field.id,
            fieldName: field.name,
            pgColumn: field.pg_column_name,
            value: str,
          });
        }
      }
    }
    return matches;
  }, [searchText, recordsData, textFields, caseSensitive, selectedFieldId]);

  const matches = findMatches();

  const handleReplaceAll = useCallback(() => {
    if (!activeBaseId || !activeTableId || !searchText) return;
    let count = 0;
    for (const match of matches) {
      const regex = new RegExp(
        searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        caseSensitive ? 'g' : 'gi',
      );
      const newValue = match.value.replace(regex, replaceText);
      if (newValue !== match.value) {
        updateRecord.mutate({
          baseId: activeBaseId,
          tableId: activeTableId,
          recordId: match.recordId,
          field: match.pgColumn,
          value: newValue,
        });
        count++;
      }
    }
    setReplacedCount(count);
  }, [activeBaseId, activeTableId, searchText, replaceText, matches, caseSensitive, updateRecord]);

  const handleReplaceSingle = useCallback(
    (match: Match) => {
      if (!activeBaseId || !activeTableId) return;
      const regex = new RegExp(
        searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        caseSensitive ? '' : 'i',
      );
      const newValue = match.value.replace(regex, replaceText);
      updateRecord.mutate({
        baseId: activeBaseId,
        tableId: activeTableId,
        recordId: match.recordId,
        field: match.pgColumn,
        value: newValue,
      });
    },
    [activeBaseId, activeTableId, searchText, replaceText, caseSensitive, updateRecord],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold flex items-center gap-2">
            <Replace size={16} className="text-[#166EE1]" />
            Search & Replace
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
              <input
                className="w-full h-9 pl-8 pr-3 text-[13px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-md bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none focus:border-[#166EE1]"
                placeholder="Search for..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setReplacedCount(0); }}
                autoFocus
              />
            </div>
            <select
              className="h-9 px-2 text-[12px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-md bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)]"
              value={selectedFieldId}
              onChange={(e) => setSelectedFieldId(e.target.value)}
            >
              <option value="all">All text fields</option>
              {textFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Replace size={14} className="absolute left-2.5 top-2.5 text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
            <input
              className="w-full h-9 pl-8 pr-3 text-[13px] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-md bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none focus:border-[#166EE1]"
              placeholder="Replace with..."
              value={replaceText}
              onChange={(e) => { setReplaceText(e.target.value); setReplacedCount(0); }}
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[12px] text-[#6A7184] dark:text-[hsl(200,20%,55%)] cursor-pointer">
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="rounded border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]"
              />
              Case sensitive
            </label>
            <span className="text-[12px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]">
              {searchText ? `${matches.length} match${matches.length !== 1 ? 'es' : ''}` : ''}
            </span>
          </div>

          {matches.length > 0 && (
            <div className="border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg max-h-[200px] overflow-y-auto">
              {matches.slice(0, 50).map((m, i) => {
                const idx = caseSensitive
                  ? m.value.indexOf(searchText)
                  : m.value.toLowerCase().indexOf(searchText.toLowerCase());
                return (
                  <div
                    key={`${m.recordId}-${m.fieldId}-${i}`}
                    className="flex items-center justify-between px-3 py-1.5 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] last:border-0 hover:bg-[#F9F9FA] dark:hover:bg-[hsl(200,25%,15%)]"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] mr-2">{m.fieldName}</span>
                      <span className="text-[12px] text-[#374151] dark:text-[hsl(200,25%,88%)]">
                        {idx >= 0 ? (
                          <>
                            {m.value.slice(Math.max(0, idx - 20), idx)}
                            <mark className="bg-yellow-200 dark:bg-yellow-700/50 dark:text-[hsl(200,25%,88%)] px-0.5 rounded">{m.value.slice(idx, idx + searchText.length)}</mark>
                            {m.value.slice(idx + searchText.length, idx + searchText.length + 20)}
                          </>
                        ) : (
                          m.value.slice(0, 60)
                        )}
                      </span>
                    </div>
                    <button
                      className="text-[11px] text-[#166EE1] hover:underline ml-2 shrink-0"
                      onClick={() => handleReplaceSingle(m)}
                    >
                      Replace
                    </button>
                  </div>
                );
              })}
              {matches.length > 50 && (
                <div className="px-3 py-2 text-[11px] text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] text-center">
                  ...and {matches.length - 50} more matches
                </div>
              )}
            </div>
          )}

          {replacedCount > 0 && (
            <p className="text-[12px] text-green-600">
              Replaced {replacedCount} occurrence{replacedCount !== 1 ? 's' : ''}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              size="sm"
              style={{ backgroundColor: '#166EE1' }}
              className="text-white"
              onClick={handleReplaceAll}
              disabled={matches.length === 0 || !searchText}
            >
              Replace all ({matches.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
