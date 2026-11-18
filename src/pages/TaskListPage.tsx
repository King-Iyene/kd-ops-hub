import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import {
  useTaskLists,
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useAssignablePeople,
  type TaskRow,
  type TaskStatus,
  type TaskPriority,
} from '@/queries/useTaskModule';

const PRIORITY_META: Record<TaskPriority, { label: string; className: string }> = {
  low:    { label: 'Low',    className: 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400' },
  medium: { label: 'Medium', className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
  high:   { label: 'High',   className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' },
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400' },
};

const NONE = '__none__';

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
  const updateTask = useUpdateTask(listId ?? '');
  const deleteTask = useDeleteTask(listId ?? '');

  const [newTitle, setNewTitle] = useState('');
  const [openTask, setOpenTask] = useState<TaskRow | null>(null);

  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));

  const submitNewTask = () => {
    const title = newTitle.trim();
    if (!title || !profile?.id) return;
    createTask.mutate(
      { title, createdBy: profile.id },
      {
        onSuccess: () => setNewTitle(''),
        onError: (err) => toast({ title: 'Could not add task', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  const toggleDone = (task: TaskRow) => {
    const nextStatus: TaskStatus = task.status === 'done' ? 'open' : 'done';
    updateTask.mutate(
      { id: task.id, patch: { status: nextStatus } },
      { onError: (err) => toast({ title: 'Could not update task', description: errorMessage(err), variant: 'destructive' }) },
    );
  };

  const rows = tasks ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link to="/task" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground kd-transition mb-1">
          <ChevronLeft className="h-3.5 w-3.5" /> All folders
        </Link>
        <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">{list?.name ?? 'List'}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Add a task…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitNewTask(); }}
          className="h-9"
        />
        <Button size="sm" className="h-9 shrink-0" disabled={createTask.isPending || !newTitle.trim()} onClick={submitNewTask}>
          {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1.5 h-4 w-4" /> Add</>}
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState illustration="ghost" title="No tasks yet" description="Add your first task above." />
      ) : (
        <div className="divide-y divide-border/50 rounded-lg border border-border/70">
          {rows.map((task) => {
            const assignee = task.assignee_id ? peopleById.get(task.assignee_id) : undefined;
            return (
              <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 kd-transition">
                <Checkbox checked={task.status === 'done'} onCheckedChange={() => toggleDone(task)} />
                <button
                  type="button"
                  onClick={() => setOpenTask(task)}
                  className={cn(
                    'flex-1 min-w-0 text-left text-sm truncate',
                    task.status === 'done' && 'line-through text-muted-foreground',
                  )}
                >
                  {task.title}
                </button>
                {task.priority && (
                  <Badge variant="outline" className={cn('text-2xs shrink-0', PRIORITY_META[task.priority].className)}>
                    {PRIORITY_META[task.priority].label}
                  </Badge>
                )}
                {assignee && (
                  <span className="text-2xs text-muted-foreground shrink-0 hidden sm:inline truncate max-w-[120px]">{assignee.full_name}</span>
                )}
                {task.due_date && (
                  <span className="text-2xs text-muted-foreground shrink-0 font-mono tabular-nums hidden sm:inline">{formatDate(task.due_date)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!openTask} onOpenChange={(open) => !open && setOpenTask(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          {openTask && (
            <TaskDetailForm
              task={openTask}
              people={people ?? []}
              onUpdate={(patch) => updateTask.mutate({ id: openTask.id, patch }, {
                onError: (err) => toast({ title: 'Could not update task', description: errorMessage(err), variant: 'destructive' }),
              })}
              onDelete={() => {
                deleteTask.mutate(openTask.id, {
                  onError: (err) => toast({ title: 'Could not delete task', description: errorMessage(err), variant: 'destructive' }),
                });
                setOpenTask(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

function TaskDetailForm({
  task, people, onUpdate, onDelete,
}: {
  task: TaskRow;
  people: { id: string; full_name: string }[];
  onUpdate: (patch: Partial<Pick<TaskRow, 'title' | 'description' | 'status' | 'priority' | 'assignee_id' | 'due_date'>>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  return (
    <div className="space-y-4 mt-2">
      <SheetHeader className="text-left">
        <SheetTitle>Task details</SheetTitle>
      </SheetHeader>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title.trim() && title !== task.title) onUpdate({ title: title.trim() }); }}
        className="font-medium"
      />

      <Textarea
        placeholder="Description…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => { if (description !== (task.description ?? '')) onUpdate({ description: description || null }); }}
        rows={4}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Status</label>
          <Select value={task.status} onValueChange={(v) => onUpdate({ status: v as TaskStatus })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</label>
          <Select value={task.priority ?? NONE} onValueChange={(v) => onUpdate({ priority: v === NONE ? null : v as TaskPriority })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Assignee</label>
          <Select value={task.assignee_id ?? NONE} onValueChange={(v) => onUpdate({ assignee_id: v === NONE ? null : v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Due date</label>
          <Input
            type="date"
            className="h-9"
            value={task.due_date ?? ''}
            onChange={(e) => onUpdate({ due_date: e.target.value || null })}
          />
        </div>
      </div>

      <SheetFooter className="pt-2">
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete task
        </Button>
      </SheetFooter>
    </div>
  );
}

export default TaskListPage;
