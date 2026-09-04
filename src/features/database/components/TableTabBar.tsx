import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Table2,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  Smile,
  Upload,
  Download,
} from 'lucide-react';
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
      className="bg-white dark:bg-[hsl(200,30%,12%)] border border-[#166EE1] rounded px-1.5 py-0.5 text-[13px] w-24 outline-none text-[#374151] dark:text-[hsl(200,25%,88%)]"
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
    <span className="text-[10px] opacity-50 tabular-nums ml-0.5">
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

export function TableTabBar() {
  const { activeBaseId, activeTableId } = useDatabaseUI();
  const { navigateToTable } = useDatabaseNavigate();
  const { data: tables } = useTables(activeBaseId);
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

  const sortedTables = useMemo(
    () => (tables ?? []).slice().sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
    [tables],
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

  const TABLE_ICONS = ['📊', '📋', '📁', '📅', '📦', '🚀', '⭐', '💡', '🎯', '🔧', '📝', '📚', '🧩', '🌐', '❤️', '🏠', '👥', '💰', '🎨', '📱'];

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
    if (activeTableId && tables.some((t: any) => t.id === activeTableId)) return;
    navigateToTable(tables[0].id);
  }, [tables, activeBaseId, activeTableId, navigateToTable]);

  if (!activeBaseId) return null;

  return (
    <div className="flex items-center h-[32px] bg-[#F5F5F5] dark:bg-[hsl(220,30%,12%)] border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] px-1 gap-0 overflow-x-auto shrink-0 select-none">
      <DndContext sensors={tableSensors} collisionDetection={closestCenter} onDragEnd={handleTableDragEnd}>
        <SortableContext items={sortedTables.map((t: any) => t.id)} strategy={horizontalListSortingStrategy}>
      {sortedTables.map((table: any) => (
        <SortableTableTabWrapper key={table.id} id={table.id}>
          {({ setNodeRef, style: dndStyle, attributes, listeners }) => (
        <div ref={setNodeRef} style={dndStyle} {...attributes} {...listeners} className="group/tab flex items-center h-full">
          <div
            className={cn(
              'relative flex items-center gap-1.5 h-full px-3 text-[13px] cursor-pointer transition-colors',
              table.id === activeTableId
                ? 'bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] font-medium rounded-t-md border-t border-l border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] -mb-px'
                : 'text-[#6A7184] hover:text-[#374151] dark:hover:text-[hsl(200,25%,78%)]',
            )}
            onClick={() => navigateToTable(table.id)}
            onDoubleClick={() => setRenamingId(table.id)}
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
                  className={cn(
                    'p-0.5 rounded hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,18%)] transition-opacity shrink-0',
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
                  <div className="px-3 py-2 flex flex-wrap gap-1">
                    {TABLE_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="w-7 h-7 rounded hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,18%)] flex items-center justify-center text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (activeBaseId) updateTable.mutate({ id: table.id, baseId: activeBaseId, icon: emoji });
                          setIconPickerId(null);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      className="w-7 h-7 rounded hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,18%)] flex items-center justify-center text-[10px] text-[#9AA2AF]"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (activeBaseId) updateTable.mutate({ id: table.id, baseId: activeBaseId, icon: null });
                        setIconPickerId(null);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
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
            className="flex items-center justify-center h-7 w-7 ml-0.5 rounded hover:bg-white/60 dark:hover:bg-[hsl(200,25%,16%)] text-[#6A7184] hover:text-[#374151] transition-colors shrink-0"
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
