import { Loader2, CalendarDays } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { buildDayGrid, DayGridTable, dayGridCsvRows } from '../../reports/reportTables';

/** Reports > Time > Time > By days — project/task hours per calendar day,
 * aggregated across everyone. */
export default function TimeByDaysPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);
  const grid = buildDayGrid(entries ?? [], filters.start, filters.end, (e) => `${e.project_name} / ${e.task_name}`);

  const exportCsv = () => {
    const { header, rows } = dayGridCsvRows('Project / Task', grid.dates, grid.rows);
    downloadCsv(`by-days-${filters.start}-to-${filters.end}.csv`, toCsv(header, rows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="By days" description="Project and task hours broken out by calendar day" icon={CalendarDays} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <DayGridTable dates={grid.dates} rows={grid.rows} dayTotals={grid.dayTotals} grandTotal={grid.grandTotal} rowHeader="Project / Task" />
      )}
    </div>
  );
}
