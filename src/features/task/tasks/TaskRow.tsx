import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { StatusDot } from '../components/StatusDot';
import { PriorityFlag } from '../components/PriorityFlag';
import { DueDate } from '../components/DueDate';
import { AvatarStack } from '../components/AvatarStack';
import type { TaskRow as TaskRowData } from '../api/tasks';
import type { TaskStatus } from '../api/statuses';

export function TaskRow({
  task,
  status,
  selected,
  onToggleSelect,
  onOpen,
}: {
  task: TaskRowData;
  status: TaskStatus | undefined;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 kd-transition cursor-pointer',
        isDragging && 'opacity-50',
        selected && 'bg-primary/5',
      )}
      onClick={onOpen}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'text-muted-foreground cursor-grab shrink-0 kd-transition',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        aria-label="Drag to move"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span
        onClick={(e) => e.stopPropagation()}
        className={cn('shrink-0 kd-transition', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
      >
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={`Select ${task.title}`} />
      </span>
      <PriorityFlag priority={task.priority === 'normal' ? null : task.priority} disabled />
      {status && <StatusDot color={status.color} />}
      <span className="flex-1 text-sm text-foreground truncate">{task.title}</span>
      <div className="flex items-center gap-3 shrink-0">
        <DueDate dueDate={task.due_date} hasTime={task.due_has_time} />
        <AvatarStack people={task.assignees} size={20} />
      </div>
    </div>
  );
}
