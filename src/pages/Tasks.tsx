import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, CheckCircle2, ListTodo, Flag,
  Pencil, Check, Clock, Send, X, Filter, Trash2,
  User, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, daysUntil } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Sheet, SheetContent,
} from '@/components/ui/sheet';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { cn } from '@/lib/utils';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { TaskSidebar, type TaskView, type Space } from '@/components/tasks/TaskSidebar';
import { MyTasksView } from '@/components/tasks/MyTasksView';
import { TaskListView } from '@/components/tasks/TaskListView';
import { TaskDashboard } from '@/components/tasks/TaskDashboard';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import type {
  Task, TaskStatus, Priority, ProfileRow, Tag,
} from '@/lib/task-types';
import {
  STATUSES, PRIORITY_OPTIONS, PRIORITY_CLASS,
} from '@/lib/task-types';

const Tasks = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  // Sidebar state
  const [currentView, setCurrentView] = useState<TaskView>('my-tasks');
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Create/Edit dialog
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    assignee_id: '',
    due_date: '',
    priority: 'normal' as Priority,
    status: 'open' as TaskStatus,
  });

  // Detail panel — full modal overlay
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Delete confirm
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  // Bulk selection
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  // Space CRUD
  const [spaceDialog, setSpaceDialog] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [spaceForm, setSpaceForm] = useState({ name: '', color: '#6366f1', description: '' });
  const [savingSpace, setSavingSpace] = useState(false);
  const [pendingDeleteSpace, setPendingDeleteSpace] = useState<Space | null>(null);

  // Sidebar collapsed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Comment counts
  const [commentCountsState, setCommentCountsState] = useState<Map<string, number>>(new Map());

  // Project-to-space mapping
  const [projectSpaceMap, setProjectSpaceMap] = useState<Map<string, string | null>>(new Map());

  // ─── Load Data ───────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topRes, allRes, profilesRes, tagsRes, spacesRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('*')
          .is('parent_id', null)
          .order('sort_order', { ascending: true })
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(500),
        supabase
          .from('tasks')
          .select('id, parent_id, status, assignee_id, completed_at, created_at, due_date, priority, title, sort_order, project_id')
          .limit(2000),
        supabase.from('profiles').select('id, full_name, email').order('full_name').limit(500),
        supabase.from('tags').select('*').or('module.eq.all,module.eq.task').order('name'),
        supabase.from('project_spaces').select('*').is('deleted_at', null).order('sort_order'),
      ]);
      if (topRes.error) throw topRes.error;
      setTasks((topRes.data as Task[]) || []);
      setAllTasks((allRes.data as Task[]) || []);
      const m = new Map<string, ProfileRow>();
      for (const p of (profilesRes.data as ProfileRow[]) || []) m.set(p.id, p);
      setProfiles(m);
      setAvailableTags((tagsRes.data as Tag[]) || []);
      setSpaces((spacesRes.data as Space[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load comment counts
  useEffect(() => {
    supabase
      .from('task_comments')
      .select('task_id')
      .then(({ data }) => {
        if (!data) return;
        const counts = new Map<string, number>();
        for (const row of data) {
          counts.set(row.task_id, (counts.get(row.task_id) ?? 0) + 1);
        }
        setCommentCountsState(counts);
      });
  }, [tasks]);

  // Load project-space mapping
  useEffect(() => {
    supabase.from('projects').select('id, space_id').then(({ data }) => {
      if (!data) return;
      const m = new Map<string, string | null>();
      for (const p of data) m.set(p.id, p.space_id);
      setProjectSpaceMap(m);
    });
  }, [spaces]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openCreate(); }
      if (e.key === 'Escape') {
        if (detailTask) { setDetailTask(null); return; }
        if (selectedTasks.size > 0) { setSelectedTasks(new Set()); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detailTask, selectedTasks]);

  // ─── Computed ────────────────────────────────────────────────────────

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

  const taskCounts = useMemo(() => {
    const myTasks = tasks.filter((t) =>
      t.assignee_id === profile?.id || t.created_by === profile?.id,
    ).length;
    const overdue = tasks.filter((t) =>
      t.assignee_id === profile?.id && t.status !== 'complete' && t.due_date && (daysUntil(t.due_date) ?? 0) < 0,
    ).length;
    return { myTasks, overdue, total: tasks.length };
  }, [tasks, profile?.id]);

  const spaceTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (!t.project_id) continue;
      const spaceId = projectSpaceMap.get(t.project_id);
      if (!spaceId) continue;
      counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
    }
    return counts;
  }, [tasks, projectSpaceMap]);

  const unorganizedCount = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.project_id) return true;
      return !projectSpaceMap.get(t.project_id);
    }).length;
  }, [tasks, projectSpaceMap]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (selectedSpace === '__unassigned__') {
        if (t.project_id && projectSpaceMap.get(t.project_id)) return false;
      } else if (selectedSpace) {
        if (!t.project_id) return false;
        if (projectSpaceMap.get(t.project_id) !== selectedSpace) return false;
      }
      if (assigneeFilter !== 'all' && t.assignee_id !== assigneeFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (!q) return true;
      const name = t.assignee_id ? profiles.get(t.assignee_id)?.full_name || '' : '';
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        name.toLowerCase().includes(q)
      );
    });
  }, [tasks, search, selectedSpace, assigneeFilter, statusFilter, priorityFilter, profiles, projectSpaceMap]);

  // ─── Task CRUD ───────────────────────────────────────────────────────

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
      title, status, priority: 'normal',
      created_by: profile?.id || null, sort_order: maxSort,
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

  const confirmDeleteTask = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('tasks').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Task deleted' });
    if (detailTask?.id === pendingDelete.id) setDetailTask(null);
    load();
  };

  // ─── Bulk actions ────────────────────────────────────────────────────

  const toggleSelect = (taskId: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  };

  const selectAllVisible = () => {
    if (selectedTasks.size === visible.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(visible.map((t) => t.id)));
    }
  };

  const bulkUpdateStatus = async (status: TaskStatus) => {
    const ids = Array.from(selectedTasks);
    const { error } = await supabase.from('tasks').update({
      status,
      completed_at: status === 'complete' ? new Date().toISOString() : null,
    }).in('id', ids);
    if (error) {
      toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${ids.length} tasks updated` });
    setSelectedTasks(new Set());
    load();
  };

  const bulkUpdatePriority = async (priority: Priority) => {
    const ids = Array.from(selectedTasks);
    const { error } = await supabase.from('tasks').update({ priority }).in('id', ids);
    if (error) {
      toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${ids.length} tasks updated` });
    setSelectedTasks(new Set());
    load();
  };

  const bulkAssign = async (assigneeId: string | null) => {
    const ids = Array.from(selectedTasks);
    const { error } = await supabase.from('tasks').update({ assignee_id: assigneeId }).in('id', ids);
    if (error) {
      toast({ title: 'Bulk assign failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${ids.length} tasks reassigned` });
    setSelectedTasks(new Set());
    load();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedTasks);
    const { error } = await supabase.from('tasks').delete().in('id', ids);
    if (error) {
      toast({ title: 'Bulk delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `${ids.length} tasks deleted` });
    setSelectedTasks(new Set());
    load();
  };

  // ─── Space CRUD ──────────────────────────────────────────────────────

  const openCreateSpace = () => {
    setEditingSpace(null);
    setSpaceForm({ name: '', color: '#6366f1', description: '' });
    setSpaceDialog(true);
  };

  const openEditSpace = (space: Space) => {
    setEditingSpace(space);
    setSpaceForm({ name: space.name, color: space.color, description: space.description || '' });
    setSpaceDialog(true);
  };

  const saveSpace = async () => {
    if (!spaceForm.name.trim()) {
      toast({ title: 'Space name is required', variant: 'destructive' });
      return;
    }
    setSavingSpace(true);
    try {
      if (editingSpace) {
        const { error } = await supabase.from('project_spaces').update({
          name: spaceForm.name.trim(),
          color: spaceForm.color,
          description: spaceForm.description || null,
        }).eq('id', editingSpace.id);
        if (error) throw error;
        await logAudit('space_updated', `Space "${spaceForm.name}" updated`, profile);
        toast({ title: 'Space updated' });
      } else {
        const { error } = await supabase.from('project_spaces').insert({
          name: spaceForm.name.trim(),
          color: spaceForm.color,
          description: spaceForm.description || null,
          owner_id: profile?.id || null,
          created_by: profile?.id || null,
          sort_order: spaces.length,
        });
        if (error) throw error;
        await logAudit('space_created', `Space "${spaceForm.name}" created`, profile);
        toast({ title: 'Space created' });
      }
      setSpaceDialog(false);
      load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingSpace(false);
    }
  };

  const confirmDeleteSpace = async () => {
    if (!pendingDeleteSpace) return;
    const { error } = await supabase.from('project_spaces').update({ deleted_at: new Date().toISOString() }).eq('id', pendingDeleteSpace.id);
    setPendingDeleteSpace(null);
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('space_deleted', `Space "${pendingDeleteSpace.name}" deleted`, profile);
    toast({ title: 'Space removed' });
    if (selectedSpace === pendingDeleteSpace.id) setSelectedSpace(null);
    load();
  };

  // ─── View helpers ────────────────────────────────────────────────────

  const viewTitle = useMemo(() => {
    if (currentView === 'my-tasks') return 'My Tasks';
    if (currentView === 'dashboard') return 'Dashboard';
    if (selectedSpace === '__unassigned__') return 'Unorganized Tasks';
    if (selectedSpace) {
      const sp = spaces.find((s) => s.id === selectedSpace);
      return sp?.name ?? 'Tasks';
    }
    return 'All Tasks';
  }, [currentView, selectedSpace, spaces]);

  const activeFilters: { key: string; label: string; onRemove: () => void }[] = [];
  if (assigneeFilter !== 'all') {
    const name = profiles.get(assigneeFilter)?.full_name ?? 'Unknown';
    activeFilters.push({ key: 'assignee', label: `Assignee: ${name}`, onRemove: () => setAssigneeFilter('all') });
  }
  if (statusFilter !== 'all') {
    activeFilters.push({ key: 'status', label: `Status: ${statusFilter.replace('_', ' ')}`, onRemove: () => setStatusFilter('all') });
  }
  if (priorityFilter !== 'all') {
    activeFilters.push({ key: 'priority', label: `Priority: ${priorityFilter}`, onRemove: () => setPriorityFilter('all') });
  }

  const clearFilters = () => {
    setAssigneeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setSearch('');
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-theme(spacing.14)-theme(spacing.8))] -m-4 md:-m-5 lg:-m-6">
      {/* ─── Module Sidebar ─────────────────────────────────────────── */}
      <div className="hidden md:flex w-[220px] lg:w-[240px] shrink-0 border-r border-border/60 bg-card/50 p-3 overflow-y-auto">
        <TaskSidebar
          spaces={spaces}
          selectedSpace={selectedSpace}
          currentView={currentView}
          taskCounts={taskCounts}
          spaceTaskCounts={spaceTaskCounts}
          onSelectSpace={setSelectedSpace}
          onChangeView={(v) => { setCurrentView(v); setSelectedTasks(new Set()); }}
          onCreateSpace={openCreateSpace}
          onEditSpace={openEditSpace}
          onDeleteSpace={(s) => setPendingDeleteSpace(s)}
          unorganizedCount={unorganizedCount}
        />
      </div>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[260px] p-3 pt-8">
          <TaskSidebar
            spaces={spaces}
            selectedSpace={selectedSpace}
            currentView={currentView}
            taskCounts={taskCounts}
            spaceTaskCounts={spaceTaskCounts}
            onSelectSpace={(id) => { setSelectedSpace(id); setSidebarOpen(false); }}
            onChangeView={(v) => { setCurrentView(v); setSidebarOpen(false); setSelectedTasks(new Set()); }}
            onCreateSpace={openCreateSpace}
            onEditSpace={openEditSpace}
            onDeleteSpace={(s) => setPendingDeleteSpace(s)}
            unorganizedCount={unorganizedCount}
          />
        </SheetContent>
      </Sheet>

      {/* ─── Main Content ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header bar */}
        <div className="shrink-0 border-b border-border/60 bg-card/30 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 px-4 lg:px-6 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button size="icon" variant="ghost" className="md:hidden h-8 w-8 shrink-0" onClick={() => setSidebarOpen(true)}>
                <ListTodo className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg font-bold truncate">{viewTitle}</h1>
                {currentView !== 'my-tasks' && currentView !== 'dashboard' && (
                  <p className="text-xs text-muted-foreground">
                    {visible.length} task{visible.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentView !== 'my-tasks' && currentView !== 'dashboard' && (
                <>
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="pl-8 h-8 w-[180px] lg:w-[220px] text-sm"
                      placeholder="Search tasks..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  <Popover open={showFilters} onOpenChange={setShowFilters}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                        <Filter className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Filter</span>
                        {activeFilters.length > 0 && (
                          <span className="bg-primary text-primary-foreground text-[9px] rounded-full h-4 w-4 flex items-center justify-center">
                            {activeFilters.length}
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-3 space-y-3" align="end">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">Filters</p>
                        {activeFilters.length > 0 && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={clearFilters}>Clear all</Button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Assignee</Label>
                        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Everyone</SelectItem>
                            {Array.from(profiles.values()).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Status</Label>
                        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Priority</Label>
                        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All priorities</SelectItem>
                            {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:hidden space-y-1.5">
                        <Label className="text-xs">Search</Label>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input className="pl-8 h-8 text-sm" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </>
              )}

              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New task</span>
              </Button>
            </div>
          </div>

          {/* Active filter pills */}
          {activeFilters.length > 0 && currentView !== 'my-tasks' && currentView !== 'dashboard' && (
            <div className="flex items-center gap-1.5 px-4 lg:px-6 pb-2.5 flex-wrap">
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={f.onRemove}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {f.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground ml-1">
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* View Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {loading ? (
            <TableSkeleton rows={6} cols={4} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : currentView === 'my-tasks' ? (
            <MyTasksView
              tasks={tasks}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCountsState}
              currentUserId={profile?.id}
              onTaskClick={(t) => setDetailTask(t)}
            />
          ) : currentView === 'dashboard' ? (
            <TaskDashboard
              tasks={visible}
              allTasks={allTasks}
              profiles={profiles}
              currentUserId={profile?.id}
              onTaskClick={(t) => setDetailTask(t)}
            />
          ) : currentView === 'board' ? (
            <KanbanBoard
              tasks={visible}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCountsState}
              onStatusChange={handleStatusChange}
              onTaskClick={(t) => setDetailTask(t)}
              onCreateTask={openCreateWithStatus}
              onQuickCreate={handleQuickCreate}
            />
          ) : currentView === 'list' ? (
            <TaskListView
              tasks={visible}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCountsState}
              onTaskClick={(t) => setDetailTask(t)}
              onUpdate={load}
              selectedTasks={selectedTasks}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAllVisible}
            />
          ) : null}
        </div>

        {/* ─── Bulk Actions Toolbar ─────────────────────────────────── */}
        {selectedTasks.size > 0 && (
          <div className="shrink-0 border-t border-border/60 bg-card px-4 lg:px-6 py-2.5">
            <div className="flex items-center gap-3 justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium tabular-nums">{selectedTasks.size} selected</span>
                <button onClick={() => setSelectedTasks(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-2">
                {/* Bulk status */}
                <Select onValueChange={(v) => bulkUpdateStatus(v as TaskStatus)}>
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <ArrowRight className="h-3 w-3 mr-1" />
                    Move to...
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                {/* Bulk priority */}
                <Select onValueChange={(v) => bulkUpdatePriority(v as Priority)}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <Flag className="h-3 w-3 mr-1" />
                    Priority...
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>

                {/* Bulk assign */}
                <Select onValueChange={(v) => bulkAssign(v === '__none__' ? null : v)}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <User className="h-3 w-3 mr-1" />
                    Assign...
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassign</SelectItem>
                    {Array.from(profiles.values()).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Bulk delete */}
                <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={bulkDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Task Detail — Full Modal Overlay ───────────────────────── */}
      <Dialog open={!!detailTask} onOpenChange={(v) => { if (!v) setDetailTask(null); }}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden flex flex-col">
          {detailTask && (
            <TaskDetailPanel
              task={detailTask}
              profiles={profiles}
              availableTags={availableTags}
              onClose={() => setDetailTask(null)}
              onUpdate={load}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Create / Edit Task Dialog ──────────────────────────────── */}
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
                onKeyDown={(e) => { if (e.key === 'Enter' && form.title.trim()) save(); }}
              />
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
                    {Array.from(profiles.values()).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {availableTags.length > 0 && (
              <div className="space-y-1">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {availableTags.map((tag) => {
                    const selected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setSelectedTagIds((prev) =>
                          selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                        )}
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all',
                          selected ? 'opacity-100' : 'opacity-40 hover:opacity-75',
                        )}
                        style={tag.color ? {
                          backgroundColor: `${tag.color}25`,
                          color: tag.color,
                          borderColor: `${tag.color}50`,
                          outline: selected ? `2px solid ${tag.color}` : undefined,
                          outlineOffset: '1px',
                        } : undefined}
                      >
                        {selected && <Check className="mr-1 h-3 w-3" />}{tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create / Edit Space Dialog ─────────────────────────────── */}
      <Dialog open={spaceDialog} onOpenChange={(v) => { setSpaceDialog(v); if (!v) setEditingSpace(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSpace ? 'Edit space' : 'New space'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={spaceForm.name} onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })} placeholder="e.g. Engineering" />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={spaceForm.color}
                  onChange={(e) => setSpaceForm({ ...spaceForm, color: e.target.value })}
                  className="h-8 w-8 rounded cursor-pointer border-0"
                />
                <div className="flex gap-1">
                  {['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'].map((c) => (
                    <button
                      key={c}
                      onClick={() => setSpaceForm({ ...spaceForm, color: c })}
                      className={cn(
                        'h-6 w-6 rounded-full transition-all',
                        spaceForm.color === c && 'ring-2 ring-offset-2 ring-offset-background ring-primary',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={spaceForm.description} onChange={(e) => setSpaceForm({ ...spaceForm, description: e.target.value })} placeholder="What is this space for?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpaceDialog(false)}>Cancel</Button>
            <Button onClick={saveSpace} disabled={savingSpace}>
              {savingSpace && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingSpace ? 'Save' : 'Create space'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Task Confirmation ───────────────────────────────── */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(v) => { if (!v) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDelete?.title}&quot; will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTask} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Delete Space Confirmation ──────────────────────────────── */}
      <AlertDialog open={!!pendingDeleteSpace} onOpenChange={(v) => { if (!v) setPendingDeleteSpace(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove space?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{pendingDeleteSpace?.name}&quot; will be removed. Tasks and projects in this space will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteSpace} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Tasks;

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
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base">My tasks</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />)}</div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">You're all caught up. No open tasks assigned to you.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const d = t.due_date ? daysUntil(t.due_date) : null;
              const overdue = d !== null && d < 0;
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-2 kd-transition hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.due_date ? `Due ${formatDate(t.due_date)}` : 'No due date'}</p>
                  </div>
                  <Badge variant="secondary" className={cn(overdue ? 'bg-destructive/10 text-destructive' : PRIORITY_CLASS[t.priority])}>
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
