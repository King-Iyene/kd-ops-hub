import { useMemo, useState } from 'react';
import {
  CheckCircle2, Clock, Flag, MessageSquare, ChevronDown,
  ChevronRight, GripVertical, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, daysUntil } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { Task, TaskStatus, ProfileRow, Tag } from '@/lib/task-types';
import { STATUSES, STATUS_DOT, PRIORITY_CLASS, STATUS_CLASS } from '@/lib/task-types';

type GroupBy = 'status' | 'priority' | 'assignee' | 'none';

interface TaskListViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onTaskClick: (task: Task) => void;
}

const STATUS_ORDER: TaskStatus[] = ['open', 'in_progress', 'blocked', 'complete'];
const PRIORITY_ORDER = ['critical', 'high', 'normal', 'low'] as const;

const STATUS_ACCENT: Record<TaskStatus, string> = {
  open: 'bg-slate-500',
  in_progress: 'bg-blue-500',
  blocked: 'bg-red-500',
  complete: 'bg-emerald-500',
};

export function TaskListView({
  tasks, profiles, availableTags, subtaskCounts, commentCounts, onTaskClick,
}: TaskListViewProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('status');

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: 'All Tasks', accent: 'bg-primary', tasks }];
    }

    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      let key: string;
      if (groupBy === 'status') key = t.status;
      else if (groupBy === 'priority') key = t.priority;
      else key = t.assignee_id || '__unassigned';
      const list = map.get(key) || [];
      list.push(t);
      map.set(key, list);
    }

    if (groupBy === 'status') {
      return STATUS_ORDER.filter((s) => map.has(s)).map((s) => ({
        key: s,
        label: STATUSES.find((st) => st.value === s)?.label ?? s,
        accent: STATUS_ACCENT[s],
        tasks: map.get(s)!,
      }));
    }

    if (groupBy === 'priority') {
      return PRIORITY_ORDER.filter((p) => map.has(p)).map((p) => ({
        key: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
        accent: p === 'critical' ? 'bg-red-500' : p === 'high' ? 'bg-orange-400' : p === 'normal' ? 'bg-blue-400' : 'bg-slate-400',
        tasks: map.get(p)!,
      }));
    }

    const sortedKeys = Array.from(map.keys()).sort((a, b) => {
      if (a === '__unassigned') return 1;
      if (b === '__unassigned') return -1;
      const na = profiles.get(a)?.full_name ?? '';
      const nb = profiles.get(b)?.full_name ?? '';
      return na.localeCompare(nb);
    });

    return sortedKeys.map((uid) => ({
      key: uid,
      label: uid === '__unassigned' ? 'Unassigned' : (profiles.get(uid)?.full_name ?? 'Unknown'),
      accent: 'bg-primary',
      tasks: map.get(uid)!,
    }));
  }, [tasks, groupBy, profiles]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-xs text-muted-foreground">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="assignee">Assignee</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No tasks to display.
        </div>
      ) : (
        groups.map((group) => (
          <ListGroup
            key={group.key}
            label={group.label}
            accent={group.accent}
            tasks={group.tasks}
            profiles={profiles}
            availableTags={availableTags}
            subtaskCounts={subtaskCounts}
            commentCounts={commentCounts}
            onTaskClick={onTaskClick}
            groupBy={groupBy}
          />
        ))
      )}
    </div>
  );
}

function ListGroup({
  label, accent, tasks, profiles, availableTags, subtaskCounts, commentCounts, onTaskClick, groupBy,
}: {
  label: string;
  accent: string;
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onTaskClick: (task: Task) => void;
  groupBy: GroupBy;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm font-semibold hover:bg-muted/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', accent)} />
        <span>{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground ml-1">
          {tasks.length}
        </span>
      </button>

      {!collapsed && (
        <div className="rounded-lg border border-border/60 overflow-hidden bg-card">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_120px_100px_100px_100px_80px] gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/30">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Task</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Assignee</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Due</span>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Priority</span>
            {groupBy !== 'status' && (
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
            )}
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Info</span>
          </div>

          {/* Rows */}
          {tasks.map((task) => (
            <ListRow
              key={task.id}
              task={task}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onClick={() => onTaskClick(task)}
              showStatus={groupBy !== 'status'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListRow({
  task, profiles, availableTags, subtaskCounts, commentCounts, onClick, showStatus,
}: {
  task: Task;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onClick: () => void;
  showStatus: boolean;
}) {
  const assignee = task.assignee_id ? profiles.get(task.assignee_id) : null;
  const d = task.due_date ? daysUntil(task.due_date) : null;
  const overdue = task.status !== 'complete' && d !== null && d < 0;
  const sc = subtaskCounts.get(task.id);
  const cc = commentCounts.get(task.id) ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'grid grid-cols-[1fr_120px_100px_100px_100px_80px] gap-2 w-full px-3 py-2.5 text-left transition-all',
        'hover:bg-muted/40 border-b border-border/20 last:border-b-0 group',
        task.status === 'complete' && 'opacity-50',
      )}
    >
      {/* Task name + tags */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[task.status])} />
        <span className={cn(
          'text-sm font-medium truncate',
          task.status === 'complete' && 'line-through text-muted-foreground',
        )}>
          {task.title}
        </span>
        {task.tags && task.tags.length > 0 && (
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {task.tags.slice(0, 2).map((tagId) => {
              const tag = availableTags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <span key={tagId} className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                  style={tag.color ? { backgroundColor: `${tag.color}15`, color: tag.color } : undefined}>
                  {tag.name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Assignee */}
      <div className="flex items-center gap-1.5 min-w-0">
        {assignee ? (
          <>
            <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="text-[7px] font-bold leading-none">
                {assignee.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground truncate">{assignee.full_name.split(' ')[0]}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Due date */}
      <div>
        {task.due_date ? (
          <span className={cn(
            'text-xs tabular-nums',
            overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}>
            {overdue
              ? `${Math.abs(d!)}d late`
              : d === 0 ? 'Today'
              : d === 1 ? 'Tomorrow'
              : formatDate(task.due_date)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </div>

      {/* Priority */}
      <div>
        <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', PRIORITY_CLASS[task.priority])}>
          {task.priority}
        </Badge>
      </div>

      {/* Status */}
      {showStatus && (
        <div>
          <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', STATUS_CLASS[task.status])}>
            {task.status.replace('_', ' ')}
          </Badge>
        </div>
      )}

      {/* Info (subtasks + comments) */}
      <div className="flex items-center gap-2 justify-end">
        {sc && sc.total > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
            <CheckCircle2 className="h-3 w-3" />{sc.done}/{sc.total}
          </span>
        )}
        {cc > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />{cc}
          </span>
        )}
      </div>
    </button>
  );
}
