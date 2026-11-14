import { Loader2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { buildCrossTab, CrossTabTable, crossTabCsvRows } from '../../reports/reportTables';

/** Reports > Time > People > By tasks — task rows × user columns. */
export default function PeopleByTasksPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);
  const table = buildCrossTab(entries ?? [], (e) => e.task_name, (e) => e.employee_name, (e) => e.duration_minutes / 60);

  const exportCsv = () => {
    const { header, rows } = crossTabCsvRows('Task', table.columns, table.rows, table.colTotals, table.grandTotal);
    downloadCsv(`people-by-tasks-${filters.start}-to-${filters.end}.csv`, toCsv(header, rows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="People by tasks" description="Hours per task, broken out by who logged them" icon={Users} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <CrossTabTable columns={table.columns} rows={table.rows} colTotals={table.colTotals} grandTotal={table.grandTotal} rowHeader="Name" />
      )}
    </div>
  );
}
