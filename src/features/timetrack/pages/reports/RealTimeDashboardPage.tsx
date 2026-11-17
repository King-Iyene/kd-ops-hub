import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import { Loader2, LayoutDashboard } from 'lucide-react';
import { RankedBars, TrendLine } from '@/features/timetrack/ui/charts';
import { PageHeader } from '@/features/timetrack/ui/TrackerPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabase';
import { formatHours } from '../../reports/useReportData';

const MONTH_OPTIONS = Array.from({ length: 6 }, (_, i) => {
  const d = subMonths(new Date(), i);
  return { value: format(d, 'yyyy-MM'), label: i === 0 ? 'This month' : format(d, 'MMMM yyyy') };
});

interface DashRow {
  employee_id: string; employee_name: string; project_name: string;
  start_time: string; duration_minutes: number; is_billable: boolean;
}

function useMonthEntries(month: string) {
  const monthStart = parseISO(`${month}-01`);
  const start = format(startOfMonth(monthStart), 'yyyy-MM-dd');
  const end = format(endOfMonth(monthStart), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['timetrack', 'dashboard-month', month],
    queryFn: async (): Promise<DashRow[]> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('employee_id, project_id, start_time, end_time, duration_minutes, is_billable, time_tasks!inner(time_projects!inner(name))')
        .gte('start_time', `${start}T00:00:00`)
        .lt('start_time', `${end}T23:59:59`);
      if (error) throw error;
      const { data: employeesRaw } = await supabase.from('profiles_directory').select('id, full_name');
      const nameMap = new Map((employeesRaw ?? []).map((e) => [e.id, e.full_name ?? e.id]));
      return (data ?? []).map((e) => ({
        employee_id: e.employee_id,
        employee_name: nameMap.get(e.employee_id) ?? e.employee_id,
        project_name: (e.time_tasks as unknown as { time_projects: { name: string } | null } | null)?.time_projects?.name ?? '—',
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
  const [month, setMonth] = useState(MONTH_OPTIONS[0].value);
  const { data: rows, isLoading } = useMonthEntries(month);

  const { totalHours, topProjects, daily, topWorkers } = useMemo(() => {
    const list = rows ?? [];
    const totalHours = list.reduce((s, r) => s + r.duration_minutes / 60, 0);

    const byProject = new Map<string, number>();
    for (const r of list) byProject.set(r.project_name, (byProject.get(r.project_name) ?? 0) + r.duration_minutes / 60);
    const topProjects = [...byProject.entries()]
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours).slice(0, 10);

    // days keyed 'yyyy-MM-dd' so they sort chronologically (they used to come out in query order)
    const byDay = new Map<string, number>();
    for (const r of list) {
      const key = format(new Date(r.start_time), 'yyyy-MM-dd');
      byDay.set(key, (byDay.get(key) ?? 0) + r.duration_minutes / 60);
    }
    const daily = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, hours]) => ({ label: format(parseISO(key), 'd MMM'), hours }));

    const byWorker = new Map<string, number>();
    for (const r of list) byWorker.set(r.employee_name, (byWorker.get(r.employee_name) ?? 0) + r.duration_minutes / 60);
    const topWorkers = [...byWorker.entries()].map(([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours).slice(0, 5);

    return { totalHours, topProjects, daily, topWorkers };
  }, [rows]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Real-time Dashboard" description="Live rollup of logged hours this month" icon={LayoutDashboard} />
      <Select value={month} onValueChange={setMonth}>
        <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
        <SelectContent>{MONTH_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
      </Select>

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

                <p className="text-sm font-medium mt-6 mb-2">Daily</p>
                <TrendLine data={daily.map((d) => ({ label: d.label, value: d.hours, note: d.note }))} xInterval={daily.length > 14 ? 2 : 0} />
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
                  {topWorkers.length === 0 && <p className="text-sm text-muted-foreground">No entries this month.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
