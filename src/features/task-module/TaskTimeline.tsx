import { useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { Loader2, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { errorMessage } from '@/lib/db-errors';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useTaskActivity, useTaskComments, useAddComment, useDeleteComment,
  STATUS_META, PRIORITY_META,
  type PersonOption, type TaskActivity, type TaskComment, type TaskPriority, type TaskStatus,
} from '@/queries/useTaskModule';
import { PersonAvatar } from './pickers';

function ago(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

function describe(a: TaskActivity, name: (id: unknown) => string): string {
  const d = a.detail as Record<string, unknown>;
  switch (a.kind) {
    case 'created': return 'created this task';
    case 'renamed': return `renamed this to "${d.to}"`;
    case 'status': return `changed the status from ${STATUS_META[d.from as TaskStatus]?.label ?? d.from} to ${STATUS_META[d.to as TaskStatus]?.label ?? d.to}`;
    case 'assigned': return d.to ? `assigned ${name(d.to)}` : 'removed the assignee';
    case 'due_date': return d.to ? `set the due date to ${format(parseISO(String(d.to)), 'd MMM')}` : 'removed the due date';
    case 'priority': return d.to ? `set the priority to ${PRIORITY_META[d.to as TaskPriority]?.label ?? d.to}` : 'cleared the priority';
    case 'description': return 'updated the description';
    case 'tags': return 'updated the tags';
    case 'subtask_added': return `added the subtask "${d.title}"`;
    case 'attachment_added': return `attached ${d.file_name}`;
    case 'recurred': return `created the next one${d.due_date ? `, due ${format(parseISO(String(d.due_date)), 'd MMM')}` : ''}`;
    case 'repeated': return 'created this task as the next repeat';
    case 'recurrence_ended': return `finished the repeat (it ended on ${d.until ? format(parseISO(String(d.until)), 'd MMM yyyy') : 'its end date'})`;
    default: return a.kind;
  }
}

type Entry = { at: string; activity?: TaskActivity; comment?: TaskComment };

export function TaskTimeline({ taskId, people }: { taskId: string; people: PersonOption[] }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';
  const { data: activity } = useTaskActivity(taskId);
  const { data: comments } = useTaskComments(taskId);
  const deleteComment = useDeleteComment(taskId);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const name = (id: unknown) => (typeof id === 'string' && peopleById.get(id)?.full_name) || 'someone';
  const endRef = useRef<HTMLDivElement>(null);

  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = [
      ...(activity ?? []).map((a) => ({ at: a.created_at, activity: a })),
      ...(comments ?? []).map((c) => ({ at: c.created_at, comment: c })),
    ];
    return list.sort((x, y) => x.at.localeCompare(y.at));
  }, [activity, comments]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2.5">
        {entries.map((e) => {
          if (e.activity) {
            const actor = e.activity.actor_id ? peopleById.get(e.activity.actor_id) : undefined;
            return (
              <div key={`a-${e.activity.id}`} className="flex items-start gap-2 text-2xs text-muted-foreground">
                <PersonAvatar person={actor} size={16} />
                <p className="leading-snug">
                  <span className="font-semibold text-foreground">{actor?.full_name?.split(' ')[0] ?? 'Someone'}</span>{' '}
                  {describe(e.activity, name)} <span className="opacity-70">· {ago(e.activity.created_at)}</span>
                </p>
              </div>
            );
          }
          const c = e.comment!;
          const author = c.author_id ? peopleById.get(c.author_id) : undefined;
          const canDelete = c.author_id === profile?.id || isAdmin;
          return (
            <div key={`c-${c.id}`} className="group rounded-lg border border-border/70 bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <PersonAvatar person={author} size={18} />
                <span className="text-xs font-semibold">{author?.full_name ?? 'Someone'}</span>
                <span className="text-2xs text-muted-foreground">{ago(c.created_at)}</span>
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
              <p className="text-sm whitespace-pre-wrap break-words mt-1">{c.body}</p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <CommentComposer taskId={taskId} people={people} />
    </div>
  );
}

function CommentComposer({ taskId, people }: { taskId: string; people: PersonOption[] }) {
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const addComment = useAddComment(taskId);
  const [body, setBody] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = mentionQuery === null
    ? []
    : people.filter((p) => p.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6);

  // The "@query" being typed is whatever follows the last "@" before the
  // cursor, as long as it starts a word and hasn't hit a line break.
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
    const at = body.slice(0, cursor).lastIndexOf('@');
    setBody(`${body.slice(0, at)}@${person.full_name} ${body.slice(cursor)}`);
    setMentionQuery(null);
    requestAnimationFrame(() => boxRef.current?.focus());
  };

  const submit = () => {
    const text = body.trim();
    if (!text || !profile?.id) return;
    // Anyone whose "@Full Name" is still in the text is mentioned, whether
    // picked from the list or typed by hand.
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
    <div className="border-t border-border/70 p-3 relative">
      {suggestions.length > 0 && (
        <div className="absolute left-3 right-3 bottom-full mb-1 rounded-md border border-border bg-popover shadow-md z-10 py-1">
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-muted"
            >
              <PersonAvatar person={p} size={18} />
              <span className="truncate">{p.full_name}</span>
            </button>
          ))}
        </div>
      )}
      <Textarea
        ref={boxRef}
        aria-label="Write a comment (type @ to mention someone)"
        value={body}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && mentionQuery !== null) { e.stopPropagation(); setMentionQuery(null); }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
        }}
        rows={2}
        className="text-sm resize-none"
      />
      <div className="flex items-center justify-end gap-3 mt-2">
        <span className="text-2xs text-muted-foreground">Ctrl + Enter to post</span>
        <Button size="sm" className="h-7 text-xs" disabled={addComment.isPending || !body.trim()} onClick={submit}>
          {addComment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
          Comment
        </Button>
      </div>
    </div>
  );
}
