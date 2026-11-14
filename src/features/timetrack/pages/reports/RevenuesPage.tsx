import { Loader2, HandCoins } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { formatNaira } from '@/lib/format';
import { useReportFilters } from '../../reports/useReportFilters';
import { useFinanceEntries } from '../../reports/useFinanceEntries';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';

/** Reports > Finance > Revenues — one row per billable entry: who, when,
 * which task, the resolved billing rate, and the revenue it produced. */
export default function RevenuesPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useFinanceEntries(filters);
  const rows = (entries ?? []).filter((e) => e.is_billable);
  const total = rows.reduce((s, e) => s + e.revenue, 0);

  const exportCsv = () => {
    const csv = toCsv(
      ['Employee', 'Month', 'Date', 'Project', 'Task', 'Hours', 'Rate/h', 'Amount'],
      rows.map((e) => [
        e.employee_name, format(new Date(e.start_time), 'MM/yyyy'), format(new Date(e.start_time), 'dd-MM-yyyy'),
        e.project_name, e.task_name, (e.duration_minutes / 60).toFixed(2), e.revenue_rate_per_hour.toFixed(2), e.revenue.toFixed(2),
      ]),
    );
    downloadCsv(`revenues-${filters.start}-to-${filters.end}.csv`, csv);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Revenues" description="Billable entries and the revenue each one produced, at its resolved billing rate" icon={HandCoins} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead><TableHead>Month</TableHead><TableHead>Date</TableHead>
                <TableHead>Path</TableHead><TableHead>Task</TableHead><TableHead className="text-right">Time</TableHead>
                <TableHead className="text-right">Rate/h</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{e.employee_name}</TableCell>
                  <TableCell>{format(new Date(e.start_time), 'MM/yyyy')}</TableCell>
                  <TableCell>{format(new Date(e.start_time), 'dd-MM-yyyy')}</TableCell>
                  <TableCell className="text-muted-foreground">{e.project_name}</TableCell>
                  <TableCell>{e.task_name}</TableCell>
                  <TableCell className="text-right">{(e.duration_minutes / 60).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{formatNaira(e.revenue_rate_per_hour)}</TableCell>
                  <TableCell className="text-right font-medium">{formatNaira(e.revenue)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No billable entries in range.</TableCell></TableRow>}
              {rows.length > 0 && (
                <TableRow className="font-semibold border-t-2">
                  <TableCell colSpan={7}>Total</TableCell>
                  <TableCell className="text-right">{formatNaira(total)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
