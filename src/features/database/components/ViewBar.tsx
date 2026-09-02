import { useMemo } from 'react';
import { Grid3X3, LayoutGrid, Columns3, FileText, Calendar, Plus } from 'lucide-react';
import { useDatabaseUI } from '../lib/store';
import { useViews, useCreateView } from '../hooks';

const VIEW_ICONS: Record<string, typeof Grid3X3> = {
  grid: Grid3X3,
  kanban: Columns3,
  gallery: LayoutGrid,
  form: FileText,
  calendar: Calendar,
};

export function ViewBar() {
  const { activeTableId, activeViewId, setActiveView } = useDatabaseUI();
  const { data: views } = useViews(activeTableId);
  const createView = useCreateView();

  const sorted = useMemo(
    () => (views ?? []).slice().sort((a, b) => a.position - b.position),
    [views],
  );

  const handleAddView = (type: 'grid' | 'kanban' | 'gallery' | 'form' | 'calendar') => {
    if (!activeTableId) return;
    createView.mutate({
      table_id: activeTableId,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} view`,
      type,
      position: (views?.length ?? 0) + 1,
    });
  };

  return (
    <div
      className="flex items-center gap-0.5 px-2 shrink-0 overflow-x-auto"
      style={{
        height: 34,
        borderBottom: '1px solid #E7E7E9',
        backgroundColor: '#FAFAFA',
      }}
    >
      {sorted.map((v) => {
        const Icon = VIEW_ICONS[v.type] ?? Grid3X3;
        const isActive = v.id === activeViewId;
        return (
          <button
            key={v.id}
            onClick={() => setActiveView(v.id)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] font-medium whitespace-nowrap transition-colors"
            style={{
              color: isActive ? '#3366FF' : '#6A7184',
              backgroundColor: isActive ? '#EBF0FF' : 'transparent',
            }}
          >
            <Icon size={13} />
            {v.name}
          </button>
        );
      })}
      <button
        onClick={() => handleAddView('grid')}
        className="flex items-center gap-1 px-2 py-1 rounded text-[12px] hover:bg-gray-100 whitespace-nowrap"
        style={{ color: '#9AA2AF' }}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
