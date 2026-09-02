import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Table2,
  Plus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useDatabaseUI } from '../lib/store';
import {
  useTables,
  useCreateTable,
  useDeleteTable,
  useUpdateTable,
} from '../hooks';

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
      className="bg-white dark:bg-[hsl(200,30%,12%)] border border-[#3366FF] rounded px-1.5 py-0.5 text-[13px] w-24 outline-none"
      style={{ color: '#374151' }}
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

export function TableTabBar() {
  const { activeBaseId, activeTableId, setActiveTable } = useDatabaseUI();
  const { data: tables } = useTables(activeBaseId);
  const createTable = useCreateTable();
  const deleteTable = useDeleteTable();
  const updateTable = useUpdateTable();
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const handleRename = useCallback(
    (tableId: string, name: string) => {
      if (!activeBaseId) return;
      updateTable.mutate({ id: tableId, baseId: activeBaseId, name });
      setRenamingId(null);
    },
    [updateTable, activeBaseId],
  );

  const handleDelete = useCallback(
    (table: any) => {
      if (!activeBaseId) return;
      if (!confirm(`Delete table "${table.name}"? All records will be permanently deleted.`)) return;
      deleteTable.mutate(
        { tableId: table.id, baseId: activeBaseId },
        {
          onSuccess: () => {
            if (activeTableId === table.id) {
              const remaining = tables?.filter((t: any) => t.id !== table.id);
              if (remaining && remaining.length > 0) setActiveTable(remaining[0].id);
              else setActiveTable(null);
            }
          },
        },
      );
    },
    [deleteTable, activeBaseId, activeTableId, tables, setActiveTable],
  );

  const handleDuplicate = useCallback(
    (table: any) => {
      if (!activeBaseId) return;
      createTable.mutate(
        {
          base_id: activeBaseId,
          name: `${table.name} (copy)`,
          position: (tables?.length ?? 0),
        },
        { onSuccess: (newTable) => setActiveTable(newTable.id) },
      );
    },
    [createTable, activeBaseId, tables, setActiveTable],
  );

  const handleAddTable = useCallback(() => {
    if (!activeBaseId) return;
    createTable.mutate(
      {
        base_id: activeBaseId,
        name: `Table ${(tables?.length ?? 0) + 1}`,
        position: tables?.length ?? 0,
      },
      { onSuccess: (newTable) => setActiveTable(newTable.id) },
    );
  }, [activeBaseId, createTable, tables, setActiveTable]);

  // Auto-select first table when base changes
  useEffect(() => {
    if (!tables || tables.length === 0 || !activeBaseId) return;
    if (activeTableId && tables.some((t: any) => t.id === activeTableId)) return;
    setActiveTable(tables[0].id);
  }, [tables, activeBaseId, activeTableId, setActiveTable]);

  if (!activeBaseId) return null;

  return (
    <div className="flex items-center h-[35px] bg-[#F0F3FF] dark:bg-[hsl(220,30%,12%)] border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] px-1 gap-0 overflow-x-auto shrink-0 select-none">
      {tables?.map((table: any) => (
        <div key={table.id} className="group/tab flex items-center h-full">
          <div
            className={cn(
              'relative flex items-center gap-1.5 h-full px-3 text-[13px] cursor-pointer transition-colors',
              table.id === activeTableId
                ? 'bg-white dark:bg-[hsl(200,30%,10%)] text-[#374151] dark:text-[hsl(200,25%,88%)] font-medium rounded-t-md border-t border-l border-r border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] -mb-px'
                : 'text-[#6A7184] hover:text-[#374151] dark:hover:text-[hsl(200,25%,78%)]',
            )}
            onClick={() => setActiveTable(table.id)}
            onDoubleClick={() => setRenamingId(table.id)}
          >
            <Table2 size={14} className="shrink-0" />
            {renamingId === table.id ? (
              <InlineRenameInput
                value={table.name}
                onCommit={(name) => handleRename(table.id, name)}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <span className="truncate max-w-[120px]">{table.name}</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    'p-0.5 rounded hover:bg-[#E7E7E9] dark:hover:bg-[hsl(200,25%,18%)] transition-opacity shrink-0',
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
      ))}
      <button
        className="flex items-center justify-center h-7 w-7 ml-0.5 rounded hover:bg-white/60 dark:hover:bg-[hsl(200,25%,16%)] text-[#6A7184] hover:text-[#374151] transition-colors shrink-0"
        onClick={handleAddTable}
        title="Add table"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
