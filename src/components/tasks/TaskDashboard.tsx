import { useMemo } from 'react';
import {
  CheckCircle2, Flag, X, Target, TrendingUp,
  AlertTriangle, ArrowUpRight, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysUntil } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { Task, ProfileRow } from '@/lib/task-types';
import { PRIORITY_CLASS } from '@/lib/task-types';

interface TaskDashboardProps {
  tasks: Task[];
  allTasks: Task[];
  profiles: Map<string, ProfileRow>;
  currentUserId?: string;
  onTaskClick?: (task: Task) => void;
}

export function TaskDashboard({ tasks, allTasks, profiles, currentUserId, onTaskClick }: TaskDashboardProps) {
  const now = Date.now();
  const weekMs = 7 * 864e5;
  const topLevel = tasks;

  const completedThisWeek = topLevel.filter((t) => t.status === 'complete' && t.completed_at && new Date(t.completed_at).getTime() >= now - weekMs);
  const completedLastWeek = topLevel.filter((t) => t.status === 'complete' && t.completed_at && new Date(t.completed_at).getTime() >= now - 2 * weekMs && new Date(t.completed_at).getTime() < now - weekMs);
  const createdThisWeek = topLevel.filter((t) => new Date(t.created_at).getTime() >= now - weekMs);
  const openTasks = topLevel.filter((t) => t.status !== 'complete');
  const overdueTasks = openTasks.filter((t) => t.due_date && (daysUntil(t.due_date) ?? 0) < 0);
  const blockedTasks = topLevel.filter((t) => t.status === 'blocked');
  const completionRate = topLevel.length > 0 ? Math.round((topLevel.filter((t) => t.status === 'complete').length / topLevel.length) * 100) : 0;
  const weekTrend = completedLastWeek.length > 0 ? Math.round(((completedThisWeek.length - completedLastWeek.length) / completedLastWeek.length) * 100) : completedThisWeek.length > 0 ? 100 : 0;

  const byAssignee = new Map<string, { name: string; open: number; done: number; overdue: number }>();
  for (const t of topLevel) {
    const uid = t.assignee_id || '__unassigned';
    const name = t.assignee_id ? (profiles.get(t.assignee_id)?.full_name ?? 'Unknown') : 'Unassigned';
    const prev = byAssignee.get(uid) || { name, open: 0, done: 0, overdue: 0 };
    if (t.status === 'complete') prev.done++;
    else { prev.open++; if (t.due_date && (daysUntil(t.due_date) ?? 0) < 0) prev.overdue++; }
    byAssignee.set(uid, prev);
  }
  const teamRows = Array.from(byAssignee.values()).sort((a, b) => b.open - a.open);

  const byPriority = { critical: 0, high: 0, normal: 0, low: 0 };
  for (const t of openTasks) byPriority[t.priority]++;

  const statusDist = { open: 0, in_progress: 0, blocked: 0, complete: 0 };
  for (const t of topLevel) statusDist[t.status]++;
  const total = topLevel.length || 1;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={CheckCircle2} label="Completed this week" value={completedThisWeek.length}
          trend={weekTrend !== 0 ? `${weekTrend > 0 ? '+' : ''}${weekTrend}% vs last week` : undefined}
          trendUp={weekTrend > 0} color="text-emerald-600" />
        <KpiCard icon={Target} label="Completion rate" value={`${completionRate}%`} color="text-blue-600" />
        <KpiCard icon={AlertTriangle} label="Overdue" value={overdueTasks.length}
          sub={overdueTasks.length > 0 ? 'Needs attention' : 'All on track'} color="text-red-600" />
        <KpiCard icon={TrendingUp} label="Created this week" value={createdThisWeek.length} color="text-violet-600" />
      </div>

      {/* Status distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Status Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex rounded-full h-3 overflow-hidden bg-muted">
            {statusDist.complete > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(statusDist.complete / total) * 100}%` }} />}
            {statusDist.in_progress > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${(statusDist.in_progress / total) * 100}%` }} />}
            {statusDist.open > 0 && <div className="bg-slate-400 transition-all" style={{ width: `${(statusDist.open / total) * 100}%` }} />}
            {statusDist.blocked > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(statusDist.blocked / total) * 100}%` }} />}
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs">
            <StatusLegend color="bg-emerald-500" label="Complete" count={statusDist.complete} />
            <StatusLegend color="bg-blue-500" label="In Progress" count={statusDist.in_progress} />
            <StatusLegend color="bg-slate-400" label="Open" count={statusDist.open} />
            <StatusLegend color="bg-red-500" label="Blocked" count={statusDist.blocked} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Team workload */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Team Workload</CardTitle>
          </CardHeader>
          <CardContent>
            {teamRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No tasks yet.</p>
            ) : (
              <div className="space-y-3">
                {teamRows.slice(0, 10).map((row) => {
                  const rowTotal = row.open + row.done;
                  const pct = rowTotal > 0 ? Math.round((row.done / rowTotal) * 100) : 0;
                  return (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate">{row.name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                          <span>{row.open} open</span>
                          {row.overdue > 0 && <span className="text-destructive">{row.overdue} overdue</span>}
                          <span className="font-medium text-foreground">{pct}%</span>
                        </div>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Priority breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Flag className="h-4 w-4 text-primary" /> Open by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {([
                { key: 'critical', label: 'Critical', color: 'bg-red-500', text: 'text-red-600' },
                { key: 'high', label: 'High', color: 'bg-orange-400', text: 'text-orange-600' },
                { key: 'normal', label: 'Normal', color: 'bg-blue-400', text: 'text-blue-600' },
                { key: 'low', label: 'Low', color: 'bg-slate-300 dark:bg-slate-600', text: 'text-muted-foreground' },
              ] as const).map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <div className={cn('h-3 w-3 rounded-full shrink-0', p.color)} />
                  <span className="text-sm flex-1">{p.label}</span>
                  <span className={cn('text-lg font-bold tabular-nums', p.text)}>{byPriority[p.key]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overdue tasks list */}
      {overdueTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Overdue Tasks ({overdueTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overdueTasks.sort((a, b) => (daysUntil(a.due_date!) ?? 0) - (daysUntil(b.due_date!) ?? 0)).slice(0, 15).map((t) => {
                const d = daysUntil(t.due_date!) ?? 0;
                const assignee = t.assignee_id ? profiles.get(t.assignee_id) : null;
                return (
                  <button
                    key={t.id}
                    onClick={() => onTaskClick?.(t)}
                    className="flex items-center gap-3 w-full rounded-lg border p-3 bg-destructive/5 text-left hover:bg-destructive/10 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{assignee?.full_name ?? 'Unassigned'}</p>
                    </div>
                    <Badge variant="destructive" className="shrink-0 text-[10px]">{Math.abs(d)}d overdue</Badge>
                    <Badge variant="secondary" className={cn('shrink-0 text-[10px]', PRIORITY_CLASS[t.priority])}>{t.priority}</Badge>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blocked tasks */}
      {blockedTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <X className="h-4 w-4 text-destructive" /> Blocked Tasks ({blockedTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {blockedTasks.slice(0, 10).map((t) => {
                const assignee = t.assignee_id ? profiles.get(t.assignee_id) : null;
                return (
                  <button
                    key={t.id}
                    onClick={() => onTaskClick?.(t)}
                    className="flex items-center gap-3 w-full rounded-lg border p-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{assignee?.full_name ?? 'Unassigned'}</p>
                    </div>
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive text-[10px]">Blocked</Badge>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, trend, trendUp, sub, color }: {
  icon: typeof CheckCircle2;
  label: string;
  value: number | string;
  trend?: string;
  trendUp?: boolean;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={cn('text-3xl font-bold mt-1 tabular-nums', color)}>{value}</p>
            {trend && (
              <p className={cn('text-[11px] mt-1 flex items-center gap-0.5', trendUp ? 'text-emerald-600' : 'text-red-500')}>
                <ArrowUpRight className={cn('h-3 w-3', !trendUp && 'rotate-90')} /> {trend}
              </p>
            )}
            {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted">
            <Icon className={cn('h-4.5 w-4.5', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusLegend({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('h-2.5 w-2.5 rounded-full', color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{count}</span>
    </div>
  );
}
