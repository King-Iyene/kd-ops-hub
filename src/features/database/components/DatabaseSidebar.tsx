import { Fragment, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Table2,
  Eye,
  EyeOff,
  X,
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Database,
  Copy,
  Palette,
  ChevronLeft,
  ChevronRight,
  Home,
  Star,
  Smile,
} from 'lucide-react';
import { confirm as styledConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useDatabaseUI } from '../lib/store';
import { EmojiPicker } from './EmojiPicker';
import { useBases, useDeleteBase, useUpdateBase, useDuplicateBase } from '../hooks';
import { useTables } from '../hooks/useTables';
import { usePrefetchTable } from '../hooks/usePrefetchTable';
import { useDatabaseNavigate } from '../hooks/useNavigate';
import { CreateBaseDialog } from './CreateBaseDialog';
import { HighlightedText } from './HighlightedText';
import { useManualHiddenTables, usePinnedTables, useShowHiddenTables } from '../hooks/useNavPrefs';
import { fuzzyFilter } from '../lib/fuzzy';
import { pinnedFirst } from '../lib/navStorage';
import { modKeyLabel, requestOpenPalette } from '../lib/shortcuts';
import { countHiddenTables, filterVisibleTables } from '../lib/tableVisibility';
import type { Base, TableMeta } from '../types';

const BASE_COLORS = [
  '#2D7FF9', '#0D9488', '#8B5CF6', '#EC4899', '#F59E0B',
  '#EF4444', '#10B981', '#6366F1', '#F97316', '#64748B',
];

const COLLAPSED_WIDTH = 48;

function InlineRenameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback(() => {
    if (committed.current) return;
    committed.current = true;
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else onCancel();
  }, [text, value, onCommit, onCancel]);

  return (
    <input
      ref={ref}
      className="bg-white dark:bg-[hsl(220,30%,12%)] border border-[#2D7FF9] rounded px-1.5 py-0.5 text-xs-plus w-full outline-none text-[#374151] dark:text-[hsl(220,25%,88%)]"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** The tables of the open base, listed under it in the sidebar: pinned first, hidden copies tucked away, searchable and keyboard friendly. */
function BaseTableList({ baseId }: { baseId: string }) {
  const { data: tables } = useTables(baseId);
  const activeTableId = useDatabaseUI((s) => s.activeTableId);
  const { navigateToTable } = useDatabaseNavigate();
  const prefetch = usePrefetchTable();
  const [query, setQuery] = useState('');
  const [showHidden, setShowHidden] = useShowHiddenTables();
  const { hiddenIds: manualHidden } = useManualHiddenTables(baseId);
  const { pinnedIds, togglePin } = usePinnedTables(baseId);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const refocusId = useRef<string | null>(null);

  const list = useMemo(() => (tables ?? []).filter((t) => t.base_id === baseId), [tables, baseId]);
  const visible = useMemo(
    () => filterVisibleTables(list, { showHidden, activeTableId, manualHidden }),
    [list, showHidden, activeTableId, manualHidden],
  );
  const hiddenCount = useMemo(() => countHiddenTables(list, { activeTableId, manualHidden }), [list, activeTableId, manualHidden]);
  const { pinned, rest } = useMemo(() => pinnedFirst(visible, pinnedIds), [visible, pinnedIds]);
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? fuzzyFilter([...pinned, ...rest], query, (t) => t.name) : null),
    [searching, pinned, rest, query],
  );

  // Keep keyboard focus on a row after it moves between the pinned and the other section.
  useEffect(() => {
    const id = refocusId.current;
    if (!id) return;
    refocusId.current = null;
    rootRef.current?.querySelector<HTMLElement>(`[data-table-id="${id}"]`)?.focus();
  }, [pinnedIds]);

  if (list.length === 0) return null;

  const focusRows = (): HTMLElement[] => Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-table-row]') ?? []);

  const handleRowsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const rows = focusRows();
    const current = rows.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(current + 1, rows.length - 1);
    else if (e.key === 'ArrowUp') next = current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else return;
    e.preventDefault();
    if (next < 0) {
      searchRef.current?.focus();
      return;
    }
    rows[next].focus();
    rows[next].scrollIntoView({ block: 'nearest' });
  };

  const renderRow = (t: TableMeta, indices: number[] = []) => {
    const isActive = t.id === activeTableId;
    const isPinned = pinnedIds.includes(t.id);
    return (
      <div
        key={t.id}
        role="listitem"
        className={cn(
          'group/row flex items-center gap-0.5 rounded transition-colors',
          isActive ? 'bg-[#2D7FF9]/10' : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,12%)]',
        )}
      >
        <button
          type="button"
          data-table-row
          data-table-id={t.id}
          title={t.name}
          aria-current={isActive ? 'page' : undefined}
          aria-keyshortcuts="P"
          {...prefetch.handlersFor(baseId, t.id)}
          onClick={() => navigateToTable(t.id)}
          onKeyDown={(e) => {
            if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              refocusId.current = t.id;
              togglePin(t.id);
            }
          }}
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7FF9]/60',
            isActive ? 'font-medium text-[#2D7FF9]' : 'text-[#4B5563] dark:text-[hsl(220,20%,70%)]',
          )}
        >
          {t.icon ? <span className="text-xs shrink-0">{t.icon}</span> : <Table2 size={12} className="shrink-0 opacity-60" />}
          <span className="min-w-0 truncate">
            <HighlightedText text={t.name} indices={indices} />
          </span>
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={isPinned ? `Unpin ${t.name}` : `Pin ${t.name}`}
          aria-pressed={isPinned}
          title={isPinned ? 'Unpin' : 'Pin to the top (P)'}
          onClick={() => {
            refocusId.current = null;
            togglePin(t.id);
          }}
          className={cn(
            'mr-0.5 shrink-0 rounded p-0.5 transition-opacity focus-visible:opacity-100',
            isPinned ? 'text-warning opacity-100' : 'text-[#9AA2AF] opacity-0 hover:text-warning group-hover/row:opacity-100',
          )}
        >
          <Star size={12} fill={isPinned ? 'currentColor' : 'none'} />
        </button>
      </div>
    );
  };

  return (
    <div ref={rootRef} onKeyDown={handleRowsKeyDown} className="mb-1.5 ml-5 mr-1.5 min-w-0 border-l border-[#E5E5E5] pl-2 dark:border-[hsl(220,25%,18%)]">
      {list.length > 8 && (
        <div className="flex items-center gap-1.5 h-6 px-1.5 my-1 rounded bg-white dark:bg-[hsl(220,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] focus-within:border-[#2D7FF9]">
          <Search size={11} className="text-[#9AA2AF] shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setQuery('');
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusRows()[0]?.focus();
              } else if (e.key === 'Enter') {
                const first = results ? results[0]?.item : visible[0];
                if (first) navigateToTable(first.id);
              }
            }}
            placeholder={`Find in ${visible.length} tables`}
            aria-label="Find a table"
            className="flex-1 min-w-0 bg-transparent outline-none text-2xs text-[#374151] dark:text-[hsl(220,25%,88%)] placeholder:text-[#9AA2AF]"
          />
        </div>
      )}
      <div className="max-h-[40vh] overflow-y-auto overflow-x-hidden" role="list" aria-label="Tables">
        {results ? (
          results.map((r) => renderRow(r.item, r.match.indices))
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <p className="px-1.5 pt-1 pb-0.5 text-3xs font-semibold uppercase tracking-widest text-[#9AA2AF]">Pinned</p>
                {pinned.map((t) => renderRow(t))}
                <p className="px-1.5 pt-1.5 pb-0.5 text-3xs font-semibold uppercase tracking-widest text-[#9AA2AF]">Tables</p>
              </>
            )}
            {rest.map((t) => renderRow(t))}
          </>
        )}
        {results && results.length === 0 && <p className="px-1.5 py-2 text-2xs text-[#9AA2AF]">No table matches</p>}
      </div>
      {(hiddenCount > 0 || showHidden) && (
        <button
          type="button"
          aria-pressed={showHidden}
          onClick={() => setShowHidden(!showHidden)}
          className="mt-0.5 flex w-full min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-left text-2xs text-[#9AA2AF] hover:bg-[#F4F4F5] hover:text-[#4B5563] dark:hover:bg-[hsl(220,25%,12%)] dark:hover:text-[hsl(220,20%,80%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D7FF9]/60"
        >
          {showHidden ? <EyeOff size={11} className="shrink-0" /> : <Eye size={11} className="shrink-0" />}
          <span className="truncate">{showHidden ? 'Hide' : 'Show'} hidden tables ({hiddenCount})</span>
        </button>
      )}
    </div>
  );
}

export function DatabaseSidebar() {
  const { activeBaseId, sidebarOpen, sidebarCollapsed, sidebarWidth, toggleSidebarCollapsed, setSidebarWidth } = useDatabaseUI();
  const { navigateToBase } = useDatabaseNavigate();
  const { data: bases } = useBases();
  const deleteBase = useDeleteBase();
  const updateBase = useUpdateBase();
  const duplicateBase = useDuplicateBase();

  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [baseQuery, setBaseQuery] = useState('');
  const [renamingBaseId, setRenamingBaseId] = useState<string | null>(null);
  const [colorPickerBaseId, setColorPickerBaseId] = useState<string | null>(null);
  const [iconPickerBaseId, setIconPickerBaseId] = useState<string | null>(null);

  const STAR_KEY = 'kd-ops:starred-bases';
  const [starredIds, setStarredIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STAR_KEY) || '[]')); } catch { return new Set(); }
  });
  const toggleStar = useCallback((baseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(baseId)) next.delete(baseId); else next.add(baseId);
      try { localStorage.setItem(STAR_KEY, JSON.stringify([...next])); } catch { /* localStorage unavailable */ }
      return next;
    });
  }, []);

  // Drag-to-resize state
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = sidebarWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = ev.clientX - startX.current;
      setSidebarWidth(startWidth.current + delta);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth, setSidebarWidth]);

  const handleRenameBase = useCallback(
    (baseId: string, name: string) => {
      updateBase.mutate({ id: baseId, name });
      setRenamingBaseId(null);
    },
    [updateBase],
  );

  const handleDuplicateBase = useCallback(
    (base: Base) => {
      duplicateBase.mutate(base.id);
    },
    [duplicateBase],
  );

  const handleColorChange = useCallback(
    (baseId: string, color: string) => {
      updateBase.mutate({ id: baseId, color });
      setColorPickerBaseId(null);
    },
    [updateBase],
  );

  const handleDeleteBase = useCallback(
    async (base: any) => {
      const ok = await styledConfirm({
        description: `Delete base "${base.name}"? All tables and data will be permanently deleted.`,
        variant: 'destructive',
      });
      if (!ok) return;
      deleteBase.mutate(base.id);
      if (activeBaseId === base.id) navigateToBase(null);
    },
    [deleteBase, activeBaseId, navigateToBase],
  );

  // Starred bases first, then the rest in saved order; the search box narrows both.
  const orderedBases = [...(bases || [])].sort((a: Base, b: Base) => {
    const aStarred = starredIds.has(a.id) ? 0 : 1;
    const bStarred = starredIds.has(b.id) ? 0 : 1;
    return aStarred - bStarred || (a.position ?? 0) - (b.position ?? 0);
  });
  const needle = baseQuery.trim().toLowerCase();
  const visibleBases = needle
    ? orderedBases.filter((b: Base) => (b.name ?? '').toLowerCase().includes(needle))
    : orderedBases;
  const starredCount = orderedBases.filter((b: Base) => starredIds.has(b.id)).length;

  if (!sidebarOpen) return null;

  const effectiveWidth = sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <aside
      className="relative bg-[#F9F9FA] dark:bg-[hsl(220,35%,6%)] border-r border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] flex flex-col shrink-0 overflow-hidden select-none"
      style={{
        width: effectiveWidth,
        minWidth: effectiveWidth,
        transition: isResizing.current ? 'none' : 'width 200ms cubic-bezier(0.4, 0, 0.2, 1), min-width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-[#E5E5E5] dark:border-[hsl(220,25%,18%)]">
        {!sidebarCollapsed && (
          <a
            href="/data"
            className="flex items-center gap-1.5 text-xs-plus font-semibold text-[#374151] dark:text-[hsl(220,25%,88%)] hover:text-[#2D7FF9] transition-colors"
            onClick={(e) => { e.preventDefault(); navigateToBase(null); }}
            title="Go to home"
          >
            <Home size={13} className="text-[#9AA2AF] dark:text-[hsl(220,20%,55%)]" />
            Bases
          </a>
        )}
        <div className={cn('flex items-center gap-0.5', sidebarCollapsed && 'mx-auto')}>
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-[#6A7184] dark:text-[hsl(220,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(220,25%,88%)] hover:bg-[#E5E5E5] dark:hover:bg-[hsl(220,25%,18%)]"
              onClick={requestOpenPalette}
              title={`Jump to a base, table or view (${modKeyLabel()} K)`}
              aria-label="Open command palette"
              aria-keyshortcuts="Control+K Meta+K"
            >
              <Search size={14} />
            </Button>
          )}
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-[#6A7184] dark:text-[hsl(220,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(220,25%,88%)] hover:bg-[#E5E5E5] dark:hover:bg-[hsl(220,25%,18%)]"
              onClick={() => setCreateBaseOpen(true)}
              title="Create base"
              aria-label="Create base"
            >
              <Plus size={15} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-[#6A7184] dark:text-[hsl(220,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(220,25%,88%)] hover:bg-[#E5E5E5] dark:hover:bg-[hsl(220,25%,18%)]"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </Button>
        </div>
      </div>

      {/* Find a base: shown once the list is long enough to need it */}
      {!sidebarCollapsed && (bases?.length ?? 0) > 4 && (
        <div className="px-2 pt-2 pb-1">
          <div className="flex items-center gap-1.5 h-7 px-2 rounded-md bg-white dark:bg-[hsl(220,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(220,25%,18%)] focus-within:border-[#2D7FF9] transition-colors">
            <Search size={12} className="text-[#9AA2AF] shrink-0" />
            <input
              value={baseQuery}
              onChange={(e) => setBaseQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') setBaseQuery('');
              }}
              placeholder="Find a base"
              aria-label="Find a base"
              className="flex-1 min-w-0 bg-transparent outline-none text-xs text-[#374151] dark:text-[hsl(220,25%,88%)] placeholder:text-[#9AA2AF]"
            />
            {baseQuery && (
              <button type="button" aria-label="Clear search" className="text-[#9AA2AF] hover:text-[#374151]" onClick={() => setBaseQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Base list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {visibleBases.map((base: any, index: number) => (
          <Fragment key={base.id}>
          {!sidebarCollapsed && !baseQuery && starredCount > 0 && (index === 0 || index === starredCount) && (
            <p className="px-3.5 pt-1.5 pb-1 text-3xs font-semibold uppercase tracking-widest text-[#9AA2AF]">
              {index === 0 ? 'Starred' : 'All bases'}
            </p>
          )}
          <div
            role="link"
            tabIndex={renamingBaseId === base.id ? undefined : 0}
            className={cn(
              'group flex items-center gap-2 mx-1.5 px-2 py-[7px] rounded-md cursor-pointer transition-colors no-underline',
              sidebarCollapsed && 'justify-center mx-0.5 px-0',
              base.id === activeBaseId
                ? 'bg-[#2D7FF9]/10 dark:bg-[hsl(220,50%,14%)]'
                : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(220,25%,12%)]',
            )}
            onClick={(_e) => {
              if (renamingBaseId === base.id) return;
              if (base.id !== activeBaseId) navigateToBase(base.id);
            }}
            onKeyDown={(e) => {
              if (renamingBaseId === base.id) return;
              if (e.key === 'Enter') navigateToBase(base.id);
            }}
            title={sidebarCollapsed ? base.name : undefined}
          >
            <span
              className="w-6 h-6 rounded flex items-center justify-center text-2xs shrink-0"
              style={{ backgroundColor: base.icon ? 'transparent' : (base.color || '#2D7FF9') }}
            >
              {base.icon ? (
                <span className="text-base leading-none">{base.icon}</span>
              ) : (
                <span className="text-white font-bold">
                  {base.name?.charAt(0)?.toUpperCase() || 'B'}
                </span>
              )}
            </span>
            {!sidebarCollapsed && (
              <>
                {renamingBaseId === base.id ? (
                  <div
                    className="flex-1 min-w-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InlineRenameInput
                      value={base.name}
                      onCommit={(name) => handleRenameBase(base.id, name)}
                      onCancel={() => setRenamingBaseId(null)}
                    />
                  </div>
                ) : (
                  <span
                    className={cn(
                      'text-xs-plus font-medium truncate flex-1',
                      base.id === activeBaseId
                        ? 'text-[#2D7FF9]'
                        : 'text-[#374151] dark:text-[hsl(220,25%,88%)]',
                    )}
                  >
                    {base.name}
                  </span>
                )}
                <button
                  className={cn(
                    'p-0.5 rounded transition-opacity shrink-0',
                    starredIds.has(base.id)
                      ? 'opacity-100 text-warning'
                      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[#9AA2AF] hover:text-warning',
                  )}
                  onClick={(e) => toggleStar(base.id, e)}
                  title={starredIds.has(base.id) ? 'Unstar base' : 'Star base'}
                  aria-label={starredIds.has(base.id) ? `Unstar ${base.name}` : `Star ${base.name}`}
                  aria-pressed={starredIds.has(base.id)}
                >
                  <Star size={13} fill={starredIds.has(base.id) ? 'currentColor' : 'none'} />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 rounded hover:bg-[#D5D5D9] dark:hover:bg-[hsl(220,25%,20%)] transition-opacity shrink-0"
                      aria-label={`Actions for ${base.name}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal size={14} className="text-[#6A7184] dark:text-[hsl(220,20%,55%)]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingBaseId(base.id);
                      }}
                    >
                      <Pencil size={12} /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateBase(base);
                      }}
                    >
                      <Copy size={12} /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setColorPickerBaseId(base.id === colorPickerBaseId ? null : base.id);
                      }}
                    >
                      <Palette size={12} /> Change color
                    </DropdownMenuItem>
                    {colorPickerBaseId === base.id && (
                      <div className="px-3 py-2 flex flex-wrap gap-1.5">
                        {BASE_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`w-5 h-5 rounded-full transition-all hover:scale-110 ${base.color === c ? 'ring-2 ring-[#2D7FF9] ring-offset-1 ring-offset-white dark:ring-offset-[hsl(220,30%,12%)]' : 'border-2 border-transparent'}`}
                            style={{
                              backgroundColor: c,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleColorChange(base.id, c);
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIconPickerBaseId(iconPickerBaseId === base.id ? null : base.id);
                      }}
                    >
                      <Smile size={12} /> Change icon
                    </DropdownMenuItem>
                    {iconPickerBaseId === base.id && (
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <EmojiPicker
                          onSelect={(emoji) => {
                            updateBase.mutate({ id: base.id, icon: emoji || null });
                            setIconPickerBaseId(null);
                          }}
                          onClose={() => setIconPickerBaseId(null)}
                        />
                      </div>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs gap-2 text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBase(base);
                      }}
                    >
                      <Trash2 size={12} /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
          {base.id === activeBaseId && !sidebarCollapsed && <BaseTableList baseId={base.id} />}
          </Fragment>
        ))}

        {baseQuery && visibleBases.length === 0 && !sidebarCollapsed && (
          <p className="px-4 py-6 text-center text-xs text-[#9AA2AF]">No base matches "{baseQuery}"</p>
        )}

        {(!bases || bases.length === 0) && !sidebarCollapsed && (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto w-10 h-10 rounded-xl bg-[#2D7FF9]/10 flex items-center justify-center mb-3">
              <Database size={20} className="text-[#2D7FF9]" />
            </div>
            <p className="text-xs text-[#9AA2AF] dark:text-[hsl(220,20%,55%)] mb-2">No bases yet</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#2D7FF9] hover:text-[#2952CC]"
              onClick={() => setCreateBaseOpen(true)}
            >
              <Plus size={12} className="mr-1" /> Create base
            </Button>
          </div>
        )}
      </div>

      {/* Resize drag handle */}
      {!sidebarCollapsed && (
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#2D7FF9]/30 active:bg-[#2D7FF9]/50 transition-colors z-20"
          onMouseDown={handleResizeMouseDown}
        />
      )}

      <CreateBaseDialog open={createBaseOpen} onOpenChange={setCreateBaseOpen} />
    </aside>
  );
}
