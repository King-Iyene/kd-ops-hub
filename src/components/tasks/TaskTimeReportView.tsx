import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Clock, Timer, TrendingUp, Users, ArrowUpDown, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Task, ProfileRow, TaskTimeEntry } from '@/lib/task-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TaskTimeReportViewProps {
  tasks: Task[];
  profiles: Map<string, ProfileRow>;
  onTaskClick: (task: Task) => void;
}

// ---------------------------------------------------------------------------
// Date-range helpers
// ---------------------------------------------------------------------------

type DateRangePreset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

function getDateRange(preset: DateRangePreset): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'this_week': {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      return { start: monday, end: sunday };
    }
    case 'last_week': {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() + mondayOffset);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      lastSunday.setHours(23, 59, 59, 999);
      return { start: lastMonday, end: lastSunday };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      lastDay.setHours(23, 59, 59, 999);
      return { start: firstDay, end: lastDay };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      lastDay.setHours(23, 59, 59, 999);
      return { start: firstDay, end: lastDay };
    }
    default:
      return getDateRange('this_week');
  }
}

function toIsoString(d: Date): string {
  return d.toISOString();
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatHours(mins: number): string {
  return `${(mins / 60).toFixed(1)}h`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

// ---------------------------------------------------------------------------
// Sort types
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc';

type GroupBy = 'none' | 'person' | 'task' | 'day';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskTimeReportView({ tasks, profiles, onTaskClick }: TaskTimeReportViewProps) {
  const { toast } = useToast();

  // State
  const [dateRange, setDateRange] = useState<DateRangePreset>('this_week');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [entries, setEntries] = useState<TaskTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range
  const range = useMemo(() => getDateRange(dateRange), [dateRange]);

  // Task map for quick lookups
  const taskMap = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasks]);

  // Profile list for filter dropdown
  const profileList = useMemo(() => {
    const list = Array.from(profiles.values());
    list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return list;
  }, [profiles]);

  // -------------------------------------------------------------------------
  // Fetch time entries
  // -------------------------------------------------------------------------

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('task_time_entries')
      .select('*')
      .gte('started_at', toIsoString(range.start))
      .lte('started_at', toIsoString(range.end))
      .order('started_at', { ascending: false });

    if (userFilter !== 'all') {
      query = query.eq('user_id', userFilter);
    }

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Failed to load time entries', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setEntries(data ?? []);
    setLoading(false);
  }, [range, userFilter, toast]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // -------------------------------------------------------------------------
  // Filtered & sorted entries
  // -------------------------------------------------------------------------

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    sorted.sort((a, b) => {
      const aTime = new Date(a.started_at).getTime();
      const bTime = new Date(b.started_at).getTime();
      return sortDir === 'desc' ? bTime - aTime : aTime - bTime;
    });
    return sorted;
  }, [entries, sortDir]);

  // -------------------------------------------------------------------------
  // Summary stats
  // -------------------------------------------------------------------------

  const summary = useMemo(() => {
    const totalLogged = tasks.reduce((sum, t) => sum + (t.time_spent_minutes ?? 0), 0);
    const totalEstimated = tasks.reduce((sum, t) => sum + (t.time_estimate_minutes ?? 0), 0);
    const utilization = totalEstimated > 0 ? Math.round((totalLogged / totalEstimated) * 100) : 0;
    const activeTimers = entries.filter((e) => e.ended_at === null).length;

    return { totalLogged, totalEstimated, utilization, activeTimers };
  }, [tasks, entries]);

  // -------------------------------------------------------------------------
  // Entries total duration
  // -------------------------------------------------------------------------

  const entriesTotalMinutes = useMemo(() => {
    return sortedEntries.reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);
  }, [sortedEntries]);

  // -------------------------------------------------------------------------
  // Grouped entries
  // -------------------------------------------------------------------------

  type GroupedSection = { key: string; label: string; entries: TaskTimeEntry[] };

  const groupedEntries = useMemo<GroupedSection[]>(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: 'All Entries', entries: sortedEntries }];
    }

    const groups = new Map<string, TaskTimeEntry[]>();
    const labelMap = new Map<string, string>();

    for (const entry of sortedEntries) {
      let key: string;
      let label: string;

      switch (groupBy) {
        case 'person': {
          key = entry.user_id;
          const profile = profiles.get(entry.user_id);
          label = profile?.full_name ?? 'Unknown';
          break;
        }
        case 'task': {
          key = entry.task_id;
          const task = taskMap.get(entry.task_id);
          label = task?.title ?? 'Unknown Task';
          break;
        }
        case 'day': {
          key = new Date(entry.started_at).toISOString().slice(0, 10);
          label = new Date(entry.started_at).toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric',
          });
          break;
        }
      }

      if (!groups.has(key)) {
        groups.set(key, []);
        labelMap.set(key, label);
      }
      groups.get(key)!.push(entry);
    }

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: labelMap.get(key) ?? key,
      entries: items,
    }));
  }, [sortedEntries, groupBy, profiles, taskMap]);

  // -------------------------------------------------------------------------
  // Per-person breakdown
  // -------------------------------------------------------------------------

  type PersonBreakdown = {
    userId: string;
    name: string;
    totalMinutes: number;
    taskCount: number;
  };

  const personBreakdown = useMemo<PersonBreakdown[]>(() => {
    const byUser = new Map<string, { totalMinutes: number; taskIds: Set<string> }>();

    for (const entry of entries) {
      const existing = byUser.get(entry.user_id);
      if (existing) {
        existing.totalMinutes += entry.duration_minutes ?? 0;
        existing.taskIds.add(entry.task_id);
      } else {
        byUser.set(entry.user_id, {
          totalMinutes: entry.duration_minutes ?? 0,
          taskIds: new Set([entry.task_id]),
        });
      }
    }

    const result: PersonBreakdown[] = [];
    for (const [userId, data] of byUser) {
      const profile = profiles.get(userId);
      result.push({
        userId,
        name: profile?.full_name ?? 'Unknown',
        totalMinutes: data.totalMinutes,
        taskCount: data.taskIds.size,
      });
    }

    result.sort((a, b) => b.totalMinutes - a.totalMinutes);
    return result;
  }, [entries, profiles]);

  const maxPersonMinutes = useMemo(
    () => Math.max(...personBreakdown.map((p) => p.totalMinutes), 1),
    [personBreakdown],
  );

  // -------------------------------------------------------------------------
  // Estimate vs Actual
  // -------------------------------------------------------------------------

  type EstimateComparison = {
    task: Task;
    estimated: number;
    actual: number;
    variance: number; // positive = over, negative = under
    variancePct: number;
  };

  const estimateComparisons = useMemo<EstimateComparison[]>(() => {
    return tasks
      .filter((t) => t.time_estimate_minutes != null && t.time_estimate_minutes > 0 && t.time_spent_minutes > 0)
      .map((t) => {
        const estimated = t.time_estimate_minutes!;
        const actual = t.time_spent_minutes;
        const variance = actual - estimated;
        const variancePct = Math.round((variance / estimated) * 100);
        return { task: t, estimated, actual, variance, variancePct };
      })
      .sort((a, b) => b.variancePct - a.variancePct);
  }, [tasks]);

  // -------------------------------------------------------------------------
  // Variance color helper
  // -------------------------------------------------------------------------

  function varianceColor(pct: number): string {
    if (pct > 10) return 'text-red-600 dark:text-red-400';
    if (pct >= -10) return 'text-amber-600 dark:text-amber-400';
    return 'text-emerald-600 dark:text-emerald-400';
  }

  function varianceBg(pct: number): string {
    if (pct > 10) return 'bg-red-500/10';
    if (pct >= -10) return 'bg-amber-500/10';
    return 'bg-emerald-500/10';
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 py-3 border-b">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Total Logged</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{formatHours(summary.totalLogged)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Timer className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">Total Estimated</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{formatHours(summary.totalEstimated)}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Utilization</span>
          </div>
          <p className={cn(
            'text-lg font-semibold tabular-nums',
            summary.utilization > 100
              ? 'text-red-600 dark:text-red-400'
              : summary.utilization >= 80
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400',
          )}>
            {summary.utilization}%
          </p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">Active Timers</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">{summary.activeTimers}</p>
          {summary.activeTimers > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Running
            </span>
          )}
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b">
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangePreset)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_week">This Week</SelectItem>
            <SelectItem value="last_week">Last Week</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
          </SelectContent>
        </Select>

        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Team member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            {profileList.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Grouping</SelectItem>
            <SelectItem value="person">Person</SelectItem>
            <SelectItem value="task">Task</SelectItem>
            <SelectItem value="day">Day</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">
          {formatShortDate(range.start)} - {formatShortDate(range.end)}
        </span>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6 p-4">
            {/* Time Entries Table */}
            <section>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Time Entries
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                  {sortedEntries.length}
                </Badge>
              </h3>

              {sortedEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Clock className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No time entries found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    No entries match the selected date range and filters.
                  </p>
                </div>
              ) : (
                <>
                  {groupedEntries.map((group) => (
                    <div key={group.key} className="mb-4">
                      {groupBy !== 'none' && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            ({formatMinutes(group.entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0))})
                          </span>
                          <div className="flex-1 h-px bg-border" />
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-2 pr-3 font-medium">
                                <button
                                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                                  onClick={() => setSortDir((d) => d === 'desc' ? 'asc' : 'desc')}
                                >
                                  Date
                                  <ArrowUpDown className="h-3 w-3" />
                                </button>
                              </th>
                              <th className="text-left py-2 pr-3 font-medium">Person</th>
                              <th className="text-left py-2 pr-3 font-medium">Task</th>
                              <th className="text-right py-2 pr-3 font-medium">Duration</th>
                              <th className="text-left py-2 font-medium">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.entries.map((entry) => {
                              const profile = profiles.get(entry.user_id);
                              const task = taskMap.get(entry.task_id);
                              const entryDate = new Date(entry.started_at);
                              const isRunning = entry.ended_at === null;

                              return (
                                <tr key={entry.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                                    {entryDate.toLocaleDateString('en-US', {
                                      month: 'short', day: 'numeric',
                                    })}
                                    <span className="text-muted-foreground ml-1">
                                      {entryDate.toLocaleTimeString('en-US', {
                                        hour: 'numeric', minute: '2-digit', hour12: true,
                                      })}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                        <span className="text-[7px] font-bold leading-none">
                                          {getInitials(profile?.full_name ?? '?')}
                                        </span>
                                      </div>
                                      <span className="truncate max-w-[120px]">
                                        {profile?.full_name ?? 'Unknown'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3">
                                    {task ? (
                                      <button
                                        className="text-left truncate max-w-[200px] hover:text-primary transition-colors hover:underline"
                                        onClick={() => onTaskClick(task)}
                                      >
                                        {task.title}
                                      </button>
                                    ) : (
                                      <span className="text-muted-foreground">Unknown Task</span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                                    {isRunning ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Running
                                      </span>
                                    ) : (
                                      formatMinutes(entry.duration_minutes ?? 0)
                                    )}
                                  </td>
                                  <td className="py-2 text-muted-foreground truncate max-w-[200px]">
                                    {entry.description ?? '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 font-medium">
                              <td className="py-2 pr-3" colSpan={3}>
                                Total
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums">
                                {formatMinutes(group.entries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0))}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}

                  {/* Grand total when grouped */}
                  {groupBy !== 'none' && groupedEntries.length > 1 && (
                    <div className="flex items-center justify-between px-2 py-2 rounded bg-muted/50 text-xs font-medium">
                      <span>Grand Total</span>
                      <span className="tabular-nums">{formatMinutes(entriesTotalMinutes)}</span>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Per-Person Breakdown */}
            {personBreakdown.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Per-Person Breakdown
                </h3>

                <div className="space-y-2">
                  {personBreakdown.map((person) => {
                    const barWidth = Math.round((person.totalMinutes / maxPersonMinutes) * 100);

                    return (
                      <div key={person.userId} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 w-[140px] shrink-0">
                          <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-bold leading-none">
                              {getInitials(person.name)}
                            </span>
                          </div>
                          <span className="text-xs font-medium truncate">{person.name}</span>
                        </div>

                        <div className="flex-1 flex items-center gap-2">
                          <div className="relative flex-1 h-5 rounded bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded bg-primary/60 transition-all"
                              style={{ width: `${barWidth}%` }}
                            />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-medium tabular-nums">
                              {formatHours(person.totalMinutes)}
                            </span>
                          </div>
                        </div>

                        <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">
                          {person.taskCount} {person.taskCount === 1 ? 'task' : 'tasks'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Estimate vs Actual */}
            {estimateComparisons.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Estimate vs Actual
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-3 font-medium">Task</th>
                        <th className="text-right py-2 pr-3 font-medium">Estimated</th>
                        <th className="text-right py-2 pr-3 font-medium">Actual</th>
                        <th className="text-right py-2 font-medium">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estimateComparisons.map((item) => (
                        <tr key={item.task.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-2 pr-3">
                            <button
                              className="text-left truncate max-w-[250px] hover:text-primary transition-colors hover:underline"
                              onClick={() => onTaskClick(item.task)}
                            >
                              {item.task.title}
                            </button>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatMinutes(item.estimated)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {formatMinutes(item.actual)}
                          </td>
                          <td className="py-2 text-right">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tabular-nums',
                              varianceBg(item.variancePct),
                              varianceColor(item.variancePct),
                            )}>
                              {item.variance > 0 ? '+' : ''}{formatMinutes(Math.abs(item.variance))}
                              <span className="opacity-70">({item.variancePct > 0 ? '+' : ''}{item.variancePct}%)</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
