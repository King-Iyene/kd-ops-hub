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
import { useDatabaseNavigate } from '../hooks/useNavigate';
import {
  useTables,
  useBases,
  useCreateTable,
  useDeleteTable,
  useUpdateTable,
  useDuplicateTable,
  useRecordCount,
} from '../hooks';
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
      className="bg-white dark:bg-[hsl(200,30%,12%)] border border-[#2D7FF9] rounded px-1.5 py-0.5 text-[13px] w-24 outline-none text-[#374151] dark:text-[hsl(200,25%,88%)]"
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
    <span className="text-[11px] opacity-50 tabular-nums ml-0.5">
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

export function TableTabBar() {
  const { activeBaseId, activeTableId } = useDatabaseUI();
  const { navigateToTable } = useDatabaseNavigate();
  const { data: tables, isFetching: isTablesFetching } = useTables(activeBaseId);
  const { data: bases } = useBases();
  const activeBase = bases?.find((b: any) => b.id === activeBaseId);
  const baseColor = activeBase?.color || '#2D7FF9';
  const createTable = useCreateTable();
  const deleteTable = useDeleteTable();
  const updateTable = useUpdateTable();
  const duplicateTable = useDuplicateTable();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [iconPickerId, setIconPickerId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [importCsvOpen, setImportCsvOpen] = useState(false);
  const [importAirtableOpen, setImportAirtableOpen] = useState(false);
  const [showHiddenMenu, setShowHiddenMenu] = useState(false);

  const HIDDEN_KEY = `kd-ops:hidden-tables:${activeBaseId || ''}`;
  const [hiddenTableIds, setHiddenTableIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
  });
  useEffect(() => {
    if (!activeBaseId) return;
    const key = `kd-ops:hidden-tables:${activeBaseId}`;
    try { setHiddenTableIds(new Set(JSON.parse(localStorage.getItem(key) || '[]'))); } catch { setHiddenTableIds(new Set()); }
  }, [activeBaseId]);

  const toggleHideTable = useCallback((tableId: string) => {
    setHiddenTableIds(prev => {
      const next = new Set(prev);
      if (next.has(tableId)) next.delete(tableId); else next.add(tableId);
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])); } catch { /* localStorage unavailable */ }
      return next;
    });
  }, [HIDDEN_KEY]);

  const sortedTables = useMemo(
    () => (tables ?? []).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
    [tables],
  );
  const visibleTables = useMemo(
    () => sortedTables.filter((t: any) => !hiddenTableIds.has(t.id)),
    [sortedTables, hiddenTableIds],
  );
  const hiddenTables = useMemo(
    () => sortedTables.filter((t: any) => hiddenTableIds.has(t.id)),
    [sortedTables, hiddenTableIds],
  );

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

  const handleAddTable = useCallback(() => {
    if (!activeBaseId) return;
    createTable.mutate(
      {
        base_id: activeBaseId,
        name: `Table ${(tables?.length ?? 0) + 1}`,
        position: tables?.length ?? 0,
      },
      { onSuccess: (newTable) => navigateToTable(newTable.id) },
    );
  }, [activeBaseId, createTable, tables, navigateToTable]);

  // Auto-select first table when base changes
  useEffect(() => {
    if (!tables || tables.length === 0 || !activeBaseId) return;
    // Don't auto-navigate while tables are refetching (cache invalidation)
    if (isTablesFetching) return;
    if (activeTableId && tables.some((t: any) => t.id === activeTableId)) return;
    navigateToTable(tables[0].id);
  }, [tables, activeBaseId, activeTableId, navigateToTable, isTablesFetching]);

  if (!activeBaseId) return null;

  return (
    <div className="flex items-center h-[38px] px-1 gap-0 overflow-x-auto shrink-0 select-none" style={{ backgroundColor: darkenColor(baseColor, 0.55) }}>
      <DndContext sensors={tableSensors} collisionDetection={closestCenter} onDragEnd={handleTableDragEnd}>
        <SortableContext items={visibleTables.map((t: any) => t.id)} strategy={horizontalListSortingStrategy}>
      {visibleTables.map((table: any) => (
        <SortableTableTabWrapper key={table.id} id={table.id}>
          {({ setNodeRef, style: dndStyle, attributes, listeners }) => (
        <div ref={setNodeRef} style={dndStyle} {...attributes} {...listeners} className="group/tab flex items-center h-full">
          <div
            className={cn(
              'relative flex items-center gap-1.5 h-full px-3 text-[13px] cursor-pointer transition-colors',
              table.id === activeTableId
                ? 'bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] font-medium rounded-t-md -mb-px'
                : 'text-white/70 hover:text-white',
            )}
            onClick={() => navigateToTable(table.id)}
            onDoubleClick={() => setRenamingId(table.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              navigateToTable(table.id);
              const trigger = e.currentTarget.querySelector<HTMLButtonElement>('[data-tab-menu-trigger]');
              if (trigger) trigger.click();
            }}
          >
            {table.icon ? (
              <span className="text-[13px] shrink-0">{table.icon}</span>
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
            {renamingId !== table.id && activeBaseId && (
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
                    toggleHideTable(table.id);
                    if (table.id === activeTableId) {
                      const next = visibleTables.find((t: any) => t.id !== table.id);
                      if (next) navigateToTable(next.id);
                    }
                  }}
                >
                  <EyeOff size={12} /> Hide table
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
          </div>
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

      {hiddenTables.length > 0 && (
        <DropdownMenu open={showHiddenMenu} onOpenChange={setShowHiddenMenu}>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1 h-7 px-2 ml-0.5 rounded hover:bg-white/20 text-white/60 hover:text-white transition-colors shrink-0 text-[11px]"
              title={`${hiddenTables.length} hidden table${hiddenTables.length > 1 ? 's' : ''}`}
            >
              <EyeOff size={12} />
              <span>{hiddenTables.length}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <div className="px-2 py-1 text-[10px] font-medium text-[#9AA2AF] uppercase tracking-wider">
              Hidden tables
            </div>
            {hiddenTables.map((table: any) => (
              <DropdownMenuItem
                key={table.id}
                className="text-xs gap-2"
                onClick={() => {
                  toggleHideTable(table.id);
                  navigateToTable(table.id);
                }}
              >
                <Eye size={12} />
                {table.icon && <span className="text-[12px]">{table.icon}</span>}
                <span className="truncate">{table.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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
