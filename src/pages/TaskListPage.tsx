import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Home, Plus, Loader2, Flag, List as ListIcon, Columns3, Calendar, Table as TableIcon,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { formatDate } from '@/lib/format';
import { initialsOf } from '@/lib/name';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AvatarBubble } from '@/components/AvatarBubble';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { TaskDetailSheet } from '@/features/task-module/TaskDetailSheet';
import {
  useTaskLists,
  useTasks,
  useCreateTask,
  useAssignablePeople,
  TASK_STATUSES,
  STATUS_META,
  PRIORITY_META,
  type TaskRow,
  type TaskStatus,
} from '@/queries/useTaskModule';

type ViewMode = 'list' | 'board';

const TaskListPage = () => {
  const { listId } = useParams<{ listId: string }>();
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const { data: lists } = useTaskLists();
  const list = (lists ?? []).find((l) => l.id === listId);
  usePageTitle(list ? `Task · ${list.name}` : 'Task');

  const { data: tasks, isLoading } = useTasks(listId ?? '');
  const { data: people } = useAssignablePeople();
  const createTask = useCreateTask(listId ?? '');

  const [view, setView] = useState<ViewMode>('list');
  const [showClosed, setShowClosed] = useState(false);
  const [addingTo, setAddingTo] = useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  const notYet = (feature: string) => toast({ title: `${feature} is coming soon` });

  const submitNewTask = (status: TaskStatus) => {
    const title = newTitle.trim();
    if (!title || !profile?.id) return;
    createTask.mutate(
      { title, createdBy: profile.id, status },
      {
        onSuccess: () => { setNewTitle(''); setAddingTo(null); },
        onError: (err) => toast({ title: 'Could not add task', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const rows = tasks ?? [];
  const visibleStatuses = TASK_STATUSES.filter((s) => s !== 'done' || showClosed);
  const byStatus = new Map<TaskStatus, TaskRow[]>();
  for (const s of TASK_STATUSES) byStatus.set(s, []);
  for (const t of rows) byStatus.get(t.status)?.push(t);

  const TaskCard = ({ task }: { task: TaskRow }) => {
    const assignee = task.assignee_id ? peopleById.get(task.assignee_id) : undefined;
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 kd-transition">
        <Flag className="h-3 w-3 text-muted-foreground/40 shrink-0" />
        <button type="button" onClick={() => setOpenTaskId(task.id)} className="flex-1 min-w-0 text-left text-sm truncate">
          {task.title}
        </button>
        {task.priority && (
          <Badge variant="outline" className={cn('text-2xs shrink-0', PRIORITY_META[task.priority].className)}>
            {PRIORITY_META[task.priority].label}
          </Badge>
        )}
        {task.due_date && (
          <span className="text-2xs text-muted-foreground shrink-0 font-mono tabular-nums hidden sm:inline">{formatDate(task.due_date)}</span>
        )}
        <AvatarBubble photoUrl={null} initials={initialsOf(undefined, undefined, assignee?.full_name || '?')} size={20} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link to="/task" className="md:hidden inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground kd-transition mb-1">
            <Home className="h-3.5 w-3.5" /> Home
          </Link>
          <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">{list?.name ?? 'List'}</h1>
        </div>
        <Button size="sm" className="h-9" onClick={() => setAddingTo('to_do')}>
          <Plus className="mr-1.5 h-4 w-4" /> Task
        </Button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => notYet('Filter')}>Filter</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => notYet('Group')}>Group: Status</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => notYet('Sort')}>Sort</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowClosed((s) => !s)}>
          {showClosed ? 'Hide closed' : 'Show closed'}
        </Button>
        <div className="ml-auto flex items-center gap-0.5 rounded-md border border-border/70 p-0.5">
          <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} className="h-7 text-2xs px-2" onClick={() => setView('list')}>
            <ListIcon className="h-3.5 w-3.5 mr-1" /> List
          </Button>
          <Button size="sm" variant={view === 'board' ? 'secondary' : 'ghost'} className="h-7 text-2xs px-2" onClick={() => setView('board')}>
            <Columns3 className="h-3.5 w-3.5 mr-1" /> Board
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-2xs px-2" onClick={() => notYet('Calendar view')}>
            <Calendar className="h-3.5 w-3.5 mr-1" /> Calendar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-2xs px-2" onClick={() => notYet('Table view')}>
            <TableIcon className="h-3.5 w-3.5 mr-1" /> Table
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState illustration="ghost" title="No tasks yet" description="Click + Task above to add your first one." />
      ) : view === 'list' ? (
        <div className="space-y-3">
          {visibleStatuses.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{STATUS_META[status].label}</h2>
                  <span className="text-2xs text-muted-foreground/60">{items.length}</span>
                </div>
                <div className="rounded-lg border border-border/70 divide-y divide-border/50">
                  {items.map((task) => <TaskCard key={task.id} task={task} />)}
                  {addingTo === status ? (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Input
                        autoFocus
                        placeholder="Task title…"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitNewTask(status); if (e.key === 'Escape') setAddingTo(null); }}
                        className="h-8 text-sm"
                      />
                      <Button size="sm" className="h-8" disabled={createTask.isPending || !newTitle.trim()} onClick={() => submitNewTask(status)}>
                        {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingTo(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingTo(status)}
                      className="w-full text-left px-3 py-1.5 text-2xs text-muted-foreground/70 hover:text-foreground hover:bg-muted/20 kd-transition"
                    >
                      + Add task
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {visibleStatuses.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <div key={status} className="w-64 shrink-0">
                <div className="flex items-center gap-2 mb-1.5 px-0.5">
                  <span className={cn('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{STATUS_META[status].label}</h2>
                  <span className="text-2xs text-muted-foreground/60">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setOpenTaskId(task.id)}
                      className="w-full text-left rounded-lg border border-border/70 p-2.5 hover:border-primary/50 kd-transition space-y-1.5"
                    >
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <div className="flex items-center justify-between gap-2">
                        {task.priority ? (
                          <Badge variant="outline" className={cn('text-3xs', PRIORITY_META[task.priority].className)}>{PRIORITY_META[task.priority].label}</Badge>
                        ) : <span />}
                        <AvatarBubble photoUrl={null} initials={initialsOf(undefined, undefined, task.assignee_id ? peopleById.get(task.assignee_id)?.full_name : '?')} size={18} />
                      </div>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setAddingTo(status); setView('list'); }}
                    className="w-full text-left px-2 py-1 text-2xs text-muted-foreground/70 hover:text-foreground"
                  >
                    + Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </div>
  );
};

export default TaskListPage;
