import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Database, Table2, FileText, X, Loader2 } from 'lucide-react';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { useDatabaseUI } from '../lib/store';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({ open, onOpenChange }: GlobalSearchDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: results, isLoading } = useGlobalSearch(query);
  const setActiveBase = useDatabaseUI((s) => s.setActiveBase);
  const setActiveTable = useDatabaseUI((s) => s.setActiveTable);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const navigateToResult = useCallback(
    (idx: number) => {
      const r = results?.[idx];
      if (!r) return;
      setActiveBase(r.baseId);
      setActiveTable(r.tableId);
      onOpenChange(false);
    },
    [results, setActiveBase, setActiveTable, onOpenChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const len = results?.length ?? 0;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % Math.max(len, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + Math.max(len, 1)) % Math.max(len, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        navigateToResult(selectedIdx);
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    },
    [results, selectedIdx, navigateToResult, onOpenChange],
  );

  if (!open) return null;

  const highlight = (text: string, q: string) => {
    if (!q || q.length < 2) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-700/50 text-inherit rounded-sm px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => onOpenChange(false)}
    >
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div
        className="relative w-full max-w-lg rounded-xl shadow-2xl border overflow-hidden
          bg-white dark:bg-[hsl(200,30%,10%)]
          border-gray-200 dark:border-[hsl(200,25%,18%)]
          animate-[panelSlideDown_150ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-[hsl(200,25%,18%)]">
          <Search size={18} className="text-gray-400 dark:text-[hsl(200,20%,50%)] shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search across all bases and tables..."
            className="flex-1 text-sm outline-none bg-transparent
              text-gray-900 dark:text-[hsl(200,25%,88%)]
              placeholder:text-gray-400 dark:placeholder:text-[hsl(200,20%,45%)]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[hsl(200,25%,15%)]"
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium
            bg-gray-100 dark:bg-[hsl(200,25%,15%)]
            text-gray-500 dark:text-[hsl(200,20%,50%)]
            border border-gray-200 dark:border-[hsl(200,25%,22%)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-400 dark:text-[hsl(200,20%,50%)]">
              <Loader2 size={16} className="animate-spin" />
              Searching...
            </div>
          )}

          {!isLoading && query.length >= 2 && results && results.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-[hsl(200,20%,50%)]">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}

          {!isLoading && query.length < 2 && (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-[hsl(200,20%,50%)]">
              Type at least 2 characters to search
            </div>
          )}

          {results && results.length > 0 && (
            <ul className="py-1">
              {results.map((r, idx) => (
                <li
                  key={`${r.recordId}-${idx}`}
                  className={`flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors
                    ${idx === selectedIdx
                      ? 'bg-blue-50 dark:bg-[hsl(220,50%,18%)]'
                      : 'hover:bg-gray-50 dark:hover:bg-[hsl(200,25%,12%)]'
                    }`}
                  onClick={() => navigateToResult(idx)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <FileText
                    size={16}
                    className={`shrink-0 mt-0.5 ${
                      idx === selectedIdx
                        ? 'text-blue-500'
                        : 'text-gray-400 dark:text-[hsl(200,20%,45%)]'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-[hsl(200,25%,88%)] truncate">
                      {highlight(r.title, query)}
                    </div>
                    {r.matchValue && r.matchField && (
                      <div className="text-xs text-gray-500 dark:text-[hsl(200,20%,55%)] truncate mt-0.5">
                        <span className="font-medium">{r.matchField}:</span>{' '}
                        {highlight(r.matchValue, query)}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-400 dark:text-[hsl(200,20%,42%)]">
                      <Database size={10} />
                      <span>{r.baseName}</span>
                      <span className="opacity-50">/</span>
                      <Table2 size={10} />
                      <span>{r.tableName}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-[hsl(200,25%,18%)]
          text-[10px] text-gray-400 dark:text-[hsl(200,20%,42%)]">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-[hsl(200,25%,15%)] border border-gray-200 dark:border-[hsl(200,25%,22%)] font-mono">↑↓</kbd>
            {' '}navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-[hsl(200,25%,15%)] border border-gray-200 dark:border-[hsl(200,25%,22%)] font-mono">↵</kbd>
            {' '}open
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-[hsl(200,25%,15%)] border border-gray-200 dark:border-[hsl(200,25%,22%)] font-mono">⌘K</kbd>
            {' '}toggle
          </span>
        </div>
      </div>
    </div>
  );
}
