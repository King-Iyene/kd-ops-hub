import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Replace, ChevronUp, ChevronDown, CaseSensitive, WholeWord, Regex } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useDatabaseUI } from '../lib/store';
import { useFields, useRecords, useUpdateRecord } from '../hooks';
import { toast } from '../components/Toast';


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
  /** Start index of the match within value */
  start: number;
  /** Length of the matched text */
  length: number;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const [matchWholeCell, setMatchWholeCell] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string>('all');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [regexError, setRegexError] = useState<string | null>(null);

  const matchListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const textFields = (fields ?? []).filter(
    (f) =>
      !f.is_system &&
      ['SingleLineText', 'LongText', 'Email', 'PhoneNumber', 'URL'].includes(f.ui_type),
  );

  const findMatches = useCallback((): Match[] => {
    if (!searchText || !recordsData?.records) return [];
    setRegexError(null);

    const targetFields = selectedFieldId === 'all' ? textFields : textFields.filter((f) => f.id === selectedFieldId);
    const matches: Match[] = [];

    let regex: RegExp;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      if (useRegex) {
        regex = new RegExp(searchText, flags);
      } else if (matchWholeCell) {
        // For whole cell, we just compare the entire string
        regex = new RegExp(`^${escapeRegex(searchText)}$`, flags);
      } else {
        regex = new RegExp(escapeRegex(searchText), flags);
      }
    } catch (e: any) {
      setRegexError(e.message ?? 'Invalid regex');
      return [];
    }

    for (const record of recordsData.records) {
      for (const field of targetFields) {
        const val = record[field.pg_column_name];
        if (val == null) continue;
        const str = String(val);

        let match: RegExpExecArray | null;
        regex.lastIndex = 0;
        while ((match = regex.exec(str)) !== null) {
          matches.push({
            recordId: record.id,
            fieldId: field.id,
            fieldName: field.name,
            pgColumn: field.pg_column_name,
            value: str,
            start: match.index,
            length: match[0].length,
          });
          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) regex.lastIndex++;
        }
      }
    }
    return matches;
  }, [searchText, recordsData, textFields, caseSensitive, matchWholeCell, useRegex, selectedFieldId]);

  const matches = findMatches();

  // Clamp currentMatchIndex
  useEffect(() => {
    if (currentMatchIndex >= matches.length) {
      setCurrentMatchIndex(Math.max(0, matches.length - 1));
    }
  }, [matches.length, currentMatchIndex]);

  // Scroll current match into view
  useEffect(() => {
    if (matchListRef.current && matches.length > 0) {
      const el = matchListRef.current.querySelector(`[data-match-index="${currentMatchIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [currentMatchIndex, matches.length]);

  const goToNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const goToPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const buildReplaceRegex = useCallback((flags: string) => {
    if (useRegex) return new RegExp(searchText, flags);
    if (matchWholeCell) return new RegExp(`^${escapeRegex(searchText)}$`, flags);
    return new RegExp(escapeRegex(searchText), flags);
  }, [searchText, useRegex, matchWholeCell]);

  const handleReplaceCurrent = useCallback(() => {
    if (!activeBaseId || !activeTableId || matches.length === 0) return;
    const m = matches[currentMatchIndex];
    if (!m) return;

    try {
      const flags = caseSensitive ? '' : 'i';
      const regex = buildReplaceRegex(flags);
      // Replace only the first occurrence starting at the match position
      const before = m.value.slice(0, m.start);
      const rest = m.value.slice(m.start);
      const newRest = rest.replace(regex, replaceText);
      const newValue = before + newRest;

      if (newValue !== m.value) {
        updateRecord.mutate({
          baseId: activeBaseId,
          tableId: activeTableId,
          recordId: m.recordId,
          field: m.pgColumn,
          value: newValue,
        });
        toast.success('Replaced 1 match');
      }
    } catch { /* regex error already handled */ }
  }, [activeBaseId, activeTableId, matches, currentMatchIndex, caseSensitive, replaceText, buildReplaceRegex, updateRecord]);

  const handleReplaceAll = useCallback(() => {
    if (!activeBaseId || !activeTableId || !searchText || matches.length === 0) return;

    // Group matches by record+field to avoid multiple updates to same cell
    const grouped = new Map<string, { recordId: string; pgColumn: string; value: string }>();
    for (const m of matches) {
      const key = `${m.recordId}:${m.pgColumn}`;
      if (!grouped.has(key)) {
        grouped.set(key, { recordId: m.recordId, pgColumn: m.pgColumn, value: m.value });
      }
    }

    let count = 0;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = buildReplaceRegex(flags);

      for (const [, item] of grouped) {
        regex.lastIndex = 0;
        const newValue = item.value.replace(regex, replaceText);
        if (newValue !== item.value) {
          updateRecord.mutate({
            baseId: activeBaseId,
            tableId: activeTableId,
            recordId: item.recordId,
            field: item.pgColumn,
            value: newValue,
          });
          count++;
        }
      }
    } catch { /* regex error already handled */ }

    if (count > 0) {
      toast.success(`Replaced in ${count} cell${count !== 1 ? 's' : ''} (Ctrl+Z to undo)`);
    }
  }, [activeBaseId, activeTableId, searchText, replaceText, matches, caseSensitive, buildReplaceRegex, updateRecord]);

  // Keyboard: Enter = next, Shift+Enter = prev
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goToPrev();
      else goToNext();
    }
  }, [goToNext, goToPrev]);

  const toggleBtn = (active: boolean, onClick: () => void, title: string, children: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs transition-colors ${
        active
          ? 'bg-[#2D7FF9]/10 text-[#2D7FF9] dark:bg-[#2D7FF9]/20'
          : 'text-[#9AA2AF] hover:text-[#6A7184] hover:bg-gray-100 dark:hover:bg-white/5 dark:hover:text-[hsl(200,25%,70%)]'
      }`}
    >
      {children}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Replace size={16} className="text-[#2D7FF9]" />
            Find & Replace
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
              <input
                ref={searchInputRef}
                className="w-full h-9 pl-8 pr-3 text-xs-plus border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-md bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none focus:border-[#2D7FF9]"
                placeholder="Find..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setCurrentMatchIndex(0); }}
                onKeyDown={handleSearchKeyDown}
                autoFocus
              />
            </div>
            {/* Navigation arrows */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={goToPrev}
                disabled={matches.length === 0}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp size={16} className="text-[#6A7184] dark:text-[#9AA2AF]" />
              </button>
              <button
                onClick={goToNext}
                disabled={matches.length === 0}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30 transition-colors"
                title="Next match (Enter)"
              >
                <ChevronDown size={16} className="text-[#6A7184] dark:text-[#9AA2AF]" />
              </button>
            </div>
          </div>

          {/* Replace row */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Replace size={14} className="absolute left-2.5 top-2.5 text-[#9AA2AF] dark:text-[hsl(200,20%,55%)]" />
              <input
                className="w-full h-9 pl-8 pr-3 text-xs-plus border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-md bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] outline-none focus:border-[#2D7FF9]"
                placeholder="Replace with..."
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
              />
            </div>
            {/* Replace / Replace All buttons inline */}
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs shrink-0"
              onClick={handleReplaceCurrent}
              disabled={matches.length === 0 || !searchText}
              title="Replace current match"
            >
              Replace
            </Button>
            <Button
              size="sm"
              style={{ backgroundColor: '#2D7FF9' }}
              className="text-white h-9 text-xs shrink-0"
              onClick={handleReplaceAll}
              disabled={matches.length === 0 || !searchText}
            >
              Replace all
            </Button>
          </div>

          {/* Options row */}
          <div className="flex items-center gap-2 flex-wrap">
            {toggleBtn(caseSensitive, () => setCaseSensitive((v) => !v), 'Case sensitive', <CaseSensitive size={14} />)}
            {toggleBtn(matchWholeCell, () => setMatchWholeCell((v) => !v), 'Match whole cell', <WholeWord size={14} />)}
            {toggleBtn(useRegex, () => setUseRegex((v) => !v), 'Use regular expression', <Regex size={14} />)}

            <select
              className="h-7 px-2 text-2xs border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)]"
              value={selectedFieldId}
              onChange={(e) => { setSelectedFieldId(e.target.value); setCurrentMatchIndex(0); }}
            >
              <option value="all">All text fields</option>
              {textFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>

            <span className="ml-auto text-xs text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] tabular-nums">
              {searchText
                ? matches.length > 0
                  ? `${currentMatchIndex + 1} of ${matches.length} match${matches.length !== 1 ? 'es' : ''}`
                  : 'No matches'
                : ''}
            </span>
          </div>

          {regexError && (
            <p className="text-2xs text-destructive">{regexError}</p>
          )}

          {/* Match list */}
          {matches.length > 0 && (
            <div
              ref={matchListRef}
              className="border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg max-h-[220px] overflow-y-auto"
            >
              {matches.slice(0, 100).map((m, i) => {
                const isActive = i === currentMatchIndex;
                const contextStart = Math.max(0, m.start - 25);
                const contextEnd = Math.min(m.value.length, m.start + m.length + 25);
                const prefix = (contextStart > 0 ? '...' : '') + m.value.slice(contextStart, m.start);
                const matched = m.value.slice(m.start, m.start + m.length);
                const suffix = m.value.slice(m.start + m.length, contextEnd) + (contextEnd < m.value.length ? '...' : '');

                return (
                  <div
                    key={`${m.recordId}-${m.pgColumn}-${m.start}-${i}`}
                    data-match-index={i}
                    onClick={() => setCurrentMatchIndex(i)}
                    className={`flex items-center justify-between px-3 py-1.5 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] last:border-0 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#2D7FF9]/5 dark:bg-[#2D7FF9]/10'
                        : 'hover:bg-[#F9F9FA] dark:hover:bg-[hsl(200,25%,15%)]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-3xs text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] mr-2">{m.fieldName}</span>
                      <span className="text-xs text-[#374151] dark:text-[hsl(200,25%,88%)]">
                        {prefix}
                        <mark className={`px-0.5 rounded ${isActive ? 'bg-[#2D7FF9]/20 dark:bg-[#2D7FF9]/30' : 'bg-yellow-200 dark:bg-yellow-700/50'} dark:text-[hsl(200,25%,88%)]`}>
                          {matched}
                        </mark>
                        {suffix}
                      </span>
                    </div>
                  </div>
                );
              })}
              {matches.length > 100 && (
                <div className="px-3 py-2 text-2xs text-[#9AA2AF] dark:text-[hsl(200,20%,55%)] text-center">
                  ...and {matches.length - 100} more matches
                </div>
              )}
            </div>
          )}

          {/* Close */}
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
