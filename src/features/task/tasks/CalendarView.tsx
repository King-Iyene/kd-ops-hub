import { useMemo, useState } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import type { TaskRow } from '../api/tasks';

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeekMonday(d: Date): Date {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - diff);
  return day;
}

function TaskChip({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        'text-2xs px-1.5 py-0.5 rounded bg-primary/10 text-primary truncate cursor-grab mb-0.5',
        isDragging && 'opacity-40',
      )}
      title={task.title}
    >
      {task.title}
    </div>
  );
}

function DayCell({ date, tasks, muted, onOpenTask }: { date: Date; tasks: TaskRow[]; muted: boolean; onOpenTask: (id: string) => void }) {
  const dateKey = toLocalDateString(date);
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const isToday = toLocalDateString(new Date()) === dateKey;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'border border-border/60 p-1.5 min-h-[90px] flex flex-col kd-transition',
        muted && 'bg-muted/20',
        isOver && 'bg-primary/5',
      )}
    >
      <span className={cn('text-2xs font-medium mb-1', isToday ? 'text-primary font-bold' : muted ? 'text-muted-foreground/50' : 'text-muted-foreground')}>
        {date.getDate()}
      </span>
      <div className="flex-1 overflow-y-auto">
        {tasks.map((t) => <TaskChip key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />)}
      </div>
    </div>
  );
}

export function CalendarView({
  tasks,
  onOpenTask,
  onReschedule,
}: {
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
  onReschedule: (taskId: string, date: string) => void;
}) {
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(new Date());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = t.due_date;
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [tasks]);

  const unscheduled = tasks.filter((t) => !t.due_date);

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeekMonday(anchor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return { date: d, muted: false };
      });
    }
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeekMonday(monthStart);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      return { date: d, muted: d.getMonth() !== anchor.getMonth() };
    });
  }, [mode, anchor]);

  const navigate = (dir: 1 | -1) => {
    const next = new Date(anchor);
    if (mode === 'week') next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    onReschedule(active.id as string, over.id as string);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate(1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          <span className="text-sm font-semibold text-foreground">
            {anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-2xs" onClick={() => setAnchor(new Date())}>Today</Button>
        </div>
        <div className="flex items-center gap-2">
          <Toggle pressed={mode === 'week'} onPressedChange={(p) => setMode(p ? 'week' : 'month')} size="sm" className="h-7 text-2xs">
            Week
          </Toggle>
          <Button variant="outline" size="sm" className="h-7 text-2xs" onClick={() => setDrawerOpen((o) => !o)}>
            <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" /> Unscheduled ({unscheduled.length})
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-7 shrink-0">
            {WEEKDAY_SHORT.map((d) => (
              <div key={d} className="text-2xs font-bold uppercase text-muted-foreground text-center py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 flex-1 overflow-y-auto">
            {days.map(({ date, muted }) => (
              <DayCell
                key={toLocalDateString(date)}
                date={date}
                tasks={tasksByDate.get(toLocalDateString(date)) ?? []}
                muted={muted}
                onOpenTask={onOpenTask}
              />
            ))}
          </div>
        </div>

        {drawerOpen && (
          <div className="w-56 shrink-0 border-l border-border pl-3 overflow-y-auto">
            <p className="text-2xs font-bold uppercase text-muted-foreground mb-2">Unscheduled</p>
            {unscheduled.map((t) => <TaskChip key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />)}
            {unscheduled.length === 0 && <p className="text-2xs text-muted-foreground">Nothing unscheduled.</p>}
          </div>
        )}
      </div>
    </DndContext>
  );
}
