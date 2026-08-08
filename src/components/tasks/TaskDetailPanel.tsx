import { useCallback, useEffect, useState } from 'react';
import {
  Plus, CheckCircle2, Clock, Send, X, Pencil, Trash2, Loader2,
  MessageSquare, ChevronDown, ChevronRight, Flag, User, Calendar,
  CornerDownRight, Activity,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime, daysUntil } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Task, TaskStatus, Priority, ProfileRow, Tag, TaskComment } from '@/lib/task-types';
import { STATUSES, PRIORITY_OPTIONS, PRIORITY_CLASS, STATUS_CLASS, STATUS_DOT } from '@/lib/task-types';

interface TaskDetailPanelProps {
  task: Task;
  profiles: Map<string, ProfileRow>;
  availableTags: Tag[];
  onClose: () => void;
  onUpdate: () => void;
}

export function TaskDetailPanel({
  task, profiles, availableTags, onClose, onUpdate,
}: TaskDetailPanelProps) {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'comments' | 'activity'>('comments');

  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState<string>('');

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

  useEffect(() => {
    loadSubtasks();
    loadComments();
  }, [loadSubtasks, loadComments]);

  const addSubtask = async () => {
    if (!newSubtask.trim() || !profile) return;
    setAddingSubtask(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        title: newSubtask.trim(), parent_id: task.id,
        created_by: profile.id, status: 'open', priority: 'normal',
        sort_order: subtasks.length, project_id: task.project_id,
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

  const addComment = async () => {
    if (!newComment.trim() || !profile) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('task_comments').insert({
        task_id: task.id, author_id: profile.id, body: newComment.trim(),
      });
      if (error) throw error;
      await logAudit('task_commented', `Commented on "${task.title}"`, profile);
      setNewComment('');
      await loadComments();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setPosting(false); }
  };

  const updateField = async (field: string, value: any) => {
    const update: Record<string, any> = { [field]: value };
    if (field === 'status' && value === 'complete') update.completed_at = new Date().toISOString();
    if (field === 'status' && value !== 'complete') update.completed_at = null;

    const { error } = await supabase.from('tasks').update(update).eq('id', task.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('task_updated', `Updated "${task.title}" ${field}`, profile);
    setEditingField(null);
    onUpdate();
  };

  const assignee = task.assignee_id ? profiles.get(task.assignee_id) : null;
  const creator = task.created_by ? profiles.get(task.created_by) : null;
  const d = task.due_date ? daysUntil(task.due_date) : null;
  const overdue = task.status !== 'complete' && d !== null && d < 0;
  const doneSubtasks = subtasks.filter((s) => s.status === 'complete').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-border/40">
        <div className="flex-1 min-w-0 pr-4">
          <h2 className="text-base font-semibold leading-snug">{task.title}</h2>
          {creator && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Created by {creator.full_name} · {formatDate(task.created_at)}
            </p>
          )}
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row">
          {/* ─── Left Column: Content ──────────────── */}
          <div className="flex-1 min-w-0 p-5 space-y-5 border-r border-border/20">
            {/* Description */}
            {task.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {task.description}
              </p>
            )}

            {/* Subtasks */}
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
                    <span className={cn('flex-1 text-sm', sub.status === 'complete' && 'line-through text-muted-foreground')}>{sub.title}</span>
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
                  {/* Comment input */}
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

                  {/* Comment list */}
                  <div className="space-y-3">
                    {comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-3 text-center">No comments yet. Be the first to comment.</p>
                    ) : comments.map((c) => {
                      const author = profiles.get(c.author_id);
                      const initials = author
                        ? author.full_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                        : '??';
                      return (
                        <div key={c.id} className="flex gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[9px] font-bold leading-none">{initials}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">{author?.full_name || 'Unknown'}</span>
                              <span className="text-[10px] text-muted-foreground">{formatDateTime(c.created_at)}</span>
                            </div>
                            <p className="text-sm text-foreground/90 whitespace-pre-wrap mt-0.5 leading-relaxed">{c.body}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeDetailTab === 'activity' && (
                <div className="py-3 text-center">
                  <p className="text-xs text-muted-foreground">Activity tracking will show status changes, assignments, and edits.</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── Right Column: Metadata ────────────── */}
          <div className="w-full lg:w-56 shrink-0 p-5 space-y-4">
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

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
