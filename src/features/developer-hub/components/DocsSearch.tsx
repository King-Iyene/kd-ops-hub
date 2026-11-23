import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSearchIndex, searchEntries } from '../lib/searchIndex';
import { AREAS, type HubLocation } from '../lib/navigation';

interface DocsSearchProps {
  onSelect: (location: HubLocation) => void;
}

function sectionLabel(loc: HubLocation): string {
  const area = AREAS.find((a) => a.id === loc.area);
  const section = area?.sections.find((s) => s.id === loc.section);
  return area && section ? `${area.label} / ${section.label}` : '';
}

/** Search box over the docs (endpoints, recipes, modules, status codes, events). Press / to focus. */
export function DocsSearch({ onSelect }: DocsSearchProps) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Built once, only when the box is first used.
  const needsIndex = open || query.length > 0;
  const index = useMemo(() => (needsIndex ? buildSearchIndex() : []), [needsIndex]);
  const results = useMemo(() => searchEntries(index, query), [index, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (i: number) => {
    const r = results[i];
    if (!r) return;
    onSelect(r.entry.location);
    setOpen(false);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      if (open && results.length) {
        e.preventDefault();
        choose(active);
      }
    } else if (e.key === 'Escape') {
      if (query) setQuery('');
      else inputRef.current?.blur();
      setOpen(false);
    }
  };

  const showList = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className="relative w-full sm:w-72 lg:w-96">
      <label htmlFor={inputId} className="sr-only">
        Search the developer docs
      </label>
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Search docs, endpoints, recipes   ( / )"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
        className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-9 pr-8 text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {query && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setQuery('');
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:text-zinc-200"
        >
          <X size={14} />
        </button>
      )}

      <ul
        id={listId}
        role="listbox"
        aria-label="Search results"
        hidden={!showList}
        className="absolute right-0 z-30 mt-1 max-h-96 w-full min-w-[18rem] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:w-[28rem]"
      >
        {showList && results.length === 0 && (
          <li role="presentation" className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Nothing found for &ldquo;{query.trim()}&rdquo;. Try a path, a status code or a module name.
          </li>
        )}
        {showList &&
          results.map((r, i) => (
            <li
              key={r.entry.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-2',
                i === active ? 'bg-primary/10' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60',
              )}
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">{r.entry.title}</span>
                <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {r.entry.kind}
                </span>
              </div>
              <p className="mt-0.5 truncate text-2xs text-zinc-500 dark:text-zinc-400">{sectionLabel(r.entry.location)}</p>
            </li>
          ))}
      </ul>
    </div>
  );
}
