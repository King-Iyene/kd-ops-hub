import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Database,
  Copy,
  Palette,
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
import { useBases, useCreateBase, useDeleteBase, useUpdateBase } from '../hooks';
import { useWorkspaces } from '../hooks';
import { CreateBaseDialog } from './CreateBaseDialog';

const BASE_COLORS = [
  '#3366FF', '#0D9488', '#8B5CF6', '#EC4899', '#F59E0B',
  '#EF4444', '#10B981', '#6366F1', '#F97316', '#64748B',
];

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
      className="bg-white dark:bg-[hsl(200,30%,12%)] border border-[#3366FF] rounded px-1.5 py-0.5 text-[13px] w-full outline-none"
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
  const { activeBaseId, sidebarOpen, setActiveBase } = useDatabaseUI();
  const { data: bases } = useBases();
  const deleteBase = useDeleteBase();
  const updateBase = useUpdateBase();

  const createBase = useCreateBase();
  const { data: workspaces } = useWorkspaces();

  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [renamingBaseId, setRenamingBaseId] = useState<string | null>(null);
  const [colorPickerBaseId, setColorPickerBaseId] = useState<string | null>(null);

  const handleRenameBase = useCallback(
    (baseId: string, name: string) => {
      updateBase.mutate({ id: baseId, name });
      setRenamingBaseId(null);
    },
    [updateBase],
  );

  const handleDuplicateBase = useCallback(
    (base: any) => {
      const wsId = base.workspace_id || workspaces?.[0]?.id;
      if (!wsId) return;
      createBase.mutate({
        workspace_id: wsId,
        name: `${base.name} (copy)`,
        color: base.color,
        icon: base.icon,
      });
    },
    [createBase, workspaces],
  );

  const handleColorChange = useCallback(
    (baseId: string, color: string) => {
      updateBase.mutate({ id: baseId, color });
      setColorPickerBaseId(null);
    },
    [updateBase],
  );

  const handleDeleteBase = useCallback(
    (base: any) => {
      if (
        !confirm(
          `Delete base "${base.name}"? All tables and data will be permanently deleted.`,
        )
      )
        return;
      deleteBase.mutate(base.id);
      if (activeBaseId === base.id) setActiveBase(null);
    },
    [deleteBase, activeBaseId, setActiveBase],
  );

  if (!sidebarOpen) return null;

  return (
    <aside className="w-[220px] bg-[#F9F9FA] dark:bg-[hsl(200,35%,6%)] border-r border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] flex flex-col shrink-0 overflow-hidden select-none">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-[#E7E7E9] dark:border-[hsl(200,25%,18%)]">
        <span className="text-[13px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)]">
          Bases
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-[#6A7184] hover:text-[#374151] hover:bg-[#E7E7E9]"
          onClick={() => setCreateBaseOpen(true)}
          title="Create base"
        >
          <Plus size={15} />
        </Button>
      </div>

      {/* Base list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {bases?.map((base: any) => (
          <div
            key={base.id}
            className={cn(
              'group flex items-center gap-2 mx-1.5 px-2 py-[7px] rounded-md cursor-pointer transition-colors',
              base.id === activeBaseId
                ? 'bg-[#3366FF]/10 dark:bg-[hsl(220,50%,14%)]'
                : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,12%)]',
            )}
            onClick={() => setActiveBase(base.id)}
          >
            <span
              className="w-6 h-6 rounded flex items-center justify-center text-[11px] shrink-0"
              style={{ backgroundColor: base.color || '#3366FF' }}
            >
              <span className="text-white font-bold">
                {base.name?.charAt(0)?.toUpperCase() || 'B'}
              </span>
            </span>
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
                  'text-[13px] font-medium truncate flex-1',
                  base.id === activeBaseId
                    ? 'text-[#3366FF]'
                    : 'text-[#374151] dark:text-[hsl(200,25%,88%)]',
                )}
              >
                {base.name}
              </span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#D5D5D9] dark:hover:bg-[hsl(200,25%,20%)] transition-opacity shrink-0"
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
                        className="w-5 h-5 rounded-full border-2 transition-all hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: base.color === c ? '#374151' : 'transparent',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleColorChange(base.id, c);
                        }}
                      />
                    ))}
                  </div>
                )}
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
        ))}

        {(!bases || bases.length === 0) && (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto w-10 h-10 rounded-xl bg-[#3366FF]/10 flex items-center justify-center mb-3">
              <Database size={20} className="text-[#3366FF]" />
            </div>
            <p className="text-xs text-[#9AA2AF] mb-2">No bases yet</p>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[#3366FF] hover:text-[#2952CC]"
              onClick={() => setCreateBaseOpen(true)}
            >
              <Plus size={12} className="mr-1" /> Create base
            </Button>
          </div>
        )}
      </div>

      <CreateBaseDialog open={createBaseOpen} onOpenChange={setCreateBaseOpen} />
    </aside>
  );
}
