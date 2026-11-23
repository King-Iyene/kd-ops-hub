import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Database,
  EyeOff,
  Eye,
  History,
  Home,
  LayoutGrid,
  PanelLeft,
  Plus,
  Search,
  Table2,
  Star,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useDatabaseUI } from '../lib/store';
import { useBases } from '../hooks/useBases';
import { useTables } from '../hooks/useTables';
import { useViews } from '../hooks/useViews';
import { useDatabaseNavigate } from '../hooks/useNavigate';
import {
  useManualHiddenTables,
  usePinnedTables,
  useRecentItems,
  useShowHiddenTables,
} from '../hooks/useNavPrefs';
import { fuzzyMatch } from '../lib/fuzzy';
import { HighlightedText } from './HighlightedText';
import { pruneRecents, type RecentItem } from '../lib/recents';
import { modKeyLabel } from '../lib/shortcuts';
import { pinnedFirst } from '../lib/navStorage';
import { countHiddenTables, filterVisibleTables } from '../lib/tableVisibility';
import { CreateTableDialog } from './CreateTableDialog';
import { CreateBaseDialog } from './CreateBaseDialog';
import type { Base } from '../types';

const ApiTokensDialog = lazy(() => import('./ApiTokensDialog').then((m) => ({ default: m.ApiTokensDialog })));

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the record search dialog (the old Ctrl+K), optionally with a starting query. */
  onSearchRecords: (query: string) => void;
  /** Opens the table switcher popover in the tab strip. */
  onBrowseTables: () => void;
}

interface PaletteEntry {
  value: string;
  label: string;
  /** Characters of `label` that matched the query. */
  indices: number[];
  hint?: string;
  icon: ReactNode;
  shortcut?: string;
  /** Stay open after choosing (toggles). */
  keepOpen?: boolean;
  /** Run after the palette has closed and given focus back (for entries that open another dialog). */
  afterClose?: boolean;
  run: () => void;
}

interface PaletteGroup {
  heading: string;
  entries: PaletteEntry[];
}

function BaseGlyph({ base }: { base: Pick<Base, 'icon' | 'color' | 'name'> | undefined }) {
  if (base?.icon) return <span className="w-[18px] text-center text-sm leading-none shrink-0">{base.icon}</span>;
  return (
    <span
      className="w-[18px] h-[18px] rounded flex items-center justify-center text-3xs font-bold text-white shrink-0"
      style={{ backgroundColor: base?.color || '#2D7FF9' }}
      aria-hidden="true"
    >
      {base?.name?.charAt(0)?.toUpperCase() || 'B'}
    </span>
  );
}

function TableGlyph({ icon }: { icon: string | null | undefined }) {
  if (icon) return <span className="w-[18px] text-center text-sm leading-none shrink-0">{icon}</span>;
  return <Table2 size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />;
}

const KIND_LABEL: Record<RecentItem['kind'], string> = { base: 'Base', table: 'Table', view: 'View' };

export function CommandPalette({ open, onOpenChange, onSearchRecords, onBrowseTables }: CommandPaletteProps) {
  const activeBaseId = useDatabaseUI((s) => s.activeBaseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);
  const activeViewId = useDatabaseUI((s) => s.activeViewId);
  const toggleSidebar = useDatabaseUI((s) => s.toggleSidebar);
  const { navigateToBase, navigateToTable, navigateToView, navigateTo } = useDatabaseNavigate();

  const { data: bases } = useBases();
  const { data: tablesData } = useTables(activeBaseId);
  const { data: viewsData } = useViews(activeTableId);
  const recents = useRecentItems();
  const [showHidden, setShowHidden] = useShowHiddenTables();
  const { hiddenIds: manualHidden } = useManualHiddenTables(activeBaseId);
  const { pinnedIds } = usePinnedTables(activeBaseId);

  const [query, setQuery] = useState('');
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [apiDocsOpen, setApiDocsOpen] = useState(false);
  const afterClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const baseList = useMemo(() => [...(bases ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [bases]);
  const baseById = useMemo(() => new Map(baseList.map((b) => [b.id, b] as const)), [baseList]);

  // The query data may briefly hold the previous base's tables while the next loads.
  const tables = useMemo(
    () => (tablesData ?? []).filter((t) => t.base_id === activeBaseId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tablesData, activeBaseId],
  );
  const views = useMemo(
    () => (viewsData ?? []).filter((v) => v.table_id === activeTableId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [viewsData, activeTableId],
  );

  const hiddenCount = useMemo(
    () => countHiddenTables(tables, { activeTableId, manualHidden }),
    [tables, activeTableId, manualHidden],
  );
  const orderedTables = useMemo(() => {
    const visible = filterVisibleTables(tables, { showHidden, activeTableId, manualHidden });
    const { pinned, rest } = pinnedFirst(visible, pinnedIds);
    return [...pinned, ...rest];
  }, [tables, showHidden, activeTableId, manualHidden, pinnedIds]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const trimmed = query.trim();
    const actionsOnly = trimmed.startsWith('>');
    const needle = actionsOnly ? trimmed.slice(1).trim() : trimmed;
    const out: PaletteGroup[] = [];

    /** Match a label (plus optional extra search words) and return the highlight positions, or null. */
    const match = (label: string, extra = ''): number[] | null => {
      if (!needle) return [];
      const m = fuzzyMatch(needle, extra ? `${label} ${extra}` : label);
      if (!m) return null;
      return m.indices.filter((i) => i < label.length);
    };

    const goTable = (tableId: string) => () => {
      if (tableId !== activeTableId) navigateToTable(tableId);
    };

    // Recent: only when nothing is typed.
    if (!needle && !actionsOnly) {
      const checked = pruneRecents(recents, {
        baseIds: new Set(baseList.map((b) => b.id)),
        activeBaseId,
        tableIds: new Set(tables.map((t) => t.id)),
        activeTableId,
        viewIds: new Set(views.map((v) => v.id)),
      });
      const entries: PaletteEntry[] = checked.map((r) => {
        const base = baseById.get(r.baseId);
        const icon =
          r.kind === 'base' ? <BaseGlyph base={base} /> : r.kind === 'table' ? <TableGlyph icon={tables.find((t) => t.id === r.id)?.icon} /> : <LayoutGrid size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />;
        return {
          value: `recent:${r.kind}:${r.id}`,
          label: r.label,
          indices: [],
          hint: r.kind === 'base' || !base ? KIND_LABEL[r.kind] : `${KIND_LABEL[r.kind]} · ${base.name}`,
          icon,
          run: () => {
            if (r.kind === 'base') {
              if (r.id !== activeBaseId || activeTableId) navigateToBase(r.id);
            } else {
              navigateTo({ baseId: r.baseId, tableId: r.tableId, viewId: r.kind === 'view' ? r.id : null });
            }
          },
        };
      });
      if (entries.length) out.push({ heading: 'Recent', entries });
    }

    if (!actionsOnly && activeBaseId) {
      const entries: PaletteEntry[] = [];
      for (const t of orderedTables) {
        const indices = match(t.name);
        if (!indices) continue;
        entries.push({
          value: `table:${t.id}`,
          label: t.name,
          indices,
          hint: t.id === activeTableId ? 'Open' : undefined,
          icon: (
            <span className="relative inline-flex">
              <TableGlyph icon={t.icon} />
              {pinnedIds.includes(t.id) && (
                <Star size={8} className="absolute -right-1 -top-1 text-warning" fill="currentColor" aria-hidden="true" />
              )}
            </span>
          ),
          run: goTable(t.id),
        });
      }
      // Hidden tables stay out of the list; say so when one matches, so nothing feels lost.
      if (needle && !showHidden) {
        const hiddenMatches = tables.filter(
          (t) => !orderedTables.some((o) => o.id === t.id) && fuzzyMatch(needle, t.name) !== null,
        ).length;
        if (hiddenMatches > 0) {
          entries.push({
            value: 'tables:show-hidden',
            label: `Show ${hiddenMatches} hidden ${hiddenMatches === 1 ? 'table' : 'tables'} that match`,
            indices: [],
            icon: <Eye size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />,
            keepOpen: true,
            run: () => setShowHidden(true),
          });
        }
      }
      if (entries.length) out.push({ heading: activeBaseId ? `Tables in ${baseById.get(activeBaseId)?.name ?? 'this base'}` : 'Tables', entries });
    }

    if (!actionsOnly && activeTableId && views.length > 0) {
      const entries: PaletteEntry[] = [];
      for (const v of views) {
        const indices = match(v.name);
        if (!indices) continue;
        entries.push({
          value: `view:${v.id}`,
          label: v.name,
          indices,
          hint: v.id === activeViewId ? 'Open' : v.type,
          icon: <LayoutGrid size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />,
          run: () => {
            if (v.id !== activeViewId) navigateToView(v.id);
          },
        });
      }
      if (entries.length) out.push({ heading: 'Views', entries });
    }

    if (!actionsOnly) {
      const entries: PaletteEntry[] = [];
      for (const b of baseList) {
        const indices = match(b.name);
        if (!indices) continue;
        entries.push({
          value: `base:${b.id}`,
          label: b.name,
          indices,
          hint: b.id === activeBaseId ? 'Open' : undefined,
          icon: <BaseGlyph base={b} />,
          run: () => {
            if (b.id !== activeBaseId) navigateToBase(b.id);
          },
        });
      }
      if (entries.length) out.push({ heading: 'Bases', entries });
    }

    const mod = modKeyLabel();
    const commands: Array<Omit<PaletteEntry, 'indices' | 'value'> & { id: string; words?: string }> = [];
    if (activeBaseId) {
      commands.push({ id: 'create-table', label: 'Create table', words: 'new add', icon: <Plus size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />, afterClose: true, run: () => setCreateTableOpen(true) });
      commands.push({ id: 'browse-tables', label: 'Browse all tables', words: 'switch list', shortcut: `${mod} J`, icon: <Table2 size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />, afterClose: true, run: onBrowseTables });
    }
    commands.push({ id: 'create-base', label: 'Create base', words: 'new add', icon: <Database size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />, afterClose: true, run: () => setCreateBaseOpen(true) });
    commands.push({ id: 'toggle-sidebar', label: 'Toggle sidebar', words: 'hide show panel', icon: <PanelLeft size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />, run: toggleSidebar });
    commands.push({ id: 'api-docs', label: 'Open API docs', words: 'api keys tokens developer rest', icon: <BookOpen size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />, afterClose: true, run: () => setApiDocsOpen(true) });
    commands.push({ id: 'search-records', label: 'Search records in all bases', words: 'find', icon: <Search size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />, afterClose: true, run: () => onSearchRecords(needle) });
    commands.push({ id: 'all-bases', label: 'Go to all bases', words: 'home', icon: <Home size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />, run: () => navigateToBase(null) });
    if (activeBaseId && (hiddenCount > 0 || showHidden)) {
      commands.push({
        id: 'toggle-hidden',
        label: showHidden ? 'Hide hidden tables' : `Show hidden tables (${hiddenCount})`,
        words: 'copy outdated wip',
        icon: showHidden ? <EyeOff size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" /> : <Eye size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />,
        keepOpen: true,
        run: () => setShowHidden(!showHidden),
      });
    }

    const commandEntries: PaletteEntry[] = [];
    for (const c of commands) {
      const indices = match(c.label, c.words);
      if (!indices) continue;
      commandEntries.push({
        value: `command:${c.id}`,
        label: c.label,
        indices,
        icon: c.icon,
        shortcut: c.shortcut,
        keepOpen: c.keepOpen,
        afterClose: c.afterClose,
        run: c.run,
      });
    }
    if (commandEntries.length) out.push({ heading: 'Actions', entries: commandEntries });

    return out;
  }, [
    query, recents, baseList, baseById, tables, views, orderedTables, pinnedIds, showHidden, hiddenCount,
    activeBaseId, activeTableId, activeViewId, navigateToBase, navigateToTable, navigateToView, navigateTo,
    toggleSidebar, setShowHidden, onBrowseTables, onSearchRecords,
  ]);

  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  const choose = (entry: PaletteEntry) => {
    if (entry.keepOpen) {
      entry.run();
      return;
    }
    if (entry.afterClose) {
      afterClose.current = entry.run;
      onOpenChange(false);
      return;
    }
    entry.run();
    onOpenChange(false);
  };

  const mod = modKeyLabel();
  const searchTerm = query.trim().replace(/^>\s*/, '');

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideClose
          data-command-palette=""
          aria-describedby={undefined}
          className="p-0 gap-0 overflow-hidden sm:max-w-xl md:max-w-xl md:top-[16%] md:translate-y-0"
          onCloseAutoFocus={(e) => {
            const next = afterClose.current;
            afterClose.current = null;
            if (next) {
              // Another dialog or popover is about to open: do not hand focus back to the page under it.
              e.preventDefault();
              next();
            }
          }}
        >
          <Command shouldFilter={false} loop label="Command palette" className="bg-transparent">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Jump to a table, view or base. Type > for actions."
              aria-label="Search tables, views, bases and actions"
            />
            <CommandList className="max-h-[min(60vh,420px)] py-1">
              {groups.map((group) => (
                <CommandGroup key={group.heading} heading={group.heading}>
                  {group.entries.map((entry) => (
                    <CommandItem key={entry.value} value={entry.value} onSelect={() => choose(entry)} className="gap-2.5 min-w-0">
                      {entry.icon}
                      <span className="flex-1 min-w-0 truncate">
                        <HighlightedText text={entry.label} indices={entry.indices} />
                      </span>
                      {entry.hint && (
                        <span className="ml-2 shrink-0 max-w-[40%] truncate text-2xs text-muted-foreground">{entry.hint}</span>
                      )}
                      {entry.shortcut && (
                        <kbd className="ml-2 shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-3xs text-muted-foreground">
                          {entry.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {total === 0 && (
                <div className="px-4 py-8 text-center" role="status">
                  <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <History size={16} aria-hidden="true" />
                  </div>
                  <p className="text-sm text-foreground">{query.trim() ? `Nothing matches "${searchTerm}"` : 'Nothing to show yet'}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {query.trim() ? 'Try fewer letters, or search the records themselves.' : 'Tables, views and bases you open will show up here.'}
                  </p>
                  {searchTerm && (
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        afterClose.current = () => onSearchRecords(searchTerm);
                        onOpenChange(false);
                      }}
                    >
                      <Search size={12} aria-hidden="true" /> Search records for "{searchTerm}"
                    </button>
                  )}
                </div>
              )}
            </CommandList>
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2 text-2xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">↑↓</kbd> move
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">↵</kbd> open
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">esc</kbd> close
                </span>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono">{mod} J</kbd> tables
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>

      {activeBaseId && <CreateTableDialog open={createTableOpen} onOpenChange={setCreateTableOpen} />}
      <CreateBaseDialog open={createBaseOpen} onOpenChange={setCreateBaseOpen} />
      {apiDocsOpen && (
        <Suspense fallback={null}>
          <ApiTokensDialog open={apiDocsOpen} onOpenChange={setApiDocsOpen} baseId={activeBaseId} />
        </Suspense>
      )}
    </>
  );
}
