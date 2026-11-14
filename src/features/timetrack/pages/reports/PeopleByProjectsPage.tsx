import { Loader2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { buildCrossTab, CrossTabTable, crossTabCsvRows } from '../../reports/reportTables';

/** Reports > Time > People > By projects — project rows × user columns
 * (rolled up to the project level, unlike "By tasks"). */
export default function PeopleByProjectsPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);
  const table = buildCrossTab(entries ?? [], (e) => e.project_name, (e) => e.employee_name, (e) => e.duration_minutes / 60);

  const exportCsv = () => {
    const { header, rows } = crossTabCsvRows('Name', table.columns, table.rows, table.colTotals, table.grandTotal);
    downloadCsv(`people-by-projects-${filters.start}-to-${filters.end}.csv`, toCsv(header, rows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="People by projects" description="Hours per project, broken out by who logged them" icon={Users} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <CrossTabTable columns={table.columns} rows={table.rows} colTotals={table.colTotals} grandTotal={table.grandTotal} rowHeader="Name" />
      )}
    </div>
  );
}
