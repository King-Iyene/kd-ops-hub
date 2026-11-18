import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/format';
import { initialsOf } from '@/lib/name';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AvatarBubble } from '@/components/AvatarBubble';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { useMyTasks, useTaskLists, STATUS_META, type TaskRow } from '@/queries/useTaskModule';

function groupTasks(tasks: TaskRow[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(in7.getDate() + 7);

  const overdue: TaskRow[] = [];
  const next7: TaskRow[] = [];
  const later: TaskRow[] = [];

  for (const t of tasks) {
    if (!t.due_date) { later.push(t); continue; }
    const due = new Date(t.due_date);
    if (due < today) overdue.push(t);
    else if (due <= in7) next7.push(t);
    else later.push(t);
  }
  return { overdue, next7, later };
}

const TaskMyTasksPage = () => {
  usePageTitle('My Tasks');
  const { profile } = useAuthStore();
  const { data: tasks, isLoading } = useMyTasks(profile?.id ?? '');
  const { data: lists } = useTaskLists();
  const [showClosed, setShowClosed] = useState(false);

  const listNameById = new Map((lists ?? []).map((l) => [l.id, l.name]));
  const visible = (tasks ?? []).filter((t) => showClosed || t.status !== 'done');
  const { overdue, next7, later } = useMemo(() => groupTasks(visible), [visible]);

  const groups: { key: string; label: string; items: TaskRow[] }[] = [
    { key: 'overdue', label: 'Overdue', items: overdue },
    { key: 'next7', label: 'Next 7 days', items: next7 },
    { key: 'later', label: 'Later', items: later },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">My Tasks</h1>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowClosed((s) => !s)}>
          {showClosed ? 'Hide closed' : 'Show closed'}
        </Button>
      </div>

      {!isLoading && visible.length === 0 ? (
        <EmptyState illustration="ghost" title="Nothing assigned to you" description="Tasks assigned to you across every list will show up here." />
      ) : (
        <div className="space-y-5">
          {groups.filter((g) => g.items.length > 0).map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
                <span className="text-2xs text-muted-foreground/60">{group.items.length}</span>
              </div>
              <div className="rounded-lg border border-border/70 divide-y divide-border/50">
                {group.items.map((task) => (
                  <Link
                    key={task.id}
                    to={`/task/list/${task.list_id}`}
                    className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 kd-transition"
                  >
                    <Badge variant="outline" className={cn('text-3xs shrink-0 uppercase tracking-wide', STATUS_META[task.status].badge)}>
                      {STATUS_META[task.status].label}
                    </Badge>
                    <Flag className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                    <span className={cn('flex-1 min-w-0 text-sm truncate', task.status === 'done' && 'line-through text-muted-foreground')}>
                      {task.title}
                    </span>
                    {listNameById.get(task.list_id) && (
                      <span className="text-2xs text-primary/80 shrink-0 hidden sm:inline">{listNameById.get(task.list_id)}</span>
                    )}
                    {task.due_date && (
                      <span className="text-2xs text-muted-foreground shrink-0 font-mono tabular-nums">{formatDate(task.due_date)}</span>
                    )}
                    <AvatarBubble photoUrl={null} initials={initialsOf(undefined, undefined, profile?.full_name)} size={20} />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskMyTasksPage;
