import { useMemo } from 'react';
import { format } from 'date-fns';
import { Loader2, Download, Users } from 'lucide-react';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals } from './shared';

/** TimeCamp's "User statistics" report — one summary row per employee. */
export default function UserStatisticsPage() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const { data: employees } = useActiveEmployees();

  const rows = useMemo(() => {
    const map = new Map<string, { captures: number; productive: number; idle: number; hours: number; days: Set<string>; first: string; last: string }>();
    for (const l of data?.logs ?? []) {
      const row = map.get(l.employee_id) ?? { captures: 0, productive: 0, idle: 0, hours: 0, days: new Set<string>(), first: l.captured_at, last: l.captured_at };
      row.captures++;
      if (l.productivity_category === 'productive') row.productive++;
      if (l.productivity_category === 'idle') row.idle++;
      row.hours += (data?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
      row.days.add(format(new Date(l.captured_at), 'yyyy-MM-dd'));
      if (l.captured_at < row.first) row.first = l.captured_at;
      if (l.captured_at > row.last) row.last = l.captured_at;
      map.set(l.employee_id, row);
    }
    return [...map.entries()].map(([employeeId, r]) => {
      const activeCaptures = r.captures - r.idle;
      return {
        employeeId, name: employees?.find((e) => e.id === employeeId)?.full_name ?? employeeId,
        captures: r.captures, idle: r.idle, hours: r.hours, activeDays: r.days.size,
        productivePct: activeCaptures > 0 ? (r.productive / activeCaptures) * 100 : 0,
        first: r.first, last: r.last,
      };
    }).sort((a, b) => b.hours - a.hours);
  }, [data, employees]);

  const exportCsv = () => {
    const csv = toCsv(['Employee', 'Captures', 'Idle', 'Est. hours', 'Active days', 'Productive %'], rows.map((r) => [
      r.name, String(r.captures), String(r.idle), r.hours.toFixed(2), String(r.activeDays), r.productivePct.toFixed(0),
    ]));
    downloadCsv(`timetrack-user-statistics-${start}-to-${end}.csv`, csv);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="User statistics" description="Per-employee capture totals and productivity share" icon={Users} />
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead className="text-right">Captures</TableHead>
              <TableHead className="text-right">Idle</TableHead>
              <TableHead className="text-right">Est. hours</TableHead><TableHead className="text-right">Active days</TableHead>
              <TableHead className="text-right">Productive %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employeeId}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.captures}</TableCell>
                  <TableCell className="text-right">{r.idle}</TableCell>
                  <TableCell className="text-right">{r.hours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.activeDays}</TableCell>
                  <TableCell className="text-right">{r.productivePct.toFixed(0)}%</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
