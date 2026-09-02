import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Grid3X3, LayoutGrid, Columns3, FileText, Calendar, Plus, Pencil, Trash2, Copy, Lock, Unlock } from 'lucide-react';
import { useDatabaseUI } from '../lib/store';
import { useViews, useCreateView, useUpdateView, useDeleteView, useLoadViewConfig } from '../hooks';

const VIEW_ICONS: Record<string, typeof Grid3X3> = {
  grid: Grid3X3,
  kanban: Columns3,
  gallery: LayoutGrid,
  form: FileText,
  calendar: Calendar,
};

const VIEW_TYPE_OPTIONS: Array<{ type: 'grid' | 'kanban' | 'gallery' | 'form' | 'calendar'; label: string }> = [
  { type: 'grid', label: 'Grid' },
  { type: 'kanban', label: 'Kanban' },
  { type: 'gallery', label: 'Gallery' },
  { type: 'form', label: 'Form' },
  { type: 'calendar', label: 'Calendar' },
];

export function ViewBar() {
  const { activeTableId, activeViewId, setActiveView } = useDatabaseUI();
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

  const handleAddView = useCallback(
    (type: 'grid' | 'kanban' | 'gallery' | 'form' | 'calendar') => {
      if (!activeTableId) return;
      createView.mutate({
        table_id: activeTableId,
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} view`,
        type,
        position: (views?.length ?? 0) + 1,
      });
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
        className="flex items-center gap-0.5 px-2 shrink-0 overflow-x-auto dark:bg-[hsl(200,30%,8%)] dark:border-[hsl(200,25%,18%)]"
        style={{
          height: 34,
          borderBottom: '1px solid #E7E7E9',
          backgroundColor: '#FAFAFA',
        }}
      >
        {sorted.map((v) => {
          const Icon = VIEW_ICONS[v.type] ?? Grid3X3;
          const isActive = v.id === activeViewId;

          if (renamingId === v.id) {
            return (
              <div key={v.id} className="flex items-center gap-1">
                <input
                  ref={renameRef}
                  className="h-6 w-28 px-1.5 text-[12px] border border-[#3366FF] rounded outline-none"
                  value={renameText}
                  onChange={(e) => setRenameText(e.target.value)}
                  onBlur={() => handleRename(v.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(v.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                />
              </div>
            );
          }

          return (
            <button
              key={v.id}
              onClick={() => loadViewConfig(v.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, viewId: v.id });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium whitespace-nowrap transition-colors"
              style={{
                color: isActive ? '#3366FF' : '#6A7184',
                backgroundColor: isActive ? '#EBF0FF' : 'transparent',
              }}
            >
              <Icon size={13} />
              {v.name}
              {v.is_locked && <Lock size={10} className="text-[#9AA2AF] ml-0.5" />}
            </button>
          );
        })}

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
              <div className="absolute left-0 top-full z-50 mt-1 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg py-1 min-w-[160px]">
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
            className="fixed z-50 bg-white dark:bg-[hsl(200,30%,10%)] border border-[#E7E7E9] dark:border-[hsl(200,25%,18%)] rounded-lg shadow-lg py-1 min-w-[140px]"
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
            <div className="h-px bg-[#E7E7E9] my-0.5" />
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
