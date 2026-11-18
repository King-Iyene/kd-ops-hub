import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { GroupHeader } from './GroupHeader';
import { TaskRow } from './TaskRow';
import { AddTaskInlineRow } from './AddTaskInlineRow';
import type { TaskStatus } from '../api/statuses';
import type { TaskRow as TaskRowData } from '../api/tasks';

export function TaskGroupSection({
  status,
  tasks,
  collapsed,
  onToggleCollapse,
  onOpenTask,
  onAddTask,
}: {
  status: TaskStatus;
  tasks: TaskRowData[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenTask: (taskId: string) => void;
  onAddTask: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id });

  return (
    <div ref={setNodeRef} className={cn('mb-1 rounded-md kd-transition', isOver && 'bg-primary/5')}>
      <GroupHeader status={status} count={tasks.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      {!collapsed && (
        <div className="pl-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} status={status} onOpen={() => onOpenTask(task.id)} />
          ))}
          <AddTaskInlineRow onAdd={onAddTask} />
        </div>
      )}
    </div>
  );
}
