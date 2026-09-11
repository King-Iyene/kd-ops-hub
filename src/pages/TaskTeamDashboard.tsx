import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  ArrowUp, ArrowDown, Download, Search, ChevronUp, ChevronDown, X, Loader as Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { formatDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme, chartPalette } from '@/components/ChartKit';

// ─── Types & helpers ───────────────────────────────────────────────────

interface TaskRow {
  id: string;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  priority: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  blocked_reason: string | null;
}
interface ProfileLite { id: string; full_name: string; }

type Bucket = 'Not Started' | 'In Progress' | 'Complete' | 'Overdue';
const BUCKETS: Bucket[] = ['Not Started', 'In Progress', 'Complete', 'Overdue'];
const BUCKET_COLORS: Record<Bucket, string> = {
  'Not Started': '#94a3b8',
  'In Progress': chartTheme.primary,
  Complete: chartTheme.success,
  Overdue: chartTheme.danger,
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfWeek = (d: Date) => { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate() + 6); return e; };
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.round((a.getTime() - b.getTime()) / 86400000));

/** Not Started / In Progress / Complete / Overdue — the four buckets used
 *  by the status donut and the workload chart. Overdue takes priority over
 *  Not Started for any non-complete task whose due date has passed. */
function classify(t: TaskRow, todayIso: string): Bucket {
  if (t.status === 'complete') return 'Complete';
  if (t.due_date && t.due_date < todayIso) return 'Overdue';
  if (t.status === 'in_progress') return 'In Progress';
  return 'Not Started';
}

/** A task counts toward the selected period if its due date, completion
 *  date, or (lacking a due date) creation date falls inside the range. */
function inPeriod(t: TaskRow, fromIso: string, toIso: string): boolean {
  if (t.due_date && t.due_date >= fromIso && t.due_date <= toIso) return true;
  if (t.completed_at && t.completed_at.slice(0, 10) >= fromIso && t.completed_at.slice(0, 10) <= toIso) return true;
  if (!t.due_date && t.created_at.slice(0, 10) >= fromIso && t.created_at.slice(0, 10) <= toIso) return true;
  return false;
}

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function weekBucketsBetween(fromIso: string, toIso: string) {
  const weeks: { label: string; start: string; end: string }[] = [];
  const cursor = startOfWeek(new Date(fromIso));
  const end = new Date(toIso);
  let guard = 0;
  while (cursor <= end && guard < 104) {
    const s = new Date(cursor);
    const e = endOfWeek(cursor);
    weeks.push({ label: formatDate(s), start: toISODate(s), end: toISODate(e) });
    cursor.setDate(cursor.getDate() + 7);
    guard++;
  }
  return weeks;
}

// ─── Small presentational pieces ───────────────────────────────────────

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  const pct = pctDelta(current, previous);
  const up = pct >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-2xs font-medium', up ? 'text-emerald-500' : 'text-red-500')}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct)}%
    </span>
  );
}

function StatCard({ label, value, current, previous, tone }: {
  label: string; value: number; current: number; previous: number; tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
        <div className="flex items-end justify-between">
          <span className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</span>
          <DeltaBadge current={current} previous={previous} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Delta shown in percentage POINTS, for cards whose value is itself a rate
 *  (e.g. completion rate) — a ratio-of-ratios delta would be misleading. */
function PointDeltaBadge({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const up = diff >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-2xs font-medium', up ? 'text-emerald-500' : 'text-red-500')}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(diff)}pt
    </span>
  );
}

function CompletionRateCard({ current, previous }: { current: number; previous: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1.5">Task Completion Rate</p>
        <div className="flex items-end justify-between">
          <span className="text-2xl font-bold tabular-nums text-emerald-500">{current}%</span>
          <PointDeltaBadge current={current} previous={previous} />
        </div>
      </CardContent>
    </Card>
  );
}

function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: string; sortField: string; sortDir: 'asc' | 'desc'; onSort: (f: string) => void;
}) {
  const active = sortField === field;
  return (
    <button onClick={() => onSort(field)} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded">
      {label}
      {active && (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
    </button>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────

export default function TaskTeamDashboard() {
  usePageTitle('Team Dashboard');

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => new Date(), []);
  const todayIso = toISODate(today);

  const [fromDate, setFromDate] = useState(toISODate(startOfWeek(today)));
  const [toDate, setToDate] = useState(toISODate(endOfWeek(today)));
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [statusClickFilter, setStatusClickFilter] = useState<Bucket | null>(null);

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('due_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [taskRes, profRes] = await Promise.all([
        supabase.from('tasks').select('id, title, assignee_id, due_date, priority, status, completed_at, created_at, blocked_reason').is('parent_id', null).limit(5000),
        supabase.from('profiles_directory').select('id, full_name').eq('is_anonymised', false).in('status', ['active', 'invited']).order('full_name').limit(500),
      ]);
      setTasks((taskRes.data as TaskRow[]) || []);
      setProfiles((profRes.data as ProfileLite[]) || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => { setPage(1); }, [search, statusClickFilter, assigneeFilter, fromDate, toDate]);

  const profilesById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const nameFor = (id: string | null) => (id ? profilesById.get(id)?.full_name || 'Unknown' : 'Unassigned');

  const baseFiltered = useMemo(
    () => tasks.filter((t) => (assigneeFilter === 'all' || t.assignee_id === assigneeFilter) && inPeriod(t, fromDate, toDate)),
    [tasks, assigneeFilter, fromDate, toDate],
  );

  const prevRange = useMemo(() => {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const lengthMs = to.getTime() - from.getTime();
    const prevTo = new Date(from.getTime() - 86400000);
    const prevFrom = new Date(prevTo.getTime() - lengthMs);
    return { from: toISODate(prevFrom), to: toISODate(prevTo) };
  }, [fromDate, toDate]);

  const prevFiltered = useMemo(
    () => tasks.filter((t) => (assigneeFilter === 'all' || t.assignee_id === assigneeFilter) && inPeriod(t, prevRange.from, prevRange.to)),
    [tasks, assigneeFilter, prevRange],
  );

  const stat = (list: TaskRow[]) => {
    const total = list.length;
    const completed = list.filter((t) => t.status === 'complete').length;
    return {
      total,
      completed,
      overdue: list.filter((t) => t.status !== 'complete' && t.due_date && t.due_date < todayIso).length,
      blocked: list.filter((t) => t.status === 'blocked').length,
      inProgress: list.filter((t) => t.status === 'in_progress').length,
      unassigned: list.filter((t) => !t.assignee_id).length,
      rate: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  };
  const cur = useMemo(() => stat(baseFiltered), [baseFiltered, todayIso]);
  const prev = useMemo(() => stat(prevFiltered), [prevFiltered, todayIso]);

  // Row 2
  const statusDist = useMemo(() => {
    const buckets: Record<Bucket, number> = { 'Not Started': 0, 'In Progress': 0, Complete: 0, Overdue: 0 };
    baseFiltered.forEach((t) => { buckets[classify(t, todayIso)]++; });
    return BUCKETS.map((k) => ({ name: k, value: buckets[k] }));
  }, [baseFiltered, todayIso]);

  const workload = useMemo(() => {
    const map = new Map<string, { id: string; name: string } & Record<Bucket, number> & { total: number }>();
    baseFiltered.forEach((t) => {
      const id = t.assignee_id || '__unassigned';
      if (!map.has(id)) map.set(id, { id, name: nameFor(t.assignee_id), 'Not Started': 0, 'In Progress': 0, Complete: 0, Overdue: 0, total: 0 });
      const row = map.get(id)!;
      row[classify(t, todayIso)]++;
      row.total++;
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [baseFiltered, profilesById, todayIso]);

  // Row 3
  const dueBuckets = useMemo(() => {
    const weekEnd = toISODate(endOfWeek(today));
    const map = new Map<string, { id: string; name: string; Today: number; 'This Week': number; Later: number }>();
    baseFiltered.filter((t) => t.status !== 'complete' && t.due_date).forEach((t) => {
      const id = t.assignee_id || '__unassigned';
      if (!map.has(id)) map.set(id, { id, name: nameFor(t.assignee_id), Today: 0, 'This Week': 0, Later: 0 });
      const row = map.get(id)!;
      if (t.due_date === todayIso) row.Today++;
      else if (t.due_date! > todayIso && t.due_date! <= weekEnd) row['This Week']++;
      else row.Later++;
    });
    return Array.from(map.values());
  }, [baseFiltered, profilesById, todayIso, today]);

  const weeklyCompletion = useMemo(() => {
    const weeks = weekBucketsBetween(fromDate, toDate);
    return weeks.map((w) => {
      const due = tasks.filter((t) => (assigneeFilter === 'all' || t.assignee_id === assigneeFilter) && t.due_date && t.due_date >= w.start && t.due_date <= w.end);
      const completed = due.filter((t) => t.status === 'complete');
      const rate = due.length === 0 ? null : Math.round((completed.length / due.length) * 100);
      return { week: w.label, rate };
    });
  }, [tasks, fromDate, toDate, assigneeFilter]);

  // Row 4
  const overdueByAssignee = useMemo(() => {
    const map = new Map<string, { id: string; name: string; overdue: number }>();
    baseFiltered.filter((t) => t.status !== 'complete' && t.due_date && t.due_date < todayIso).forEach((t) => {
      const id = t.assignee_id || '__unassigned';
      if (!map.has(id)) map.set(id, { id, name: nameFor(t.assignee_id), overdue: 0 });
      map.get(id)!.overdue++;
    });
    return Array.from(map.values()).sort((a, b) => b.overdue - a.overdue);
  }, [baseFiltered, profilesById, todayIso]);

  const avgAge = useMemo(() => {
    const map = new Map<string, { id: string; name: string; totalDays: number; count: number }>();
    baseFiltered.filter((t) => t.status !== 'complete').forEach((t) => {
      const id = t.assignee_id || '__unassigned';
      if (!map.has(id)) map.set(id, { id, name: nameFor(t.assignee_id), totalDays: 0, count: 0 });
      const row = map.get(id)!;
      row.totalDays += daysBetween(today, new Date(t.created_at));
      row.count++;
    });
    return Array.from(map.values()).map((r) => ({ id: r.id, name: r.name, avgAge: r.count ? Math.round(r.totalDays / r.count) : 0 })).sort((a, b) => b.avgAge - a.avgAge);
  }, [baseFiltered, profilesById, today]);

  // Row 5 — blocked tasks. Note: there's no dedicated "blocked at" or
  // "escalation status" column in the schema, so Date Blocked is
  // approximated from created_at, and Escalation Status is derived from
  // the same day thresholds used for row highlighting.
  const blockedTasks = useMemo(() => baseFiltered.filter((t) => t.status === 'blocked').map((t) => {
    const daysBlocked = daysBetween(today, new Date(t.created_at));
    const escalation = daysBlocked > 7 ? 'Escalated' : daysBlocked > 3 ? 'Watch' : 'New';
    return {
      id: t.id, title: t.title, assigneeName: nameFor(t.assignee_id),
      dateBlocked: t.created_at, daysBlocked, blockerDescription: t.blocked_reason || '—', escalation,
    };
  }).sort((a, b) => b.daysBlocked - a.daysBlocked), [baseFiltered, profilesById, today]);

  // Row 6
  const completionTrend = useMemo(() => {
    const weeks = weekBucketsBetween(fromDate, toDate);
    const assigneeIds = assigneeFilter === 'all'
      ? Array.from(new Set(tasks.map((t) => t.assignee_id).filter(Boolean))) as string[]
      : [assigneeFilter];
    const names = assigneeIds.map((id) => nameFor(id));
    const data = weeks.map((w) => {
      const row: Record<string, string | number> = { week: w.label };
      assigneeIds.forEach((id) => {
        row[nameFor(id)] = tasks.filter((t) => t.assignee_id === id && t.completed_at && t.completed_at.slice(0, 10) >= w.start && t.completed_at.slice(0, 10) <= w.end).length;
      });
      return row;
    });
    return { data, names };
  }, [tasks, fromDate, toDate, assigneeFilter, profilesById]);

  // Row 7
  const detailRowsAll = useMemo(() => baseFiltered
    .filter((t) => !statusClickFilter || classify(t, todayIso) === statusClickFilter)
    .map((t) => ({
      id: t.id,
      title: t.title,
      assigneeName: nameFor(t.assignee_id),
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      completed_at: t.completed_at,
      daysOpen: daysBetween(t.completed_at ? new Date(t.completed_at) : today, new Date(t.created_at)),
      blocked: t.status === 'blocked',
    })), [baseFiltered, statusClickFilter, todayIso, profilesById, today]);

  const detailRows = useMemo(() => {
    let rows = detailRowsAll;
    if (search.trim()) rows = rows.filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title': cmp = a.title.localeCompare(b.title); break;
        case 'assignee': cmp = a.assigneeName.localeCompare(b.assigneeName); break;
        case 'status': cmp = a.status.localeCompare(b.status); break;
        case 'priority': cmp = a.priority.localeCompare(b.priority); break;
        case 'due_date': cmp = (a.due_date || '').localeCompare(b.due_date || ''); break;
        case 'completed_at': cmp = (a.completed_at || '').localeCompare(b.completed_at || ''); break;
        case 'days_open': cmp = a.daysOpen - b.daysOpen; break;
        case 'blocked': cmp = Number(a.blocked) - Number(b.blocked); break;
        default: cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [detailRowsAll, search, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(detailRows.length / PAGE_SIZE));
  const pageRows = detailRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const exportCsv = () => {
    const header = ['Task Name', 'Assignee', 'Status', 'Priority', 'Due Date', 'Date Completed', 'Days Open', 'Blocked'];
    const rows = detailRows.map((r) => [r.title, r.assigneeName, r.status, r.priority, r.due_date || '', r.completed_at || '', r.daysOpen, r.blocked ? 'Yes' : 'No']);
    downloadCsv('team-task-dashboard', toCsv(header, rows));
  };

  if (loading) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Header + persistent filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Team Dashboard</h1>
          <p className="text-sm text-muted-foreground">Team-wide task performance for the selected period.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="h-8 w-[150px] text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-[150px] text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 1 — Headline stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <StatCard label="Total Tasks in Period" value={cur.total} current={cur.total} previous={prev.total} />
        <StatCard label="Total Completed" value={cur.completed} current={cur.completed} previous={prev.completed} tone="text-success" />
        <CompletionRateCard current={cur.rate} previous={prev.rate} />
        <StatCard label="Total Overdue" value={cur.overdue} current={cur.overdue} previous={prev.overdue} tone="text-destructive" />
        <StatCard label="Total Blocked" value={cur.blocked} current={cur.blocked} previous={prev.blocked} tone="text-amber-500" />
        <StatCard label="Total In Progress" value={cur.inProgress} current={cur.inProgress} previous={prev.inProgress} tone="text-primary" />
        <StatCard label="Unassigned Tasks" value={cur.unassigned} current={cur.unassigned} previous={prev.unassigned} />
      </div>

      {/* Row 2 — Status & workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Status distribution</CardTitle></CardHeader>
          <CardContent>
            {statusClickFilter && (
              <button onClick={() => setStatusClickFilter(null)} className="mb-2 inline-flex items-center gap-1 text-2xs text-primary hover:underline">
                Filtered by: {statusClickFilter} <X className="h-3 w-3" />
              </button>
            )}
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <ChartGradients />
                <Pie
                  data={statusDist} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}
                  onClick={(entry: any) => setStatusClickFilter((prev) => (prev === entry.name ? null : entry.name))}
                  {...chartAnim}
                >
                  {statusDist.map((s) => <Cell key={s.name} fill={BUCKET_COLORS[s.name as Bucket]} className="cursor-pointer" />)}
                </Pie>
                <ChartTooltip content={<GlassTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Workload by assignee</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(260, workload.length * 34)}>
              <BarChart data={workload} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={110} />
                <ChartTooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                {BUCKETS.map((b) => (
                  <Bar
                    key={b} dataKey={b} stackId="a" fill={BUCKET_COLORS[b]} {...chartAnim}
                    onClick={(data: any) => { if (data?.id && data.id !== '__unassigned') setAssigneeFilter(data.id); }}
                    className="cursor-pointer"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 3 — Urgency & timing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming due dates by assignee</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dueBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={axisTick} allowDecimals={false} />
                <ChartTooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Today" fill={chartTheme.danger} {...chartAnim} onClick={(d: any) => d?.id && d.id !== '__unassigned' && setAssigneeFilter(d.id)} className="cursor-pointer" />
                <Bar dataKey="This Week" fill={chartTheme.warning} {...chartAnim} onClick={(d: any) => d?.id && d.id !== '__unassigned' && setAssigneeFilter(d.id)} className="cursor-pointer" />
                <Bar dataKey="Later" fill={chartTheme.primary} {...chartAnim} onClick={(d: any) => d?.id && d.id !== '__unassigned' && setAssigneeFilter(d.id)} className="cursor-pointer" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly completion rate <span className="text-muted-foreground font-normal">(target 80%)</span></CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={weeklyCompletion}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
                <XAxis dataKey="week" tick={axisTick} />
                <YAxis tick={axisTick} domain={[0, 100]} />
                <ChartTooltip content={<GlassTooltip formatter={(v: any) => (v == null ? 'No data' : `${v}%`)} />} />
                <ReferenceLine y={80} stroke={chartTheme.warning} strokeDasharray="4 4" label={{ value: 'Target', position: 'right', fill: chartTheme.warning, fontSize: 11 }} />
                <Line
                  type="monotone" dataKey="rate" stroke={chartTheme.primary} strokeWidth={2} connectNulls
                  dot={(props: any) => {
                    const { cx, cy, value, index } = props;
                    if (value === null || value === undefined) return <g key={index} />;
                    const color = value < 80 ? chartTheme.danger : chartTheme.success;
                    return <circle key={index} cx={cx} cy={cy} r={4} fill={color} stroke={color} />;
                  }}
                  {...chartAnim}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 4 — Accountability signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Overdue tasks by assignee</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(260, overdueByAssignee.length * 34)}>
              <BarChart data={overdueByAssignee} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={110} />
                <ChartTooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="overdue" fill={chartTheme.danger} {...chartAnim} onClick={(d: any) => d?.id && d.id !== '__unassigned' && setAssigneeFilter(d.id)} className="cursor-pointer" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Average task age (days), open tasks</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(260, avgAge.length * 34)}>
              <BarChart data={avgAge} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} horizontal={false} />
                <XAxis type="number" tick={axisTick} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={axisTick} width={110} />
                <ChartTooltip content={<GlassTooltip />} cursor={{ fill: 'transparent' }} />
                <Bar dataKey="avgAge" fill={chartTheme.gold} {...chartAnim} onClick={(d: any) => d?.id && d.id !== '__unassigned' && setAssigneeFilter(d.id)} className="cursor-pointer" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 5 — Blockers & escalations */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Blocked tasks</CardTitle>
          <p className="text-2xs text-muted-foreground">
            Date Blocked is approximated from task creation date — this schema has no dedicated "blocked at" timestamp. Escalation Status is derived from Days Blocked.
          </p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {blockedTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No blocked tasks in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Task Name</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Assignee</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Date Blocked</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Days Blocked</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Blocker Description</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground text-xs">Escalation Status</th>
                </tr>
              </thead>
              <tbody>
                {blockedTasks.map((b) => (
                  <tr
                    key={b.id}
                    className={cn(
                      'border-b border-border/60',
                      b.daysBlocked > 7 ? 'bg-red-500/10' : b.daysBlocked > 3 ? 'bg-amber-500/10' : undefined,
                    )}
                  >
                    <td className="py-2 pr-3 max-w-[220px] truncate">{b.title}</td>
                    <td className="py-2 pr-3">{b.assigneeName}</td>
                    <td className="py-2 pr-3">{formatDate(b.dateBlocked)}</td>
                    <td className="py-2 pr-3 font-medium">{b.daysBlocked}</td>
                    <td className="py-2 pr-3 max-w-[260px] truncate">{b.blockerDescription}</td>
                    <td className="py-2 pr-3">
                      <span className={cn(
                        'text-2xs font-medium px-2 py-0.5 rounded-full',
                        b.escalation === 'Escalated' ? 'bg-red-500/15 text-red-500' : b.escalation === 'Watch' ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground',
                      )}
                      >
                        {b.escalation}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Row 6 — Completion trend by assignee */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly completion trend by assignee</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={completionTrend.data}>
              <ChartGradients />
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} />
              <XAxis dataKey="week" tick={axisTick} />
              <YAxis tick={axisTick} allowDecimals={false} />
              <ChartTooltip content={<GlassTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              {completionTrend.names.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={chartPalette[i % chartPalette.length]} strokeWidth={2} dot={{ r: 3 }} {...chartAnim} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Row 7 — Task detail table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">Task detail</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="h-8 pl-8 text-xs w-[200px]" placeholder="Search tasks..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3"><SortHeader label="Task Name" field="title" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="py-2 pr-3"><SortHeader label="Assignee" field="assignee" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="py-2 pr-3"><SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="py-2 pr-3"><SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="py-2 pr-3"><SortHeader label="Due Date" field="due_date" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="py-2 pr-3"><SortHeader label="Date Completed" field="completed_at" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="py-2 pr-3"><SortHeader label="Days Open" field="days_open" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
                <th className="py-2 pr-3"><SortHeader label="Blocked" field="blocked" sortField={sortField} sortDir={sortDir} onSort={toggleSort} /></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="py-2 pr-3 max-w-[220px] truncate">{r.title}</td>
                  <td className="py-2 pr-3">{r.assigneeName}</td>
                  <td className="py-2 pr-3 capitalize">{r.status.replace('_', ' ')}</td>
                  <td className="py-2 pr-3 capitalize">{r.priority}</td>
                  <td className="py-2 pr-3">{formatDate(r.due_date)}</td>
                  <td className="py-2 pr-3">{r.completed_at ? formatDate(r.completed_at) : '—'}</td>
                  <td className="py-2 pr-3">{r.daysOpen}</td>
                  <td className="py-2 pr-3">{r.blocked ? 'Yes' : 'No'}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No tasks match the current filters.</td></tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
              <span>Page {page} of {totalPages} ({detailRows.length} tasks)</span>
              <div className="flex gap-1.5">
                <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="xs" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
