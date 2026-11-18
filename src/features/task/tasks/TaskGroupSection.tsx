import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { GroupHeader } from './GroupHeader';
import { TaskRow } from './TaskRow';
import { AddTaskInlineRow } from './AddTaskInlineRow';
import type { TaskStatus } from '../api/statuses';
import type { TaskRow as TaskRowData } from '../api/tasks';

export interface TaskGroupDef {
  key: string;
  label: string;
  color?: string;
}

export function TaskGroupSection({
  group,
  tasks,
  statusesById,
  collapsed,
  selectedIds,
  droppable,
  onToggleCollapse,
  onToggleSelect,
  onOpenTask,
  onAddTask,
}: {
  group: TaskGroupDef;
  tasks: TaskRowData[];
  statusesById: Map<string, TaskStatus>;
  collapsed: boolean;
  selectedIds: Set<string>;
  /** Cross-group drag only has a defined meaning when grouped by status
   *  (master prompt section 7.3's Phase 3 line: "drag between groups"). */
  droppable: boolean;
  onToggleCollapse: () => void;
  onToggleSelect: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onAddTask: (title: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: group.key, disabled: !droppable });

  return (
    <div ref={setNodeRef} className={cn('mb-1 rounded-md kd-transition', droppable && isOver && 'bg-primary/5')}>
      <GroupHeader label={group.label} color={group.color} count={tasks.length} collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
      {!collapsed && (
        <div className="pl-1">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              status={task.status_id ? statusesById.get(task.status_id) : undefined}
              selected={selectedIds.has(task.id)}
              onToggleSelect={() => onToggleSelect(task.id)}
              onOpen={() => onOpenTask(task.id)}
            />
          ))}
          <AddTaskInlineRow onAdd={onAddTask} />
        </div>
      )}
    </div>
  );
}
