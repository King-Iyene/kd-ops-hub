import { useMemo } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { formatNaira } from '@/lib/format';
import { useReportFilters } from '../../reports/useReportFilters';
import { useFinanceEntries } from '../../reports/useFinanceEntries';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { formatHours } from '../../reports/useReportData';

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '0.0%');

/** Reports > Finance > Billable, non-billable — per project, splits hours
 * and value into billable/unbillable and invoiced/uninvoiced billable. */
export default function BillableNonBillablePage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useFinanceEntries(filters);

  const rows = useMemo(() => {
    const map = new Map<string, {
      name: string; totalHours: number; billableHours: number; billableValue: number;
      invoicedValue: number;
    }>();
    for (const e of entries ?? []) {
      const r = map.get(e.project_id) ?? { name: e.project_name, totalHours: 0, billableHours: 0, billableValue: 0, invoicedValue: 0 };
      const hours = e.duration_minutes / 60;
      r.totalHours += hours;
      if (e.is_billable) {
        r.billableHours += hours;
        r.billableValue += e.revenue;
        if (e.invoiced) r.invoicedValue += e.revenue;
      }
      map.set(e.project_id, r);
    }
    return [...map.values()].sort((a, b) => b.totalHours - a.totalHours);
  }, [entries]);

  const totals = rows.reduce((acc, r) => ({
    totalHours: acc.totalHours + r.totalHours, billableHours: acc.billableHours + r.billableHours,
    billableValue: acc.billableValue + r.billableValue, invoicedValue: acc.invoicedValue + r.invoicedValue,
  }), { totalHours: 0, billableHours: 0, billableValue: 0, invoicedValue: 0 });

  const exportCsv = () => {
    const header = ['Name', 'Total', 'Billable', 'Billable %', 'Billable value', 'Unbillable', 'Unbillable %', 'Invoiced billable', 'Invoiced %', 'Uninvoiced billable', 'Uninvoiced %'];
    const csvRows = rows.map((r) => [
      r.name, formatHours(r.totalHours), formatHours(r.billableHours), pct(r.billableHours, r.totalHours), r.billableValue.toFixed(2),
      formatHours(r.totalHours - r.billableHours), pct(r.totalHours - r.billableHours, r.totalHours),
      r.invoicedValue.toFixed(2), pct(r.invoicedValue, r.billableValue), (r.billableValue - r.invoicedValue).toFixed(2), pct(r.billableValue - r.invoicedValue, r.billableValue),
    ]);
    downloadCsv(`billable-non-billable-${filters.start}-to-${filters.end}.csv`, toCsv(header, csvRows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Billable, unbillable, invoiced" description="Hours and value split by billable and invoiced status, per project" icon={Receipt} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Billable</TableHead><TableHead className="text-right">%</TableHead><TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Unbillable</TableHead><TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Invoiced billable</TableHead><TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Uninvoiced billable</TableHead><TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{formatHours(r.totalHours)}</TableCell>
                  <TableCell className="text-right">{formatHours(r.billableHours)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(r.billableHours, r.totalHours)}</TableCell>
                  <TableCell className="text-right">{formatNaira(r.billableValue)}</TableCell>
                  <TableCell className="text-right">{formatHours(r.totalHours - r.billableHours)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(r.totalHours - r.billableHours, r.totalHours)}</TableCell>
                  <TableCell className="text-right">{formatNaira(r.invoicedValue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(r.invoicedValue, r.billableValue)}</TableCell>
                  <TableCell className="text-right">{formatNaira(r.billableValue - r.invoicedValue)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(r.billableValue - r.invoicedValue, r.billableValue)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No entries in range.</TableCell></TableRow>}
              {rows.length > 0 && (
                <TableRow className="font-semibold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatHours(totals.totalHours)}</TableCell>
                  <TableCell className="text-right">{formatHours(totals.billableHours)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{formatNaira(totals.billableValue)}</TableCell>
                  <TableCell className="text-right">{formatHours(totals.totalHours - totals.billableHours)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{formatNaira(totals.invoicedValue)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{formatNaira(totals.billableValue - totals.invoicedValue)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
