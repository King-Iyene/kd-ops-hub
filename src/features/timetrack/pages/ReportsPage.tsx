import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, eachDayOfInterval, parseISO } from 'date-fns';
import { Download, Loader2, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { toCsv, downloadCsv } from '@/lib/csv';
import { formatNaira } from '@/lib/format';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
type Entry = {
  id: string; employee_id: string; project_id: string; task_id: string;
  start_time: string; duration_minutes: number | null; is_billable: boolean; notes: string | null;
  time_tasks: { name: string; time_projects: { name: string } };
};

function useDateRange() {
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  return { start, end, setStart, setEnd };
}

function useEntriesInRange(start: string, end: string) {
  return useQuery({
    queryKey: ['timetrack', 'report-entries', start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('id, employee_id, project_id, task_id, start_time, duration_minutes, is_billable, notes, time_tasks(name, time_projects(name))')
        .gte('start_time', `${start}T00:00:00`)
        .lt('start_time', `${end}T23:59:59`)
        .not('end_time', 'is', null)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data as unknown as Entry[];
    },
  });
}

export default function ReportsPage() {
  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Reports" description="Time, people, finance, computer-activity and live dashboard views — every one CSV-exportable" icon={BarChart3} />
      <Tabs defaultValue="time">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="time">Time</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="dashboard">Live Dashboard</TabsTrigger>
          <TabsTrigger value="raw">Raw export</TabsTrigger>
        </TabsList>
        <TabsContent value="time" className="mt-4"><TimeReportsGroup /></TabsContent>
        <TabsContent value="people" className="mt-4"><PeopleReportsGroup /></TabsContent>
        <TabsContent value="finance" className="mt-4"><FinanceReport /></TabsContent>
        <TabsContent value="dashboard" className="mt-4"><LiveDashboard /></TabsContent>
        <TabsContent value="raw" className="mt-4"><RawExport /></TabsContent>
      </Tabs>
    </div>
  );
}

function TimeReportsGroup() {
  return (
    <Tabs defaultValue="summary">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="detailed">Detailed</TabsTrigger>
        <TabsTrigger value="byDays">By days</TabsTrigger>
        <TabsTrigger value="pivot">Pivot Table</TabsTrigger>
      </TabsList>
      <TabsContent value="summary" className="mt-4"><SummaryReport /></TabsContent>
      <TabsContent value="detailed" className="mt-4"><DetailedReport /></TabsContent>
      <TabsContent value="byDays" className="mt-4"><TimeByDaysReport /></TabsContent>
      <TabsContent value="pivot" className="mt-4"><PivotReport /></TabsContent>
    </Tabs>
  );
}

function PeopleReportsGroup() {
  return (
    <Tabs defaultValue="byTasks">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="byTasks">By tasks</TabsTrigger>
        <TabsTrigger value="byDaysTasks">By days and tasks</TabsTrigger>
        <TabsTrigger value="byDays">By days</TabsTrigger>
        <TabsTrigger value="byProjects">By projects</TabsTrigger>
      </TabsList>
      <TabsContent value="byTasks" className="mt-4"><PeopleByTasksReport /></TabsContent>
      <TabsContent value="byDaysTasks" className="mt-4"><PeopleByDaysTasksReport /></TabsContent>
      <TabsContent value="byDays" className="mt-4"><PeopleByDaysReport /></TabsContent>
      <TabsContent value="byProjects" className="mt-4"><PeopleByProjectsReport /></TabsContent>
    </Tabs>
  );
}

function DateRangeBar({ start, end, setStart, setEnd, onExport }: {
  start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void; onExport?: () => void;
}) {
  return (
    <div className="flex items-end gap-3 mb-4">
      <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
      <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      {onExport && <Button variant="outline" onClick={onExport}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>}
    </div>
  );
}

function SummaryReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);
  const { data: employees } = useActiveEmployees();

  const rows = useMemo(() => {
    const map = new Map<string, { employee_id: string; project: string; hours: number; billableHours: number }>();
    for (const e of entries ?? []) {
      const key = `${e.employee_id}:${e.time_tasks?.time_projects?.name ?? '—'}`;
      const row = map.get(key) ?? { employee_id: e.employee_id, project: e.time_tasks?.time_projects?.name ?? '—', hours: 0, billableHours: 0 };
      row.hours += (e.duration_minutes ?? 0) / 60;
      if (e.is_billable) row.billableHours += (e.duration_minutes ?? 0) / 60;
      map.set(key, row);
    }
    return [...map.values()];
  }, [entries]);

  const exportCsv = () => {
    const csv = toCsv(['Employee', 'Project', 'Hours', 'Billable hours'], rows.map((r) => [
      employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id, r.project, r.hours.toFixed(2), r.billableHours.toFixed(2),
    ]));
    downloadCsv(`timetrack-summary-${start}-to-${end}.csv`, csv);
  };

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} onExport={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Project</TableHead><TableHead>Hours</TableHead><TableHead>Billable</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</TableCell>
                <TableCell>{r.project}</TableCell>
                <TableCell>{r.hours.toFixed(2)}</TableCell>
                <TableCell>{r.billableHours.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function DetailedReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);
  const { data: employees } = useActiveEmployees();

  const exportCsv = () => {
    const csv = toCsv(['Date', 'Employee', 'Project', 'Task', 'Hours', 'Billable', 'Notes'], (entries ?? []).map((e) => [
      format(new Date(e.start_time), 'yyyy-MM-dd'),
      employees?.find((emp) => emp.id === e.employee_id)?.full_name ?? e.employee_id,
      e.time_tasks?.time_projects?.name ?? '', e.time_tasks?.name ?? '',
      ((e.duration_minutes ?? 0) / 60).toFixed(2), e.is_billable ? 'yes' : 'no', e.notes ?? '',
    ]));
    downloadCsv(`timetrack-detailed-${start}-to-${end}.csv`, csv);
  };

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} onExport={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Project / Task</TableHead><TableHead>Hours</TableHead><TableHead>Billable</TableHead></TableRow></TableHeader>
          <TableBody>
            {(entries ?? []).map((e) => (
              <TableRow key={e.id}>
                <TableCell>{format(new Date(e.start_time), 'MMM d')}</TableCell>
                <TableCell>{employees?.find((emp) => emp.id === e.employee_id)?.full_name ?? e.employee_id}</TableCell>
                <TableCell>{e.time_tasks?.time_projects?.name} / {e.time_tasks?.name}</TableCell>
                <TableCell>{((e.duration_minutes ?? 0) / 60).toFixed(2)}</TableCell>
                <TableCell>{e.is_billable ? <Badge variant="secondary">Yes</Badge> : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

const PIVOT_DIMENSIONS = [
  { key: 'employee', label: 'Employee' },
  { key: 'project', label: 'Project' },
  { key: 'billable', label: 'Billable status' },
  { key: 'date', label: 'Date' },
] as const;

function PivotReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);
  const { data: employees } = useActiveEmployees();
  const [dims, setDims] = useState<string[]>(['employee', 'project']);

  const keyFor = (e: Entry) => dims.map((d) => {
    if (d === 'employee') return employees?.find((emp) => emp.id === e.employee_id)?.full_name ?? e.employee_id;
    if (d === 'project') return e.time_tasks?.time_projects?.name ?? '—';
    if (d === 'billable') return e.is_billable ? 'Billable' : 'Non-billable';
    return format(new Date(e.start_time), 'yyyy-MM-dd');
  }).join(' · ');

  const rows = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries ?? []) {
      const k = keyFor(e);
      map.set(k, (map.get(k) ?? 0) + (e.duration_minutes ?? 0) / 60);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, dims, employees]);

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      <div className="flex gap-4 mb-4">
        {PIVOT_DIMENSIONS.map((d) => (
          <label key={d.key} className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={dims.includes(d.key)} onCheckedChange={(v) => setDims((prev) => v ? [...prev, d.key] : prev.filter((x) => x !== d.key))} />
            {d.label}
          </label>
        ))}
      </div>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>{dims.map((d) => PIVOT_DIMENSIONS.find((pd) => pd.key === d)?.label).join(' / ')}</TableHead><TableHead>Hours</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map(([k, h]) => <TableRow key={k}><TableCell>{k}</TableCell><TableCell>{h.toFixed(2)}</TableCell></TableRow>)}</TableBody>
        </Table>
      )}
    </div>
  );
}

/** Shared grid builder for every "by days" style report: one row per groupKey, one column per calendar day in range. */
function buildDayGrid(entries: Entry[], start: string, end: string, rowKeyFn: (e: Entry) => string) {
  const dates = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((d) => format(d, 'yyyy-MM-dd'));
  const rowMap = new Map<string, { cells: Record<string, number>; total: number }>();
  for (const e of entries) {
    const rowKey = rowKeyFn(e);
    const day = format(new Date(e.start_time), 'yyyy-MM-dd');
    const row = rowMap.get(rowKey) ?? { cells: {}, total: 0 };
    const hours = (e.duration_minutes ?? 0) / 60;
    row.cells[day] = (row.cells[day] ?? 0) + hours;
    row.total += hours;
    rowMap.set(rowKey, row);
  }
  const rows = [...rowMap.entries()].map(([label, r]) => ({ label, ...r })).sort((a, b) => b.total - a.total);
  return { dates, rows };
}

function DayGridTable({ dates, rows, rowHeader, onExport }: {
  dates: string[]; rows: { label: string; cells: Record<string, number>; total: number }[]; rowHeader: string; onExport: () => void;
}) {
  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button variant="outline" onClick={onExport}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background">{rowHeader}</TableHead>
              {dates.map((d) => <TableHead key={d} className="text-right whitespace-nowrap">{format(new Date(d), 'MMM d')}</TableHead>)}
              <TableHead className="text-right font-semibold">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="sticky left-0 bg-background font-medium">{r.label}</TableCell>
                {dates.map((d) => <TableCell key={d} className="text-right">{r.cells[d] ? r.cells[d].toFixed(2) : '—'}</TableCell>)}
                <TableCell className="text-right font-semibold">{r.total.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={dates.length + 2} className="text-center text-muted-foreground">No entries in range.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function exportDayGridCsv(filename: string, rowHeader: string, dates: string[], rows: { label: string; cells: Record<string, number>; total: number }[]) {
  const csv = toCsv([rowHeader, ...dates, 'Total'], rows.map((r) => [r.label, ...dates.map((d) => (r.cells[d] ?? 0).toFixed(2)), r.total.toFixed(2)]));
  downloadCsv(filename, csv);
}

/** Time > By days — project/task hours per calendar day, aggregated across everyone. */
function TimeByDaysReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);

  const grid = useMemo(
    () => buildDayGrid(entries ?? [], start, end, (e) => `${e.time_tasks?.time_projects?.name ?? '—'} / ${e.time_tasks?.name ?? '—'}`),
    [entries, start, end],
  );

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <DayGridTable dates={grid.dates} rows={grid.rows} rowHeader="Project / Task" onExport={() => exportDayGridCsv(`timetrack-by-days-${start}-to-${end}.csv`, 'Project / Task', grid.dates, grid.rows)} />
      )}
    </div>
  );
}

/** People > By days — one row per employee, one column per day. */
function PeopleByDaysReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);
  const { data: employees } = useActiveEmployees();

  const grid = useMemo(
    () => buildDayGrid(entries ?? [], start, end, (e) => employees?.find((emp) => emp.id === e.employee_id)?.full_name ?? e.employee_id),
    [entries, start, end, employees],
  );

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <DayGridTable dates={grid.dates} rows={grid.rows} rowHeader="Employee" onExport={() => exportDayGridCsv(`timetrack-people-by-days-${start}-to-${end}.csv`, 'Employee', grid.dates, grid.rows)} />
      )}
    </div>
  );
}

/** People > By days and tasks — one row per employee/task pair, one column per day. */
function PeopleByDaysTasksReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);
  const { data: employees } = useActiveEmployees();

  const grid = useMemo(
    () => buildDayGrid(entries ?? [], start, end, (e) => {
      const name = employees?.find((emp) => emp.id === e.employee_id)?.full_name ?? e.employee_id;
      return `${name} — ${e.time_tasks?.name ?? '—'}`;
    }),
    [entries, start, end, employees],
  );

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <DayGridTable dates={grid.dates} rows={grid.rows} rowHeader="Employee — Task" onExport={() => exportDayGridCsv(`timetrack-people-by-days-tasks-${start}-to-${end}.csv`, 'Employee — Task', grid.dates, grid.rows)} />
      )}
    </div>
  );
}

/** People > By projects — one row per employee, one column per project (no day breakdown). */
function PeopleByProjectsReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);
  const { data: employees } = useActiveEmployees();

  const { columns, rows } = useMemo(() => {
    const colSet = new Set<string>();
    const rowMap = new Map<string, { cells: Record<string, number>; total: number }>();
    for (const e of entries ?? []) {
      const emp = employees?.find((x) => x.id === e.employee_id)?.full_name ?? e.employee_id;
      const project = e.time_tasks?.time_projects?.name ?? '—';
      colSet.add(project);
      const row = rowMap.get(emp) ?? { cells: {}, total: 0 };
      const hours = (e.duration_minutes ?? 0) / 60;
      row.cells[project] = (row.cells[project] ?? 0) + hours;
      row.total += hours;
      rowMap.set(emp, row);
    }
    const cols = [...colSet].sort();
    const rws = [...rowMap.entries()].map(([label, r]) => ({ label, ...r })).sort((a, b) => b.total - a.total);
    return { columns: cols, rows: rws };
  }, [entries, employees]);

  const exportCsv = () => {
    const csv = toCsv(['Employee', ...columns, 'Total'], rows.map((r) => [r.label, ...columns.map((c) => (r.cells[c] ?? 0).toFixed(2)), r.total.toFixed(2)]));
    downloadCsv(`timetrack-people-by-projects-${start}-to-${end}.csv`, csv);
  };

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="overflow-x-auto">
          <div className="flex justify-end mb-3"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Employee</TableHead>
                {columns.map((c) => <TableHead key={c} className="text-right whitespace-nowrap">{c}</TableHead>)}
                <TableHead className="text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="sticky left-0 bg-background font-medium">{r.label}</TableCell>
                  {columns.map((c) => <TableCell key={c} className="text-right">{r.cells[c] ? r.cells[c].toFixed(2) : '—'}</TableCell>)}
                  <TableCell className="text-right font-semibold">{r.total.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={columns.length + 2} className="text-center text-muted-foreground">No entries in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** People > By tasks — one row per employee, nested rows per task, total hours (no day breakdown). */
function PeopleByTasksReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: entries, isLoading } = useEntriesInRange(start, end);
  const { data: employees } = useActiveEmployees();

  const rows = useMemo(() => {
    const map = new Map<string, { employee: string; task: string; project: string; hours: number }>();
    for (const e of entries ?? []) {
      const employee = employees?.find((x) => x.id === e.employee_id)?.full_name ?? e.employee_id;
      const task = e.time_tasks?.name ?? '—';
      const project = e.time_tasks?.time_projects?.name ?? '—';
      const key = `${employee}:${project}:${task}`;
      const row = map.get(key) ?? { employee, task, project, hours: 0 };
      row.hours += (e.duration_minutes ?? 0) / 60;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.employee.localeCompare(b.employee) || b.hours - a.hours);
  }, [entries, employees]);

  const exportCsv = () => {
    const csv = toCsv(['Employee', 'Project', 'Task', 'Hours'], rows.map((r) => [r.employee, r.project, r.task, r.hours.toFixed(2)]));
    downloadCsv(`timetrack-people-by-tasks-${start}-to-${end}.csv`, csv);
  };

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} onExport={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Project</TableHead><TableHead>Task</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                <TableCell>{r.employee}</TableCell>
                <TableCell>{r.project}</TableCell>
                <TableCell>{r.task}</TableCell>
                <TableCell className="text-right">{r.hours.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No entries in range.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function FinanceReport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: employees } = useActiveEmployees();
  const { data, isLoading } = useQuery({
    queryKey: ['timetrack', 'finance-report', start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('time_finance_report', { p_start_date: start, p_end_date: end, p_employee_id: null, p_project_id: null });
      if (error) throw error;
      return data as { entry_date: string; employee_id: string; project_id: string; hours: number; revenue: number; cost: number; margin: number; is_billable: boolean }[];
    },
  });

  const totals = (data ?? []).reduce((acc, r) => ({
    billableHours: acc.billableHours + (r.is_billable ? r.hours : 0),
    nonBillableHours: acc.nonBillableHours + (r.is_billable ? 0 : r.hours),
    revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, margin: acc.margin + r.margin,
  }), { billableHours: 0, nonBillableHours: 0, revenue: 0, cost: 0, margin: 0 });

  const exportCsv = () => {
    const csv = toCsv(['Date', 'Employee', 'Hours', 'Revenue', 'Cost', 'Margin'], (data ?? []).map((r) => [
      r.entry_date, employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id,
      r.hours.toFixed(2), r.revenue.toFixed(2), r.cost.toFixed(2), r.margin.toFixed(2),
    ]));
    downloadCsv(`timetrack-finance-${start}-to-${end}.csv`, csv);
  };

  return (
    <div>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} onExport={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {[
              ['Billable hours', totals.billableHours.toFixed(2)],
              ['Non-billable hours', totals.nonBillableHours.toFixed(2)],
              ['Revenue', formatNaira(totals.revenue)],
              ['Cost', formatNaira(totals.cost)],
              ['Margin', formatNaira(totals.margin)],
            ].map(([label, val]) => (
              <div key={label} className="rounded-md border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-semibold">{val}</p>
              </div>
            ))}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Hours</TableHead><TableHead>Revenue</TableHead><TableHead>Cost</TableHead><TableHead>Margin</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.entry_date}</TableCell>
                  <TableCell>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</TableCell>
                  <TableCell>{r.hours.toFixed(2)}</TableCell>
                  <TableCell>{formatNaira(r.revenue)}</TableCell>
                  <TableCell>{formatNaira(r.cost)}</TableCell>
                  <TableCell className={r.margin < 0 ? 'text-destructive' : ''}>{formatNaira(r.margin)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

function LiveDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['timetrack', 'dashboard-today'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('time_dashboard_today');
      if (error) throw error;
      return data as { employee_id: string; full_name: string; hours_today: number; is_timer_active: boolean; active_project_name: string | null }[];
    },
    refetchInterval: 30_000,
  });

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <Table>
      <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Hours today</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>
        {(data ?? []).sort((a, b) => b.hours_today - a.hours_today).map((r) => (
          <TableRow key={r.employee_id}>
            <TableCell>{r.full_name}</TableCell>
            <TableCell>{r.hours_today.toFixed(2)}</TableCell>
            <TableCell>{r.is_timer_active ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Active on {r.active_project_name}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RawExport() {
  const { start, end, setStart, setEnd } = useDateRange();
  const { data: employees } = useActiveEmployees();
  const [loading, setLoading] = useState(false);

  const exportRaw = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .gte('start_time', `${start}T00:00:00`)
        .lt('start_time', `${end}T23:59:59`)
        .order('start_time');
      if (error) throw error;
      const csv = toCsv(
        ['id', 'employee', 'task_id', 'project_id', 'start_time', 'end_time', 'duration_minutes', 'is_billable', 'notes', 'entry_source', 'invoiced'],
        (data ?? []).map((e: any) => [
          e.id, employees?.find((emp) => emp.id === e.employee_id)?.full_name ?? e.employee_id, e.task_id, e.project_id,
          e.start_time, e.end_time, e.duration_minutes, e.is_billable, e.notes, e.entry_source, e.invoiced,
        ])
      );
      downloadCsv(`timetrack-raw-entries-${start}-to-${end}.csv`, csv);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">Every raw time entry in the selected range — no grouping, one row per entry.</p>
      <DateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      <Button onClick={exportRaw} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
        Export raw CSV
      </Button>
    </div>
  );
}
