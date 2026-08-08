import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, CheckCircle2, ListTodo, Flag,
  MessageSquare, Trash2, Pencil, Check, LayoutGrid, List,
  Clock, Send, X, BarChart3, TrendingUp, Users, Target,
  ArrowUpRight, AlertTriangle, CalendarDays,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime, daysUntil } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { StatCard } from '@/components/ui-kit/StatCard';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import type {
  Task, TaskStatus, Priority, ProfileRow, Tag, TaskComment,
} from '@/lib/task-types';
import {
  STATUSES, PRIORITY_OPTIONS, PRIORITY_CLASS, STATUS_CLASS,
} from '@/lib/task-types';

type ViewMode = 'board' | 'list' | 'dashboard';

const Tasks = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [scope, setScope] = useState<'all' | 'mine'>('mine');
  const [view, setView] = useState<ViewMode>('board');

  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assignee_id: '',
    due_date: '',
    priority: 'normal' as Priority,
    status: 'open' as TaskStatus,
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topRes, allRes, profilesRes, tagsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .is('parent_id', null)
          .order('sort_order', { ascending: true })
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(500),
        supabase
          .from('tasks')
          .select('id, parent_id, status, assignee_id, completed_at, created_at, due_date, priority, title, sort_order')
          .limit(2000),
        supabase.from('profiles').select('id, full_name, email').order('full_name').limit(500),
        supabase.from('tags').select('*').or('module.eq.all,module.eq.task').order('name'),
      ]);
      if (topRes.error) throw topRes.error;
      setTasks((topRes.data as Task[]) || []);
      setAllTasks((allRes.data as Task[]) || []);
      const m = new Map<string, ProfileRow>();
      for (const p of (profilesRes.data as ProfileRow[]) || []) m.set(p.id, p);
      setProfiles(m);
      setAvailableTags((tagsRes.data as Tag[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const subtaskCounts = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>();
    for (const t of allTasks) {
      if (!t.parent_id) continue;
      const prev = counts.get(t.parent_id) || { total: 0, done: 0 };
      prev.total++;
      if (t.status === 'complete') prev.done++;
      counts.set(t.parent_id, prev);
    }
    return counts;
  }, [allTasks]);

  const loadComments = async (taskId: string) => {
    const { data } = await supabase
      .from('task_comments').select('*').eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setComments((data as TaskComment[]) || []);
  };

  const loadSubtasks = async (taskId: string) => {
    const { data } = await supabase
      .from('tasks').select('*').eq('parent_id', taskId)
      .order('sort_order').order('created_at');
    setSubtasks((data as Task[]) || []);
  };

  const openDetail = async (task: Task) => {
    setDetailTask(task);
    setDetailOpen(true);
    setComments([]);
    setSubtasks([]);
    setNewComment('');
    setNewSubtask('');
    await Promise.all([loadComments(task.id), loadSubtasks(task.id)]);
  };

  const reset = () => {
    setEditing(null);
    setSelectedTagIds([]);
    setForm({ title: '', description: '', assignee_id: '', due_date: '', priority: 'normal', status: 'open' });
  };

  const openCreate = () => { reset(); setDialog(true); };

  const openCreateWithStatus = (status: TaskStatus) => {
    reset();
    setForm((f) => ({ ...f, status }));
    setDialog(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setSelectedTagIds(task.tags || []);
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
        tags: selectedTagIds,
      };
      if (editing) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editing.id);
        if (error) throw error;
        await logAudit('task_updated', `Task "${payload.title}" updated`, profile);
        toast({ title: 'Task updated' });
      } else {
        const maxSort = tasks.filter((t) => t.status === form.status).length;
        const { error } = await supabase.from('tasks').insert({
          ...payload,
          created_by: profile?.id || null,
          sort_order: maxSort,
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

  const handleQuickCreate = async (title: string, status: TaskStatus) => {
    const maxSort = tasks.filter((t) => t.status === status).length;
    const { error } = await supabase.from('tasks').insert({
      title,
      status,
      priority: 'normal',
      created_by: profile?.id || null,
      sort_order: maxSort,
    });
    if (error) {
      toast({ title: 'Create failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('task_created', `Task "${title}" created`, profile);
    toast({ title: 'Task created' });
    load();
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: newStatus, completed_at: newStatus === 'complete' ? new Date().toISOString() : t.completed_at }
          : t,
      ),
    );
    const { error } = await supabase.from('tasks').update({
      status: newStatus,
      completed_at: newStatus === 'complete' ? new Date().toISOString() : null,
    }).eq('id', taskId);
    if (error) {
      toast({ title: 'Move failed', description: error.message, variant: 'destructive' });
      load();
      return;
    }
    const task = tasks.find((t) => t.id === taskId);
    if (task) await logAudit('task_updated', `Task "${task.title}" moved to ${newStatus}`, profile);
  };

  const markComplete = async (task: Task) => {
    const { error } = await supabase.from('tasks').update({
      status: 'complete', completed_at: new Date().toISOString(),
    }).eq('id', task.id);
    if (error) { toast({ title: 'Could not complete', description: error.message, variant: 'destructive' }); return; }
    await logAudit('task_completed', `Task "${task.title}" completed`, profile);
    toast({ title: 'Task completed' });
    load();
  };

  const confirmDeleteTask = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('tasks').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    if (error) { toast({ title: 'Could not delete', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Task deleted' });
    if (detailTask?.id === pendingDelete.id) { setDetailOpen(false); setDetailTask(null); }
    load();
  };

  const addComment = async () => {
    if (!detailTask || !newComment.trim() || !profile) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('task_comments').insert({
        task_id: detailTask.id, author_id: profile.id, body: newComment.trim(),
      });
      if (error) throw error;
      await logAudit('task_commented', `Commented on task "${detailTask.title}"`, profile);
      setNewComment('');
      loadComments(detailTask.id);
    } catch (err: any) {
      toast({ title: 'Comment failed', description: err?.message, variant: 'destructive' });
    } finally { setPosting(false); }
  };

  const addSubtask = async () => {
    if (!detailTask || !newSubtask.trim() || !profile) return;
    setAddingSubtask(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        title: newSubtask.trim(), parent_id: detailTask.id,
        created_by: profile.id, status: 'open', priority: 'normal',
        sort_order: subtasks.length, project_id: detailTask.project_id,
      });
      if (error) throw error;
      setNewSubtask('');
      await loadSubtasks(detailTask.id);
      load();
    } catch (err: any) {
      toast({ title: 'Subtask failed', description: err?.message, variant: 'destructive' });
    } finally { setAddingSubtask(false); }
  };

  const toggleSubtask = async (sub: Task) => {
    const newStatus: TaskStatus = sub.status === 'complete' ? 'open' : 'complete';
    await supabase.from('tasks').update({
      status: newStatus, completed_at: newStatus === 'complete' ? new Date().toISOString() : null,
    }).eq('id', sub.id);
    if (detailTask) await loadSubtasks(detailTask.id);
    load();
  };

  const deleteSubtask = async (subId: string) => {
    await supabase.from('tasks').delete().eq('id', subId);
    if (detailTask) await loadSubtasks(detailTask.id);
    load();
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (scope === 'mine' && t.assignee_id !== profile?.id && t.created_by !== profile?.id) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (!q) return true;
      const name = t.assignee_id ? profiles.get(t.assignee_id)?.full_name || '' : '';
      return t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || name.toLowerCase().includes(q);
    });
  }, [tasks, search, statusFilter, priorityFilter, scope, profile?.id, profiles]);

  const pagination = usePagination(visible, 20);

  const stats = useMemo(() => {
    const mine = tasks.filter((t) => t.assignee_id === profile?.id);
    const overdue = mine.filter((t) => t.status !== 'complete' && t.due_date && (daysUntil(t.due_date) ?? 0) < 0).length;
    const open = mine.filter((t) => t.status !== 'complete').length;
    const completedThisWeek = tasks.filter((t) => {
      if (t.status !== 'complete' || !t.completed_at) return false;
      return new Date(t.completed_at).getTime() >= Date.now() - 7 * 864e5;
    }).length;
    return { mine: mine.length, open, overdue, completedThisWeek };
  }, [tasks, profile?.id]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Your team's accountability system — every action has an owner and a deadline."
        actions={
          <div className="flex items-center gap-2">
            {/* View switcher */}
            <div className="flex bg-muted rounded-lg p-0.5">
              {([
                { key: 'board', icon: LayoutGrid, label: 'Board' },
                { key: 'list', icon: List, label: 'List' },
                { key: 'dashboard', icon: BarChart3, label: 'Dashboard' },
              ] as const).map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all',
                    view === v.key
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <v.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              ))}
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New task
            </Button>
          </div>
        }
      />

      {/* ─── Dashboard View ───────────────────────────────────────── */}
      {view === 'dashboard' ? (
        <TaskDashboard tasks={tasks} allTasks={allTasks} profiles={profiles} currentUserId={profile?.id} />
      ) : (
        <>
          {/* Stat cards */}
          <div className="kd-stat-grid">
            <StatCard title="My tasks" value={stats.mine} icon={ListTodo} tone="primary" />
            <StatCard title="Open" value={stats.open} icon={ListTodo} tone="warning" />
            <StatCard title="Overdue" value={stats.overdue} icon={Flag} tone="danger" />
            <StatCard title="Completed this week" value={stats.completedThisWeek} icon={CheckCircle2} tone="success" />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 h-10 sm:h-9" placeholder="Search tasks, assignees..." value={search}
                onChange={(e) => { setSearch(e.target.value); pagination.reset(); }} />
            </div>
            <Select value={scope} onValueChange={(v) => setScope(v as any)}>
              <SelectTrigger className="flex-1 sm:flex-initial sm:w-[140px] h-10 sm:h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="mine">Mine</SelectItem><SelectItem value="all">All team</SelectItem></SelectContent>
            </Select>
            {view === 'list' && (
              <>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                  <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All priorities</SelectItem>
                    {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          {/* Board or List */}
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : view === 'board' ? (
            <KanbanBoard
              tasks={visible}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              onStatusChange={handleStatusChange}
              onTaskClick={openDetail}
              onCreateTask={openCreateWithStatus}
              onQuickCreate={handleQuickCreate}
            />
          ) : visible.length === 0 ? (
            <Card><CardContent className="p-0">
              <EmptyState illustration="radar" title="No tasks match" description="Create your first task to start tracking accountability."
                action={<Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> New task</Button>} />
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
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
                    const assignee = t.assignee_id ? profiles.get(t.assignee_id) : undefined;
                    const d = t.due_date ? daysUntil(t.due_date) : null;
                    const overdue = t.status !== 'complete' && d !== null && d < 0;
                    const sc = subtaskCounts.get(t.id);
                    return (
                      <TableRow key={t.id} className="kd-transition">
                        <TableCell>
                          <button className="text-left hover:underline" onClick={() => openDetail(t)}>
                            <p className="font-medium">{t.title}</p>
                            {t.description && <p className="text-xs text-muted-foreground truncate max-w-sm">{t.description}</p>}
                          </button>
                          {sc && sc.total > 0 && <span className="text-[10px] text-muted-foreground ml-1">({sc.done}/{sc.total} subtasks)</span>}
                          {t.tags && t.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {t.tags.map((tid) => { const tag = availableTags.find((tg) => tg.id === tid); if (!tag) return null; return (
                                <span key={tid} className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                                  style={tag.color ? { backgroundColor: `${tag.color}25`, color: tag.color } : undefined}>{tag.name}</span>
                              ); })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {assignee ? <div><p className="text-sm">{assignee.full_name}</p><p className="text-xs text-muted-foreground">{assignee.email}</p></div>
                            : <span className="text-muted-foreground text-sm">Unassigned</span>}
                        </TableCell>
                        <TableCell>
                          {t.due_date ? (
                            <span className={cn(overdue && 'text-destructive font-medium')}>
                              {formatDate(t.due_date)}
                              {d !== null && <span className="block text-xs text-muted-foreground">{d < 0 ? `${-d}d overdue` : `in ${d}d`}</span>}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell><Badge variant="secondary" className={PRIORITY_CLASS[t.priority]}>{t.priority}</Badge></TableCell>
                        <TableCell><Badge variant="secondary" className={STATUS_CLASS[t.status]}>{t.status.replace('_', ' ')}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {t.status !== 'complete' && <Button size="sm" variant="ghost" onClick={() => markComplete(t)} title="Mark complete"><CheckCircle2 className="h-4 w-4 text-success" /></Button>}
                            <Button size="sm" variant="ghost" onClick={() => openDetail(t)} title="Details"><MessageSquare className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(t)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(t)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} pageSize={pagination.pageSize}
                onPrev={pagination.prev} onNext={pagination.next} hasPrev={pagination.hasPrev} hasNext={pagination.hasNext} />
            </CardContent></Card>
          )}
        </>
      )}

      {/* ─── Create / Edit Dialog ─────────────────────────────────── */}
      <Dialog open={dialog} onOpenChange={(v) => { setDialog(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. File April PAYE return" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Assignee</Label>
                <Select value={form.assignee_id || 'unassigned'} onValueChange={(v) => setForm({ ...form, assignee_id: v === 'unassigned' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {Array.from(profiles.values()).map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {availableTags.length > 0 && (
              <div className="space-y-1">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => { const selected = selectedTagIds.includes(tag.id); return (
                    <button key={tag.id} type="button"
                      onClick={() => setSelectedTagIds((prev) => selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id])}
                      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all', selected ? 'opacity-100' : 'opacity-40 hover:opacity-75')}
                      style={tag.color ? { backgroundColor: `${tag.color}25`, color: tag.color, borderColor: `${tag.color}50`, outline: selected ? `2px solid ${tag.color}` : undefined, outlineOffset: '1px' } : undefined}>
                      {selected && <Check className="mr-1 h-3 w-3" />}{tag.name}
                    </button>
                  ); })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? 'Save changes' : 'Create task'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Side Panel ────────────────────────────────────── */}
      <Sheet open={detailOpen} onOpenChange={(v) => { setDetailOpen(v); if (!v) { setDetailTask(null); setComments([]); setSubtasks([]); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle className="text-left pr-6">{detailTask?.title}</SheetTitle></SheetHeader>
          {detailTask && (
            <div className="space-y-5 mt-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={PRIORITY_CLASS[detailTask.priority]}>{detailTask.priority}</Badge>
                <Badge variant="secondary" className={STATUS_CLASS[detailTask.status]}>{detailTask.status.replace('_', ' ')}</Badge>
                {detailTask.due_date && <span className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Due {formatDate(detailTask.due_date)}</span>}
              </div>
              {detailTask.assignee_id && (
                <div className="text-sm"><span className="text-muted-foreground">Assigned to </span>
                  <span className="font-medium">{profiles.get(detailTask.assignee_id)?.full_name ?? 'Unknown'}</span></div>
              )}
              {detailTask.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{detailTask.description}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setDetailOpen(false); openEdit(detailTask); }}><Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit</Button>
                {detailTask.status !== 'complete' && (
                  <Button size="sm" variant="outline" onClick={() => { handleStatusChange(detailTask.id, 'complete'); setDetailTask({ ...detailTask, status: 'complete' }); }}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-success" /> Complete
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => setPendingDelete(detailTask)}><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete</Button>
              </div>

              {/* Subtasks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Subtasks</Label>
                  {subtasks.length > 0 && <span className="text-[11px] text-muted-foreground">{subtasks.filter((s) => s.status === 'complete').length}/{subtasks.length} done</span>}
                </div>
                {subtasks.length > 0 && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="bg-success h-1.5 rounded-full transition-all" style={{ width: `${(subtasks.filter((s) => s.status === 'complete').length / subtasks.length) * 100}%` }} />
                  </div>
                )}
                <div className="space-y-1">
                  {subtasks.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-muted/50">
                      <button onClick={() => toggleSubtask(sub)} className="shrink-0">
                        <CheckCircle2 className={cn('h-4 w-4', sub.status === 'complete' ? 'text-success fill-success/20' : 'text-muted-foreground/40')} />
                      </button>
                      <span className={cn('flex-1 text-sm', sub.status === 'complete' && 'line-through text-muted-foreground')}>{sub.title}</span>
                      <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => deleteSubtask(sub.id)}>
                        <X className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input className="h-8 text-sm" placeholder="Add a subtask..." value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }} />
                  <Button size="sm" className="h-8 shrink-0" disabled={addingSubtask || !newSubtask.trim()} onClick={addSubtask}>
                    {addingSubtask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Comments */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Comments</Label>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {comments.length === 0
                    ? <p className="text-sm text-muted-foreground py-2">No comments yet.</p>
                    : comments.map((c) => { const author = profiles.get(c.author_id); return (
                      <div key={c.id} className="rounded-lg border p-3 bg-muted/30 text-sm">
                        <p className="text-xs text-muted-foreground mb-1">{author?.full_name || 'Unknown'} · {formatDateTime(c.created_at)}</p>
                        <p className="whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ); })}
                </div>
                <div className="flex gap-2">
                  <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment..." rows={2} className="text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); }} />
                </div>
                <Button size="sm" onClick={addComment} disabled={posting || !newComment.trim()}>
                  {posting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />} Post
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Delete Confirmation ──────────────────────────────────── */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>"{pendingDelete?.title}" will be permanently deleted. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Tasks;

// ─── Task Dashboard ──────────────────────────────────────────────────

function TaskDashboard({ tasks, allTasks, profiles, currentUserId }: {
  tasks: Task[];
  allTasks: Task[];
  profiles: Map<string, ProfileRow>;
  currentUserId?: string;
}) {
  const now = Date.now();
  const weekMs = 7 * 864e5;
  const topLevel = allTasks.filter((t) => !t.parent_id);

  const completedThisWeek = topLevel.filter((t) => t.status === 'complete' && t.completed_at && new Date(t.completed_at).getTime() >= now - weekMs);
  const completedLastWeek = topLevel.filter((t) => t.status === 'complete' && t.completed_at && new Date(t.completed_at).getTime() >= now - 2 * weekMs && new Date(t.completed_at).getTime() < now - weekMs);
  const createdThisWeek = topLevel.filter((t) => new Date(t.created_at).getTime() >= now - weekMs);
  const openTasks = topLevel.filter((t) => t.status !== 'complete');
  const overdueTasks = openTasks.filter((t) => t.due_date && (daysUntil(t.due_date) ?? 0) < 0);
  const blockedTasks = topLevel.filter((t) => t.status === 'blocked');
  const completionRate = topLevel.length > 0 ? Math.round((topLevel.filter((t) => t.status === 'complete').length / topLevel.length) * 100) : 0;
  const weekTrend = completedLastWeek.length > 0 ? Math.round(((completedThisWeek.length - completedLastWeek.length) / completedLastWeek.length) * 100) : completedThisWeek.length > 0 ? 100 : 0;

  const byAssignee = new Map<string, { name: string; open: number; done: number; overdue: number }>();
  for (const t of topLevel) {
    const uid = t.assignee_id || '__unassigned';
    const name = t.assignee_id ? (profiles.get(t.assignee_id)?.full_name ?? 'Unknown') : 'Unassigned';
    const prev = byAssignee.get(uid) || { name, open: 0, done: 0, overdue: 0 };
    if (t.status === 'complete') prev.done++;
    else { prev.open++; if (t.due_date && (daysUntil(t.due_date) ?? 0) < 0) prev.overdue++; }
    byAssignee.set(uid, prev);
  }
  const teamRows = Array.from(byAssignee.values()).sort((a, b) => b.open - a.open);

  const byPriority = { critical: 0, high: 0, normal: 0, low: 0 };
  for (const t of openTasks) byPriority[t.priority]++;

  const statusDist = { open: 0, in_progress: 0, blocked: 0, complete: 0 };
  for (const t of topLevel) statusDist[t.status]++;
  const total = topLevel.length || 1;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={CheckCircle2} label="Completed this week" value={completedThisWeek.length}
          trend={weekTrend !== 0 ? `${weekTrend > 0 ? '+' : ''}${weekTrend}% vs last week` : undefined}
          trendUp={weekTrend > 0} color="text-emerald-600" />
        <KpiCard icon={Target} label="Completion rate" value={`${completionRate}%`} color="text-blue-600" />
        <KpiCard icon={AlertTriangle} label="Overdue" value={overdueTasks.length}
          sub={overdueTasks.length > 0 ? 'Needs attention' : 'All on track'} color="text-red-600" />
        <KpiCard icon={TrendingUp} label="Created this week" value={createdThisWeek.length} color="text-violet-600" />
      </div>

      {/* Status distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex rounded-full h-3 overflow-hidden bg-muted">
            {statusDist.complete > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(statusDist.complete / total) * 100}%` }} />}
            {statusDist.in_progress > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${(statusDist.in_progress / total) * 100}%` }} />}
            {statusDist.open > 0 && <div className="bg-slate-400 transition-all" style={{ width: `${(statusDist.open / total) * 100}%` }} />}
            {statusDist.blocked > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(statusDist.blocked / total) * 100}%` }} />}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs">
            <StatusLegend color="bg-emerald-500" label="Complete" count={statusDist.complete} />
            <StatusLegend color="bg-blue-500" label="In Progress" count={statusDist.in_progress} />
            <StatusLegend color="bg-slate-400" label="Open" count={statusDist.open} />
            <StatusLegend color="bg-red-500" label="Blocked" count={statusDist.blocked} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team workload */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Team Workload</CardTitle>
          </CardHeader>
          <CardContent>
            {teamRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No tasks yet.</p>
            ) : (
              <div className="space-y-3">
                {teamRows.slice(0, 10).map((row) => {
                  const rowTotal = row.open + row.done;
                  const pct = rowTotal > 0 ? Math.round((row.done / rowTotal) * 100) : 0;
                  return (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate">{row.name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                          <span>{row.open} open</span>
                          {row.overdue > 0 && <span className="text-destructive">{row.overdue} overdue</span>}
                          <span className="font-medium text-foreground">{pct}%</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Priority breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Flag className="h-4 w-4 text-primary" /> Open by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {([
                { key: 'critical', label: 'Critical', color: 'bg-red-500', text: 'text-red-600' },
                { key: 'high', label: 'High', color: 'bg-orange-400', text: 'text-orange-600' },
                { key: 'normal', label: 'Normal', color: 'bg-blue-400', text: 'text-blue-600' },
                { key: 'low', label: 'Low', color: 'bg-slate-300 dark:bg-slate-600', text: 'text-muted-foreground' },
              ] as const).map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <div className={cn('h-3 w-3 rounded-full shrink-0', p.color)} />
                  <span className="text-sm flex-1">{p.label}</span>
                  <span className={cn('text-lg font-bold tabular-nums', p.text)}>{byPriority[p.key]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue tasks list */}
      {overdueTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Overdue Tasks ({overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueTasks.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0)).slice(0, 15).map((t) => {
                const d = daysUntil(t.due_date!) ?? 0;
                const assignee = t.assignee_id ? profiles.get(t.assignee_id) : null;
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3 bg-destructive/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{assignee?.full_name ?? 'Unassigned'}</p>
                    </div>
                    <Badge variant="destructive" className="shrink-0 text-[10px]">{Math.abs(d)}d overdue</Badge>
                    <Badge variant="secondary" className={cn('shrink-0 text-[10px]', PRIORITY_CLASS[t.priority])}>{t.priority}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blocked tasks */}
      {blockedTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <X className="h-4 w-4 text-destructive" /> Blocked Tasks ({blockedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {blockedTasks.slice(0, 10).map((t) => {
                const assignee = t.assignee_id ? profiles.get(t.assignee_id) : null;
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{assignee?.full_name ?? 'Unassigned'}</p>
                    </div>
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">Blocked</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, trend, trendUp, sub, color }: {
  icon: typeof CheckCircle2;
  label: string;
  value: number | string;
  trend?: string;
  trendUp?: boolean;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={cn('text-3xl font-bold mt-1 tabular-nums', color)}>{value}</p>
            {trend && (
              <p className={cn('text-[11px] mt-1 flex items-center gap-0.5', trendUp ? 'text-emerald-600' : 'text-red-500')}>
                <ArrowUpRight className={cn('h-3 w-3', !trendUp && 'rotate-90')} /> {trend}
              </p>
            )}
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center bg-muted')}>
            <Icon className={cn('h-4.5 w-4.5', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusLegend({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('h-2.5 w-2.5 rounded-full', color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{count}</span>
    </div>
  );
}

// ─── Dashboard widget (used by main Dashboard page) ──────────────────

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
      .is('parent_id', null)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(6)
      .then(({ data }) => { setTasks((data as Task[]) || []); setLoading(false); });
  }, [profile?.id]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-base">My tasks</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}</div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">You're all caught up. No open tasks assigned to you.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => { const d = t.due_date ? daysUntil(t.due_date) : null; const overdue = d !== null && d < 0; return (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-2 kd-transition hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.due_date ? `Due ${formatDate(t.due_date)}` : 'No due date'}</p>
                </div>
                <Badge variant="secondary" className={cn(overdue ? 'bg-destructive/10 text-destructive' : PRIORITY_CLASS[t.priority])}>{overdue ? 'Overdue' : t.priority}</Badge>
              </div>
            ); })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
