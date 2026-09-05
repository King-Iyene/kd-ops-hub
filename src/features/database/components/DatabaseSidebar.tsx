import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Pencil,
  Database,
  Copy,
  Palette,
  Settings,
  ChevronLeft,
  ChevronRight,
  Download,
  Home,
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
import { useBases, useCreateBase, useDeleteBase, useUpdateBase, useDuplicateBase } from '../hooks';
import { useWorkspaces } from '../hooks';
import { useDatabaseNavigate } from '../hooks/useNavigate';
import { CreateBaseDialog } from './CreateBaseDialog';
import { ImportAirtableDialog } from './ImportAirtableDialog';
import { BaseSettingsDialog } from './BaseSettingsDialog';
import type { Base } from '../types';

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
      className="bg-white dark:bg-[hsl(200,30%,12%)] border border-[#2D7FF9] rounded px-1.5 py-0.5 text-[13px] w-full outline-none text-[#374151] dark:text-[hsl(200,25%,88%)]"
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
  const { activeBaseId, sidebarOpen, sidebarCollapsed, sidebarWidth, toggleSidebarCollapsed, setSidebarWidth } = useDatabaseUI();
  const { navigateToBase } = useDatabaseNavigate();
  const { data: bases } = useBases();
  const deleteBase = useDeleteBase();
  const updateBase = useUpdateBase();
  const createBase = useCreateBase();
  const { data: workspaces } = useWorkspaces();
  const duplicateBase = useDuplicateBase();

  const [createBaseOpen, setCreateBaseOpen] = useState(false);
  const [importAirtableOpen, setImportAirtableOpen] = useState(false);
  const [renamingBaseId, setRenamingBaseId] = useState<string | null>(null);
  const [colorPickerBaseId, setColorPickerBaseId] = useState<string | null>(null);
  const [settingsBase, setSettingsBase] = useState<Base | null>(null);

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

  if (!sidebarOpen) return null;

  const effectiveWidth = sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth;

  return (
    <aside
      className="relative bg-[#F9F9FA] dark:bg-[hsl(200,35%,6%)] border-r border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] flex flex-col shrink-0 overflow-hidden select-none"
      style={{
        width: effectiveWidth,
        minWidth: effectiveWidth,
        transition: isResizing.current ? 'none' : 'width 200ms cubic-bezier(0.4, 0, 0.2, 1), min-width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]">
        {!sidebarCollapsed && (
          <button
            className="flex items-center gap-1.5 text-[13px] font-semibold text-[#374151] dark:text-[hsl(200,25%,88%)] hover:text-[#2D7FF9] transition-colors"
            onClick={() => navigateToBase(null)}
            title="Go to home"
          >
            <Home size={13} className="text-[#9AA2AF]" />
            Bases
          </button>
        )}
        <div className={cn('flex items-center gap-0.5', sidebarCollapsed && 'mx-auto')}>
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-[#6A7184] dark:text-[hsl(200,20%,55%)] hover:text-[#374151] dark:hover:text-[hsl(200,25%,88%)] hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,18%)]"
              onClick={() => setCreateBaseOpen(true)}
              title="Create base"
            >
              <Plus size={15} />
            </Button>
          )}
          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-[#6A7184] hover:text-[#374151] hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,15%)] dark:hover:text-[hsl(200,25%,88%)]"
              onClick={() => setImportAirtableOpen(true)}
              title="Import from Airtable"
            >
              <Download size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-[#6A7184] hover:text-[#374151] hover:bg-[#E5E5E5] dark:hover:bg-[hsl(200,25%,18%)]"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </Button>
        </div>
      </div>

      {/* Base list */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {bases?.map((base: any) => (
          <div
            key={base.id}
            className={cn(
              'group flex items-center gap-2 mx-1.5 px-2 py-[7px] rounded-md cursor-pointer transition-colors',
              sidebarCollapsed && 'justify-center mx-0.5 px-0',
              base.id === activeBaseId
                ? 'bg-[#2D7FF9]/10 dark:bg-[hsl(220,50%,14%)]'
                : 'hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,12%)]',
            )}
            onClick={() => navigateToBase(base.id)}
            title={sidebarCollapsed ? base.name : undefined}
          >
            <span
              className="w-6 h-6 rounded flex items-center justify-center text-[11px] shrink-0"
              style={{ backgroundColor: base.color || '#2D7FF9' }}
            >
              <span className="text-white font-bold">
                {base.name?.charAt(0)?.toUpperCase() || 'B'}
              </span>
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
                      'text-[13px] font-medium truncate flex-1',
                      base.id === activeBaseId
                        ? 'text-[#2D7FF9]'
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
                      <MoreHorizontal size={14} className="text-[#6A7184] dark:text-[hsl(200,20%,55%)]" />
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
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSettingsBase(base as Base);
                      }}
                    >
                      <Settings size={12} /> Settings
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
              </>
            )}
          </div>
        ))}

        {(!bases || bases.length === 0) && !sidebarCollapsed && (
          <div className="px-4 py-8 text-center">
            <div className="mx-auto w-10 h-10 rounded-xl bg-[#2D7FF9]/10 flex items-center justify-center mb-3">
              <Database size={20} className="text-[#2D7FF9]" />
            </div>
            <p className="text-xs text-[#9AA2AF] mb-2">No bases yet</p>
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
      <ImportAirtableDialog open={importAirtableOpen} onOpenChange={setImportAirtableOpen} />
      {settingsBase && (
        <BaseSettingsDialog
          open={!!settingsBase}
          onOpenChange={(open) => { if (!open) setSettingsBase(null); }}
          base={settingsBase}
        />
      )}
    </aside>
  );
}
