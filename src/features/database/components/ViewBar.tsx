import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Grid3X3, LayoutGrid, Columns3, FileText, Calendar, GanttChart, BarChart3, Plus, Pencil, Trash2, Copy, Lock, Unlock } from 'lucide-react';
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
import { useDatabaseUI } from '../lib/store';
import { useViews, useCreateView, useUpdateView, useDeleteView, useLoadViewConfig } from '../hooks';

const VIEW_ICONS: Record<string, typeof Grid3X3> = {
  grid: Grid3X3,
  kanban: Columns3,
  gallery: LayoutGrid,
  form: FileText,
  calendar: Calendar,
  timeline: GanttChart,
  gantt: BarChart3,
};

const VIEW_TYPE_OPTIONS: Array<{ type: 'grid' | 'kanban' | 'gallery' | 'form' | 'calendar' | 'timeline' | 'gantt'; label: string }> = [
  { type: 'grid', label: 'Grid' },
  { type: 'kanban', label: 'Kanban' },
  { type: 'gallery', label: 'Gallery' },
  { type: 'form', label: 'Form' },
  { type: 'calendar', label: 'Calendar' },
  { type: 'timeline', label: 'Timeline' },
  { type: 'gantt', label: 'Gantt' },
];

function SortableViewTab({
  view,
  isActive,
  isRenaming,
  renameRef,
  renameText,
  setRenameText,
  onRename,
  setRenamingId,
  onSelect,
  onContextMenu,
}: {
  view: any;
  isActive: boolean;
  isRenaming: boolean;
  renameRef: React.RefObject<HTMLInputElement | null>;
  renameText: string;
  setRenameText: (t: string) => void;
  onRename: (id: string) => void;
  setRenamingId: (id: string | null) => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const Icon = VIEW_ICONS[view.type] ?? Grid3X3;

  if (isRenaming) {
    return (
      <div ref={setNodeRef} style={style} className="flex items-center gap-1">
        <input
          ref={renameRef}
          className="h-6 w-28 px-1.5 text-[12px] border border-[#166EE1] rounded outline-none"
          value={renameText}
          onChange={(e) => setRenameText(e.target.value)}
          onBlur={() => onRename(view.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRename(view.id);
            if (e.key === 'Escape') setRenamingId(null);
          }}
        />
      </div>
    );
  }

  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium whitespace-nowrap transition-colors"
      style={{
        ...style,
        color: isActive ? '#166EE1' : '#6A7184',
        backgroundColor: isActive ? '#EBF0FF' : 'transparent',
      }}
    >
      <Icon size={13} />
      {view.name}
      {view.is_locked && <Lock size={10} className="text-[#9AA2AF] ml-0.5" />}
    </button>
  );
}

export function ViewBar() {
  const { activeTableId, activeViewId } = useDatabaseUI();
  const setActiveView = useDatabaseUI((s) => s.setActiveView);
  const { data: views } = useViews(activeTableId);
  const createView = useCreateView();
  const updateView = useUpdateView();
  const deleteView = useDeleteView();
  const loadViewConfig = useLoadViewConfig();

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; viewId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const renameRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => (views ?? []).slice().sort((a, b) => a.position - b.position),
    [views],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !activeTableId) return;
      const oldIndex = sorted.findIndex((v) => v.id === active.id);
      const newIndex = sorted.findIndex((v) => v.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(sorted, oldIndex, newIndex);
      reordered.forEach((v, i) => {
        if (v.position !== i + 1) {
          updateView.mutate({ id: v.id, table_id: activeTableId, updates: { position: i + 1 } });
        }
      });
    },
    [sorted, activeTableId, updateView],
  );

  const handleAddView = useCallback(
    (type: 'grid' | 'kanban' | 'gallery' | 'form' | 'calendar' | 'timeline' | 'gantt') => {
      if (!activeTableId) return;
      createView.mutate(
        {
          table_id: activeTableId,
          name: `${type.charAt(0).toUpperCase() + type.slice(1)} view`,
          type,
          position: (views?.length ?? 0) + 1,
        },
        {
          onSuccess: (newView) => {
            const hiddenFieldIds = new Set<string>();
            if (newView.field_visibility) {
              for (const [fid, visible] of Object.entries(newView.field_visibility)) {
                if (!visible) hiddenFieldIds.add(fid);
              }
            }
            setActiveView(newView.id, {
              type: newView.type,
              filters: newView.filters ?? [],
              sorts: newView.sorts ?? [],
              groups: newView.groups ?? [],
              hiddenFieldIds,
              fieldOrder: newView.field_order ?? [],
              fieldWidths: newView.field_widths ?? {},
            });
          },
          onError: (err) => {
            console.error('Failed to create view:', err);
          },
        },
      );
      setAddMenuOpen(false);
    },
    [activeTableId, createView, views],
  );

  const handleRename = useCallback(
    (viewId: string) => {
      const trimmed = renameText.trim();
      if (trimmed) {
        updateView.mutate({ id: viewId, table_id: activeTableId!, updates: { name: trimmed } });
      }
      setRenamingId(null);
    },
    [renameText, updateView, activeTableId],
  );

  useEffect(() => {
    if (renamingId) renameRef.current?.focus();
  }, [renamingId]);

  return (
    <>
      <div
        className="flex items-center gap-0.5 px-2 shrink-0 overflow-x-auto bg-white dark:bg-[hsl(200,30%,8%)] border-b border-[#E5E5E5] dark:border-[hsl(200,25%,18%)]"
        style={{ height: 32 }}
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sorted.map((v) => v.id)} strategy={horizontalListSortingStrategy}>
            {sorted.map((v) => {
              const isActive = v.id === activeViewId;
              return (
                <SortableViewTab
                  key={v.id}
                  view={v}
                  isActive={isActive}
                  isRenaming={renamingId === v.id}
                  renameRef={renameRef}
                  renameText={renameText}
                  setRenameText={setRenameText}
                  onRename={handleRename}
                  setRenamingId={setRenamingId}
                  onSelect={() => loadViewConfig(v.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, viewId: v.id });
                  }}
                />
              );
            })}
          </SortableContext>
        </DndContext>

        <div className="relative">
          <button
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[12px] hover:bg-gray-100 whitespace-nowrap"
            style={{ color: '#9AA2AF' }}
          >
            <Plus size={12} />
          </button>
          {addMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
              <div className="absolute left-0 top-full z-50 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg py-1 min-w-[160px]">
                {VIEW_TYPE_OPTIONS.map((opt) => {
                  const Icon = VIEW_ICONS[opt.type];
                  return (
                    <button
                      key={opt.type}
                      className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
                      onClick={() => handleAddView(opt.type)}
                    >
                      <Icon size={13} className="text-[#9AA2AF]" />
                      {opt.label} view
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* View context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E5E5E5] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={() => {
                const view = sorted.find((v) => v.id === contextMenu.viewId);
                if (view) {
                  setRenameText(view.name);
                  setRenamingId(view.id);
                }
                setContextMenu(null);
              }}
            >
              <Pencil size={12} className="text-[#9AA2AF]" /> Rename
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={() => {
                if (!activeTableId) return;
                const view = sorted.find((v) => v.id === contextMenu.viewId);
                if (view) {
                  createView.mutate({
                    table_id: activeTableId,
                    name: `${view.name} (copy)`,
                    type: view.type,
                    filters: view.filters,
                    sorts: view.sorts,
                    groups: view.groups,
                    field_order: view.field_order,
                    field_visibility: view.field_visibility,
                    field_widths: view.field_widths,
                    position: (views?.length ?? 0) + 1,
                  });
                }
                setContextMenu(null);
              }}
            >
              <Copy size={12} className="text-[#9AA2AF]" /> Duplicate
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#F4F4F5] dark:hover:bg-[hsl(200,25%,15%)] flex items-center gap-2 text-[#374151] dark:text-[hsl(200,25%,88%)]"
              onClick={() => {
                if (!activeTableId) return;
                const view = sorted.find((v) => v.id === contextMenu.viewId);
                if (view) {
                  updateView.mutate({
                    id: view.id,
                    table_id: activeTableId,
                    updates: { is_locked: !view.is_locked },
                  });
                }
                setContextMenu(null);
              }}
            >
              {sorted.find((v) => v.id === contextMenu.viewId)?.is_locked
                ? <><Unlock size={12} className="text-[#9AA2AF]" /> Unlock view</>
                : <><Lock size={12} className="text-[#9AA2AF]" /> Lock view</>
              }
            </button>
            <div className="h-px bg-[#E5E5E5] my-0.5" />
            <button
              className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-red-50 flex items-center gap-2 text-red-500"
              onClick={() => {
                if (!activeTableId) return;
                const view = sorted.find((v) => v.id === contextMenu.viewId);
                if (view?.is_default) return;
                deleteView.mutate({ id: contextMenu.viewId, table_id: activeTableId });
                if (activeViewId === contextMenu.viewId) {
                  const fallback = sorted.find((v) => v.id !== contextMenu.viewId);
                  if (fallback) loadViewConfig(fallback.id);
                }
                setContextMenu(null);
              }}
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </>
      )}
    </>
  );
}
