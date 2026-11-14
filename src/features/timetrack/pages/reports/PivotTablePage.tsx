import { useState } from 'react';
import { Loader2, Table2 } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries, type ReportEntry } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { buildCrossTab, CrossTabTable, crossTabCsvRows, downloadXlsx } from '../../reports/reportTables';

const DIMENSIONS = {
  employee: { label: 'User', fn: (e: ReportEntry) => e.employee_name },
  project: { label: 'Project', fn: (e: ReportEntry) => e.project_name },
  task: { label: 'Task', fn: (e: ReportEntry) => e.task_name },
  billable: { label: 'Billable', fn: (e: ReportEntry) => (e.is_billable ? 'Billable' : 'Non-billable') },
  day: { label: 'Day', fn: (e: ReportEntry) => format(new Date(e.start_time), 'd MMM yyyy') },
  week: { label: 'Week', fn: (e: ReportEntry) => `Week of ${format(new Date(e.start_time), 'd MMM')}` },
  month: { label: 'Month', fn: (e: ReportEntry) => format(new Date(e.start_time), 'MMM yyyy') },
} as const;
type DimKey = keyof typeof DIMENSIONS;

/**
 * Reports > Time > Time > Pivot Table. TimeCamp's own version is a full
 * drag-and-drop field builder; we offer the same cross-tab result with row
 * and column dimension pickers instead of drag-and-drop, which covers every
 * combination TimeCamp's own axes support without the added complexity.
 */
export default function PivotTablePage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);
  const [rowDim, setRowDim] = useState<DimKey>('task');
  const [colDim, setColDim] = useState<DimKey>('employee');

  const table = buildCrossTab(
    entries ?? [],
    (e) => DIMENSIONS[rowDim].fn(e),
    (e) => DIMENSIONS[colDim].fn(e),
    (e) => e.duration_minutes / 60,
  );

  const exportCsv = () => {
    const { header, rows } = crossTabCsvRows(DIMENSIONS[rowDim].label, table.columns, table.rows, table.colTotals, table.grandTotal);
    downloadCsv(`pivot-${filters.start}-to-${filters.end}.csv`, toCsv(header, rows));
  };
  const exportXlsx = () => {
    const { header, rows } = crossTabCsvRows(DIMENSIONS[rowDim].label, table.columns, table.rows, table.colTotals, table.grandTotal);
    downloadXlsx(`pivot-${filters.start}-to-${filters.end}`, header, rows);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Pivot Table" description="Choose a row and column dimension to cross-tabulate hours" icon={Table2} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} onExportXlsx={exportXlsx} />
      <div className="flex flex-wrap gap-4 mb-4">
        <div>
          <Label className="text-xs text-muted-foreground">Rows</Label>
          <Select value={rowDim} onValueChange={(v) => setRowDim(v as DimKey)}>
            <SelectTrigger className="h-8 text-xs w-[150px] mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(DIMENSIONS).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Columns</Label>
          <Select value={colDim} onValueChange={(v) => setColDim(v as DimKey)}>
            <SelectTrigger className="h-8 text-xs w-[150px] mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(DIMENSIONS).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <CrossTabTable columns={table.columns} rows={table.rows} colTotals={table.colTotals} grandTotal={table.grandTotal} rowHeader={DIMENSIONS[rowDim].label} />
      )}
    </div>
  );
}
