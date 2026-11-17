import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, differenceInCalendarDays } from 'date-fns';
import { Link } from 'react-router-dom';
import { Loader2, LayoutDashboard, Download, AlertTriangle } from 'lucide-react';
import { RankedBars, TrendLine } from '@/features/timetrack/ui/charts';
import { useActiveEmployees } from '@/features/timetrack/lib/trackerEmployees';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { StatCard } from '@/features/timetrack/ui/TrackerStat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { downloadXlsx } from '../../reports/reportTables';
import { MultiSelectFilter } from '../../reports/ReportFiltersBar';
import { ActivityDateRangeBar, useActivityDateRange, useLogsWithIntervals, captureDomain, CATEGORY_BADGE, GetDesktopAppButton, EmployeeLink } from './shared';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** One capture tick ≈ one employee's configured interval (default 5 min when
 * no agent-settings row exists yet). Ticks → hours is how every "time" figure
 * on this page is derived — there's no separate duration column to sum. */
function ticksToHours(ticks: number, intervalMinutes: number | undefined): number {
  return (ticks * (intervalMinutes ?? 5)) / 60;
}

function fmtHm(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const PRODUCTIVE_GOAL_HOURS = 7;

const CATEGORY_LABEL: Record<string, string> = {
  productive: 'Productive', neutral: 'Neutral', unproductive: 'Unproductive', blocked: 'Blocked', idle: 'Away', uncategorized: 'Uncategorized',
};

/** 0 -> "12a", 9 -> "9a", 12 -> "12p", 15 -> "3p" */
function hourLabel(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

const CATEGORY_COLOR: Record<string, string> = {
  productive: '#22c55e', neutral: '#9ca3af', unproductive: '#ef4444', blocked: '#ef4444', idle: '#38bdf8',
};

/** TimeCamp's "Activities summary" — averages for the selected people plus a
 * per-person breakdown, backed by the same capture feed as the raw log table. */
export default function ActivitiesSummaryPage() {
  const { data: employees } = useActiveEmployees();
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const [searchParams, setSearchParams] = useSearchParams();

  // Arriving via an EmployeeLink from another activity-tracker page (e.g.
  // User Statistics) — pre-scope to that one person, then drop the param so
  // the People filter above (which owns employeeIds from here on) is the
  // single source of truth and a page refresh doesn't silently re-apply it.
  useEffect(() => {
    const fromLink = searchParams.get('employee');
    if (fromLink) {
      setEmployeeIds([fromLink]);
      setSearchParams((p) => { p.delete('employee'); return p; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const nameOf = (id: string) => employees?.find((e) => e.id === id)?.full_name ?? id;

  const scopedLogs = useMemo(() => {
    const all = data?.logs ?? [];
    return employeeIds.length > 0 ? all.filter((l) => employeeIds.includes(l.employee_id)) : all;
  }, [data, employeeIds]);

  const days = Math.max(1, differenceInCalendarDays(new Date(end), new Date(start)) + 1);

  const { totalHours, avgPerDay, topApps, byPerson } = useMemo(() => {
    const intervalByEmployee = data?.intervalByEmployee ?? new Map<string, number>();
    let totalTicks = 0;
    const appTicks = new Map<string, number>();
    const personTicks = new Map<string, { total: number; productive: number; unproductive: number; idle: number; apps: Map<string, number> }>();

    for (const l of scopedLogs) {
      totalTicks += 1;
      const app = l.app_name ?? 'Unknown';
      appTicks.set(app, (appTicks.get(app) ?? 0) + 1);

      const p = personTicks.get(l.employee_id) ?? { total: 0, productive: 0, unproductive: 0, idle: 0, apps: new Map<string, number>() };
      p.total += 1;
      if (l.productivity_category === 'productive') p.productive += 1;
      if (l.productivity_category === 'unproductive') p.unproductive += 1;
      if (l.productivity_category === 'idle') p.idle += 1;
      p.apps.set(app, (p.apps.get(app) ?? 0) + 1);
      personTicks.set(l.employee_id, p);
    }

    // Blend each person's own capture interval when summing total hours (a
    // mixed selection of employees on different intervals still adds up right).
    let totalHours = 0;
    for (const [empId, p] of personTicks) totalHours += ticksToHours(p.total, intervalByEmployee.get(empId));
    const avgIntervalForTopApps = scopedLogs.length > 0 ? (intervalByEmployee.get(scopedLogs[0].employee_id) ?? 5) : 5;

    const topApps = [...appTicks.entries()]
      .map(([app, ticks]) => ({ app, hours: ticksToHours(ticks, avgIntervalForTopApps), pct: totalTicks > 0 ? (ticks / totalTicks) * 100 : 0 }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);

    const byPerson = [...personTicks.entries()].map(([empId, p]) => {
      const hours = ticksToHours(p.total, intervalByEmployee.get(empId));
      const topApp = [...p.apps.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        employeeId: empId,
        hours,
        avgPerDay: hours / days,
        productivePct: p.total > 0 ? (p.productive / p.total) * 100 : 0,
        unproductivePct: p.total > 0 ? (p.unproductive / p.total) * 100 : 0,
        topApp: topApp ? topApp[0] : '—',
      };
    }).sort((a, b) => b.hours - a.hours);

    return { totalHours, avgPerDay: totalHours / days, topApps, byPerson };
  }, [scopedLogs, data, days]);

  // TimeCamp-style personal dashboard figures, from the same scoped captures.
  const extra = useMemo(() => {
    const intervalByEmployee = data?.intervalByEmployee ?? new Map<string, number>();
    const hourly = Array.from({ length: 24 }, () => 0);
    const byCategory = new Map<string, number>();
    const uncategorized = new Set<string>();
    let activeHours = 0;
    let productiveHours = 0;
    let distractedHours = 0;
    let idleHours = 0;
    for (const l of scopedLogs) {
      const h = (intervalByEmployee.get(l.employee_id) ?? 5) / 60;
      const cat = l.productivity_category ?? 'uncategorized';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + h);
      if (cat === 'idle') { idleHours += h; continue; }
      activeHours += h;
      hourly[new Date(l.captured_at).getHours()] += h;
      if (cat === 'productive') productiveHours += h;
      if (cat === 'unproductive' || cat === 'blocked') distractedHours += h;
      if (!l.ruled) uncategorized.add(captureDomain(l) ?? l.app_name ?? 'Unknown');
    }
    const allHours = activeHours + idleHours;
    return {
      hourly: hourly.map((hours, hour) => ({ hour: String(hour), minutes: Math.round(hours * 60) })),
      categories: [...byCategory.entries()].map(([name, hours]) => ({ name, hours: Number(hours.toFixed(2)) })).sort((a, b) => b.hours - a.hours),
      uncategorizedCount: uncategorized.size,
      toolUsagePct: allHours > 0 ? (activeHours / allHours) * 100 : 0,
      activeHours,
      productiveHours,
      distractedHours,
      distractedPct: activeHours > 0 ? (distractedHours / activeHours) * 100 : 0,
    };
  }, [scopedLogs, data]);

  const exportRows = () => scopedLogs.map((l) => [
    format(new Date(l.captured_at), 'yyyy-MM-dd HH:mm'), nameOf(l.employee_id), l.app_name ?? '', l.window_title ?? '', l.productivity_category ?? '',
  ]);
  const exportHeader = ['Time', 'Employee', 'App', 'Window title', 'Category'];
  const exportCsv = () => downloadCsv(`activities-summary-${start}-to-${end}.csv`, toCsv(exportHeader, exportRows()));
  const exportXlsx = () => downloadXlsx(`activities-summary-${start}-to-${end}`, exportHeader, exportRows());

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Activities summary"
        description="Native desktop agent: window/app activity capture, optional screenshots — requires the standalone KD Ops Time Tracker install"
        icon={LayoutDashboard}
        actions={<GetDesktopAppButton />}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
          <div className="w-56">
            <MultiSelectFilter
              label="People" allLabel="All users"
              options={(employees ?? []).map((e) => ({ id: e.id, name: e.full_name }))}
              selected={employeeIds} onChange={setEmployeeIds}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportXlsx}><Download className="h-3.5 w-3.5 mr-1.5" /> Download Excel (XLSX)</Button>
        </div>
      </div>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          {extra.uncategorizedCount > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>
                There {extra.uncategorizedCount === 1 ? 'is' : 'are'} <strong>{extra.uncategorizedCount}</strong> application{extra.uncategorizedCount === 1 ? '' : 's'} or site{extra.uncategorizedCount === 1 ? '' : 's'} that {extra.uncategorizedCount === 1 ? 'is' : 'are'} not categorized.{' '}
                <Link to="/timetrack/activity/sites-apps" className="font-medium text-primary hover:underline">Click here</Link> to suggest categories.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard title="Tool usage" value={`${extra.toolUsagePct.toFixed(0)}%`} tone="primary" />
            <StatCard title="Per day" value={fmtHm(avgPerDay)} tone="info" />
            <StatCard title="Total time" value={fmtHm(totalHours)} tone="default" />
            <StatCard title="Distracted time" value={`${fmtHm(extra.distractedHours)} (${extra.distractedPct.toFixed(0)}%)`} tone="default" />
          </div>

          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-2">Productive ≥ {PRODUCTIVE_GOAL_HOURS}h per day</p>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (extra.productiveHours / days / PRODUCTIVE_GOAL_HOURS) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {fmtHm(extra.productiveHours / days)} productive per day on average · <Link to="/timetrack/activity/goals" className="text-primary hover:underline">Edit goals</Link>
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">Daily time (by hour of day)</p>
                <TrendLine data={extra.hourly.map((h) => ({ label: hourLabel(Number(h.hour)), value: h.minutes / 60 }))} xInterval={2} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">Top categories</p>
                <RankedBars data={extra.categories.map((c) => ({ name: CATEGORY_LABEL[c.name] ?? c.name, hours: c.hours, color: CATEGORY_COLOR[c.name] ?? '#94a3b8' }))} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-4">Averages for all selected users</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <StatCard title="Total time" value={fmtHm(totalHours)} tone="primary" />
                <StatCard title="Average per day" value={fmtHm(avgPerDay)} tone="info" />
                <StatCard title="Tools tracked" value={topApps.length} tone="default" />
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Tools usage</p>
              <div className="space-y-2">
                {topApps.map((a) => (
                  <div key={a.app} className="flex items-center gap-3 text-sm">
                    <span className="w-36 truncate shrink-0">{a.app}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, a.pct)}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs text-muted-foreground shrink-0">{a.pct.toFixed(0)}%</span>
                    <span className="w-16 text-right text-xs text-muted-foreground shrink-0">{fmtHm(a.hours)}</span>
                  </div>
                ))}
                {topApps.length === 0 && <p className="text-sm text-muted-foreground">No captures in this range.</p>}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {byPerson.map((p) => (
              <Card key={p.employeeId}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <Avatar className="h-8 w-8"><AvatarFallback>{initials(nameOf(p.employeeId))}</AvatarFallback></Avatar>
                    <div className="min-w-0">
                      <p className="text-sm truncate"><EmployeeLink employeeId={p.employeeId} name={nameOf(p.employeeId)} /></p>
                      <p className="text-xs text-muted-foreground">{fmtHm(p.hours)} total · {fmtHm(p.avgPerDay)}/day</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <span className="text-emerald-600">{p.productivePct.toFixed(0)}% productive</span>
                    {p.unproductivePct > 0 && <span className="text-destructive">· {p.unproductivePct.toFixed(0)}% unproductive</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">Top: {p.topApp}</p>
                </CardContent>
              </Card>
            ))}
            {byPerson.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No activity captured yet.</p>}
          </div>

          <Card>
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Raw activity log{scopedLogs.length > 200 ? ' (most recent 200)' : ''}
              </p>
              <Table>
                <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Employee</TableHead><TableHead>App</TableHead><TableHead>Window title</TableHead><TableHead>Category</TableHead></TableRow></TableHeader>
                <TableBody>
                  {scopedLogs.slice(0, 200).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{format(new Date(l.captured_at), 'MMM d, HH:mm')}</TableCell>
                      <TableCell><EmployeeLink employeeId={l.employee_id} name={nameOf(l.employee_id)} /></TableCell>
                      <TableCell>{l.app_name ?? '—'}</TableCell>
                      <TableCell className="max-w-xs truncate">{l.window_title ?? '—'}</TableCell>
                      <TableCell>{l.productivity_category && <Badge variant="outline" className={CATEGORY_BADGE[l.productivity_category]}>{l.productivity_category}</Badge>}</TableCell>
                    </TableRow>
                  ))}
                  {scopedLogs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">
                      No activity captured yet — the desktop agent needs to be installed and enabled under Agent &amp; policy.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
