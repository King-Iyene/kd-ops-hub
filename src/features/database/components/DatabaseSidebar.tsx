import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useDatabaseUI } from '../lib/store';
import { useBases, useTables, useViews, useDeleteBase } from '../hooks';
import { CreateTableDialog } from './CreateTableDialog';
import { CreateBaseDialog } from './CreateBaseDialog';

const VIEW_ICONS: Record<string, typeof LayoutGrid> = {
  grid: LayoutGrid,
  kanban: Kanban,
  gallery: GalleryHorizontalEnd,
  form: FileText,
  calendar: Calendar,
};

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

  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [expandedBases, setExpandedBases] = useState<Set<string>>(new Set());

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
              <span className="text-[13px] font-medium text-[#374151] dark:text-[hsl(200,25%,88%)] truncate flex-1">
                {base.name}
              </span>
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
                  <DropdownMenuItem className="text-xs gap-2">
                    <Pencil size={12} /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs gap-2 text-red-500 focus:text-red-500"
                    onClick={() => {
                      if (confirm(`Delete base "${base.name}"? This cannot be undone.`)) {
                        deleteBase.mutate(base.id);
                      }
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
                  <div key={table.id}>
                    <button
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1 rounded-md text-[13px] text-left transition-colors',
                        table.id === activeTableId
                          ? 'bg-[#3366FF]/10 text-[#3366FF] font-medium'
                          : 'text-[#4A5268] dark:text-[hsl(200,15%,60%)] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,12%)]',
                      )}
                      onClick={() => setActiveTable(table.id)}
                    >
                      <Table2 size={14} className="shrink-0" />
                      <span className="truncate">{table.name}</span>
                    </button>

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
