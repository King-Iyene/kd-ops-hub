import { useMemo, useState } from 'react';
import {
  CheckCircle2, Clock, Calendar, Flag, ChevronDown, ChevronRight,
  MessageSquare, Layers, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, daysUntil } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import type { Task, TaskStatus, ProfileRow, Tag } from '@/lib/task-types';
import { PRIORITY_CLASS, STATUS_CLASS, STATUS_DOT } from '@/lib/task-types';

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
    const today: Task[] = [];
    const overdue: Task[] = [];
    const next: Task[] = [];
    const noDate: Task[] = [];

    for (const t of todoTasks) {
      if (!t.due_date) { noDate.push(t); continue; }
      const d = daysUntil(t.due_date);
      if (d === null) { noDate.push(t); continue; }
      if (d < 0) overdue.push(t);
      else if (d === 0) today.push(t);
      else next.push(t);
    }

    overdue.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0));
    next.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0));

    return { today, overdue, next, noDate };
  }, [todoTasks]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'todo', label: 'To Do', count: todoTasks.length },
    { key: 'done', label: 'Done', count: doneTasks.length },
    { key: 'delegated', label: 'Delegated', count: delegatedTasks.length },
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

      {/* Content */}
      {activeTab === 'todo' && (
        <div className="space-y-2">
          {groupedTodo.overdue.length > 0 && (
            <TaskGroup
              title="Overdue"
              icon={AlertTriangle}
              iconColor="text-destructive"
              count={groupedTodo.overdue.length}
              tasks={groupedTodo.overdue}
              collapsed={collapsedGroups.has('overdue')}
              onToggle={() => toggleGroup('overdue')}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onTaskClick={onTaskClick}
              highlight="destructive"
            />
          )}
          {groupedTodo.today.length > 0 && (
            <TaskGroup
              title="Today"
              icon={Calendar}
              iconColor="text-blue-500"
              count={groupedTodo.today.length}
              tasks={groupedTodo.today}
              collapsed={collapsedGroups.has('today')}
              onToggle={() => toggleGroup('today')}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onTaskClick={onTaskClick}
            />
          )}
          {groupedTodo.next.length > 0 && (
            <TaskGroup
              title="Next"
              icon={Clock}
              iconColor="text-muted-foreground"
              count={groupedTodo.next.length}
              tasks={groupedTodo.next}
              collapsed={collapsedGroups.has('next')}
              onToggle={() => toggleGroup('next')}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onTaskClick={onTaskClick}
            />
          )}
          {groupedTodo.noDate.length > 0 && (
            <TaskGroup
              title="No Date"
              icon={Layers}
              iconColor="text-muted-foreground/50"
              count={groupedTodo.noDate.length}
              tasks={groupedTodo.noDate}
              collapsed={collapsedGroups.has('noDate')}
              onToggle={() => toggleGroup('noDate')}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onTaskClick={onTaskClick}
            />
          )}
          {todoTasks.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              You're all caught up — no open tasks assigned to you.
            </div>
          )}
        </div>
      )}

      {activeTab === 'done' && (
        <div className="space-y-1">
          {doneTasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No completed tasks yet.</div>
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

      {activeTab === 'delegated' && (
        <div className="space-y-1">
          {delegatedTasks.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No delegated tasks. Assign tasks to team members to see them here.
            </div>
          ) : delegatedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCounts}
              onClick={() => onTaskClick(task)}
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
  highlight,
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
                  <span key={tagId} className="text-[9px] px-1.5 py-0.5 rounded font-medium"
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
        {/* Subtask count */}
        {sc && sc.total > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            <CheckCircle2 className="h-3 w-3 inline mr-0.5" />{sc.done}/{sc.total}
          </span>
        )}

        {/* Comment count */}
        {cc > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            <MessageSquare className="h-3 w-3 inline mr-0.5" />{cc}
          </span>
        )}

        {/* Assignee avatar (for delegated view) */}
        {showAssignee && assignee && (
          <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <span className="text-[7px] font-bold leading-none">
              {assignee.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
            </span>
          </div>
        )}

        {/* Priority */}
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
