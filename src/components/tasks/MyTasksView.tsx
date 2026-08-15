import { useMemo, useState } from 'react';
import {
  CheckCircle2, Clock, Calendar, Flag, ChevronDown, ChevronRight,
  MessageSquare, Layers, AlertTriangle, CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, daysUntil } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import type { Task, TaskStatus, ProfileRow, Tag } from '@/lib/task-types';
import { STATUS_DOT } from '@/lib/task-types';

interface MyTasksViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  currentUserId?: string;
  onTaskClick: (task: Task) => void;
  commentCounts: Map<string, number>;
}

type TabKey = 'todo' | 'done' | 'delegated';

export function MyTasksView({
  tasks, profiles, availableTags, subtaskCounts,
  currentUserId, onTaskClick, commentCounts,
}: MyTasksViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('todo');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const myTasks = useMemo(() => {
    return tasks.filter((t) =>
      t.assignee_id === currentUserId || t.created_by === currentUserId,
    );
  }, [tasks, currentUserId]);

  const todoTasks = useMemo(() =>
    myTasks.filter((t) => t.assignee_id === currentUserId && t.status !== 'complete'),
  [myTasks, currentUserId]);

  const doneTasks = useMemo(() =>
    myTasks.filter((t) => t.assignee_id === currentUserId && t.status === 'complete'),
  [myTasks, currentUserId]);

  const delegatedTasks = useMemo(() =>
    myTasks.filter((t) => t.created_by === currentUserId && t.assignee_id !== currentUserId && t.assignee_id),
  [myTasks, currentUserId]);

  const groupedTodo = useMemo(() => {
    const overdue: Task[] = [];
    const today: Task[] = [];
    const tomorrow: Task[] = [];
    const thisWeek: Task[] = [];
    const nextWeek: Task[] = [];
    const later: Task[] = [];
    const noDate: Task[] = [];

    for (const t of todoTasks) {
      if (!t.due_date) { noDate.push(t); continue; }
      const d = daysUntil(t.due_date);
      if (d === null) { noDate.push(t); continue; }
      if (d < 0) overdue.push(t);
      else if (d === 0) today.push(t);
      else if (d === 1) tomorrow.push(t);
      else if (d <= 7) thisWeek.push(t);
      else if (d <= 14) nextWeek.push(t);
      else later.push(t);
    }

    overdue.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0));
    thisWeek.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0));
    nextWeek.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0));
    later.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0));

    return { overdue, today, tomorrow, thisWeek, nextWeek, later, noDate };
  }, [todoTasks]);

  // Group delegated tasks by assignee
  const delegatedByAssignee = useMemo(() => {
    const map = new Map<string, { name: string; tasks: Task[] }>();
    for (const t of delegatedTasks) {
      if (!t.assignee_id) continue;
      if (!map.has(t.assignee_id)) {
        const p = profiles.get(t.assignee_id);
        map.set(t.assignee_id, { name: p?.full_name ?? 'Unknown', tasks: [] });
      }
      map.get(t.assignee_id)!.tasks.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [delegatedTasks, profiles]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'todo', label: 'To Do', count: todoTasks.length },
    { key: 'done', label: 'Done', count: doneTasks.length },
    { key: 'delegated', label: 'Delegated', count: delegatedTasks.length },
  ];

  const todoGroups: { key: string; title: string; icon: typeof Calendar; iconColor: string; tasks: Task[]; highlight?: 'destructive' }[] = [
    { key: 'overdue', title: 'Overdue', icon: AlertTriangle, iconColor: 'text-destructive', tasks: groupedTodo.overdue, highlight: 'destructive' },
    { key: 'today', title: 'Today', icon: Calendar, iconColor: 'text-blue-500', tasks: groupedTodo.today },
    { key: 'tomorrow', title: 'Tomorrow', icon: CalendarDays, iconColor: 'text-blue-400', tasks: groupedTodo.tomorrow },
    { key: 'thisWeek', title: 'This Week', icon: Clock, iconColor: 'text-indigo-500', tasks: groupedTodo.thisWeek },
    { key: 'nextWeek', title: 'Next Week', icon: Clock, iconColor: 'text-muted-foreground', tasks: groupedTodo.nextWeek },
    { key: 'later', title: 'Later', icon: Layers, iconColor: 'text-muted-foreground/70', tasks: groupedTodo.later },
    { key: 'noDate', title: 'No Due Date', icon: Layers, iconColor: 'text-muted-foreground/50', tasks: groupedTodo.noDate },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border/60">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px',
              activeTab === tab.key
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border',
            )}
          >
            {tab.label}
            <span className={cn(
              'ml-2 text-[11px] tabular-nums rounded-full px-1.5 py-0.5',
              activeTab === tab.key ? 'bg-primary/10' : 'bg-muted',
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* To Do content */}
      {activeTab === 'todo' && (
        <div className="space-y-2">
          {todoGroups.map((group) => group.tasks.length > 0 && (
            <TaskGroup
              key={group.key}
              title={group.title}
              icon={group.icon}
              iconColor={group.iconColor}
              count={group.tasks.length}
              tasks={group.tasks}
              collapsed={collapsedGroups.has(group.key)}
              onToggle={() => toggleGroup(group.key)}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onTaskClick={onTaskClick}
              highlight={group.highlight as any}
            />
          ))}
          {todoTasks.length === 0 && (
            <EmptyState
              illustration="plane"
              title="You're all caught up"
              description="No open tasks assigned to you. Enjoy the peace."
              tone="success"
            />
          )}
        </div>
      )}

      {/* Done content */}
      {activeTab === 'done' && (
        <div className="space-y-1">
          {doneTasks.length === 0 ? (
            <EmptyState
              illustration="radar"
              title="No completed tasks"
              description="Tasks you complete will appear here."
              tone="default"
              compact
            />
          ) : doneTasks.slice(0, 50).map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </div>
      )}

      {/* Delegated content */}
      {activeTab === 'delegated' && (
        <div className="space-y-3">
          {delegatedTasks.length === 0 ? (
            <EmptyState
              illustration="radar"
              title="No delegated tasks"
              description="When you assign tasks to others, they'll appear here so you can track progress."
              tone="primary"
            />
          ) : delegatedByAssignee.map((group) => (
            <TaskGroup
              key={group.name}
              title={group.name}
              icon={Flag}
              iconColor="text-primary"
              count={group.tasks.length}
              tasks={group.tasks}
              collapsed={collapsedGroups.has(`del-${group.name}`)}
              onToggle={() => toggleGroup(`del-${group.name}`)}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onTaskClick={onTaskClick}
              showAssignee
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskGroup({
  title, icon: Icon, iconColor, count, tasks, collapsed, onToggle,
  profiles, availableTags, subtaskCounts, commentCounts, onTaskClick,
  highlight, showAssignee,
}: {
  title: string;
  icon: typeof Calendar;
  iconColor: string;
  count: number;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onTaskClick: (task: Task) => void;
  highlight?: 'destructive';
  showAssignee?: boolean;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm font-semibold transition-colors',
          'hover:bg-muted/50',
          highlight === 'destructive' && 'text-destructive',
        )}
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
        <span>{title}</span>
        <span className={cn(
          'text-[11px] tabular-nums ml-1 rounded-full px-1.5 py-0.5',
          highlight === 'destructive' ? 'bg-destructive/10' : 'bg-muted',
        )}>
          {count}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5 mt-1">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onClick={() => onTaskClick(task)}
              showAssignee={showAssignee}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task, profiles, availableTags, subtaskCounts, commentCounts, onClick, showAssignee,
}: {
  task: Task;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  subtaskCounts: Map<string, { total: number; done: number }>;
  commentCounts: Map<string, number>;
  onClick: () => void;
  showAssignee?: boolean;
}) {
  const d = task.due_date ? daysUntil(task.due_date) : null;
  const overdue = task.status !== 'complete' && d !== null && d < 0;
  const sc = subtaskCounts.get(task.id);
  const cc = commentCounts.get(task.id) ?? 0;
  const assignee = task.assignee_id ? profiles.get(task.assignee_id) : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left transition-all group',
        'hover:bg-muted/60',
        task.status === 'complete' && 'opacity-60',
      )}
    >
      {/* Status dot */}
      <div className={cn('h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background', STATUS_DOT[task.status])} />

      {/* Title + tags */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-medium truncate',
            task.status === 'complete' && 'line-through text-muted-foreground',
          )}>
            {task.title}
          </span>
          {task.tags && task.tags.length > 0 && (
            <div className="hidden sm:flex items-center gap-1 shrink-0">
              {task.tags.slice(0, 2).map((tagId) => {
                const tag = availableTags.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                  <span key={tagId} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                    style={tag.color ? { backgroundColor: `${tag.color}15`, color: tag.color } : undefined}>
                    {tag.name}
                  </span>
                );
              })}
              {task.tags.length > 2 && <span className="text-[9px] text-muted-foreground">+{task.tags.length - 2}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 shrink-0">
        {sc && sc.total > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            <CheckCircle2 className="h-3 w-3 inline mr-0.5" />{sc.done}/{sc.total}
          </span>
        )}

        {cc > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            <MessageSquare className="h-3 w-3 inline mr-0.5" />{cc}
          </span>
        )}

        {showAssignee && assignee && (
          <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span className="text-[7px] font-bold leading-none">
              {assignee.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
            </span>
          </div>
        )}

        {/* Priority dot */}
        <div className={cn(
          'h-1.5 w-1.5 rounded-full shrink-0',
          task.priority === 'critical' && 'bg-red-500',
          task.priority === 'high' && 'bg-orange-400',
          task.priority === 'normal' && 'bg-blue-400',
          task.priority === 'low' && 'bg-slate-300 dark:bg-slate-600',
        )} />

        {/* Due date */}
        {task.due_date && (
          <span className={cn(
            'text-[11px] tabular-nums shrink-0',
            overdue ? 'text-destructive font-medium' : 'text-muted-foreground',
          )}>
            {overdue
              ? `${Math.abs(d!)}d late`
              : d === 0 ? 'Today'
              : d === 1 ? 'Tomorrow'
              : formatDate(task.due_date)}
          </span>
        )}
      </div>
    </button>
  );
}
