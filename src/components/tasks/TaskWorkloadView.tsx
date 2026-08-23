import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Users, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Task, ProfileRow } from '@/lib/task-types';
import { PRIORITY_CLASS, STATUS_DOT } from '@/lib/task-types';

interface TaskWorkloadViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  onTaskClick: (task: Task) => void;
}

const WEEKLY_CAPACITY_MINUTES = 40 * 60;
const DEFAULT_TASK_MINUTES = 60;
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };

function getWeekRange(offset: number): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortDate(d: Date): string {
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function getWeekLabel(offset: number, start: Date, end: Date): string {
  if (offset === 0) return 'This Week';
  if (offset === 1) return 'Next Week';
  if (offset === -1) return 'Last Week';
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

interface MemberWorkload {
  profileId: string;
  name: string;
  photoUrl: string | null;
  tasks: Task[];
  totalMinutes: number;
  utilization: number;
  statusCounts: Record<string, number>;
}

export function TaskWorkloadView({ tasks, profiles, onTaskClick }: TaskWorkloadViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

  const { start, end } = useMemo(() => getWeekRange(weekOffset), [weekOffset]);
  const weekLabel = getWeekLabel(weekOffset, start, end);

  const startKey = toDateKey(start);
  const endKey = toDateKey(end);

  const weekTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (!t.due_date) return false;
        const key = t.due_date.slice(0, 10);
        return key >= startKey && key <= endKey;
      }),
    [tasks, startKey, endKey],
  );

  const overdueTasks = useMemo(() => {
    const todayKey = toDateKey(new Date());
    return tasks.filter(
      (t) => t.due_date && t.due_date.slice(0, 10) < todayKey && t.status !== 'complete',
    );
  }, [tasks]);

  const workloads = useMemo(() => {
    const byMember = new Map<string, Task[]>();

    for (const t of weekTasks) {
      const id = t.assignee_id ?? '__unassigned';
      const arr = byMember.get(id) || [];
      arr.push(t);
      byMember.set(id, arr);
    }

    const result: MemberWorkload[] = [];

    for (const [profileId, memberTasks] of byMember) {
      const profile = profiles.get(profileId);
      const name = profile?.full_name ?? (profileId === '__unassigned' ? 'Unassigned' : 'Unknown');

      const totalMinutes = memberTasks.reduce(
        (sum, t) => sum + (t.time_estimate_minutes ?? DEFAULT_TASK_MINUTES),
        0,
      );

      const statusCounts: Record<string, number> = {};
      for (const t of memberTasks) {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
      }

      const sorted = [...memberTasks].sort(
        (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
      );

      result.push({
        profileId,
        name,
        photoUrl: profile?.photo_url ?? null,
        tasks: sorted,
        totalMinutes,
        utilization: Math.round((totalMinutes / WEEKLY_CAPACITY_MINUTES) * 100),
        statusCounts,
      });
    }

    result.sort((a, b) => b.utilization - a.utilization);
    return result;
  }, [weekTasks, profiles]);

  const toggleMember = (id: string) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const utilizationColor = (pct: number) => {
    if (pct > 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const utilizationTextColor = (pct: number) => {
    if (pct > 90) return 'text-red-600 dark:text-red-400';
    if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Previous week" onClick={() => setWeekOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" aria-label="Next week" onClick={() => setWeekOffset((o) => o + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setWeekOffset(0)}>
              Today
            </Button>
          )}
        </div>

        <h3 className="text-sm font-semibold">
          {weekLabel}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {formatShortDate(start)} – {formatShortDate(end)}
          </span>
        </h3>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {workloads.length} members
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {weekTasks.length} tasks
          </span>
          {overdueTasks.length > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {overdueTasks.length} overdue
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {workloads.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
            <Clock className="h-8 w-8 mb-2 opacity-40" />
            No tasks scheduled for this week
          </div>
        )}

        {workloads.map((w) => {
          const expanded = expandedMembers.has(w.profileId);
          const hours = (w.totalMinutes / 60).toFixed(1);
          const barWidth = Math.min(w.utilization, 100);

          return (
            <div key={w.profileId} className="border-b last:border-b-0">
              <button
                onClick={() => toggleMember(w.profileId)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
              >
                <div
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-full text-xs font-semibold shrink-0 overflow-hidden',
                    w.profileId === '__unassigned'
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary/10 text-primary',
                  )}
                >
                  {w.photoUrl ? (
                    <img src={w.photoUrl} alt={w.name} className="h-full w-full object-cover" />
                  ) : (
                    getInitials(w.name)
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium truncate">{w.name}</span>
                    <span className="text-xs text-muted-foreground">{w.tasks.length} tasks</span>
                    <div className="flex items-center gap-0.5 ml-auto">
                      {(['open', 'in_progress', 'blocked', 'complete'] as const).map(
                        (s) =>
                          (w.statusCounts[s] ?? 0) > 0 && (
                            <div key={s} className="flex items-center gap-0.5" title={`${s}: ${w.statusCounts[s]}`}>
                              <span className={cn('inline-block h-2 w-2 rounded-full', STATUS_DOT[s])} />
                              <span className="text-[10px] text-muted-foreground">{w.statusCounts[s]}</span>
                            </div>
                          ),
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', utilizationColor(w.utilization))}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className={cn('text-xs font-medium tabular-nums w-12 text-right', utilizationTextColor(w.utilization))}>
                      {w.utilization}%
                    </span>
                    <span className="text-[10px] text-muted-foreground w-12 text-right">{hours}h</span>
                  </div>
                </div>
              </button>

              {expanded && (
                <div className="px-4 pb-3 pl-[3.75rem]">
                  {w.tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No tasks this week</p>
                  ) : (
                    <div className="space-y-1">
                      {w.tasks.map((t) => {
                        const isOverdue =
                          t.due_date &&
                          t.due_date.slice(0, 10) < toDateKey(new Date()) &&
                          t.status !== 'complete';

                        return (
                          <button
                            key={t.id}
                            onClick={() => onTaskClick(t)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/80 transition-colors text-left group"
                          >
                            <span className={cn('inline-block h-2 w-2 rounded-full shrink-0', STATUS_DOT[t.status])} />
                            <span className="text-xs truncate flex-1">{t.title}</span>
                            {isOverdue && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                            <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 h-4', PRIORITY_CLASS[t.priority])}>
                              {t.priority}
                            </Badge>
                            {t.time_estimate_minutes != null && (
                              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                {(t.time_estimate_minutes / 60).toFixed(1)}h
                              </span>
                            )}
                            {t.due_date && (
                              <span className={cn('text-[10px] tabular-nums shrink-0', isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
                                {new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
