import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  Smile,
  Upload,
  Download,
  EyeOff,
  Eye,
} from 'lucide-react';
import { AllTablesPopover } from './AllTablesPopover';
import { EmojiPicker } from './EmojiPicker';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { confirm as styledConfirm } from '@/hooks/use-confirm';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useDatabaseUI } from '../lib/store';
import { useDatabaseNavigate, toShort } from '../hooks/useNavigate';
import {
  useTables,
  useBases,
  useDeleteTable,
  useUpdateTable,
  useDuplicateTable,
} from '../hooks';
import { usePrefetchTable } from '../hooks/usePrefetchTable';
import {
  useManualHiddenTables,
  usePinnedTables,
  useShowHiddenTables,
} from '../hooks/useNavPrefs';
import { countHiddenTables, filterVisibleTables } from '../lib/tableVisibility';
import { CreateTableDialog } from './CreateTableDialog';
import { ImportCsvDialog } from './ImportCsvDialog';
import { ImportAirtableDialog } from './ImportAirtableDialog';

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

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else onCancel();
  }, [text, value, onCommit, onCancel]);

  return (
    <input
      ref={ref}
      className="bg-white dark:bg-[hsl(220,30%,12%)] border border-primary rounded px-1.5 py-0.5 text-xs-plus w-24 outline-none text-[#374151] dark:text-[hsl(220,25%,88%)]"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function SortableTableTabWrapper({ id, children }: { id: string; children: (props: { setNodeRef: (el: HTMLElement | null) => void; style: React.CSSProperties; attributes: Record<string, any>; listeners: Record<string, any> | undefined }) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return <>{children({ setNodeRef, style, attributes, listeners })}</>;
}

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * (1 - amount))}, ${Math.round(g * (1 - amount))}, ${Math.round(b * (1 - amount))})`;
}

interface TableTabBarProps {
  /** Controlled open state of the "All tables" popover (Ctrl+J). Falls back to its own state when omitted. */
  tablesOpen?: boolean;
  onTablesOpenChange?: (open: boolean) => void;
}

export function TableTabBar({ tablesOpen, onTablesOpenChange }: TableTabBarProps = {}) {
  const { activeBaseId, activeTableId } = useDatabaseUI();
  const { navigateToTable } = useDatabaseNavigate();
  const { data: tables, isFetching: isTablesFetching } = useTables(activeBaseId);
  const prefetch = usePrefetchTable();
  const { data: bases } = useBases();
  const activeBase = bases?.find((b: any) => b.id === activeBaseId);
  const baseColor = activeBase?.color || '#2D7FF9';
  const deleteTable = useDeleteTable();
  const updateTable = useUpdateTable();
  const duplicateTable = useDuplicateTable();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [iconPickerId, setIconPickerId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [importAirtableOpen, setImportAirtableOpen] = useState(false);
  const { hiddenIds: manualHidden, toggleHidden: toggleHideTable } = useManualHiddenTables(activeBaseId);
  const [showHidden, setShowHidden] = useShowHiddenTables();
  const { pinnedIds } = usePinnedTables(activeBaseId);

  // The query can briefly still hold the previous base's tables while the next one loads.
  const sortedTables = useMemo(
    () => (tables ?? []).filter((t) => t.base_id === activeBaseId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [tables, activeBaseId],
  );
  // Copies, outdated and WIP tables (and any hidden by hand) stay out of the strip unless the user asks for them.
  const selectableTables = useMemo(
    () => filterVisibleTables(sortedTables, { showHidden, activeTableId, manualHidden }),
    [sortedTables, showHidden, activeTableId, manualHidden],
  );
  const hiddenCount = useMemo(
    () => countHiddenTables(sortedTables, { activeTableId, manualHidden }),
    [sortedTables, activeTableId, manualHidden],
  );

  // Like Airtable: every table is a tab, in order, and the strip scrolls sideways when they do not all fit.
  const tabTables = selectableTables;
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  useEffect(() => {
    updateEdges();
    const el = stripRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdges, tabTables.length]);
  // Keep the open table's tab in view.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip || !activeTableId) return;
    strip.querySelector<HTMLElement>(`[data-tab-id="${activeTableId}"]`)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [activeTableId, tabTables.length]);
  const scrollStrip = useCallback((delta: number) => {
    stripRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  }, []);

  const [tablesOpenLocal, setTablesOpenLocal] = useState(false);
  const tablesPopoverOpen = tablesOpen ?? tablesOpenLocal;
  const setTablesPopoverOpen = onTablesOpenChange ?? setTablesOpenLocal;

  const tableSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleTableDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !activeBaseId) return;
      const oldIndex = sortedTables.findIndex((t: any) => t.id === active.id);
      const newIndex = sortedTables.findIndex((t: any) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(sortedTables, oldIndex, newIndex);
      reordered.forEach((t: any, i: number) => {
        if ((t.position ?? 0) !== i) {
          updateTable.mutate({ id: t.id, baseId: activeBaseId, position: i });
        }
      });
    },
    [sortedTables, activeBaseId, updateTable],
  );


  const handleRename = useCallback(
    (tableId: string, name: string) => {
      if (!activeBaseId) return;
      updateTable.mutate({ id: tableId, baseId: activeBaseId, name });
      setRenamingId(null);
    },
    [updateTable, activeBaseId],
  );

  const handleDelete = useCallback(
    async (table: any) => {
      if (!activeBaseId) return;
      if (!(await styledConfirm({ description: `Delete table "${table.name}"? All records will be permanently deleted.`, variant: 'destructive' }))) return;
      deleteTable.mutate(
        { tableId: table.id, baseId: activeBaseId },
        {
          onSuccess: () => {
            if (activeTableId === table.id) {
              const remaining = tables?.filter((t: any) => t.id !== table.id);
              if (remaining && remaining.length > 0) navigateToTable(remaining[0].id);
              else navigateToTable(null);
            }
          },
        },
      );
    },
    [deleteTable, activeBaseId, activeTableId, tables, navigateToTable],
  );

  const handleDuplicate = useCallback(
    (table: any) => {
      if (!activeBaseId) return;
      duplicateTable.mutate(
        {
          base_id: activeBaseId,
          table_id: table.id,
          name: `${table.name} (copy)`,
        },
        { onSuccess: (newTable) => navigateToTable(newTable.id) },
      );
    },
    [duplicateTable, activeBaseId, navigateToTable],
  );



  // Auto-select first table when base changes
  useEffect(() => {
    if (!tables || tables.length === 0 || !activeBaseId) return;
    // Don't auto-navigate while tables are refetching (cache invalidation)
    if (isTablesFetching) return;
    if (activeTableId && tables.some((t: any) => t.id === activeTableId)) return;
    // Open the first table that is not a hidden copy, if there is one.
    const first = filterVisibleTables(sortedTables, { showHidden: false, manualHidden })[0] ?? tables[0];
    navigateToTable(first.id);
  }, [tables, sortedTables, manualHidden, activeBaseId, activeTableId, navigateToTable, isTablesFetching]);

  if (!activeBaseId) return null;

  return (
    <div className="flex h-[40px] shrink-0 select-none items-end gap-1 px-2" style={{ backgroundColor: darkenColor(baseColor, 0.55) }}>
      <div className="relative flex h-full min-w-0 items-end">
        {edges.left && (
          <button
            type="button"
            className="absolute left-0 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            onClick={() => scrollStrip(-240)}
            aria-label="Scroll tables left"
          >
            <ChevronLeft size={14} />
          </button>
        )}
        <div
          ref={stripRef}
          onScroll={updateEdges}
          onWheel={(e) => {
            // A mouse wheel scrolls the tabs sideways.
            const el = stripRef.current;
            if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
          }}
          className="flex h-full min-w-0 items-end overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: 'none' }}
          role="tablist"
          aria-label="Tables"
        >
          <DndContext sensors={tableSensors} collisionDetection={closestCenter} onDragEnd={handleTableDragEnd}>
            <SortableContext items={tabTables.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
              {tabTables.map((table: any) => {
                const isActive = table.id === activeTableId;
                return (
                  <SortableTableTabWrapper key={table.id} id={table.id}>
                    {({ setNodeRef, style: dndStyle, attributes, listeners }) => (
                      <div
                        ref={setNodeRef}
                        style={dndStyle}
                        {...attributes}
                        {...listeners}
                        data-tab-id={table.id}
                        className="group/tab flex h-[32px] shrink-0 items-center"
                      >
                        <a
                          href={activeBaseId ? `/data/${toShort(activeBaseId)}/${toShort(table.id)}` : '#'}
                          role="tab"
                          aria-selected={isActive}
                          className={cn(
                            'relative flex h-full items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 text-[13px] no-underline transition-colors cursor-pointer',
                            isActive
                              ? '-mb-px bg-white font-medium text-[#1D1F25] dark:bg-[hsl(220,30%,10%)] dark:text-[hsl(220,25%,92%)]'
                              : 'text-white/85 hover:bg-white/15 hover:text-white',
                          )}
                          {...(activeBaseId ? prefetch.handlersFor(activeBaseId, table.id) : {})}
                          onClick={(e) => { e.preventDefault(); navigateToTable(table.id); }}
                          onDoubleClick={() => setRenamingId(table.id)}
                        >
                          {table.icon ? <span className="shrink-0 text-[13px]">{table.icon}</span> : null}
                          {renamingId === table.id ? (
                            <InlineRenameInput
                              value={table.name}
                              onCommit={(name) => handleRename(table.id, name)}
                              onCancel={() => setRenamingId(null)}
                            />
                          ) : (
                            <span className="max-w-[200px] truncate">{table.name}</span>
                          )}
                          {/* The menu arrow belongs to the open table only, as in Airtable. */}
                          {isActive && renamingId !== table.id && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  data-tab-menu-trigger
                                  className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`${table.name} options`}
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-44">
                                <DropdownMenuItem className="gap-2 text-xs" onClick={() => setRenamingId(table.id)}>
                                  <Pencil size={12} /> Rename table
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2 text-xs" onClick={() => handleDuplicate(table)}>
                                  <Copy size={12} /> Duplicate table
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="gap-2 text-xs"
                                  onClick={() => setIconPickerId(iconPickerId === table.id ? null : table.id)}
                                >
                                  <Smile size={12} /> Change icon
                                </DropdownMenuItem>
                                {iconPickerId === table.id && (
                                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                                    <EmojiPicker
                                      onSelect={(emoji) => {
                                        if (activeBaseId) updateTable.mutate({ id: table.id, baseId: activeBaseId, icon: emoji || null });
                                        setIconPickerId(null);
                                      }}
                                      onClose={() => setIconPickerId(null)}
                                    />
                                  </div>
                                )}
                                <DropdownMenuItem
                                  className="gap-2 text-xs"
                                  onClick={() => {
                                    const wasHidden = manualHidden.has(table.id);
                                    toggleHideTable(table.id);
                                    if (!wasHidden && table.id === activeTableId) {
                                      const next = selectableTables.find((t) => t.id !== table.id && !manualHidden.has(t.id));
                                      if (next) navigateToTable(next.id);
                                    }
                                  }}
                                >
                                  {manualHidden.has(table.id) ? <Eye size={12} /> : <EyeOff size={12} />}
                                  {manualHidden.has(table.id) ? 'Unhide table' : 'Hide table'}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-xs text-red-500 focus:text-red-500"
                                  onClick={() => handleDelete(table)}
                                >
                                  <Trash2 size={12} /> Delete table
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </a>
                      </div>
                    )}
                  </SortableTableTabWrapper>
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
        {edges.right && (
          <button
            type="button"
            className="absolute right-0 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            onClick={() => scrollStrip(240)}
            aria-label="Scroll tables right"
          >
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="flex h-[32px] shrink-0 items-center gap-1 pb-0.5">
        <AllTablesPopover
          open={tablesPopoverOpen}
          onOpenChange={setTablesPopoverOpen}
          tables={sortedTables}
          activeTableId={activeTableId}
          pinnedIds={pinnedIds}
          manualHidden={manualHidden}
          hiddenCount={hiddenCount}
          showHidden={showHidden}
          onShowHiddenChange={setShowHidden}
          onSelect={(tableId) => {
            setTablesPopoverOpen(false);
            if (tableId !== activeTableId) navigateToTable(tableId);
          }}
          onUnhide={toggleHideTable}
        />
        <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-7 shrink-0 items-center gap-1 rounded px-2 text-[13px] text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              title="Add or import a table"
            >
              <Plus size={14} />
              <span className="whitespace-nowrap">Add or import</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="gap-2 text-xs" onClick={() => setCreateTableOpen(true)}>
              <Plus size={12} /> Create new table
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-xs" onClick={() => setImportCsvOpen(true)}>
              <Upload size={12} /> Import CSV
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-xs" onClick={() => setImportAirtableOpen(true)}>
              <Download size={12} /> Import from Airtable
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CreateTableDialog open={createTableOpen} onOpenChange={setCreateTableOpen} />
      <ImportCsvDialog open={importCsvOpen} onOpenChange={setImportCsvOpen} />
      <ImportAirtableDialog open={importAirtableOpen} onOpenChange={setImportAirtableOpen} />
    </div>
  );
}
