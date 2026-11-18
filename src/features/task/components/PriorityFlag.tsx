import { Flag } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { taskTheme } from '../theme/taskTheme';
import type { TaskPriority } from '../api/tasks';

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

function colorFor(priority: TaskPriority | null): string {
  if (!priority) return taskTheme.priority.none;
  return taskTheme.priority[priority];
}

export function PriorityFlag({
  priority,
  onChange,
  disabled,
  className,
}: {
  priority: TaskPriority | null;
  onChange?: (priority: TaskPriority) => void;
  disabled?: boolean;
  className?: string;
}) {
  const color = colorFor(priority);
  const icon = <Flag className={cn('h-3.5 w-3.5 shrink-0', className)} style={{ color }} fill={priority ? color : 'none'} />;

  if (disabled || !onChange) {
    return <span title={priority ? PRIORITY_LABEL[priority] : 'No priority'}>{icon}</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Priority" title={priority ? PRIORITY_LABEL[priority] : 'No priority'}>
          {icon}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
          <DropdownMenuItem key={p} onSelect={() => onChange(p)} className="gap-2">
            <Flag className="h-3.5 w-3.5" style={{ color: taskTheme.priority[p] }} fill={taskTheme.priority[p]} />
            {PRIORITY_LABEL[p]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
