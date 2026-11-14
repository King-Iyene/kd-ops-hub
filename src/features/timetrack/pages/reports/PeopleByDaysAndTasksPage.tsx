import { Fragment, useMemo } from 'react';
import { Loader2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries, formatHours, type ReportEntry } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { buildDayGrid } from '../../reports/reportTables';
import { format } from 'date-fns';

/** Reports > Time > People > By days and tasks — grouped by person, each
 * with their own tasks as sub-rows against the same day columns, matching
 * TimeCamp's nested per-person matrix. */
export default function PeopleByDaysAndTasksPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);

  const { dates, people } = useMemo(() => {
    const byPerson = new Map<string, ReportEntry[]>();
    for (const e of entries ?? []) {
      const list = byPerson.get(e.employee_name) ?? [];
      list.push(e);
      byPerson.set(e.employee_name, list);
    }
    const dates = buildDayGrid(entries ?? [], filters.start, filters.end, () => '').dates;
    const people = [...byPerson.entries()].map(([name, rows]) => {
      const grid = buildDayGrid(rows, filters.start, filters.end, (e) => e.task_name);
      const total = grid.rows.reduce((s, r) => s + r.total, 0);
      return { name, grid, total };
    }).sort((a, b) => b.total - a.total);
    return { dates, people };
  }, [entries, filters.start, filters.end]);

  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    for (const p of people) {
      for (const t of p.grid.rows) {
        rows.push([p.name, t.label, ...dates.map((d) => (t.cells[d] ?? 0).toFixed(2)), t.total.toFixed(2)]);
      }
    }
    downloadCsv(`people-by-days-tasks-${filters.start}-to-${filters.end}.csv`, toCsv(['Name', 'Task', ...dates, 'Total'], rows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="People by days and tasks" description="Each person's tasks, hours by calendar day" icon={Users} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background">Name</TableHead>
                {dates.map((d) => <TableHead key={d} className="text-right whitespace-nowrap">{format(new Date(d), 'd MMM')}</TableHead>)}
                <TableHead className="text-right font-semibold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <Fragment key={p.name}>
                  <TableRow className="font-semibold bg-muted/40">
                    <TableCell className="sticky left-0 bg-muted/40">{p.name}</TableCell>
                    {dates.map((d) => <TableCell key={d} className="text-right">{p.grid.dayTotals[d] ? formatHours(p.grid.dayTotals[d]) : '—'}</TableCell>)}
                    <TableCell className="text-right">{formatHours(p.total)}</TableCell>
                  </TableRow>
                  {p.grid.rows.map((t) => (
                    <TableRow key={`${p.name}-${t.label}`} className="text-muted-foreground">
                      <TableCell className="sticky left-0 bg-background pl-6">{t.label}</TableCell>
                      {dates.map((d) => <TableCell key={d} className="text-right">{t.cells[d] ? formatHours(t.cells[d]) : '—'}</TableCell>)}
                      <TableCell className="text-right">{formatHours(t.total)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
              {people.length === 0 && (
                <TableRow><TableCell colSpan={dates.length + 2} className="text-center text-muted-foreground py-8">No entries in range.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
