import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Replace, ChevronDown, ChevronUp, CaseSensitive, X } from 'lucide-react';
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
    if (!open) {
      onHighlightCell?.(null);
      return;
    }
    const match = matches[currentIdx];
    onHighlightCell?.(match ? `${match.recordId}:${match.fieldId}` : null);
  }, [open, currentIdx, matches, onHighlightCell]);

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

  if (!open) return null;

  const fieldClass =
    'w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs-plus text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30';
  const iconBtn =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

  // A small bar at the top, like Airtable's: no backdrop, so the rows being searched stay visible and usable.
  return (
    <div
      role="search"
      aria-label="Find in this view"
      className="fixed right-4 top-28 z-50 w-[380px] max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-2 shadow-lg"
    >
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <input
            ref={findRef}
            type="text"
            value={findText}
            onChange={(e) => { setFindText(e.target.value); setCurrentIdx(0); }}
            placeholder="Find in this view"
            className={fieldClass + ' pr-16'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { if (e.shiftKey) goPrev(); else goNext(); }
              if (e.key === 'Escape') onOpenChange(false);
            }}
          />
          {findText && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-muted-foreground">
              {matches.length > 0 ? `${currentIdx + 1} / ${matches.length}` : 'No results'}
            </span>
          )}
        </div>
        <button
          className={`${iconBtn} ${caseSensitive ? '!border-primary !bg-primary/10 !text-primary' : ''}`}
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="Match case"
          aria-pressed={caseSensitive}
        >
          <CaseSensitive size={16} />
        </button>
        <button className={iconBtn} onClick={goPrev} title="Previous match (Shift+Enter)" aria-label="Previous match">
          <ChevronUp size={16} />
        </button>
        <button className={iconBtn} onClick={goNext} title="Next match (Enter)" aria-label="Next match">
          <ChevronDown size={16} />
        </button>
        <button
          className={`${iconBtn} ${showReplace ? '!bg-muted !text-foreground' : ''}`}
          onClick={() => setShowReplace(!showReplace)}
          title={showReplace ? 'Hide replace' : 'Replace'}
          aria-pressed={showReplace}
        >
          <Replace size={15} />
        </button>
        <button className={iconBtn} onClick={() => onOpenChange(false)} title="Close (Esc)" aria-label="Close find">
          <X size={16} />
        </button>
      </div>

      {showReplace && (
        <div className="mt-2 flex items-center gap-1">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace with"
            className={fieldClass}
            onKeyDown={(e) => { if (e.key === 'Escape') onOpenChange(false); }}
          />
          <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={replaceOne} disabled={matches.length === 0}>
            Replace
          </Button>
          <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={replaceAll} disabled={matches.length === 0}>
            All ({matches.length})
          </Button>
        </div>
      )}
    </div>
  );
}
