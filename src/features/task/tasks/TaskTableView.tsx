import { Input } from '@/components/ui/input';
import { StatusPill } from '../components/StatusPill';
import { PriorityFlag } from '../components/PriorityFlag';
import { AvatarStack } from '../components/AvatarStack';
import { TaskDatePicker } from '../components/TaskDatePicker';
import type { TaskStatus } from '../api/statuses';
import type { TaskPriority, TaskRow } from '../api/tasks';

const COLUMNS = ['Title', 'Status', 'Priority', 'Assignees', 'Start', 'Due'];

export function TaskTableView({
  tasks,
  statuses,
  onOpenTask,
  onUpdateTask,
}: {
  tasks: TaskRow[];
  statuses: TaskStatus[];
  onOpenTask: (id: string) => void;
  onUpdateTask: (taskId: string, patch: Record<string, unknown>) => void;
}) {
  const statusesById = new Map(statuses.map((s) => [s.id, s]));

  return (
    <div className="overflow-auto h-full border border-border rounded-md">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border">
            {COLUMNS.map((c) => (
              <th key={c} className="text-left text-2xs font-bold uppercase text-muted-foreground px-2.5 py-2 border-r border-border last:border-r-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-border hover:bg-muted/30 kd-transition">
              <td className="px-1 border-r border-border">
                <Input
                  defaultValue={task.title}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== task.title) onUpdateTask(task.id, { title: v });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="h-8 border-none shadow-none focus-visible:ring-1 text-sm"
                />
              </td>
              <td className="px-2.5 py-1 border-r border-border">
                <StatusPill
                  status={statusesById.get(task.status_id ?? '')}
                  statuses={statuses}
                  onChange={(statusId) => onUpdateTask(task.id, { status_id: statusId })}
                />
              </td>
              <td className="px-2.5 py-1 border-r border-border">
                <PriorityFlag priority={task.priority} onChange={(p: TaskPriority) => onUpdateTask(task.id, { priority: p })} />
              </td>
              <td className="px-2.5 py-1 border-r border-border">
                <AvatarStack people={task.assignees} size={20} />
              </td>
              <td className="px-2.5 py-1 border-r border-border">
                <TaskDatePicker value={task.start_date} onChange={(d) => onUpdateTask(task.id, { start_date: d })} />
              </td>
              <td className="px-2.5 py-1">
                <div className="flex items-center justify-between gap-2">
                  <TaskDatePicker value={task.due_date} onChange={(d) => onUpdateTask(task.id, { due_date: d })} />
                  <button onClick={() => onOpenTask(task.id)} className="text-2xs text-muted-foreground hover:text-primary">Open</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tasks.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No tasks match.</p>
      )}
    </div>
  );
}
