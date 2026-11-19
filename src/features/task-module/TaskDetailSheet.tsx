import { useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, Loader2, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { initialsOf } from '@/lib/name';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AvatarBubble } from '@/components/AvatarBubble';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import {
  useTask, useUpdateTask, useDeleteTask, useAssignablePeople,
  useTaskComments, useAddComment, useDeleteComment,
  TASK_STATUSES, STATUS_META,
  type TaskRow, type TaskStatus, type TaskPriority, type TaskPatch, type PersonOption,
} from '@/queries/useTaskModule';

const NONE = '__none__';

// One panel for every place a task opens (Home cards, list views, …). It
// loads the task by id itself, so after any edit it shows what's saved,
// not a stale copy of the row it was opened from.
export function TaskDetailSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { data: task } = useTask(taskId);
  const { data: people } = useAssignablePeople();

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        {task ? (
          <TaskDetailBody key={task.id} task={task} people={people ?? []} onClose={onClose} />
        ) : (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailBody({ task, people, onClose }: { task: TaskRow; people: PersonOption[]; onClose: () => void }) {
  const { toast } = useToast();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');

  const save = (patch: TaskPatch) =>
    updateTask.mutate({ task, patch }, {
      onError: (err) => toast({ title: 'Could not update task', description: errorMessage(err), variant: 'destructive' }),
    });

  return (
    <div className="space-y-4 mt-2">
      <SheetHeader className="text-left">
        <SheetTitle>Task details</SheetTitle>
      </SheetHeader>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title.trim() && title.trim() !== task.title) save({ title: title.trim() }); }}
        className="font-medium"
      />

      <Textarea
        placeholder="Description…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => { if (description !== (task.description ?? '')) save({ description: description || null }); }}
        rows={4}
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <Select value={task.status} onValueChange={(v) => save({ status: v as TaskStatus })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={task.priority ?? NONE} onValueChange={(v) => save({ priority: v === NONE ? null : (v as TaskPriority) })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Assignee">
          <Select value={task.assignee_id ?? NONE} onValueChange={(v) => save({ assignee_id: v === NONE ? null : v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Due date">
          <Input
            type="date"
            className="h-9"
            value={task.due_date ?? ''}
            onChange={(e) => save({ due_date: e.target.value || null })}
          />
        </Field>
      </div>

      <Comments taskId={task.id} people={people} />

      <SheetFooter className="pt-2">
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            deleteTask.mutate(task.id, {
              onError: (err) => toast({ title: 'Could not delete task', description: errorMessage(err), variant: 'destructive' }),
            });
            onClose();
          }}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete task
        </Button>
      </SheetFooter>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Comments({ taskId, people }: { taskId: string; people: PersonOption[] }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const { data: comments } = useTaskComments(taskId);
  const addComment = useAddComment(taskId);
  const deleteComment = useDeleteComment(taskId);
  const [body, setBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const suggestions = mentionQuery === null
    ? []
    : people.filter((p) => p.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);

  // The "@query" being typed is whatever follows the last "@" before the
  // cursor, as long as it hasn't run into a line break.
  const onChange = (value: string) => {
    setBody(value);
    const cursor = boxRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const at = before.lastIndexOf('@');
    if (at === -1 || /[\n@]/.test(before.slice(at + 1)) || (at > 0 && !/\s/.test(before[at - 1]))) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(before.slice(at + 1));
  };

  const pick = (person: PersonOption) => {
    const cursor = boxRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, cursor);
    const at = before.lastIndexOf('@');
    const next = `${body.slice(0, at)}@${person.full_name} ${body.slice(cursor)}`;
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => boxRef.current?.focus());
  };

  const submit = () => {
    const text = body.trim();
    if (!text || !profile?.id) return;
    // Anyone whose "@Full Name" is still in the text is mentioned — picked
    // from the list or typed out by hand, it counts either way.
    const mentions = people.filter((p) => text.includes(`@${p.full_name}`)).map((p) => p.id);
    addComment.mutate(
      { authorId: profile.id, body: text, mentions },
      {
        onSuccess: () => setBody(''),
        onError: (err) => toast({ title: 'Could not post comment', description: errorMessage(err), variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="space-y-3 border-t border-border/70 pt-4">
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Comments</h3>

      {(comments ?? []).length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
      <div className="space-y-3">
        {(comments ?? []).map((c) => {
          const author = c.author_id ? peopleById.get(c.author_id) : undefined;
          const canDelete = c.author_id === profile?.id || isAdmin;
          return (
            <div key={c.id} className="flex gap-2.5 group">
              <AvatarBubble photoUrl={author?.photo_url ?? null} initials={initialsOf(undefined, undefined, author?.full_name || '?')} size={24} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold truncate">{author?.full_name ?? 'Someone'}</span>
                  <span className="text-2xs text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                  {canDelete && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      className="ml-auto opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-destructive"
                      onClick={() => deleteComment.mutate(c.id, {
                        onError: (err) => toast({ title: 'Could not delete comment', description: errorMessage(err), variant: 'destructive' }),
                      })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative">
        <Textarea
          ref={boxRef}
          placeholder="Write a comment… type @ to mention someone"
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMentionQuery(null);
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
          }}
          rows={2}
          className="pr-10 text-sm"
        />
        <Button
          size="icon"
          className="absolute right-1.5 bottom-1.5 h-7 w-7"
          disabled={addComment.isPending || !body.trim()}
          onClick={submit}
          aria-label="Post comment"
        >
          {addComment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
        {suggestions.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 w-full rounded-md border border-border bg-popover shadow-md z-10 py-1">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
              >
                <AvatarBubble photoUrl={p.photo_url} initials={initialsOf(undefined, undefined, p.full_name)} size={18} />
                <span className="truncate">{p.full_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
