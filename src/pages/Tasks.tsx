import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  ListTodo,
  Flag,
  MessageSquare,
  Trash2,
  Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime, toIsoDate, daysUntil } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { StatCard } from '@/components/ui-kit/StatCard';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

type Priority = 'critical' | 'high' | 'normal' | 'low';
type Status = 'open' | 'in_progress' | 'blocked' | 'complete';

interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  due_date: string | null;
  priority: Priority;
  status: Status;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
}

interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

const PRIORITY_CLASS: Record<Priority, string> = {
  critical: 'bg-destructive/10 text-destructive border border-destructive/30',
  high: 'bg-warning/10 text-warning border border-warning/30',
  normal: 'bg-info/10 text-info border border-info/30',
  low: 'bg-muted text-muted-foreground border border-border',
};

const STATUS_CLASS: Record<Status, string> = {
  open: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/10 text-info',
  blocked: 'bg-destructive/10 text-destructive',
  complete: 'bg-success/10 text-success',
};

const STATUSES: { value: Status; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
];

const Tasks = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [scope, setScope] = useState<'all' | 'mine'>('mine');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assignee_id: '',
    due_date: '',
    priority: 'normal' as Priority,
    status: 'open' as Status,
  });

  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, profilesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .order('due_date', { ascending: true, nullsFirst: false }),
        supabase.from('profiles').select('id, full_name, email').order('full_name'),
      ]);
      if (tasksRes.error) throw tasksRes.error;
      setTasks((tasksRes.data as Task[]) || []);
      const m = new Map<string, ProfileRow>();
      for (const p of (profilesRes.data as ProfileRow[]) || []) m.set(p.id, p);
      setProfiles(m);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadComments = async (taskId: string) => {
    const { data } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setComments((data as TaskComment[]) || []);
  };

  const openDetail = async (task: Task) => {
    setDetailTask(task);
    setComments([]);
    setNewComment('');
    await loadComments(task.id);
  };

  const reset = () => {
    setEditing(null);
    setForm({
      title: '',
      description: '',
      assignee_id: '',
      due_date: '',
      priority: 'normal',
      status: 'open',
    });
  };

  const openCreate = () => {
    reset();
    setDialog(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description || '',
      assignee_id: task.assignee_id || '',
      due_date: task.due_date || '',
      priority: task.priority,
      status: task.status,
    });
    setDialog(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        assignee_id: form.assignee_id || null,
        due_date: form.due_date || null,
        priority: form.priority,
        status: form.status,
        completed_at: form.status === 'complete' ? new Date().toISOString() : null,
      };
      if (editing) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('task_updated', `Task "${payload.title}" updated`, profile);
        toast({ title: 'Task updated' });
      } else {
        const { error } = await supabase.from('tasks').insert({
          ...payload,
          created_by: profile?.id || null,
        });
        if (error) throw error;
        await logAudit('task_created', `Task "${payload.title}" created`, profile);
        toast({ title: 'Task created' });
      }
      setDialog(false);
      reset();
      load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async (task: Task) => {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', task.id);
    if (error) {
      toast({ title: 'Could not complete', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('task_completed', `Task "${task.title}" completed`, profile);
    toast({ title: 'Task completed' });
    load();
  };

  const removeTask = async (task: Task) => {
    if (!window.confirm(`Delete task "${task.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Task deleted' });
    load();
  };

  const addComment = async () => {
    if (!detailTask || !newComment.trim() || !profile) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('task_comments').insert({
        task_id: detailTask.id,
        author_id: profile.id,
        body: newComment.trim(),
      });
      if (error) throw error;
      await logAudit(
        'task_commented',
        `Commented on task "${detailTask.title}"`,
        profile,
      );
      setNewComment('');
      loadComments(detailTask.id);
    } catch (err: any) {
      toast({ title: 'Comment failed', description: err?.message, variant: 'destructive' });
    } finally {
      setPosting(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (scope === 'mine' && t.assignee_id !== profile?.id && t.created_by !== profile?.id) {
        return false;
      }
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (!q) return true;
      const assigneeName = t.assignee_id ? profiles.get(t.assignee_id)?.full_name || '' : '';
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        assigneeName.toLowerCase().includes(q)
      );
    });
  }, [tasks, search, statusFilter, priorityFilter, scope, profile?.id, profiles]);

  const pagination = usePagination(visible, 20);

  const stats = useMemo(() => {
    const mine = tasks.filter((t) => t.assignee_id === profile?.id);
    const overdue = mine.filter(
      (t) => t.status !== 'complete' && t.due_date && (daysUntil(t.due_date) ?? 0) < 0,
    ).length;
    const open = mine.filter((t) => t.status !== 'complete').length;
    const completedThisWeek = tasks.filter((t) => {
      if (t.status !== 'complete' || !t.completed_at) return false;
      const d = new Date(t.completed_at).getTime();
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      return d >= weekAgo;
    }).length;
    return { mine: mine.length, open, overdue, completedThisWeek };
  }, [tasks, profile?.id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Your team's accountability system — every action has an owner and a deadline."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> New task
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard title="My tasks" value={stats.mine} icon={ListTodo} tone="primary" />
        <StatCard title="Open" value={stats.open} icon={ListTodo} tone="warning" />
        <StatCard title="Overdue" value={stats.overdue} icon={Flag} tone="danger" />
        <StatCard
          title="Completed this week"
          value={stats.completedThisWeek}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <Card>
        <div className="p-4 border-b flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search tasks, assignees..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Select value={scope} onValueChange={(v) => setScope(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Mine</SelectItem>
              <SelectItem value="all">All team</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No tasks match"
              description="Create your first task to start tracking accountability."
              action={
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" /> New task
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((t) => {
                    const assignee = t.assignee_id
                      ? profiles.get(t.assignee_id)
                      : undefined;
                    const d = t.due_date ? daysUntil(t.due_date) : null;
                    const overdue = t.status !== 'complete' && d !== null && d < 0;
                    return (
                      <TableRow key={t.id} className="kd-transition">
                        <TableCell>
                          <button
                            className="text-left hover:underline"
                            onClick={() => openDetail(t)}
                          >
                            <p className="font-medium">{t.title}</p>
                            {t.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-sm">
                                {t.description}
                              </p>
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          {assignee ? (
                            <div>
                              <p className="text-sm">{assignee.full_name}</p>
                              <p className="text-xs text-muted-foreground">{assignee.email}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {t.due_date ? (
                            <span className={cn(overdue && 'text-destructive font-medium')}>
                              {formatDate(t.due_date)}
                              {d !== null && (
                                <span className="block text-xs text-muted-foreground">
                                  {d < 0 ? `${-d}d overdue` : `in ${d}d`}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={PRIORITY_CLASS[t.priority]}>
                            {t.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_CLASS[t.status]}>
                            {t.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {t.status !== 'complete' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => markComplete(t)}
                                title="Mark complete"
                              >
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openDetail(t)}
                              title="Comments"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(t)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeTask(t)}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={pagination.pageSize}
                onPrev={pagination.prev}
                onNext={pagination.next}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={(v) => { setDialog(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. File April PAYE return"
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Assignee</Label>
                <Select
                  value={form.assignee_id || 'unassigned'}
                  onValueChange={(v) =>
                    setForm({ ...form, assignee_id: v === 'unassigned' ? '' : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {Array.from(profiles.values()).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v as Priority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as Status })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detailTask}
        onOpenChange={(v) => {
          if (!v) {
            setDetailTask(null);
            setComments([]);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailTask?.title}</DialogTitle>
          </DialogHeader>
          {detailTask && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={PRIORITY_CLASS[detailTask.priority]}>
                  {detailTask.priority}
                </Badge>
                <Badge variant="secondary" className={STATUS_CLASS[detailTask.status]}>
                  {detailTask.status.replace('_', ' ')}
                </Badge>
                {detailTask.due_date && (
                  <span className="text-sm text-muted-foreground">
                    Due {formatDate(detailTask.due_date)}
                  </span>
                )}
              </div>
              {detailTask.description && (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {detailTask.description}
                </p>
              )}

              <div className="space-y-3">
                <Label className="text-sm">Comments</Label>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No comments yet.</p>
                  ) : (
                    comments.map((c) => {
                      const author = profiles.get(c.author_id);
                      return (
                        <div
                          key={c.id}
                          className="rounded-md border p-3 bg-muted/20 text-sm"
                        >
                          <p className="text-xs text-muted-foreground mb-1">
                            {author?.full_name || 'Unknown'} · {formatDateTime(c.created_at)}
                          </p>
                          <p className="whitespace-pre-wrap">{c.body}</p>
                        </div>
                      );
                    })
                  )}
                </div>
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTask(null)}>
              Close
            </Button>
            <Button
              onClick={addComment}
              disabled={posting || !newComment.trim()}
            >
              {posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;

// --- Dashboard widget -------------------------------------------------------

export function MyTasksWidget() {
  const { profile } = useAuthStore();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('tasks')
      .select('*')
      .eq('assignee_id', profile.id)
      .neq('status', 'complete')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(6)
      .then(({ data }) => {
        setTasks((data as Task[]) || []);
        setLoading(false);
      });
  }, [profile?.id]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">My tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            You're all caught up. No open tasks assigned to you.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const d = t.due_date ? daysUntil(t.due_date) : null;
              const overdue = d !== null && d < 0;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-2 kd-transition hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.due_date ? `Due ${formatDate(t.due_date)}` : 'No due date'}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      overdue ? 'bg-destructive/10 text-destructive' : PRIORITY_CLASS[t.priority],
                    )}
                  >
                    {overdue ? 'Overdue' : t.priority}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
