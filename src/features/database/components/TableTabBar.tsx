import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Table2,
  Plus,
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
  useRecordCount,
} from '../hooks';
import {
  useManualHiddenTables,
  usePinnedTables,
  useRecentTableIds,
  useShowHiddenTables,
} from '../hooks/useNavPrefs';
import { countHiddenTables, filterVisibleTables, pickTabTables } from '../lib/tableVisibility';
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
      className="bg-white dark:bg-[hsl(220,30%,12%)] border border-[#2D7FF9] rounded px-1.5 py-0.5 text-xs-plus w-24 outline-none text-[#374151] dark:text-[hsl(220,25%,88%)]"
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

function TabRecordCount({ baseId, tableId }: { baseId: string; tableId: string }) {
  const { data: count } = useRecordCount(baseId, tableId);
  if (count == null) return null;
  return (
    <span className="text-2xs opacity-50 tabular-nums ml-0.5">
      {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
    </span>
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

// Rough widths used to decide how many tabs fit: one tab (icon, name up to 120px, count, menu), and the fixed controls.
const TAB_SLOT_WIDTH = 150;
const RESERVED_WIDTH = 190;
const MAX_TABS = 6;
const FALLBACK_TABS = 4;

/** Width of an element, kept current as the window or sidebar is resized. 0 until first measured. */
function useElementWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === w ? prev : w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
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
  const recentTableIds = useRecentTableIds(activeBaseId);

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

  // Only as many tabs as fit: the open table plus the ones used most recently. Everything else is one click away in All tables.
  const barRef = useRef<HTMLDivElement>(null);
  const barWidth = useElementWidth(barRef);
  const maxTabs = barWidth > 0 ? Math.min(MAX_TABS, Math.floor((barWidth - RESERVED_WIDTH) / TAB_SLOT_WIDTH)) : FALLBACK_TABS;
  const tabTables = useMemo(
    () => pickTabTables(selectableTables, { activeId: activeTableId, recentIds: recentTableIds, max: maxTabs }),
    [selectableTables, activeTableId, recentTableIds, maxTabs],
  );

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
    <div ref={barRef} className="flex items-center h-[38px] px-1 gap-0 overflow-hidden shrink-0 select-none" style={{ backgroundColor: darkenColor(baseColor, 0.55) }}>
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
      <DndContext sensors={tableSensors} collisionDetection={closestCenter} onDragEnd={handleTableDragEnd}>
        <SortableContext items={tabTables.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
      {tabTables.map((table: any) => (
        <SortableTableTabWrapper key={table.id} id={table.id}>
          {({ setNodeRef, style: dndStyle, attributes, listeners }) => (
        <div ref={setNodeRef} style={dndStyle} {...attributes} {...listeners} className="group/tab flex items-center h-full min-w-0 shrink">
          <a
            href={activeBaseId ? `/data/${toShort(activeBaseId)}/${toShort(table.id)}` : '#'}
            className={cn(
              'relative flex items-center gap-1.5 h-full min-w-0 px-3 text-xs-plus cursor-pointer transition-colors no-underline',
              table.id === activeTableId
                ? 'bg-white dark:bg-[hsl(220,30%,10%)] text-[#374151] dark:text-[hsl(220,25%,88%)] font-medium rounded-t-md -mb-px'
                : 'text-white/70 hover:text-white',
            )}
            onClick={(e) => { e.preventDefault(); navigateToTable(table.id); }}
            onDoubleClick={() => setRenamingId(table.id)}
          >
            {table.icon ? (
              <span className="text-xs-plus shrink-0">{table.icon}</span>
            ) : (
              <Table2 size={14} className="shrink-0" />
            )}
            {renamingId === table.id ? (
              <InlineRenameInput
                value={table.name}
                onCommit={(name) => handleRename(table.id, name)}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <span className="truncate max-w-[120px]">{table.name}</span>
            )}
            {/* Only the open table is counted: counting every tab fired one request per table (43 on KDS Finances). */}
            {renamingId !== table.id && activeBaseId && table.id === activeTableId && (
              <TabRecordCount baseId={activeBaseId} tableId={table.id} />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-tab-menu-trigger
                  className={cn(
                    'p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-opacity shrink-0',
                    table.id === activeTableId
                      ? 'opacity-60 hover:opacity-100'
                      : 'opacity-0 group-hover/tab:opacity-60 hover:!opacity-100',
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ChevronDown size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={() => setRenamingId(table.id)}
                >
                  <Pencil size={12} /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2"
                  onClick={() => handleDuplicate(table)}
                >
                  <Copy size={12} /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs gap-2"
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
                  className="text-xs gap-2"
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
                  className="text-xs gap-2 text-red-500 focus:text-red-500"
                  onClick={() => handleDelete(table)}
                >
                  <Trash2 size={12} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </a>
        </div>
          )}
        </SortableTableTabWrapper>
      ))}
        </SortableContext>
      </DndContext>
      <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-center h-7 w-7 ml-0.5 rounded hover:bg-white/20 text-white/70 hover:text-white transition-colors shrink-0"
            title="Add table"
          >
            <Plus size={15} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem className="text-xs gap-2" onClick={() => setCreateTableOpen(true)}>
            <Plus size={12} /> Create new table
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs gap-2" onClick={() => setImportCsvOpen(true)}>
            <Upload size={12} /> Import CSV
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" onClick={() => setImportAirtableOpen(true)}>
            <Download size={12} /> Import from Airtable
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateTableDialog
        open={createTableOpen}
        onOpenChange={setCreateTableOpen}
      />
      <ImportCsvDialog
        open={importCsvOpen}
        onOpenChange={setImportCsvOpen}
      />
      <ImportAirtableDialog
        open={importAirtableOpen}
        onOpenChange={setImportAirtableOpen}
      />
    </div>
  );
}
