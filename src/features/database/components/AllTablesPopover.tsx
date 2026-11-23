import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Search, Star, Table2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { fuzzyFilter } from '../lib/fuzzy';
import { pinnedFirst } from '../lib/navStorage';
import { modKeyLabel } from '../lib/shortcuts';
import { isTableHidden } from '../lib/tableVisibility';
import { HighlightedText } from './HighlightedText';
import type { TableMeta } from '../types';

interface AllTablesPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every table of the base, in order. Hidden ones are listed too (muted), so nothing is out of reach. */
  tables: TableMeta[];
  activeTableId: string | null;
  pinnedIds: string[];
  manualHidden: ReadonlySet<string>;
  /** How many tables the "show hidden" switch would reveal. */
  hiddenCount: number;
  showHidden: boolean;
  onShowHiddenChange: (value: boolean) => void;
  onSelect: (tableId: string) => void;
  /** Bring back a table that was hidden by hand. */
  onUnhide: (tableId: string) => void;
}

interface Section {
  heading: string;
  rows: Array<{ table: TableMeta; indices: number[] }>;
}

function PopoverBody({
  tables,
  activeTableId,
  pinnedIds,
  manualHidden,
  hiddenCount,
  showHidden,
  onShowHiddenChange,
  onSelect,
  onUnhide,
}: Omit<AllTablesPopoverProps, 'open' | 'onOpenChange'>) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(activeTableId ? `table:${activeTableId}` : '');
  const listRef = useRef<HTMLDivElement>(null);

  const sections = useMemo<Section[]>(() => {
    const { pinned, rest } = pinnedFirst(tables, pinnedIds);
    const match = (list: TableMeta[]) => fuzzyFilter(list, query, (t) => t.name).map((r) => ({ table: r.item, indices: r.match.indices }));
    if (query.trim()) return [{ heading: 'Results', rows: match([...pinned, ...rest]) }];
    const out: Section[] = [];
    if (pinned.length) out.push({ heading: 'Pinned', rows: match(pinned) });
    out.push({ heading: pinned.length ? 'All tables' : 'Tables', rows: match(rest) });
    return out.filter((s) => s.rows.length > 0);
  }, [tables, pinnedIds, query]);

  const total = sections.reduce((n, s) => n + s.rows.length, 0);

  // Start with the open table in view, like a picker should.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[data-active-table="true"]');
    if (!list || !el) return;
    list.scrollTop += el.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight / 2 + el.clientHeight / 2;
  }, []);

  const handleQuery = (value: string) => {
    setQuery(value);
    // The highlight follows the first result as the list changes.
    setSelected('');
  };

  const trailing = (t: TableMeta): ReactNode => {
    const pinned = pinnedIds.includes(t.id);
    const manual = manualHidden.has(t.id);
    const hidden = isTableHidden(t, manualHidden) && t.id !== activeTableId;
    return (
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {pinned && <Star size={11} className="text-warning" fill="currentColor" aria-label="Pinned" />}
        {hidden && (
          <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            <EyeOff size={11} aria-hidden="true" /> Hidden
          </span>
        )}
        {manual && (
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Unhide ${t.name}`}
            title="Unhide"
            onClick={(e) => {
              e.stopPropagation();
              onUnhide(t.id);
            }}
          >
            <Eye size={12} />
          </button>
        )}
        {t.id === activeTableId && <Check size={13} className="text-primary" aria-label="Open table" />}
      </span>
    );
  };

  return (
    <Command shouldFilter={false} loop value={selected} onValueChange={setSelected} label="All tables" className="bg-transparent">
      <CommandInput
        value={query}
        onValueChange={handleQuery}
        placeholder={`Find a table (${tables.length})`}
        aria-label="Find a table"
      />
      <CommandList ref={listRef} className="max-h-[min(55vh,380px)] py-1">
        {sections.map((section) => (
          <CommandGroup key={section.heading} heading={section.heading}>
            {section.rows.map(({ table, indices }) => {
              const isActive = table.id === activeTableId;
              const dim = isTableHidden(table, manualHidden) && !isActive;
              return (
                <CommandItem
                  key={table.id}
                  value={`table:${table.id}`}
                  data-active-table={isActive ? 'true' : undefined}
                  aria-current={isActive ? 'true' : undefined}
                  onSelect={() => onSelect(table.id)}
                  className={cn('gap-2 min-w-0', isActive && 'bg-primary/10 font-medium', dim && 'text-muted-foreground')}
                >
                  {table.icon ? (
                    <span className="w-4 shrink-0 text-center text-sm leading-none">{table.icon}</span>
                  ) : (
                    <Table2 size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate" title={table.name}>
                    <HighlightedText text={table.name} indices={indices} />
                  </span>
                  {trailing(table)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
        {total === 0 && (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center" role="status">
            <Search size={16} className="text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-foreground">No table matches "{query.trim()}"</p>
          </div>
        )}
      </CommandList>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2 text-2xs text-muted-foreground">
        {hiddenCount > 0 || showHidden ? (
          <button
            type="button"
            role="switch"
            aria-checked={showHidden}
            className="inline-flex min-w-0 items-center gap-2 rounded text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onShowHiddenChange(!showHidden)}
          >
            <span
              aria-hidden="true"
              className={cn('relative h-3.5 w-6 shrink-0 rounded-full transition-colors', showHidden ? 'bg-primary' : 'bg-muted-foreground/30')}
            >
              <span className={cn('absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all', showHidden ? 'left-3' : 'left-0.5')} />
            </span>
            <span className="truncate">Show hidden tables ({hiddenCount})</span>
          </button>
        ) : (
          <span>All tables are shown</span>
        )}
        <span className="inline-flex shrink-0 items-center gap-1">
          <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">{modKeyLabel()} J</kbd>
        </span>
      </div>
    </Command>
  );
}

/** "All tables (43)" button at the start of the tab strip, with a searchable list of every table. */
export function AllTablesPopover(props: AllTablesPopoverProps) {
  const { open, onOpenChange, tables, ...body } = props;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'mr-1 flex h-7 shrink-0 items-center gap-1 rounded px-2 text-xs-plus font-medium text-white/80 transition-colors',
            'hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
            open && 'bg-white/20 text-white',
          )}
          aria-label={`All tables, ${tables.length}`}
          aria-keyshortcuts="Control+J Meta+J"
          title={`All tables (${modKeyLabel()} J)`}
        >
          <Table2 size={14} aria-hidden="true" />
          <span className="whitespace-nowrap">All tables ({tables.length})</span>
          <ChevronDown size={12} className="opacity-70" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden p-0"
      >
        <PopoverBody tables={tables} {...body} />
      </PopoverContent>
    </Popover>
  );
}
