import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Plus, Pencil, CheckCircle2, MessageSquare, Clock, Activity,
  User, Flag, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Task, ProfileRow, TaskComment } from '@/lib/task-types';

interface TaskActivityViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  onTaskClick: (task: Task) => void;
}

interface AuditLogRow {
  id: string;
  action: string;
  description: string;
  user_id: string | null;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

interface ActivityEntry {
  id: string;
  kind: 'audit' | 'comment';
  timestamp: string;
  userId: string | null;
  description: string;
  action: string;
  taskId: string | null;
  taskTitle: string | null;
}

const ACTION_ICON: Record<string, typeof Plus> = {
  task_created: Plus,
  task_updated: Pencil,
  task_completed: CheckCircle2,
  task_commented: MessageSquare,
  comment: MessageSquare,
  project_created: Plus,
  project_updated: Pencil,
  project_deleted: Flag,
  space_created: Plus,
  space_updated: Pencil,
};

const ACTION_COLOR: Record<string, string> = {
  task_created: 'bg-emerald-500/10 text-emerald-600',
  task_completed: 'bg-green-500/10 text-green-600',
  task_updated: 'bg-blue-500/10 text-blue-600',
  task_commented: 'bg-amber-500/10 text-amber-600',
  comment: 'bg-amber-500/10 text-amber-600',
};

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(iso);
}

function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (d.getFullYear() === now.getFullYear()) return `${months[d.getMonth()]} ${d.getDate()}`;
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function TaskActivityView({ tasks, profiles, onTaskClick }: TaskActivityViewProps) {
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [commentRows, setCommentRows] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);

  const taskMap = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  const fetchActivity = useCallback(async () => {
    const [auditRes, commentRes] = await Promise.all([
      supabase
        .from('audit_log')
        .select('id, action, description, user_id, timestamp, metadata')
        .order('timestamp', { ascending: false })
        .limit(100),
      supabase
        .from('task_comments')
        .select('id, task_id, author_id, body, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (auditRes.data) setAuditRows(auditRes.data);
    if (commentRes.data) setCommentRows(commentRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  useEffect(() => {
    const channel = supabase
      .channel('task-activity-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, () => {
        fetchActivity();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments' }, () => {
        fetchActivity();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchActivity]);

  const timeline = useMemo<ActivityEntry[]>(() => {
    const entries: ActivityEntry[] = [];

    for (const row of auditRows) {
      const taskId = (row.metadata?.task_id as string) ?? null;
      const task = taskId ? taskMap.get(taskId) : null;
      entries.push({
        id: `audit-${row.id}`,
        kind: 'audit',
        timestamp: row.timestamp,
        userId: row.user_id,
        description: row.description,
        action: row.action,
        taskId,
        taskTitle: task?.title ?? (row.metadata?.task_title as string) ?? null,
      });
    }

    for (const c of commentRows) {
      const task = taskMap.get(c.task_id);
      entries.push({
        id: `comment-${c.id}`,
        kind: 'comment',
        timestamp: c.created_at,
        userId: c.author_id,
        description: c.body,
        action: 'comment',
        taskId: c.task_id,
        taskTitle: task?.title ?? null,
      });
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return entries;
  }, [auditRows, commentRows, taskMap]);

  const grouped = useMemo(() => {
    const groups: { label: string; entries: ActivityEntry[] }[] = [];
    let currentLabel = '';
    for (const entry of timeline) {
      const label = dateGroupLabel(entry.timestamp);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, entries: [] });
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [timeline]);

  const handleEntryClick = useCallback(
    (entry: ActivityEntry) => {
      if (!entry.taskId) return;
      const task = taskMap.get(entry.taskId);
      if (task) onTaskClick(task);
    },
    [taskMap, onTaskClick],
  );

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Activity</span>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <Activity className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Activity will appear here as tasks are created, updated, and commented on.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Activity</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
          {timeline.length}
        </Badge>
      </div>

      <div className="space-y-6">
        {grouped.map((group) => (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.label}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-1">
              {group.entries.map((entry) => (
                <ActivityRow
                  key={entry.id}
                  entry={entry}
                  profiles={profiles}
                  onClick={() => handleEntryClick(entry)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityRow({
  entry,
  profiles,
  onClick,
}: {
  entry: ActivityEntry;
  profiles: Map<string, ProfileRow>;
  onClick: () => void;
}) {
  const profile = entry.userId ? profiles.get(entry.userId) : null;
  const IconComponent = ACTION_ICON[entry.action] ?? Activity;
  const iconColor = ACTION_COLOR[entry.action] ?? 'bg-muted text-muted-foreground';

  const descriptionPreview =
    entry.kind === 'comment'
      ? entry.description.length > 120
        ? entry.description.slice(0, 120) + '...'
        : entry.description
      : entry.description;

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-2 py-2 rounded-md transition-colors',
        entry.taskId ? 'hover:bg-muted/50 cursor-pointer' : '',
      )}
      onClick={entry.taskId ? onClick : undefined}
    >
      <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5', iconColor)}>
        <IconComponent className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {profile ? (
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <span className="text-[7px] font-bold leading-none">
                  {getInitials(profile.full_name)}
                </span>
              </div>
              <span className="text-xs font-medium text-foreground">{profile.full_name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">System</span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          {entry.kind === 'comment' ? (
            <>
              <span>commented on </span>
              {entry.taskTitle && (
                <span className="font-medium text-foreground">{entry.taskTitle}</span>
              )}
              <span className="block mt-0.5 text-muted-foreground/80 italic truncate">
                {descriptionPreview}
              </span>
            </>
          ) : (
            <>
              <span>{descriptionPreview}</span>
              {entry.taskTitle && (
                <>
                  <ArrowRight className="inline h-3 w-3 mx-1 text-muted-foreground/50" />
                  <span className="font-medium text-foreground">{entry.taskTitle}</span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      <span className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap shrink-0 mt-1">
        <Clock className="inline h-3 w-3 mr-0.5 -mt-px" />
        {relativeTime(entry.timestamp)}
      </span>
    </div>
  );
}
