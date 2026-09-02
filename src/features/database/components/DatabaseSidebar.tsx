import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Table2,
  ChevronDown,
  ChevronRight,
  Plus,
  LayoutGrid,
  Kanban,
  GalleryHorizontalEnd,
  FileText,
  Calendar,
  MoreHorizontal,
  Trash2,
  Pencil,
  Copy,
} from 'lucide-react';
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
import {
  useBases,
  useTables,
  useViews,
  useDeleteBase,
  useUpdateBase,
  useDeleteTable,
  useUpdateTable,
  useCreateTable,
} from '../hooks';
import { CreateTableDialog } from './CreateTableDialog';
import { CreateBaseDialog } from './CreateBaseDialog';

const VIEW_ICONS: Record<string, typeof LayoutGrid> = {
  grid: LayoutGrid,
  kanban: Kanban,
  gallery: GalleryHorizontalEnd,
  form: FileText,
  calendar: Calendar,
};

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
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  }, [text, value, onCommit, onCancel]);

  return (
    <input
      ref={ref}
      className="bg-white border border-[#3366FF] rounded px-1.5 py-0.5 text-[13px] w-full outline-none"
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

export function DatabaseSidebar() {
  const {
    activeBaseId,
    activeTableId,
    activeViewId,
    sidebarOpen,
    setActiveBase,
    setActiveTable,
    setActiveView,
  } = useDatabaseUI();

  const { data: bases } = useBases();
  const { data: tables } = useTables(activeBaseId);
  const { data: views } = useViews(activeTableId);
  const deleteBase = useDeleteBase();
  const updateBase = useUpdateBase();
  const deleteTable = useDeleteTable();
  const updateTable = useUpdateTable();
  const createTable = useCreateTable();

  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [expandedBases, setExpandedBases] = useState<Set<string>>(new Set());
  const [renamingBaseId, setRenamingBaseId] = useState<string | null>(null);
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null);

  const toggleBase = (id: string) => {
    setActiveBase(id);
    setExpandedBases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isBaseExpanded = (id: string) =>
    expandedBases.has(id) || id === activeBaseId;

  const handleRenameBase = useCallback(
    (baseId: string, name: string) => {
      updateBase.mutate({ id: baseId, name });
      setRenamingBaseId(null);
    },
    [updateBase],
  );

  const handleDeleteBase = useCallback(
    (base: any) => {
      if (confirm(`Delete base "${base.name}"? All tables and data will be permanently deleted.`)) {
        deleteBase.mutate(base.id);
        if (activeBaseId === base.id) {
          setActiveBase(null as any);
        }
      }
    },
    [deleteBase, activeBaseId, setActiveBase],
  );

  const handleRenameTable = useCallback(
    (tableId: string, name: string) => {
      if (!activeBaseId) return;
      updateTable.mutate({ id: tableId, baseId: activeBaseId, name });
      setRenamingTableId(null);
    },
    [updateTable, activeBaseId],
  );

  const handleDeleteTable = useCallback(
    (table: any) => {
      if (!activeBaseId) return;
      if (confirm(`Delete table "${table.name}"? All records will be permanently deleted.`)) {
        deleteTable.mutate(
          { tableId: table.id, baseId: activeBaseId },
          {
            onSuccess: () => {
              if (activeTableId === table.id) {
                const remaining = tables?.filter((t: any) => t.id !== table.id);
                if (remaining && remaining.length > 0) {
                  setActiveTable(remaining[0].id);
                } else {
                  setActiveTable(null as any);
                }
              }
            },
          },
        );
      }
    },
    [deleteTable, activeBaseId, activeTableId, tables, setActiveTable],
  );

  const handleDuplicateTable = useCallback(
    (table: any) => {
      if (!activeBaseId) return;
      createTable.mutate(
        {
          base_id: activeBaseId,
          name: `${table.name} (copy)`,
          position: (tables?.length ?? 0),
        },
        {
          onSuccess: (newTable) => setActiveTable(newTable.id),
        },
      );
    },
    [createTable, activeBaseId, tables, setActiveTable],
  );

  if (!sidebarOpen) return null;

  return (
    <aside className="w-[260px] bg-[#F9F9FA] dark:bg-[hsl(200,35%,6%)] border-r border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] flex flex-col shrink-0 overflow-hidden select-none">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-3 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
        <span className="text-sm font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
          Bases
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-[#6A7184] hover:text-[#374151] hover:bg-[#E7E7E9]"
          onClick={() => setCreateBaseOpen(true)}
        >
          <Plus size={16} />
        </Button>
      </div>

      {/* Base list */}
      <div className="flex-1 overflow-y-auto py-1">
        {bases?.map((base: any) => (
          <div key={base.id}>
            {/* Base row */}
            <div
              className={cn(
                'group flex items-center gap-2 mx-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                base.id === activeBaseId
                  ? 'bg-[#E7E7E9] dark:bg-[hsl(200,50%,14%)]'
                  : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,12%)]',
              )}
              onClick={() => toggleBase(base.id)}
            >
              {isBaseExpanded(base.id) ? (
                <ChevronDown size={14} className="text-[#9AA2AF] shrink-0" />
              ) : (
                <ChevronRight size={14} className="text-[#9AA2AF] shrink-0" />
              )}
              <span
                className="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0"
                style={{ backgroundColor: base.color || '#3366FF' }}
              >
                <span className="text-white font-bold">
                  {base.name?.charAt(0)?.toUpperCase() || 'B'}
                </span>
              </span>
              {renamingBaseId === base.id ? (
                <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                  <InlineRenameInput
                    value={base.name}
                    onCommit={(name) => handleRenameBase(base.id, name)}
                    onCancel={() => setRenamingBaseId(null)}
                  />
                </div>
              ) : (
                <span className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] truncate flex-1">
                  {base.name}
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#D5D5D9] transition-opacity shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal size={14} className="text-[#6A7184]" />
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-xs gap-2 text-red-500 focus:text-red-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBase(base);
                    }}
                  >
                    <Trash2 size={12} /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Tables under this base */}
            {isBaseExpanded(base.id) && base.id === activeBaseId && (
              <div className="ml-5 mt-0.5">
                {tables?.map((table: any) => (
                  <div key={table.id} className="group/table">
                    <div
                      className={cn(
                        'flex items-center gap-1 pr-1 rounded-md transition-colors',
                        table.id === activeTableId
                          ? 'bg-[#3366FF]/10'
                          : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,12%)]',
                      )}
                    >
                      {renamingTableId === table.id ? (
                        <div className="flex-1 min-w-0 px-2 py-1">
                          <InlineRenameInput
                            value={table.name}
                            onCommit={(name) => handleRenameTable(table.id, name)}
                            onCancel={() => setRenamingTableId(null)}
                          />
                        </div>
                      ) : (
                        <button
                          className={cn(
                            'flex-1 flex items-center gap-2 px-2 py-1 text-[13px] text-left min-w-0',
                            table.id === activeTableId
                              ? 'text-[#3366FF] font-medium'
                              : 'text-[#4A5268] dark:text-[hsl(200,15%,60%)]',
                          )}
                          onClick={() => setActiveTable(table.id)}
                          onDoubleClick={() => setRenamingTableId(table.id)}
                        >
                          <Table2 size={14} className="shrink-0" />
                          <span className="truncate">{table.name}</span>
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="opacity-0 group-hover/table:opacity-100 p-0.5 rounded hover:bg-[#D5D5D9] transition-opacity shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal size={12} className="text-[#6A7184]" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            className="text-xs gap-2"
                            onClick={() => setRenamingTableId(table.id)}
                          >
                            <Pencil size={12} /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-xs gap-2"
                            onClick={() => handleDuplicateTable(table)}
                          >
                            <Copy size={12} /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs gap-2 text-red-500 focus:text-red-500"
                            onClick={() => handleDeleteTable(table)}
                          >
                            <Trash2 size={12} /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Views under active table */}
                    {table.id === activeTableId && views && views.length > 0 && (
                      <div className="ml-4 mt-0.5 mb-1 space-y-0.5">
                        {views.map((view: any) => {
                          const ViewIcon = VIEW_ICONS[view.type] || LayoutGrid;
                          return (
                            <button
                              key={view.id}
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-0.5 rounded text-[12px] text-left transition-colors',
                                view.id === activeViewId
                                  ? 'bg-[#3366FF]/10 text-[#3366FF] font-medium'
                                  : 'text-[#6A7184] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,12%)]',
                              )}
                              onClick={() => setActiveView(view.id)}
                            >
                              <ViewIcon size={12} className="shrink-0" />
                              <span className="truncate">{view.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-[12px] text-[#6A7184] hover:text-[#374151] justify-start gap-1.5 px-2 mt-0.5"
                  onClick={() => setCreateTableOpen(true)}
                >
                  <Plus size={12} /> Add table
                </Button>
              </div>
            )}
          </div>
        ))}

        {(!bases || bases.length === 0) && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-[#9AA2AF]">No bases yet</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-xs text-[#3366FF] hover:text-[#2952CC]"
              onClick={() => setCreateBaseOpen(true)}
            >
              <Plus size={12} className="mr-1" /> Create your first base
            </Button>
          </div>
        )}
      </div>

      <CreateTableDialog open={createTableOpen} onOpenChange={setCreateTableOpen} />
      <CreateBaseDialog open={createBaseOpen} onOpenChange={setCreateBaseOpen} />
    </aside>
  );
}
