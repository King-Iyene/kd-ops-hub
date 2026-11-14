import { Loader2, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useActiveEmployees } from '@/queries/useEmployees';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { buildDayGrid, DayGridTable, dayGridCsvRows } from '../../reports/reportTables';

/** Reports > Time > People > By days — one row per person (including those
 * with zero logged hours in range, like TimeCamp's own version), one
 * column per day, no task breakdown. */
export default function PeopleByDaysPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);
  const { data: employees } = useActiveEmployees();

  const grid = buildDayGrid(entries ?? [], filters.start, filters.end, (e) => e.employee_name);
  // Include employees with no entries in range so the roster matches TimeCamp's.
  const loggedNames = new Set(grid.rows.map((r) => r.label));
  const zeroRows = (employees ?? [])
    .filter((e) => !loggedNames.has(e.full_name ?? e.email))
    .map((e) => ({ label: e.full_name ?? e.email, cells: {}, total: 0 }));
  const rows = [...grid.rows, ...zeroRows].sort((a, b) => a.label.localeCompare(b.label));

  const exportCsv = () => {
    const { header, rows: csvRows } = dayGridCsvRows('Name', grid.dates, rows);
    downloadCsv(`people-by-days-${filters.start}-to-${filters.end}.csv`, toCsv(header, csvRows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="People by days" description="One row per person, hours by calendar day" icon={Users} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <DayGridTable dates={grid.dates} rows={rows} rowHeader="Name" />
      )}
    </div>
  );
}
