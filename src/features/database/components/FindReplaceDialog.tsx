import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Search, Replace, ChevronDown, ChevronUp, CaseSensitive } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { FieldMeta, RecordRow } from '../types';

interface FindReplaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldMeta[];
  records: RecordRow[];
  onCellUpdate: (recordId: string, fieldId: string, value: any) => void;
  onHighlightCell?: (cellId: string | null) => void;
}

interface Match {
  recordId: string;
  fieldId: string;
  pgColumn: string;
  value: string;
  index: number;
}

export function FindReplaceDialog({
  open,
  onOpenChange,
  fields,
  records,
  onCellUpdate,
  onHighlightCell,
}: FindReplaceDialogProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const findRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => findRef.current?.focus(), 100);
  }, [open]);

  const searchableFields = useMemo(
    () => fields.filter((f) => !f.is_system && f.ui_type !== 'ID' && ['SingleLineText', 'LongText', 'Email', 'URL', 'PhoneNumber', 'SingleSelect', 'Number', 'Currency', 'Decimal'].includes(f.ui_type)),
    [fields],
  );

  const matches = useMemo(() => {
    if (!findText) return [];
    const results: Match[] = [];
    const query = caseSensitive ? findText : findText.toLowerCase();
    for (const record of records) {
      for (const field of searchableFields) {
        const raw = record[field.pg_column_name];
        if (raw == null) continue;
        const str = String(raw);
        const compare = caseSensitive ? str : str.toLowerCase();
        if (compare.includes(query)) {
          results.push({
            recordId: record.id,
            fieldId: field.id,
            pgColumn: field.pg_column_name,
            value: str,
            index: results.length,
          });
        }
      }
    }
    return results;
  }, [findText, caseSensitive, records, searchableFields]);

  useEffect(() => {
    if (currentIdx >= matches.length) setCurrentIdx(Math.max(0, matches.length - 1));
  }, [matches.length, currentIdx]);

  useEffect(() => {
    const match = matches[currentIdx];
    onHighlightCell?.(match ? `${match.recordId}:${match.fieldId}` : null);
  }, [currentIdx, matches, onHighlightCell]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIdx((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const replaceOne = useCallback(() => {
    const match = matches[currentIdx];
    if (!match) return;
    const newVal = caseSensitive
      ? match.value.replace(findText, replaceText)
      : match.value.replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), replaceText);
    onCellUpdate(match.recordId, match.fieldId, newVal);
  }, [matches, currentIdx, findText, replaceText, caseSensitive, onCellUpdate]);

  const replaceAll = useCallback(() => {
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
    for (const match of matches) {
      const newVal = match.value.replace(regex, replaceText);
      if (newVal !== match.value) {
        onCellUpdate(match.recordId, match.fieldId, newVal);
      }
    }
  }, [matches, findText, replaceText, caseSensitive, onCellUpdate]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onHighlightCell?.(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Search size={16} className="text-[#2D7FF9]" />
            Find {showReplace && '& Replace'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                ref={findRef}
                type="text"
                value={findText}
                onChange={(e) => { setFindText(e.target.value); setCurrentIdx(0); }}
                placeholder="Find in this view..."
                className="w-full px-3 py-2 text-xs-plus rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none focus:border-[#2D7FF9] focus:ring-1 focus:ring-[#2D7FF9]/30"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { if (e.shiftKey) goPrev(); else goNext(); }
                  if (e.key === 'Escape') onOpenChange(false);
                }}
              />
              {findText && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-[#9AA2AF] dark:text-[hsl(200,25%,50%)]">
                  {matches.length > 0 ? `${currentIdx + 1} / ${matches.length}` : '0 results'}
                </span>
              )}
            </div>
            <button
              className={`p-1.5 rounded-md border transition-colors ${caseSensitive ? 'border-[#2D7FF9] bg-[#2D7FF9]/10 text-[#2D7FF9]' : 'border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#9AA2AF]'}`}
              onClick={() => setCaseSensitive(!caseSensitive)}
              title="Case sensitive"
            >
              <CaseSensitive size={16} />
            </button>
            <button className="p-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#9AA2AF] hover:text-[#374151] dark:hover:text-white transition-colors" onClick={goPrev} title="Previous">
              <ChevronUp size={16} />
            </button>
            <button className="p-1.5 rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] text-[#9AA2AF] hover:text-[#374151] dark:hover:text-white transition-colors" onClick={goNext} title="Next">
              <ChevronDown size={16} />
            </button>
          </div>

          <button
            className="text-xs text-[#2D7FF9] hover:underline"
            onClick={() => setShowReplace(!showReplace)}
          >
            {showReplace ? 'Hide replace' : 'Show replace'}
          </button>

          {showReplace && (
            <div className="space-y-2">
              <input
                type="text"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="Replace with..."
                className="w-full px-3 py-2 text-xs-plus rounded-md border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none focus:border-[#2D7FF9] focus:ring-1 focus:ring-[#2D7FF9]/30"
                onKeyDown={(e) => { if (e.key === 'Escape') onOpenChange(false); }}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  onClick={replaceOne}
                  disabled={matches.length === 0}
                >
                  <Replace size={13} className="mr-1" /> Replace
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  onClick={replaceAll}
                  disabled={matches.length === 0}
                >
                  Replace all ({matches.length})
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
