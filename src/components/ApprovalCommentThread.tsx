import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  entityType: 'batch' | 'expense' | 'fuel' | 'budget' | 'leave';
  entityId: string;
  title?: string;
}

interface Comment {
  id: string;
  author_name: string | null;
  body: string | null;
  action: 'comment' | 'approve' | 'reject' | 'delegate' | 'escalate';
  created_at: string;
}

const ACTION_CLASS: Record<Comment['action'], string> = {
  comment: 'bg-muted text-muted-foreground',
  approve: 'bg-success/10 text-success',
  reject: 'bg-destructive/10 text-destructive',
  delegate: 'bg-info/10 text-info',
  escalate: 'bg-warning/10 text-warning',
};

export function ApprovalCommentThread({ entityType, entityId, title }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('approval_comments')
      .select('id, author_name, action, created_at, body')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true });
    setComments((data as Comment[]) || []);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  const post = async () => {
    if (!body.trim() || !profile) return;
    setPosting(true);
    try {
      const { error } = await supabase.from('approval_comments').insert({
        entity_type: entityType,
        entity_id: entityId,
        author_id: profile.id,
        author_name: profile.full_name || profile.email,
        action: 'comment',
        body: body.trim(),
      });
      if (error) throw error;
      await logAudit(
        'approval_comment',
        `Commented on ${entityType}:${entityId}`,
        profile,
      );
      setBody('');
      load();
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> {title || 'Discussion'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet. Leave a note for the next approver.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {comments.map((c) => (
              <div
                key={c.id}
                className="rounded-md border p-3 bg-muted/20 text-sm kd-transition"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="font-medium text-foreground">
                    {c.author_name || 'Unknown'}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(ACTION_CLASS[c.action], 'capitalize')}
                  >
                    {c.action}
                  </Badge>
                  <span className="ml-auto">{formatDateTime(c.created_at)}</span>
                </div>
                {c.body && <p className="whitespace-pre-wrap">{c.body}</p>}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-start gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Leave a note..."
            rows={2}
          />
          <Button onClick={post} disabled={posting || !body.trim()}>
            {posting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
