import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { confirm } from '@/hooks/use-confirm';
import { TaskAvatar } from '../components/TaskAvatar';
import { RichTextEditor } from '../components/RichTextEditor';
import { useActivity, type TaskActivityEntry } from '../api/activity';
import { useComments, useCreateComment, useDeleteComment, type TaskComment } from '../api/comments';
import type { TaskStatus } from '../api/statuses';
import type { TaskEntityType } from '../api/comments';

type FeedItem =
  | { kind: 'comment'; at: string; comment: TaskComment }
  | { kind: 'activity'; at: string; entry: TaskActivityEntry };

const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  priority: 'priority',
  due_date: 'due date',
  start_date: 'start date',
  description_text: 'description',
  list_id: 'list',
};

function describeActivity(entry: TaskActivityEntry, statusesById: Map<string, TaskStatus>): string[] {
  if (entry.action === 'insert') return ['created this'];
  if (entry.action === 'delete') return ['deleted this'];
  const before = (entry.diff?.before ?? {}) as Record<string, unknown>;
  const after = (entry.diff?.after ?? {}) as Record<string, unknown>;
  const lines: string[] = [];

  if (before.status_id !== after.status_id) {
    const from = statusesById.get(before.status_id as string)?.name ?? 'none';
    const to = statusesById.get(after.status_id as string)?.name ?? 'none';
    lines.push(`changed status from ${from} to ${to}`);
  }
  if (before.archived_at !== after.archived_at) {
    lines.push(after.archived_at ? 'archived this' : 'restored this');
  }
  for (const key of ['title', 'priority', 'due_date', 'start_date', 'description_text', 'list_id']) {
    if (key === 'status_id' || key === 'archived_at') continue;
    if (before[key] === after[key]) continue;
    const label = FIELD_LABELS[key] ?? key;
    if (after[key] == null) lines.push(`cleared the ${label}`);
    else if (before[key] == null) lines.push(`set the ${label}`);
    else lines.push(`changed the ${label}`);
  }
  return lines.length > 0 ? lines : [];
}

export function CommentsActivityFeed({
  entityType,
  entityId,
  statuses,
}: {
  entityType: TaskEntityType;
  entityId: string;
  statuses: TaskStatus[];
}) {
  const { toast } = useToast();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: comments } = useComments(entityType, entityId);
  const { data: activity } = useActivity(entityType, entityId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const [draft, setDraft] = useState<{ json: unknown; text: string }>({ json: '', text: '' });
  const [composerKey, setComposerKey] = useState(0);

  const statusesById = new Map(statuses.map((s) => [s.id, s]));

  const items: FeedItem[] = [
    ...(comments ?? []).map((c): FeedItem => ({ kind: 'comment', at: c.created_at, comment: c })),
    ...(activity ?? []).map((a): FeedItem => ({ kind: 'activity', at: a.created_at, entry: a })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const handlePost = async () => {
    const text = draft.text.trim();
    if (!text || !userId) return;
    try {
      await createComment.mutateAsync({ entityType, entityId, body: draft.json, bodyText: text, mentions: [], createdBy: userId });
      setDraft({ json: '', text: '' });
      setComposerKey((k) => k + 1);
    } catch (err) {
      toast({ title: 'Could not post comment', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleDelete = async (comment: TaskComment) => {
    const ok = await confirm({ title: 'Delete comment', description: 'This cannot be undone.', variant: 'destructive' });
    if (!ok) return;
    deleteComment.mutate(
      { id: comment.id, entityType, entityId },
      { onError: (err) => toast({ title: 'Could not delete comment', description: (err as Error).message, variant: 'destructive' }) },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {items.map((item) => {
          if (item.kind === 'activity') {
            const lines = describeActivity(item.entry, statusesById);
            if (lines.length === 0) return null;
            return (
              <div key={item.entry.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{item.entry.actor_name}</span>{' '}
                {lines.join(', ')} · {new Date(item.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </div>
            );
          }
          const c = item.comment;
          const canDelete = c.created_by === userId;
          return (
            <div key={c.id} className="flex items-start gap-2.5">
              <TaskAvatar userId={c.created_by} name={c.author_name} photoUrl={c.author_photo_url} size={26} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-foreground">{c.author_name}</span>
                  <span className="text-3xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    {c.edited_at ? ' (edited)' : ''}
                  </span>
                  {canDelete && (
                    <button onClick={() => handleDelete(c)} className="text-3xs text-muted-foreground hover:text-destructive ml-1">
                      Delete
                    </button>
                  )}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">{c.body_text}</p>
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">No activity yet.</p>
        )}
      </div>

      <div className="border-t border-border p-3" onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handlePost(); }}>
        <RichTextEditor
          key={composerKey}
          content=""
          onChange={(json, text) => setDraft({ json, text })}
          placeholder="Add a comment..."
        />
        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={handlePost} disabled={!draft.text.trim() || createComment.isPending}>
            <Send className="h-3.5 w-3.5 mr-1.5" /> Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
