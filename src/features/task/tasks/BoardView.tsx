import { useMemo } from 'react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { StatusDot } from '../components/StatusDot';
import { PriorityFlag } from '../components/PriorityFlag';
import { DueDate } from '../components/DueDate';
import { AvatarStack } from '../components/AvatarStack';
import { AddTaskInlineRow } from './AddTaskInlineRow';
import type { TaskStatus } from '../api/statuses';
import type { TaskRow } from '../api/tasks';

export type BoardGroupBy = 'status' | 'assignee' | 'priority';

const PRIORITY_COLUMNS = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'normal', label: 'Normal' },
  { key: 'low', label: 'Low' },
];

interface Column {
  key: string;
  label: string;
  color?: string;
}

function BoardCard({ task, onOpen }: { task: TaskRow; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={onOpen}
      className={cn(
        'rounded-md border border-border bg-card p-2.5 mb-2 cursor-pointer hover:border-primary/40 kd-transition',
        isDragging && 'opacity-50',
      )}
    >
      <p className="text-sm text-foreground break-words mb-2">{task.title}</p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PriorityFlag priority={task.priority === 'normal' ? null : task.priority} disabled />
          <DueDate dueDate={task.due_date} hasTime={task.due_has_time} />
        </div>
        <AvatarStack people={task.assignees} size={18} />
      </div>
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  onOpenTask,
  onAddTask,
}: {
  column: Column;
  tasks: TaskRow[];
  onOpenTask: (id: string) => void;
  onAddTask: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <div className="w-[260px] shrink-0 flex flex-col">
      <div className="flex items-center gap-2 px-1 py-2">
        {column.color && <StatusDot color={column.color} />}
        <span className="text-2xs font-bold uppercase tracking-wide text-foreground">{column.label}</span>
        <span className="text-2xs text-muted-foreground">{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex-1 rounded-md p-1 min-h-[80px] overflow-y-auto kd-transition', isOver && 'bg-primary/5')}>
        {tasks.map((t) => <BoardCard key={t.id} task={t} onOpen={() => onOpenTask(t.id)} />)}
        <AddTaskInlineRow onAdd={onAddTask} />
      </div>
    </div>
  );
}

export function BoardView({
  tasks,
  statuses,
  groupBy,
  onOpenTask,
  onAddTask,
  onMoveTask,
}: {
  tasks: TaskRow[];
  statuses: TaskStatus[];
  groupBy: BoardGroupBy;
  onOpenTask: (id: string) => void;
  onAddTask: (columnKey: string, title: string) => void;
  onMoveTask: (taskId: string, columnKey: string) => void;
}) {
  const columns: Column[] = useMemo(() => {
    if (groupBy === 'priority') return PRIORITY_COLUMNS;
    if (groupBy === 'assignee') {
      const seen = new Map<string, string>();
      for (const t of tasks) for (const a of t.assignees) seen.set(a.user_id, a.full_name);
      const cols = [...seen.entries()].map(([key, label]) => ({ key, label }));
      return [{ key: 'unassigned', label: 'Unassigned' }, ...cols];
    }
    return [...statuses].sort((a, b) => a.position - b.position).map((s) => ({ key: s.id, label: s.name, color: s.color }));
  }, [groupBy, statuses, tasks]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const c of columns) map.set(c.key, []);
    for (const t of tasks) {
      let key: string | undefined;
      if (groupBy === 'priority') key = t.priority;
      else if (groupBy === 'assignee') key = t.assignees[0]?.user_id ?? 'unassigned';
      else key = t.status_id ?? undefined;
      if (key && map.has(key)) map.get(key)!.push(t);
    }
    return map;
  }, [tasks, columns, groupBy]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    onMoveTask(active.id as string, over.id as string);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto h-full pb-2">
        {columns.map((c) => (
          <BoardColumn
            key={c.key}
            column={c}
            tasks={tasksByColumn.get(c.key) ?? []}
            onOpenTask={onOpenTask}
            onAddTask={(title) => onAddTask(c.key, title)}
          />
        ))}
      </div>
    </DndContext>
  );
}
