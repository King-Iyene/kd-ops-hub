import { Fragment, useMemo } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries, formatHours } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';

/** Reports > Time > Time > Summary — one row per project, with its tasks
 * indented underneath, total hours each. Matches TimeCamp's "Summary"
 * report's project→task tree, collapsed to the hours our schema actually
 * tracks (every entry has both a project and a task). */
export default function SummaryPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);

  const projectRows = useMemo(() => {
    const projects = new Map<string, { name: string; hours: number; tasks: Map<string, { name: string; hours: number }> }>();
    for (const e of entries ?? []) {
      const proj = projects.get(e.project_id) ?? { name: e.project_name, hours: 0, tasks: new Map() };
      proj.hours += e.duration_minutes / 60;
      const task = proj.tasks.get(e.task_id) ?? { name: e.task_name, hours: 0 };
      task.hours += e.duration_minutes / 60;
      proj.tasks.set(e.task_id, task);
      projects.set(e.project_id, proj);
    }
    return [...projects.values()]
      .map((p) => ({ ...p, tasks: [...p.tasks.values()].sort((a, b) => b.hours - a.hours) }))
      .sort((a, b) => b.hours - a.hours);
  }, [entries]);

  const grandTotal = projectRows.reduce((s, p) => s + p.hours, 0);

  const exportCsv = () => {
    const rows: string[][] = [];
    for (const p of projectRows) {
      rows.push([p.name, p.hours.toFixed(2)]);
      for (const t of p.tasks) rows.push([`  ${t.name}`, t.hours.toFixed(2)]);
    }
    rows.push(['Total', grandTotal.toFixed(2)]);
    downloadCsv(`summary-${filters.start}-to-${filters.end}.csv`, toCsv(['Name', 'Hours'], rows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Summary" description="Total hours per project and task in the selected range" icon={BarChart3} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader>
          <TableBody>
            {projectRows.map((p) => (
              <Fragment key={p.name}>
                <TableRow className="font-medium">
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-right">{formatHours(p.hours)}</TableCell>
                </TableRow>
                {p.tasks.length > 1 && p.tasks.map((t) => (
                  <TableRow key={`${p.name}-${t.name}`} className="text-muted-foreground">
                    <TableCell className="pl-8">{t.name}</TableCell>
                    <TableCell className="text-right">{formatHours(t.hours)}</TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
            {projectRows.length === 0 && (
              <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">No entries in range.</TableCell></TableRow>
            )}
            {projectRows.length > 0 && (
              <TableRow className="font-semibold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatHours(grandTotal)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
