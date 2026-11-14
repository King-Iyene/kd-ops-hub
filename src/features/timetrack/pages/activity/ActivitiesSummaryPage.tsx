import { useMemo, useState } from 'react';
import { format, differenceInCalendarDays } from 'date-fns';
import { Loader2, LayoutDashboard, Download } from 'lucide-react';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { downloadXlsx } from '../../reports/reportTables';
import { MultiSelectFilter } from '../../reports/ReportFiltersBar';
import { ActivityDateRangeBar, useActivityDateRange, useLogsWithIntervals, CATEGORY_BADGE, GetDesktopAppButton } from './shared';

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

/** TimeCamp's "Activities summary" — averages for the selected people plus a
 * per-person breakdown, backed by the same capture feed as the raw log table. */
export default function ActivitiesSummaryPage() {
  const { data: employees } = useActiveEmployees();
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const { data, isLoading } = useLogsWithIntervals(start, end);

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
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-medium mb-4">Averages for all selected users</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <StatCard title="Total time" value={`${totalHours.toFixed(1)}h`} tone="primary" />
                <StatCard title="Average per day" value={`${avgPerDay.toFixed(1)}h`} tone="info" />
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
                    <span className="w-16 text-right text-xs text-muted-foreground shrink-0">{a.hours.toFixed(1)}h</span>
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
                      <p className="text-sm font-medium truncate">{nameOf(p.employeeId)}</p>
                      <p className="text-xs text-muted-foreground">{p.hours.toFixed(1)}h total · {p.avgPerDay.toFixed(1)}h/day</p>
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

          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Employee</TableHead><TableHead>App</TableHead><TableHead>Window title</TableHead><TableHead>Category</TableHead></TableRow></TableHeader>
            <TableBody>
              {scopedLogs.slice(0, 200).map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{format(new Date(l.captured_at), 'MMM d, HH:mm')}</TableCell>
                  <TableCell>{nameOf(l.employee_id)}</TableCell>
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
        </>
      )}
    </div>
  );
}
