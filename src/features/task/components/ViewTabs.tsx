import { List as ListIcon, LayoutGrid, Calendar as CalendarIcon, Table2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TaskView, TaskViewType } from '../api/views';

const VIEW_ICON: Record<TaskViewType, typeof ListIcon> = {
  list: ListIcon,
  board: LayoutGrid,
  calendar: CalendarIcon,
  table: Table2,
  grid: Table2,
};

export function ViewTabs({
  views,
  activeId,
  onSelect,
  onCreate,
}: {
  views: TaskView[];
  activeId: string | undefined;
  onSelect: (viewId: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5">
      {views.map((v) => {
        const Icon = VIEW_ICON[v.type];
        const active = v.id === activeId;
        return (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium kd-transition',
              active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" /> {v.name}
          </button>
        );
      })}
      <button
        onClick={onCreate}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground kd-transition"
      >
        <Plus className="h-3.5 w-3.5" /> View
      </button>
    </div>
  );
}
