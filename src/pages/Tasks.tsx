import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, ListTodo, Flag,
  Check, X, Filter, Trash2,
  User, ArrowRight, Download, CalendarDays, FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { confirm } from '@/hooks/use-confirm';
import { logAudit } from '@/lib/audit';
import { notifyUser } from '@/lib/notify';
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
  Dialog, DialogContent, DialogTitle,
} from '@/components/ui/dialog';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
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
import { usePageTitle } from '@/hooks/usePageTitle';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { cn } from '@/lib/utils';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { TaskSidebar, type TaskView, type Space } from '@/components/tasks/TaskSidebar';
import { MyTasksView } from '@/components/tasks/MyTasksView';
import { TaskListView } from '@/components/tasks/TaskListView';
import { TaskDashboard } from '@/components/tasks/TaskDashboard';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import { SpaceMembersDialog } from '@/components/tasks/SpaceMembersDialog';
import { SpaceStatusManager } from '@/components/tasks/SpaceStatusManager';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { TaskGanttView } from '@/components/tasks/TaskGanttView';
import { TaskTemplatesDialog } from '@/components/tasks/TaskTemplatesDialog';
import { RecurrenceEditor } from '@/components/tasks/RecurrenceEditor';
import { SavedViewsPanel } from '@/components/tasks/SavedViewsPanel';
import { TaskWorkloadView } from '@/components/tasks/TaskWorkloadView';
import { TaskActivityView } from '@/components/tasks/TaskActivityView';
import { TaskTimeReportView } from '@/components/tasks/TaskTimeReportView';
import { TaskImportExportDialog } from '@/components/tasks/TaskImportExportDialog';
import { GoogleCalendarSync } from '@/components/tasks/GoogleCalendarSync';
import { TaskFormBuilder } from '@/components/tasks/TaskFormBuilder';
import type { SavedView } from '@/lib/task-types';
import { Switch } from '@/components/ui/switch';
import type {
  Task, TaskStatus, Priority, ProfileRow, Tag,
  TaskList, SpaceFolder, TaskDependency,
} from '@/lib/task-types';
import {
  STATUSES, PRIORITY_OPTIONS, PRIORITY_CLASS,
} from '@/lib/task-types';

const Tasks = () => {
  usePageTitle('Tasks');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);

  // Sidebar state
  const [currentView, setCurrentView] = useState<TaskView>('my-tasks');
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [folders, setFolders] = useState<SpaceFolder[]>([]);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [tagFilter, setTagFilter] = useState<string>('all');

  // Create/Edit dialog
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [formAssignees, setFormAssignees] = useState<string[]>([]);
  const [formRecurrence, setFormRecurrence] = useState<import('@/lib/task-types').RecurrenceRule | null>(null);
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
  const [spaceForm, setSpaceForm] = useState({ name: '', color: '#6366f1', description: '', is_private: false });
  const [savingSpace, setSavingSpace] = useState(false);
  const [pendingDeleteSpace, setPendingDeleteSpace] = useState<Space | null>(null);
  const [membersSpace, setMembersSpace] = useState<Space | null>(null);
  const [statusManagerSpace, setStatusManagerSpace] = useState<Space | null>(null);

  // Sidebar collapsed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Pagination
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 200;

  // Comment counts
  const [commentCountsState, setCommentCountsState] = useState<Map<string, number>>(new Map());

  // Favorites
  const [favoriteSpaceIds, setFavoriteSpaceIds] = useState<Set<string>>(new Set());

  // Project-to-space mapping
  const [projectSpaceMap, setProjectSpaceMap] = useState<Map<string, string | null>>(new Map());

  // Templates
  const [templatesDialog, setTemplatesDialog] = useState(false);
  const [importExportDialog, setImportExportDialog] = useState(false);
  const [calendarDialog, setCalendarDialog] = useState(false);
  const [formBuilderDialog, setFormBuilderDialog] = useState(false);

  // ─── Load Data ───────────────────────────────────────────────────────

  const load = useCallback(async (append = false) => {
    if (!append) setLoading(true);
    setError(null);
    try {
      const offset = append ? tasks.length : 0;
      const [topRes, allRes, profilesRes, tagsRes, spacesRes, foldersRes, listsRes, depsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, description, assignee_id, due_date, priority, status, created_by, completed_at, created_at, tags, parent_id, project_id, list_id, sort_order, start_date, time_estimate_minutes, time_spent_minutes, task_type, blocked_reason, goal_id, recurrence_rule')
          .is('parent_id', null)
          .order('sort_order', { ascending: true })
          .order('due_date', { ascending: true, nullsFirst: false })
          .range(offset, offset + PAGE_SIZE - 1),
        supabase
          .from('tasks')
          .select('id, parent_id, status, assignee_id, completed_at, created_at, due_date, priority, title, sort_order, project_id, list_id, task_type, blocked_reason, start_date, time_estimate_minutes, time_spent_minutes, description, tags, created_by')
          .limit(5000),
        supabase.from('profiles_directory').select('id, full_name, email, status').eq('is_anonymised', false).in('status', ['active', 'invited']).order('full_name').limit(500),
        supabase.from('tags').select('id, name, color').or('module.eq.all,module.eq.task').order('name'),
        supabase.from('project_spaces').select('id, name, description, color, owner_id, is_private').is('deleted_at', null).order('sort_order').limit(2000),
        supabase.from('space_folders').select('id, space_id, name, color, sort_order').order('sort_order').limit(5000),
        supabase.from('task_lists').select('id, space_id, folder_id, name, color, sort_order').order('sort_order').limit(5000),
        supabase.from('task_dependencies').select('id, task_id, depends_on_id, dependency_type').limit(20000),
      ]);
      if (topRes.error) throw topRes.error;
      const newTasks = (topRes.data as Task[]) || [];
      setHasMore(newTasks.length === PAGE_SIZE);
      if (append) {
        setTasks((prev) => [...prev, ...newTasks]);
      } else {
        setTasks(newTasks);
      }
      setAllTasks((allRes.data as Task[]) || []);
      const m = new Map<string, ProfileRow>();
      const seenKeys = new Set<string>();
      for (const p of (profilesRes.data as ProfileRow[]) || []) {
        const nameKey = (p.full_name || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const emailKey = (p.email || '').trim().toLowerCase();
        if (seenKeys.has(emailKey) || (nameKey && seenKeys.has(`n:${nameKey}`))) continue;
        seenKeys.add(emailKey);
        if (nameKey) seenKeys.add(`n:${nameKey}`);
        m.set(p.id, p);
      }
      setProfiles(m);
      setAvailableTags((tagsRes.data as Tag[]) || []);
      setSpaces((spacesRes.data as Space[]) || []);
      setFolders((foldersRes.data as SpaceFolder[]) || []);
      setTaskLists((listsRes.data as TaskList[]) || []);
      setDependencies((depsRes.data as TaskDependency[]) || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [tasks.length, PAGE_SIZE]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription — auto-refresh when any task changes
  useEffect(() => {
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, () => {
        supabase.from('task_comments').select('task_id').limit(20000).then(({ data }) => {
          if (!data) return;
          const counts = new Map<string, number>();
          for (const row of data) counts.set(row.task_id, (counts.get(row.task_id) ?? 0) + 1);
          setCommentCountsState(counts);
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Load comment counts
  useEffect(() => {
    supabase
      .from('task_comments')
      .select('task_id')
      .limit(20000)
      .then(({ data }) => {
        if (!data) return;
        const counts = new Map<string, number>();
        for (const row of data) {
          counts.set(row.task_id, (counts.get(row.task_id) ?? 0) + 1);
        }
        setCommentCountsState(counts);
      });
  }, [tasks]);

  // Load favorites
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('user_favorites')
      .select('item_id')
      .eq('user_id', profile.id)
      .eq('item_type', 'space')
      .then(({ data }) => {
        if (data) setFavoriteSpaceIds(new Set(data.map((r: any) => r.item_id)));
      });
  }, [profile?.id, spaces]);

  // Load project-space mapping
  useEffect(() => {
    supabase.from('projects').select('id, space_id').limit(5000).then(({ data }) => {
      if (!data) return;
      const m = new Map<string, string | null>();
      for (const p of data) m.set(p.id, p.space_id);
      setProjectSpaceMap(m);
    });
  }, [spaces]);

  // ─── Due-date notifications (run once per session) ───────────────────
  useEffect(() => {
    if (!profile?.id || tasks.length === 0) return;
    const notifiedKey = `kd_due_notified_${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(notifiedKey)) return;
    sessionStorage.setItem(notifiedKey, '1');

    const myTasks = tasks.filter((t) => t.assignee_id === profile.id && t.status !== 'complete' && t.due_date);
    const today = new Date().toISOString().slice(0, 10);
    const dueTodayCount = myTasks.filter((t) => t.due_date === today).length;
    const overdueCount = myTasks.filter((t) => t.due_date! < today).length;

    if (overdueCount > 0) {
      toast({
        title: `${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`,
        description: 'Check your tasks — some are past due.',
        variant: 'destructive',
      });
    } else if (dueTodayCount > 0) {
      toast({
        title: `${dueTodayCount} task${dueTodayCount > 1 ? 's' : ''} due today`,
        description: 'Stay on track — check your tasks.',
      });
    }
  }, [profile?.id, tasks]);

  // ─── Favorites ───────────────────────────────────────────────────────

  const toggleFavoriteSpace = async (spaceId: string) => {
    if (!profile?.id) return;
    if (favoriteSpaceIds.has(spaceId)) {
      await supabase.from('user_favorites').delete()
        .eq('user_id', profile.id).eq('item_type', 'space').eq('item_id', spaceId);
      setFavoriteSpaceIds((prev) => { const next = new Set(prev); next.delete(spaceId); return next; });
    } else {
      await supabase.from('user_favorites').insert({
        user_id: profile.id, item_type: 'space', item_id: spaceId,
      });
      setFavoriteSpaceIds((prev) => new Set(prev).add(spaceId));
    }
  };

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

  const listTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (!t.list_id) continue;
      counts.set(t.list_id, (counts.get(t.list_id) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const unorganizedCount = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.project_id) return true;
      return !projectSpaceMap.get(t.project_id);
    }).length;
  }, [tasks, projectSpaceMap]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (selectedList) {
        if (t.list_id !== selectedList) return false;
      } else if (selectedSpace === '__unassigned__') {
        if (t.project_id && projectSpaceMap.get(t.project_id)) return false;
      } else if (selectedSpace) {
        if (!t.project_id) return false;
        if (projectSpaceMap.get(t.project_id) !== selectedSpace) return false;
      }
      if (assigneeFilter !== 'all' && t.assignee_id !== assigneeFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (tagFilter !== 'all' && !(t.tags || []).includes(tagFilter)) return false;
      if (!q) return true;
      const name = t.assignee_id ? profiles.get(t.assignee_id)?.full_name || '' : '';
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        name.toLowerCase().includes(q)
      );
    });
  }, [tasks, search, selectedSpace, selectedList, assigneeFilter, statusFilter, priorityFilter, tagFilter, profiles, projectSpaceMap]);

  // ─── Task CRUD ───────────────────────────────────────────────────────

  const reset = () => {
    setEditing(null);
    setSelectedTagIds([]);
    setFormAssignees([]);
    setFormRecurrence(null);
    setForm({ title: '', description: '', assignee_id: '', due_date: '', priority: 'normal', status: 'open' });
  };

  function openCreate() { reset(); setDialog(true); }

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
        recurrence_rule: formRecurrence,
      };
      if (editing) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', editing.id);
        if (error) throw error;
        if (formAssignees.length > 0) {
          await supabase.from('task_assignees').delete().eq('task_id', editing.id);
          await supabase.from('task_assignees').insert(
            formAssignees.map((uid) => ({ task_id: editing.id, user_id: uid })),
          );
        }
        await logAudit('task_updated', `Task "${payload.title}" updated`, profile);
        toast({ title: 'Task updated' });
      } else {
        const maxSort = tasks.filter((t) => t.status === form.status).length;
        const { data: newTask, error } = await supabase.from('tasks').insert({
          ...payload,
          created_by: profile?.id || null,
          sort_order: maxSort,
        }).select('id').single();
        if (error) throw error;
        if (formAssignees.length > 0 && newTask) {
          await supabase.from('task_assignees').insert(
            formAssignees.map((uid) => ({ task_id: newTask.id, user_id: uid })),
          );
        }
        await logAudit('task_created', `Task "${payload.title}" created`, profile);
        if (payload.assignee_id && payload.assignee_id !== profile?.id) {
          void notifyUser({
            userId: payload.assignee_id,
            type: 'task.assigned',
            module: 'tasks',
            title: 'New task assigned to you',
            body: `"${payload.title}" was assigned to you by ${profile?.full_name || 'someone'}`,
          });
        }
        for (const uid of formAssignees) {
          if (uid !== profile?.id) {
            void notifyUser({
              userId: uid,
              type: 'task.assigned',
              module: 'tasks',
              title: 'New task assigned to you',
              body: `"${payload.title}" was assigned to you by ${profile?.full_name || 'someone'}`,
            });
          }
        }
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

  const handleFieldChange = async (taskId: string, field: string, value: any) => {
    const update: Record<string, any> = { [field]: value };
    const { error } = await supabase.from('tasks').update(update).eq('id', taskId);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      await logAudit('task_updated', `Task "${task.title}" ${field} changed`, profile);
      if (field === 'assignee_id' && value && value !== profile?.id) {
        void notifyUser({
          userId: value,
          type: 'task.assigned',
          module: 'tasks',
          title: 'Task assigned to you',
          body: `"${task.title}" was assigned to you by ${profile?.full_name || 'someone'}`,
        });
      }
    }
    load();
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
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
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
    setSpaceForm({ name: '', color: '#6366f1', description: '', is_private: false });
    setSpaceDialog(true);
  };

  const openEditSpace = (space: Space) => {
    setEditingSpace(space);
    setSpaceForm({ name: space.name, color: space.color, description: space.description || '', is_private: space.is_private });
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
          is_private: spaceForm.is_private,
        }).eq('id', editingSpace.id);
        if (error) throw error;
        await logAudit('space_updated', `Space "${spaceForm.name}" updated`, profile);
        toast({ title: 'Space updated' });
      } else {
        const { error, data: newSpace } = await supabase.from('project_spaces').insert({
          name: spaceForm.name.trim(),
          color: spaceForm.color,
          description: spaceForm.description || null,
          is_private: spaceForm.is_private,
          owner_id: profile?.id || null,
          created_by: profile?.id || null,
          sort_order: spaces.length,
        }).select('id').single();
        if (error) throw error;
        if (spaceForm.is_private && newSpace && profile?.id) {
          await supabase.from('space_members').insert({
            space_id: newSpace.id,
            user_id: profile.id,
            role: 'owner',
            added_by: profile.id,
          });
        }
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

  // ─── Folder / List CRUD ──────────────────────────────────────────────

  const handleCreateFolder = async (spaceId: string) => {
    const name = prompt('Folder name:');
    if (!name?.trim()) return;
    const { error } = await supabase.from('space_folders').insert({
      space_id: spaceId, name: name.trim(),
      sort_order: folders.filter((f) => f.space_id === spaceId).length,
      created_by: profile?.id || null,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Folder created' });
    load();
  };

  const handleCreateList = async (spaceId: string, folderId?: string) => {
    const name = prompt('List name:');
    if (!name?.trim()) return;
    const { error } = await supabase.from('task_lists').insert({
      space_id: spaceId, folder_id: folderId || null, name: name.trim(),
      sort_order: taskLists.filter((l) => l.space_id === spaceId).length,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'List created' });
    load();
  };

  const handleRenameFolder = async (folder: SpaceFolder) => {
    const name = prompt('Rename folder:', folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    const { error } = await supabase.from('space_folders').update({ name: name.trim() }).eq('id', folder.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Folder renamed' });
    load();
  };

  const handleDeleteFolder = async (folder: SpaceFolder) => {
    if (!(await confirm({ title: 'Delete folder?', description: `Delete folder "${folder.name}"? Lists inside will be moved out of the folder.`, variant: 'destructive' }))) return;
    const { error } = await supabase.from('space_folders').delete().eq('id', folder.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Folder deleted' });
    load();
  };

  const handleRenameList = async (list: TaskList) => {
    const name = prompt('Rename list:', list.name);
    if (!name?.trim() || name.trim() === list.name) return;
    const { error } = await supabase.from('task_lists').update({ name: name.trim() }).eq('id', list.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'List renamed' });
    load();
  };

  const handleDeleteList = async (list: TaskList) => {
    if (!(await confirm({ title: 'Delete list?', description: `Delete list "${list.name}"? Tasks in this list will become unassigned.`, variant: 'destructive' }))) return;
    await supabase.from('tasks').update({ list_id: null }).eq('list_id', list.id);
    const { error } = await supabase.from('task_lists').delete().eq('id', list.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    if (selectedList === list.id) setSelectedList(null);
    toast({ title: 'List deleted' });
    load();
  };

  // ─── View helpers ────────────────────────────────────────────────────

  const viewTitle = useMemo(() => {
    if (currentView === 'my-tasks') return 'My Tasks';
    if (currentView === 'dashboard') return 'Dashboard';
    if (currentView === 'workload') return 'Workload';
    if (currentView === 'activity') return 'Activity';
    if (currentView === 'time-report') return 'Time Reports';
    if (selectedList) {
      const l = taskLists.find((l) => l.id === selectedList);
      return l?.name ?? 'List';
    }
    if (selectedSpace === '__unassigned__') return 'Unorganized Tasks';
    if (selectedSpace) {
      const sp = spaces.find((s) => s.id === selectedSpace);
      return sp?.name ?? 'Tasks';
    }
    return 'All Tasks';
  }, [currentView, selectedSpace, selectedList, spaces, taskLists]);

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
  if (tagFilter !== 'all') {
    const tagName = availableTags.find((t) => t.id === tagFilter)?.name ?? tagFilter;
    activeFilters.push({ key: 'tag', label: `Tag: ${tagName}`, onRemove: () => setTagFilter('all') });
  }

  const clearFilters = () => {
    setAssigneeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setTagFilter('all');
    setSearch('');
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100dvh-theme(spacing.14)-theme(spacing.8)-3.5rem-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-theme(spacing.14)-theme(spacing.8))] -m-4 md:-m-5 lg:-m-6">
      {/* ─── Module Sidebar ─────────────────────────────────────────── */}
      <div className="hidden md:flex w-[220px] lg:w-[240px] shrink-0 border-r border-border/60 bg-card/50 p-3 overflow-y-auto">
        <TaskSidebar
          spaces={spaces}
          folders={folders}
          lists={taskLists}
          selectedSpace={selectedSpace}
          selectedList={selectedList}
          currentView={currentView}
          taskCounts={taskCounts}
          spaceTaskCounts={spaceTaskCounts}
          listTaskCounts={listTaskCounts}
          onSelectSpace={setSelectedSpace}
          onSelectList={setSelectedList}
          onChangeView={(v) => { setCurrentView(v); setSelectedTasks(new Set()); }}
          onCreateSpace={openCreateSpace}
          onEditSpace={openEditSpace}
          onDeleteSpace={(s) => setPendingDeleteSpace(s)}
          onManageMembers={(s) => setMembersSpace(s)}
          onManageStatuses={(s) => setStatusManagerSpace(s)}
          onCreateFolder={handleCreateFolder}
          onCreateList={handleCreateList}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameList={handleRenameList}
          onDeleteList={handleDeleteList}
          favoriteSpaceIds={favoriteSpaceIds}
          onToggleFavorite={toggleFavoriteSpace}
          unorganizedCount={unorganizedCount}
        />
      </div>

      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[260px] p-3 pt-8">
          <TaskSidebar
            spaces={spaces}
            folders={folders}
            lists={taskLists}
            selectedSpace={selectedSpace}
            selectedList={selectedList}
            currentView={currentView}
            taskCounts={taskCounts}
            spaceTaskCounts={spaceTaskCounts}
            listTaskCounts={listTaskCounts}
            onSelectSpace={(id) => { setSelectedSpace(id); setSidebarOpen(false); }}
            onSelectList={(id) => { setSelectedList(id); setSidebarOpen(false); }}
            onChangeView={(v) => { setCurrentView(v); setSidebarOpen(false); setSelectedTasks(new Set()); }}
            onCreateSpace={openCreateSpace}
            onEditSpace={openEditSpace}
            onDeleteSpace={(s) => setPendingDeleteSpace(s)}
            onManageMembers={(s) => setMembersSpace(s)}
            onManageStatuses={(s) => setStatusManagerSpace(s)}
            onCreateFolder={handleCreateFolder}
            onCreateList={handleCreateList}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameList={handleRenameList}
            onDeleteList={handleDeleteList}
            favoriteSpaceIds={favoriteSpaceIds}
            onToggleFavorite={toggleFavoriteSpace}
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
                {currentView !== 'my-tasks' && currentView !== 'dashboard' && currentView !== 'workload' && currentView !== 'activity' && currentView !== 'time-report' && (
                  <p className="text-xs text-muted-foreground">
                    {visible.length} task{visible.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentView !== 'my-tasks' && currentView !== 'dashboard' && currentView !== 'workload' && currentView !== 'activity' && currentView !== 'time-report' && (
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
                      {availableTags.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tag</Label>
                          <Select value={tagFilter} onValueChange={setTagFilter}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All tags</SelectItem>
                              {availableTags.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
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

              {currentView !== 'my-tasks' && currentView !== 'dashboard' && currentView !== 'workload' && currentView !== 'activity' && currentView !== 'time-report' && (
                <>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs hidden sm:flex" onClick={() => setTemplatesDialog(true)}>
                    <ListTodo className="h-3.5 w-3.5" />
                    Templates
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs hidden sm:flex" onClick={() => setImportExportDialog(true)}>
                    <Download className="h-3.5 w-3.5" />
                    Import/Export
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs hidden lg:flex" onClick={() => setFormBuilderDialog(true)}>
                    <FileText className="h-3.5 w-3.5" />
                    Forms
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs hidden lg:flex" onClick={() => setCalendarDialog(true)}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    Calendar Sync
                  </Button>
                </>
              )}

              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New task</span>
              </Button>
            </div>
          </div>

          {/* Saved views */}
          {currentView !== 'my-tasks' && currentView !== 'dashboard' && currentView !== 'workload' && currentView !== 'activity' && currentView !== 'time-report' && (
            <div className="px-4 lg:px-6 pb-1">
              <SavedViewsPanel
                spaceId={selectedSpace}
                currentFilters={{
                  assignee: assigneeFilter,
                  status: statusFilter,
                  priority: priorityFilter,
                  tag: tagFilter,
                  search,
                }}
                currentViewType={currentView}
                onApplyView={(v: SavedView) => {
                  setCurrentView(v.view_type as any);
                  if (v.filters.assignee) setAssigneeFilter(v.filters.assignee);
                  if (v.filters.status) setStatusFilter(v.filters.status);
                  if (v.filters.priority) setPriorityFilter(v.filters.priority);
                  if (v.filters.tag) setTagFilter(v.filters.tag);
                  if (v.filters.search) setSearch(v.filters.search);
                }}
              />
            </div>
          )}

          {/* Active filter pills */}
          {activeFilters.length > 0 && currentView !== 'my-tasks' && currentView !== 'dashboard' && currentView !== 'workload' && currentView !== 'activity' && currentView !== 'time-report' && (
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
              onFieldChange={handleFieldChange}
              onTaskClick={(t) => setDetailTask(t)}
              onCreateTask={openCreateWithStatus}
              onQuickCreate={handleQuickCreate}
              spaces={spaces}
              folders={folders}
              lists={taskLists}
              onUpdate={() => load()}
            />
          ) : currentView === 'calendar' ? (
            <TaskCalendarView
              tasks={visible}
              profiles={profiles}
              onTaskClick={(t) => setDetailTask(t)}
            />
          ) : currentView === 'gantt' ? (
            <TaskGanttView
              tasks={visible}
              profiles={profiles}
              onTaskClick={(t) => setDetailTask(t)}
              dependencies={dependencies}
            />
          ) : currentView === 'workload' ? (
            <TaskWorkloadView
              tasks={tasks}
              profiles={profiles}
              onTaskClick={(t) => setDetailTask(t)}
            />
          ) : currentView === 'activity' ? (
            <TaskActivityView
              tasks={tasks}
              profiles={profiles}
              onTaskClick={(t) => setDetailTask(t)}
            />
          ) : currentView === 'time-report' ? (
            <TaskTimeReportView
              tasks={tasks}
              profiles={profiles}
              onTaskClick={(t) => setDetailTask(t)}
            />
          ) : currentView === 'list' || currentView === 'table' ? (
            <TaskListView
              tasks={visible}
              profiles={profiles}
              availableTags={availableTags}
              subtaskCounts={subtaskCounts}
              commentCounts={commentCountsState}
              onTaskClick={(t) => setDetailTask(t)}
              onUpdate={() => load()}
              selectedTasks={selectedTasks}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAllVisible}
              tableMode={currentView === 'table'}
              spaces={spaces}
              folders={folders}
              lists={taskLists}
            />
          ) : null}

          {hasMore && !loading && currentView !== 'dashboard' && (
            <div className="flex justify-center py-4">
              <Button variant="outline" size="sm" onClick={() => load(true)} className="text-xs gap-1.5">
                <Loader2 className="h-3 w-3" /> Load more tasks
              </Button>
            </div>
          )}
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
        <DialogContent className="max-w-4xl h-[85vh] p-0 overflow-hidden flex flex-col" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{detailTask?.title || 'Task details'}</DialogTitle>
          {detailTask && (
            <TaskDetailPanel
              task={detailTask}
              profiles={profiles}
              availableTags={availableTags}
              allTasks={allTasks as Task[]}
              onClose={() => setDetailTask(null)}
              onUpdate={load}
              onTaskClick={(t) => setDetailTask(t)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Create / Edit Task Dialog ──────────────────────────────── */}
      <ResponsiveDialog
        open={dialog}
        onOpenChange={(v) => { setDialog(v); if (!v) reset(); }}
        title={editing ? 'Edit task' : 'New task'}
        size="2xl"
        footer={<>
          <Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? 'Save changes' : 'Create task'}
          </Button>
        </>}
      >
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
                {formAssignees.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {formAssignees.map((uid) => (
                      <span key={uid} className="inline-flex items-center gap-1 text-[10px] bg-muted rounded-full px-2 py-0.5">
                        {profiles.get(uid)?.full_name || 'Unknown'}
                        <button onClick={() => setFormAssignees((prev) => prev.filter((id) => id !== uid))} className="hover:text-destructive">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Select value="" onValueChange={(uid) => {
                  if (uid && uid !== form.assignee_id && !formAssignees.includes(uid)) {
                    setFormAssignees((prev) => [...prev, uid]);
                  }
                }}>
                  <SelectTrigger className="h-7 text-[10px] mt-1">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <User className="h-3 w-3" /> Add more assignees
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(profiles.values())
                      .filter((p) => p.id !== form.assignee_id && !formAssignees.includes(p.id))
                      .map((p) => (
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
            <div className="space-y-1">
              <Label>Recurrence</Label>
              <RecurrenceEditor value={formRecurrence} onChange={setFormRecurrence} />
            </div>
          </div>
      </ResponsiveDialog>

      {/* ─── Create / Edit Space Dialog ─────────────────────────────── */}
      <ResponsiveDialog
        open={spaceDialog}
        onOpenChange={(v) => { setSpaceDialog(v); if (!v) setEditingSpace(null); }}
        title={editingSpace ? 'Edit space' : 'New space'}
        size="md"
        footer={<>
          <Button variant="outline" onClick={() => setSpaceDialog(false)}>Cancel</Button>
          <Button onClick={saveSpace} disabled={savingSpace}>
            {savingSpace && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingSpace ? 'Save' : 'Create space'}
          </Button>
        </>}
      >
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
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
              <div className="space-y-0.5">
                <Label className="text-sm">Private space</Label>
                <p className="text-[11px] text-muted-foreground">Only members can see tasks in this space</p>
              </div>
              <Switch
                checked={spaceForm.is_private}
                onCheckedChange={(v) => setSpaceForm({ ...spaceForm, is_private: v })}
              />
            </div>
          </div>
      </ResponsiveDialog>

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

      {/* ─── Space Members Dialog ──────────────────────────────── */}
      {membersSpace && (
        <SpaceMembersDialog
          space={membersSpace}
          open={!!membersSpace}
          onClose={() => setMembersSpace(null)}
          profiles={profiles}
        />
      )}

      {/* ─── Space Status Manager Dialog ───────────────────────── */}
      {statusManagerSpace && (
        <SpaceStatusManager
          spaceId={statusManagerSpace.id}
          spaceName={statusManagerSpace.name}
          open={!!statusManagerSpace}
          onClose={() => setStatusManagerSpace(null)}
        />
      )}

      <TaskTemplatesDialog
        open={templatesDialog}
        onClose={() => setTemplatesDialog(false)}
        currentTask={detailTask}
        onApplyTemplate={(data) => {
          setForm({
            title: data.title || '',
            description: data.description || '',
            assignee_id: '',
            due_date: '',
            priority: data.priority || 'normal',
            status: data.status || 'open',
          });
          if (data.tags) setSelectedTagIds(data.tags);
          setDialog(true);
        }}
      />

      {/* Import/Export Dialog */}
      <TaskImportExportDialog
        open={importExportDialog}
        onOpenChange={setImportExportDialog}
        tasks={visible}
        profiles={profiles}
        onUpdate={() => load()}
        currentListId={selectedList}
        currentProjectId={selectedSpace ? (projectSpaceMap.get(selectedSpace) ?? null) : null}
      />

      {/* Google Calendar Sync Dialog */}
      <ResponsiveDialog
        open={calendarDialog}
        onOpenChange={setCalendarDialog}
        title="Google Calendar Sync"
        size="lg"
      >
        <GoogleCalendarSync tasks={tasks} />
      </ResponsiveDialog>

      {/* Form Builder Dialog */}
      <TaskFormBuilder
        open={formBuilderDialog}
        onOpenChange={setFormBuilderDialog}
        spaces={spaces}
        lists={taskLists}
        profiles={profiles}
        onSaved={() => load()}
      />
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
      .select('id, title, due_date, priority')
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
