import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { Loader2, LayoutDashboard } from 'lucide-react';
import { RankedBars, TrendLine } from '@/features/timetrack/ui/charts';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { useCompanyEmployeeIds } from '@/features/timetrack/lib/trackerEmployees';
import { formatHours } from '../../reports/useReportData';
import { DateRangeSelect, datePresets } from '../../ui/DateRangeSelect';
import { STICKY_FILTERS } from '../../ui/stickyFilters';
import { DASHBOARD_RANGES, bucketHours, bucketKind, rangeText } from '../../lib/dashboardRange';

interface DashRow {
  employee_id: string; employee_name: string; project_name: string;
  start_time: string; duration_minutes: number; is_billable: boolean;
}

const PAGE = 1000;

function useRangeEntries(start: string, end: string) {
  // never the field team (or anyone the company filter leaves out)
  const shownIds = useCompanyEmployeeIds();
  return useQuery({
    queryKey: ['timetrack', 'dashboard-range', start, end, shownIds ? [...shownIds].sort().join(',') : 'all'],
    queryFn: async (): Promise<DashRow[]> => {
      // The database hands back at most 1000 rows at a time, and a year of entries is far more than that: read it page by page.
      const raw: {
        employee_id: string; start_time: string; end_time: string | null; duration_minutes: number | null; is_billable: boolean; time_tasks: unknown;
      }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('time_entries')
          .select('id, employee_id, project_id, start_time, end_time, duration_minutes, is_billable, time_tasks!inner(time_projects!inner(name))')
          .gte('start_time', `${start}T00:00:00`)
          .lt('start_time', `${format(addDays(parseISO(end), 1), 'yyyy-MM-dd')}T00:00:00`)
          .order('start_time', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        raw.push(...((data ?? []) as unknown as typeof raw));
        if ((data ?? []).length < PAGE) break;
      }
      const { data: employeesRaw } = await supabase.from('profiles_directory').select('id, full_name');
      const nameMap = new Map((employeesRaw ?? []).map((e) => [e.id, e.full_name ?? e.id]));
      return raw.filter((e) => !shownIds || shownIds.has(e.employee_id)).map((e) => ({
        employee_id: e.employee_id,
        employee_name: nameMap.get(e.employee_id) ?? e.employee_id,
        project_name: (e.time_tasks as { time_projects: { name: string } | null } | null)?.time_projects?.name ?? '—',
        start_time: e.start_time,
        // a timer still running counts up to now
        duration_minutes: e.end_time ? (e.duration_minutes ?? 0) : Math.max(0, Math.round((Date.now() - new Date(e.start_time).getTime()) / 60_000)),
        is_billable: e.is_billable,
      }));
    },
  });
}

/** Reports > Time > Other > Real-time dashboard. */
export default function RealTimeDashboardPage() {
  // starts on "This month", like before
  const thisMonth = datePresets().find((p) => p.key === 'month')!;
  const [start, setStart] = useState(thisMonth.start);
  const [end, setEnd] = useState(thisMonth.end);
  const { data: rows, isLoading } = useRangeEntries(start, end);
  const kind = bucketKind(start, end);

  const { totalHours, topProjects, daily, topWorkers } = useMemo(() => {
    const list = rows ?? [];
    const totalHours = list.reduce((s, r) => s + r.duration_minutes / 60, 0);

    const byProject = new Map<string, number>();
    for (const r of list) byProject.set(r.project_name, (byProject.get(r.project_name) ?? 0) + r.duration_minutes / 60);
    const topProjects = [...byProject.entries()]
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours).slice(0, 10);

    // per day for a short range, per month for a long one (a year)
    const daily = bucketHours(list, kind);

    const byWorker = new Map<string, number>();
    for (const r of list) byWorker.set(r.employee_name, (byWorker.get(r.employee_name) ?? 0) + r.duration_minutes / 60);
    const topWorkers = [...byWorker.entries()].map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours).slice(0, 5);

    return { totalHours, topProjects, daily, topWorkers };
  }, [rows, kind]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Real-time Dashboard" description={`Live rollup of logged hours · ${rangeText(start, end)}`} icon={LayoutDashboard} />
      <div className={STICKY_FILTERS}><DateRangeSelect start={start} end={end} setStart={setStart} setEnd={setEnd} only={[...DASHBOARD_RANGES]} /></div>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <Card className="max-w-xs"><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total time tracked</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatHours(totalHours)}</p>
          </CardContent></Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-2">Top 10 projects</p>
                <RankedBars data={topProjects} />

                <p className="text-sm font-medium mt-6 mb-2">{kind === 'month' ? 'Monthly' : 'Daily'}</p>
                <TrendLine data={daily.map((d) => ({ label: d.label, value: d.hours }))} xInterval={daily.length > 14 ? 2 : 0} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium mb-3">Top workers</p>
                <div className="space-y-2.5">
                  {topWorkers.map((w, i) => (
                    <div key={w.name} className="flex items-center gap-2.5">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <Avatar className="h-6 w-6"><AvatarFallback className="text-xs">{w.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <span className="text-sm flex-1 truncate">{w.name}</span>
                      <span className="text-sm font-medium">{formatHours(w.hours)}</span>
                    </div>
                  ))}
                  {topWorkers.length === 0 && <p className="text-sm text-muted-foreground">No entries in this period.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
