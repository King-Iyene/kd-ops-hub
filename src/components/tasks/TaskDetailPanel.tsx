import { useCallback, useEffect, useState } from 'react';
import {
  Plus, CheckCircle2, Clock, Send, X, Pencil, Trash2, Loader2,
  MessageSquare, ChevronDown, ChevronRight, Flag, User, Calendar,
  CornerDownRight, Activity, ArrowRight, Tag as TagIcon, UserPlus,
  RotateCcw, Link2, AlertTriangle, Play, Square, Timer,
  CheckSquare, Eye, Bug, Milestone, Sparkles, ListChecks,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { notifyUser } from '@/lib/notify';
import { formatDate, formatDateTime, daysUntil } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type {
  Task, TaskStatus, Priority, ProfileRow, Tag, TaskComment,
  TaskDependency, TaskChecklist, TaskTimeEntry, DependencyType, TaskType,
} from '@/lib/task-types';
import { STATUSES, PRIORITY_OPTIONS, STATUS_DOT } from '@/lib/task-types';

interface GoalRow {
  id: string;
  title: string;
  scope: string;
  quarter: string;
  status: string;
  progress_pct: number;
}

interface TaskDetailPanelProps {
  task: Task;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  allTasks: Task[];
  onClose: () => void;
  onUpdate: () => void;
  onTaskClick?: (task: Task) => void;
}

const TASK_TYPE_CONFIG: Record<TaskType, { icon: typeof Bug; label: string; color: string }> = {
  task: { icon: CheckSquare, label: 'Task', color: 'text-blue-500' },
  bug: { icon: Bug, label: 'Bug', color: 'text-red-500' },
  feature: { icon: Sparkles, label: 'Feature', color: 'text-purple-500' },
  milestone: { icon: Milestone, label: 'Milestone', color: 'text-amber-500' },
};

export function TaskDetailPanel({
  task, profiles, availableTags, allTasks, onClose, onUpdate, onTaskClick,
}: TaskDetailPanelProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [checklists, setChecklists] = useState<TaskChecklist[]>([]);
  const [timeEntries, setTimeEntries] = useState<TaskTimeEntry[]>([]);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [watchers, setWatchers] = useState<string[]>([]);

  const [newSubtask, setNewSubtask] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [newChecklist, setNewChecklist] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState<'comments' | 'activity'>('comments');
  const [timerRunning, setTimerRunning] = useState(false);
  const [activeTimerEntry, setActiveTimerEntry] = useState<TaskTimeEntry | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descDraft, setDescDraft] = useState(task.description || '');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const [availableGoals, setAvailableGoals] = useState<GoalRow[]>([]);

  // Dependency add state
  const [showDepAdd, setShowDepAdd] = useState(false);
  const [depTaskId, setDepTaskId] = useState('');
  const [depType, setDepType] = useState<DependencyType>('blocks');

  const loadSubtasks = useCallback(async () => {
    const { data } = await supabase
      .from('tasks').select('*').eq('parent_id', task.id)
      .order('sort_order').order('created_at');
    setSubtasks((data as Task[]) || []);
  }, [task.id]);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from('task_comments').select('*').eq('task_id', task.id)
      .order('created_at', { ascending: true });
    setComments((data as TaskComment[]) || []);
  }, [task.id]);

  const loadDependencies = useCallback(async () => {
    const { data } = await supabase
      .from('task_dependencies').select('*')
      .or(`task_id.eq.${task.id},depends_on_id.eq.${task.id}`);
    setDependencies((data as TaskDependency[]) || []);
  }, [task.id]);

  const loadChecklists = useCallback(async () => {
    const { data } = await supabase
      .from('task_checklists').select('*').eq('task_id', task.id)
      .order('sort_order').order('created_at');
    setChecklists((data as TaskChecklist[]) || []);
  }, [task.id]);

  const loadTimeEntries = useCallback(async () => {
    const { data } = await supabase
      .from('task_time_entries').select('*').eq('task_id', task.id)
      .order('started_at', { ascending: false }).limit(20);
    setTimeEntries((data as TaskTimeEntry[]) || []);
    const running = (data as TaskTimeEntry[])?.find((e) => !e.ended_at && e.user_id === profile?.id);
    if (running) { setTimerRunning(true); setActiveTimerEntry(running); }
    else { setTimerRunning(false); setActiveTimerEntry(null); }
  }, [task.id, profile?.id]);

  const loadActivities = useCallback(async () => {
    const { data } = await supabase
      .from('task_activity').select('*').eq('task_id', task.id)
      .order('created_at', { ascending: false }).limit(50);
    setActivities((data as TaskActivity[]) || []);
  }, [task.id]);

  const loadWatchers = useCallback(async () => {
    const { data } = await supabase
      .from('task_watchers').select('user_id').eq('task_id', task.id);
    setWatchers((data || []).map((w: any) => w.user_id));
  }, [task.id]);

  useEffect(() => {
    loadSubtasks();
    loadComments();
    loadDependencies();
    loadChecklists();
    loadTimeEntries();
    loadActivities();
    loadWatchers();
    supabase.from('goals').select('id, title, scope, quarter, status, progress_pct')
      .neq('status', 'missed').order('quarter', { ascending: false }).limit(50)
      .then(({ data }) => setAvailableGoals((data as GoalRow[]) || []));
  }, [loadSubtasks, loadComments, loadDependencies, loadChecklists, loadTimeEntries, loadActivities, loadWatchers]);

  // ─── Subtask actions ────────────────────────────────────────
  const addSubtask = async () => {
    if (!newSubtask.trim() || !profile) return;
    setAddingSubtask(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        title: newSubtask.trim(), parent_id: task.id,
        created_by: profile.id, status: 'open', priority: 'normal',
        sort_order: subtasks.length, project_id: task.project_id,
        list_id: task.list_id, task_type: 'task',
      });
      if (error) throw error;
      setNewSubtask('');
      await loadSubtasks();
      onUpdate();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setAddingSubtask(false); }
  };

  const toggleSubtask = async (sub: Task) => {
    const newStatus: TaskStatus = sub.status === 'complete' ? 'open' : 'complete';
    await supabase.from('tasks').update({
      status: newStatus, completed_at: newStatus === 'complete' ? new Date().toISOString() : null,
    }).eq('id', sub.id);
    await loadSubtasks();
    onUpdate();
  };

  const deleteSubtask = async (subId: string) => {
    await supabase.from('tasks').delete().eq('id', subId);
    await loadSubtasks();
    onUpdate();
  };

  // ─── Checklist actions ──────────────────────────────────────
  const addChecklistItem = async () => {
    if (!newChecklist.trim()) return;
    const { error } = await supabase.from('task_checklists').insert({
      task_id: task.id, title: newChecklist.trim(), sort_order: checklists.length,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setNewChecklist('');
    await loadChecklists();
  };

  const toggleChecklistItem = async (item: TaskChecklist) => {
    await supabase.from('task_checklists').update({ is_checked: !item.is_checked }).eq('id', item.id);
    await loadChecklists();
  };

  const deleteChecklistItem = async (id: string) => {
    await supabase.from('task_checklists').delete().eq('id', id);
    await loadChecklists();
  };

  // ─── Dependency actions ─────────────────────────────────────
  const addDependency = async () => {
    if (!depTaskId) return;
    const { error } = await supabase.from('task_dependencies').insert({
      task_id: task.id, depends_on_id: depTaskId, dependency_type: depType,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setShowDepAdd(false);
    setDepTaskId('');
    await loadDependencies();
  };

  const removeDependency = async (id: string) => {
    await supabase.from('task_dependencies').delete().eq('id', id);
    await loadDependencies();
  };

  // ─── Time tracking ─────────────────────────────────────────
  const startTimer = async () => {
    if (!profile) return;
    const { error } = await supabase.from('task_time_entries').insert({
      task_id: task.id, user_id: profile.id,
    });
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await loadTimeEntries();
  };

  const stopTimer = async () => {
    if (!activeTimerEntry) return;
    const started = new Date(activeTimerEntry.started_at);
    const duration = Math.round((Date.now() - started.getTime()) / 60000);
    const { error } = await supabase.from('task_time_entries').update({
      ended_at: new Date().toISOString(), duration_minutes: duration,
    }).eq('id', activeTimerEntry.id);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await supabase.from('tasks').update({
      time_spent_minutes: task.time_spent_minutes + duration,
    }).eq('id', task.id);
    await loadTimeEntries();
    onUpdate();
  };

  // ─── Watchers ───────────────────────────────────────────────
  const toggleWatch = async () => {
    if (!profile) return;
    if (watchers.includes(profile.id)) {
      await supabase.from('task_watchers').delete().eq('task_id', task.id).eq('user_id', profile.id);
    } else {
      await supabase.from('task_watchers').insert({ task_id: task.id, user_id: profile.id });
    }
    await loadWatchers();
  };

  // ─── Comment ────────────────────────────────────────────────
  const addComment = async () => {
    if (!newComment.trim() || !profile) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('task_comments').insert({
        task_id: task.id, author_id: profile.id, body: newComment.trim(),
      });
      if (error) throw error;
      await logAudit('task_commented', `Commented on "${task.title}"`, profile);
      // Notify task assignee and creator about the comment
      const notifyIds = new Set<string>();
      if (task.assignee_id && task.assignee_id !== profile?.id) notifyIds.add(task.assignee_id);
      if (task.created_by && task.created_by !== profile?.id) notifyIds.add(task.created_by);
      for (const uid of notifyIds) {
        void notifyUser({
          userId: uid,
          type: 'task.commented',
          module: 'tasks',
          title: 'New comment on task',
          body: `${profile?.full_name || 'Someone'} commented on "${task.title}"`,
        });
      }
      setNewComment('');
      await loadComments();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setPosting(false); }
  };

  // ─── Comment edit / delete ──────────────────────────────────
  const startEditComment = (c: TaskComment) => {
    setEditingCommentId(c.id);
    setEditCommentBody(c.body);
  };

  const saveEditComment = async () => {
    if (!editingCommentId || !editCommentBody.trim()) return;
    const { error } = await supabase.from('task_comments').update({ body: editCommentBody.trim() }).eq('id', editingCommentId);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    setEditingCommentId(null);
    setEditCommentBody('');
    await loadComments();
  };

  const deleteComment = async (commentId: string) => {
    const { error } = await supabase.from('task_comments').delete().eq('id', commentId);
    if (error) { toast({ title: 'Failed', description: error.message, variant: 'destructive' }); return; }
    await loadComments();
  };

  // ─── Field update ───────────────────────────────────────────
  const updateField = async (field: string, value: any) => {
    const oldValue = (task as any)[field];
    const update: Record<string, any> = { [field]: value };
    if (field === 'status' && value === 'complete') update.completed_at = new Date().toISOString();
    if (field === 'status' && value !== 'complete') update.completed_at = null;

    const { error } = await supabase.from('tasks').update(update).eq('id', task.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('task_updated', `Updated "${task.title}" ${field}`, profile);

    // Notify on assignment changes
    if (field === 'assignee_id' && value && value !== profile?.id) {
      void notifyUser({
        userId: value,
        type: 'task.assigned',
        module: 'tasks',
        title: 'Task assigned to you',
        body: `"${task.title}" was assigned to you by ${profile?.full_name || 'someone'}`,
      });
    }
    // Notify assignee on status changes
    if (field === 'status' && task.assignee_id && task.assignee_id !== profile?.id) {
      void notifyUser({
        userId: task.assignee_id,
        type: value === 'complete' ? 'task.completed' : 'task.status_changed',
        module: 'tasks',
        title: value === 'complete' ? 'Task marked complete' : 'Task status changed',
        body: `"${task.title}" was ${value === 'complete' ? 'marked complete' : `moved to ${value}`} by ${profile?.full_name || 'someone'}`,
      });
    }

    const actionMap: Record<string, string> = {
      status: value === 'complete' ? 'completed' : oldValue === 'complete' ? 'reopened' : 'status_changed',
      priority: 'priority_changed',
      assignee_id: 'assigned',
      due_date: 'due_date_changed',
    };
    const action = actionMap[field] || 'updated';
    await supabase.from('task_activity').insert({
      task_id: task.id, user_id: profile?.id || null, action, field,
      old_value: oldValue != null ? String(oldValue) : null,
      new_value: value != null ? String(value) : null,
    }).then(() => loadActivities());

    onUpdate();
  };

  // ─── Computed ───────────────────────────────────────────────
  const assignee = task.assignee_id ? profiles.get(task.assignee_id) : null;
  const creator = task.created_by ? profiles.get(task.created_by) : null;
  const d = task.due_date ? daysUntil(task.due_date) : null;
  const overdue = task.status !== 'complete' && d !== null && d < 0;
  const doneSubtasks = subtasks.filter((s) => s.status === 'complete').length;
  const checkedItems = checklists.filter((c) => c.is_checked).length;
  const totalTimeLogged = timeEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const typeConfig = TASK_TYPE_CONFIG[task.task_type || 'task'];

  const blocking = dependencies.filter((dep) => dep.task_id === task.id && dep.dependency_type === 'blocks');
  const blockedBy = dependencies.filter((dep) => dep.depends_on_id === task.id && dep.dependency_type === 'blocks')
    .concat(dependencies.filter((dep) => dep.task_id === task.id && dep.dependency_type === 'is_blocked_by'));
  const relatedDeps = dependencies.filter((dep) => dep.dependency_type === 'relates_to');

  const depTaskOptions = allTasks.filter((t) => t.id !== task.id && t.parent_id !== task.id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-border/40">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <typeConfig.icon className={cn('h-4 w-4 shrink-0', typeConfig.color)} />
            {task.parent_id && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Subtask</span>
            )}
          </div>
          {editingTitle ? (
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="text-base font-semibold h-8 px-1"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && titleDraft.trim()) {
                  updateField('title', titleDraft.trim());
                  setEditingTitle(false);
                }
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              onBlur={() => {
                if (titleDraft.trim() && titleDraft.trim() !== task.title) {
                  updateField('title', titleDraft.trim());
                }
                setEditingTitle(false);
              }}
            />
          ) : (
            <h2
              className="text-base font-semibold leading-snug cursor-pointer hover:text-primary/80 transition-colors"
              onClick={() => { setTitleDraft(task.title); setEditingTitle(true); }}
            >
              {task.title}
            </h2>
          )}
          {creator && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Created by {creator.full_name} · {formatDate(task.created_at)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TooltipWrap tip={watchers.includes(profile?.id || '') ? 'Unwatch' : 'Watch'}>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={toggleWatch}>
              <Eye className={cn('h-4 w-4', watchers.includes(profile?.id || '') && 'text-primary')} />
            </Button>
          </TooltipWrap>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row">
          {/* ─── Left Column: Content ──────────────── */}
          <div className="flex-1 min-w-0 p-5 space-y-5 border-r border-border/20">
            {/* Description */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</Label>
                {!editingDescription && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground" onClick={() => { setDescDraft(task.description || ''); setEditingDescription(true); }}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </div>
              {editingDescription ? (
                <div className="space-y-2">
                  <Textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    rows={4}
                    className="text-sm resize-y"
                    placeholder="Add a description..."
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={async () => {
                      await updateField('description', descDraft || null);
                      setEditingDescription(false);
                    }}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDescription(false)}>Cancel</Button>
                  </div>
                </div>
              ) : task.description ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed cursor-pointer hover:bg-muted/30 rounded p-1.5 -m-1.5 transition-colors"
                   onClick={() => { setDescDraft(task.description || ''); setEditingDescription(true); }}>
                  {task.description}
                </p>
              ) : (
                <button
                  onClick={() => { setDescDraft(''); setEditingDescription(true); }}
                  className="text-sm text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
                >
                  Click to add description...
                </button>
              )}
            </div>

            {/* Dependencies */}
            {(blocking.length > 0 || blockedBy.length > 0 || relatedDeps.length > 0 || showDepAdd) && (
              <DependencySection
                blocking={blocking}
                blockedBy={blockedBy}
                related={relatedDeps}
                task={task}
                allTasks={allTasks}
                onRemove={removeDependency}
                onTaskClick={onTaskClick}
              />
            )}

            {/* Subtasks — full task display */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Subtasks
                </Label>
                {subtasks.length > 0 && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">{doneSubtasks}/{subtasks.length}</span>
                )}
              </div>
              {subtasks.length > 0 && (
                <Progress value={subtasks.length > 0 ? (doneSubtasks / subtasks.length) * 100 : 0} className="h-1" />
              )}
              <div className="space-y-0.5">
                {subtasks.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
                    <button onClick={() => toggleSubtask(sub)} className="shrink-0">
                      <CheckCircle2 className={cn('h-4 w-4 transition-colors',
                        sub.status === 'complete' ? 'text-emerald-500 fill-emerald-500/20' : 'text-muted-foreground/30 hover:text-muted-foreground/60',
                      )} />
                    </button>
                    <button
                      onClick={() => onTaskClick?.(sub)}
                      className={cn('flex-1 text-sm text-left hover:text-primary transition-colors', sub.status === 'complete' && 'line-through text-muted-foreground')}
                    >
                      {sub.title}
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {sub.assignee_id && profiles.get(sub.assignee_id) && (
                        <span className="text-[9px] text-muted-foreground">{profiles.get(sub.assignee_id)!.full_name.split(' ')[0]}</span>
                      )}
                      {sub.due_date && (
                        <span className={cn('text-[10px] tabular-nums', sub.status !== 'complete' && daysUntil(sub.due_date) !== null && daysUntil(sub.due_date)! < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {formatDate(sub.due_date)}
                        </span>
                      )}
                      <div className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                        sub.priority === 'critical' && 'bg-red-500',
                        sub.priority === 'high' && 'bg-orange-400',
                        sub.priority === 'normal' && 'bg-blue-400',
                        sub.priority === 'low' && 'bg-slate-300 dark:bg-slate-600',
                      )} />
                    </div>
                    <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => deleteSubtask(sub.id)}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-8 text-sm"
                  placeholder="Add a subtask..."
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addSubtask(); }}
                />
                <Button size="sm" className="h-8 shrink-0" disabled={addingSubtask || !newSubtask.trim()} onClick={addSubtask}>
                  {addingSubtask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* Checklists */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <ListChecks className="h-3 w-3 inline mr-1" />Checklist
                </Label>
                {checklists.length > 0 && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">{checkedItems}/{checklists.length}</span>
                )}
              </div>
              {checklists.length > 0 && (
                <Progress value={checklists.length > 0 ? (checkedItems / checklists.length) * 100 : 0} className="h-1" />
              )}
              <div className="space-y-0.5">
                {checklists.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 group rounded-md px-2 py-1 hover:bg-muted/50 transition-colors">
                    <button onClick={() => toggleChecklistItem(item)} className="shrink-0">
                      {item.is_checked
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500/20" />
                        : <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30" />
                      }
                    </button>
                    <span className={cn('flex-1 text-sm', item.is_checked && 'line-through text-muted-foreground')}>{item.title}</span>
                    <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => deleteChecklistItem(item.id)}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-7 text-sm"
                  placeholder="Add checklist item..."
                  value={newChecklist}
                  onChange={(e) => setNewChecklist(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addChecklistItem(); }}
                />
                <Button size="sm" className="h-7 shrink-0" disabled={!newChecklist.trim()} onClick={addChecklistItem}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Comments / Activity tabs */}
            <div className="space-y-3">
              <div className="flex items-center gap-1 border-b border-border/40">
                {(['comments', 'activity'] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveDetailTab(tab)}
                    className={cn(
                      'px-3 py-2 text-xs font-medium transition-all border-b-2 -mb-px capitalize',
                      activeDetailTab === tab
                        ? 'text-primary border-primary'
                        : 'text-muted-foreground border-transparent hover:text-foreground',
                    )}>
                    {tab === 'comments' && <MessageSquare className="h-3 w-3 inline mr-1.5" />}
                    {tab === 'activity' && <Activity className="h-3 w-3 inline mr-1.5" />}
                    {tab}
                    {tab === 'comments' && comments.length > 0 && (
                      <span className="ml-1.5 text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">{comments.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {activeDetailTab === 'comments' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Write a comment... (Ctrl+Enter to send)"
                      rows={2}
                      className="text-sm resize-none"
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment(); }}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" onClick={addComment} disabled={posting || !newComment.trim()} className="h-7 text-xs">
                        {posting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                        Comment
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center">No comments yet.</p>
                    ) : comments.map((c) => {
                      const author = profiles.get(c.author_id);
                      const initials = author
                        ? author.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                        : '??';
                      const isOwn = c.author_id === profile?.id;
                      const isEditing = editingCommentId === c.id;
                      return (
                        <div key={c.id} className="flex gap-2.5 group">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[9px] font-bold leading-none">{initials}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">{author?.full_name || 'Unknown'}</span>
                              <span className="text-[10px] text-muted-foreground">{formatDateTime(c.created_at)}</span>
                              {isOwn && !isEditing && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEditComment(c)}>
                                    <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => deleteComment(c.id)}>
                                    <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {isEditing ? (
                              <div className="space-y-1.5 mt-1">
                                <Textarea
                                  value={editCommentBody}
                                  onChange={(e) => setEditCommentBody(e.target.value)}
                                  rows={2}
                                  className="text-sm resize-none"
                                  autoFocus
                                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditComment(); }}
                                />
                                <div className="flex gap-1.5">
                                  <Button size="sm" className="h-6 text-[11px]" onClick={saveEditComment} disabled={!editCommentBody.trim()}>Save</Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setEditingCommentId(null)}>Cancel</Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground/90 whitespace-pre-wrap mt-0.5 leading-relaxed">{c.body}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeDetailTab === 'activity' && (
                <div className="space-y-1">
                  {activities.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">No activity recorded yet.</p>
                  ) : activities.map((a) => {
                    const actor = a.user_id ? profiles.get(a.user_id) : null;
                    return (
                      <div key={a.id} className="flex items-start gap-2.5 px-1 py-1.5">
                        <ActivityIcon action={a.action} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs">
                            <span className="font-medium">{actor?.full_name || 'System'}</span>
                            {' '}
                            <span className="text-muted-foreground">{describeActivity(a, profiles)}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(a.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ─── Right Column: Metadata ────────────── */}
          <div className="w-full lg:w-60 shrink-0 p-5 space-y-4">
            {/* Task Type */}
            <MetaField label="Type">
              <Select value={task.task_type || 'task'} onValueChange={(v) => updateField('task_type', v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-1.5">
                        <cfg.icon className={cn('h-3 w-3', cfg.color)} />
                        {cfg.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaField>

            {/* Status */}
            <MetaField label="Status">
              <Select value={task.status} onValueChange={(v) => updateField('status', v)}>
                <SelectTrigger className="h-8 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className={cn('h-2 w-2 rounded-full', STATUS_DOT[task.status])} />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <div className="flex items-center gap-1.5">
                        <div className={cn('h-2 w-2 rounded-full', STATUS_DOT[s.value])} />
                        {s.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaField>

            {/* Priority */}
            <MetaField label="Priority">
              <Select value={task.priority} onValueChange={(v) => updateField('priority', v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </MetaField>

            {/* Assignee */}
            <MetaField label="Assignee">
              <Select value={task.assignee_id || '__none__'} onValueChange={(v) => updateField('assignee_id', v === '__none__' ? null : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {Array.from(profiles.values()).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </MetaField>

            {/* Start Date */}
            <MetaField label="Start Date">
              <Input
                type="date"
                className="h-8 text-xs"
                value={task.start_date || ''}
                onChange={(e) => updateField('start_date', e.target.value || null)}
              />
            </MetaField>

            {/* Due Date */}
            <MetaField label="Due Date">
              <Input
                type="date"
                className="h-8 text-xs"
                value={task.due_date || ''}
                onChange={(e) => updateField('due_date', e.target.value || null)}
              />
              {overdue && (
                <p className="text-[10px] text-destructive font-medium mt-1">{Math.abs(d!)} days overdue</p>
              )}
            </MetaField>

            {/* Time Tracking */}
            <MetaField label="Time Tracking">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {timerRunning ? (
                    <Button size="sm" variant="destructive" className="h-7 text-xs flex-1" onClick={stopTimer}>
                      <Square className="h-3 w-3 mr-1 fill-current" /> Stop
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={startTimer}>
                      <Play className="h-3 w-3 mr-1" /> Start timer
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Logged</span>
                  <span className="font-medium tabular-nums">{formatMinutes(totalTimeLogged)}</span>
                </div>
                {task.time_estimate_minutes && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Estimate</span>
                    <span className="font-medium tabular-nums">{formatMinutes(task.time_estimate_minutes)}</span>
                  </div>
                )}
                <Input
                  type="number"
                  className="h-7 text-xs"
                  placeholder="Set estimate (min)"
                  defaultValue={task.time_estimate_minutes ?? ''}
                  onBlur={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    if (val !== task.time_estimate_minutes) updateField('time_estimate_minutes', val);
                  }}
                />
                {timeEntries.length > 0 && (
                  <div className="space-y-0.5 mt-1 max-h-28 overflow-y-auto">
                    {timeEntries.filter((e) => e.ended_at).map((entry) => {
                      const who = entry.user_id ? profiles.get(entry.user_id) : null;
                      return (
                        <div key={entry.id} className="flex items-center justify-between text-[10px] text-muted-foreground px-1 py-0.5 rounded hover:bg-muted/40">
                          <span className="truncate">{who?.full_name?.split(' ')[0] || 'User'} · {new Date(entry.started_at).toLocaleDateString()}</span>
                          <span className="font-medium tabular-nums shrink-0">{formatMinutes(entry.duration_minutes || 0)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </MetaField>

            {/* Blocked Reason */}
            {task.status === 'blocked' && (
              <MetaField label="Blocked Reason">
                <Input
                  className="h-8 text-xs"
                  placeholder="Why is this blocked?"
                  defaultValue={task.blocked_reason || ''}
                  onBlur={(e) => updateField('blocked_reason', e.target.value || null)}
                />
              </MetaField>
            )}

            {/* Dependencies quick add */}
            <MetaField label="Dependencies">
              <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => setShowDepAdd(!showDepAdd)}>
                <Link2 className="h-3 w-3 mr-1" /> Add dependency
              </Button>
              {showDepAdd && (
                <div className="space-y-1.5 mt-2">
                  <Select value={depType} onValueChange={(v) => setDepType(v as DependencyType)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blocks">Blocking</SelectItem>
                      <SelectItem value="is_blocked_by">Blocked by</SelectItem>
                      <SelectItem value="relates_to">Related to</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={depTaskId} onValueChange={setDepTaskId}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select task..." /></SelectTrigger>
                    <SelectContent>
                      {depTaskOptions.slice(0, 50).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-7 text-xs w-full" disabled={!depTaskId} onClick={addDependency}>
                    Add
                  </Button>
                </div>
              )}
            </MetaField>

            {/* Tags */}
            {availableTags.length > 0 && (
              <MetaField label="Tags">
                <div className="flex flex-wrap gap-1">
                  {availableTags.map((tag) => {
                    const selected = task.tags?.includes(tag.id);
                    return (
                      <button key={tag.id}
                        onClick={() => {
                          const newTags = selected
                            ? (task.tags || []).filter((id) => id !== tag.id)
                            : [...(task.tags || []), tag.id];
                          updateField('tags', newTags);
                        }}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full font-medium border transition-all',
                          selected ? 'opacity-100' : 'opacity-30 hover:opacity-60',
                        )}
                        style={tag.color ? {
                          backgroundColor: `${tag.color}15`,
                          color: tag.color,
                          borderColor: `${tag.color}40`,
                        } : undefined}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </MetaField>
            )}

            {/* Watchers */}
            <MetaField label={`Watchers (${watchers.length})`}>
              <div className="flex flex-wrap gap-1">
                {watchers.map((uid) => {
                  const p = profiles.get(uid);
                  if (!p) return null;
                  return (
                    <span key={uid} className="text-[10px] bg-muted rounded-full px-2 py-0.5 font-medium">
                      {p.full_name.split(' ')[0]}
                    </span>
                  );
                })}
              </div>
            </MetaField>

            {/* Goal linking */}
            {availableGoals.length > 0 && (
              <MetaField label="Goal">
                <Select
                  value={task.goal_id || '__none__'}
                  onValueChange={(v) => updateField('goal_id', v === '__none__' ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No goal</SelectItem>
                    {availableGoals.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-muted-foreground shrink-0">{g.quarter}</span>
                          <span className="truncate">{g.title}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {task.goal_id && (() => {
                  const goal = availableGoals.find((g) => g.id === task.goal_id);
                  return goal ? (
                    <div className="flex items-center justify-between text-[10px] mt-1">
                      <span className="text-muted-foreground">{goal.quarter} · {goal.scope}</span>
                      <span className="font-medium tabular-nums">{goal.progress_pct}%</span>
                    </div>
                  ) : null;
                })()}
              </MetaField>
            )}

            {/* Quick actions */}
            <div className="pt-3 border-t border-border/40 space-y-1.5">
              {task.status !== 'complete' && (
                <Button size="sm" variant="outline" className="w-full h-8 text-xs justify-start"
                  onClick={() => updateField('status', 'complete')}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Mark complete
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TooltipWrap({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <div title={tip}>{children}</div>
  );
}

function DependencySection({
  blocking, blockedBy, related, task, allTasks, onRemove, onTaskClick,
}: {
  blocking: TaskDependency[];
  blockedBy: TaskDependency[];
  related: TaskDependency[];
  task: Task;
  allTasks: Task[];
  onRemove: (id: string) => void;
  onTaskClick?: (task: Task) => void;
}) {
  const findTask = (id: string) => allTasks.find((t) => t.id === id);

  const renderDep = (dep: TaskDependency, targetId: string, label: string, color: string) => {
    const t = findTask(targetId);
    if (!t) return null;
    return (
      <div key={dep.id} className="flex items-center gap-2 group">
        <span className={cn('text-[10px] font-medium shrink-0 w-[70px]', color)}>{label}</span>
        <button
          onClick={() => onTaskClick?.(t)}
          className="flex-1 text-xs text-left truncate hover:text-primary transition-colors"
        >
          {t.title}
        </button>
        <div className={cn('h-2 w-2 rounded-full shrink-0', STATUS_DOT[t.status])} />
        <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => onRemove(dep.id)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Link2 className="h-3 w-3 inline mr-1" />Dependencies
      </Label>
      <div className="space-y-1 rounded-lg border border-border/40 p-2">
        {blocking.map((dep) => renderDep(dep, dep.depends_on_id, 'Blocking', 'text-red-500'))}
        {blockedBy.map((dep) => {
          const targetId = dep.task_id === task.id ? dep.depends_on_id : dep.task_id;
          return renderDep(dep, targetId, 'Blocked by', 'text-amber-500');
        })}
        {related.map((dep) => {
          const targetId = dep.task_id === task.id ? dep.depends_on_id : dep.task_id;
          return renderDep(dep, targetId, 'Related', 'text-blue-500');
        })}
        {blocking.length === 0 && blockedBy.length === 0 && related.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-1">No dependencies</p>
        )}
      </div>
    </div>
  );
}

interface TaskActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ACTIVITY_ICONS: Record<string, typeof Activity> = {
  created: Plus,
  status_changed: ArrowRight,
  completed: CheckCircle2,
  reopened: RotateCcw,
  assigned: UserPlus,
  priority_changed: Flag,
  due_date_changed: Calendar,
  commented: MessageSquare,
  updated: Pencil,
  tag_added: TagIcon,
  tag_removed: TagIcon,
  subtask_added: CornerDownRight,
  subtask_removed: Trash2,
  moved: ArrowRight,
};

function ActivityIcon({ action }: { action: string }) {
  const Icon = ACTIVITY_ICONS[action] || Activity;
  const color = action === 'completed' ? 'text-emerald-500'
    : action === 'reopened' ? 'text-amber-500'
    : 'text-muted-foreground';
  return (
    <div className={cn('mt-0.5 h-5 w-5 rounded-full bg-muted/60 flex items-center justify-center shrink-0', color)}>
      <Icon className="h-3 w-3" />
    </div>
  );
}

function describeActivity(a: TaskActivity, profiles: Map<string, ProfileRow>): string {
  switch (a.action) {
    case 'created': return 'created this task';
    case 'completed': return 'marked as complete';
    case 'reopened': return 'reopened this task';
    case 'status_changed':
      return `changed status from ${a.old_value || '?'} to ${a.new_value || '?'}`;
    case 'assigned': {
      const assignee = a.new_value ? profiles.get(a.new_value)?.full_name : null;
      return assignee ? `assigned to ${assignee}` : 'unassigned';
    }
    case 'priority_changed':
      return `changed priority from ${a.old_value || '?'} to ${a.new_value || '?'}`;
    case 'due_date_changed':
      return a.new_value ? `set due date to ${a.new_value}` : 'removed due date';
    case 'commented': return 'added a comment';
    case 'subtask_added': return 'added a subtask';
    case 'subtask_removed': return 'removed a subtask';
    case 'tag_added': return 'added a tag';
    case 'tag_removed': return 'removed a tag';
    case 'moved': return `moved to ${a.new_value || 'another space'}`;
    default:
      return a.field ? `updated ${a.field}` : 'made a change';
  }
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
