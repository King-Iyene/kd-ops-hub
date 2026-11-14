import { useMemo } from 'react';
import { Loader2, ArrowUpDown } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { formatNaira } from '@/lib/format';
import { useReportFilters } from '../../reports/useReportFilters';
import { useFinanceEntries } from '../../reports/useFinanceEntries';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';
import { formatHours } from '../../reports/useReportData';

/** Reports > Finance > Margin — per project: hours, revenue, cost, and the
 * resulting margin in both currency and percentage. */
export default function MarginPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useFinanceEntries(filters);

  const rows = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; revenue: number; cost: number }>();
    for (const e of entries ?? []) {
      const r = map.get(e.project_id) ?? { name: e.project_name, hours: 0, revenue: 0, cost: 0 };
      r.hours += e.duration_minutes / 60;
      r.revenue += e.revenue;
      r.cost += e.cost;
      map.set(e.project_id, r);
    }
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }, [entries]);

  const totals = rows.reduce((acc, r) => ({
    hours: acc.hours + r.hours, revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost,
  }), { hours: 0, revenue: 0, cost: 0 });

  const marginOf = (revenue: number, cost: number) => revenue - cost;
  const marginPctOf = (revenue: number, cost: number) => (revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0);

  const exportCsv = () => {
    const header = ['Project', 'Hours', 'Revenue', 'Cost', 'Margin', 'Margin %'];
    const csvRows = rows.map((r) => [r.name, r.hours.toFixed(2), r.revenue.toFixed(2), r.cost.toFixed(2), marginOf(r.revenue, r.cost).toFixed(2), marginPctOf(r.revenue, r.cost).toFixed(1)]);
    downloadCsv(`margin-${filters.start}-to-${filters.end}.csv`, toCsv(header, csvRows));
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Projects margin" description="Revenue minus cost, per project" icon={ArrowUpDown} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead><TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const margin = marginOf(r.revenue, r.cost);
              return (
                <TableRow key={r.name}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{formatHours(r.hours)}</TableCell>
                  <TableCell className="text-right">{formatNaira(r.revenue)}</TableCell>
                  <TableCell className="text-right">{formatNaira(r.cost)}</TableCell>
                  <TableCell className={`text-right font-medium ${margin < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatNaira(margin)} ({marginPctOf(r.revenue, r.cost).toFixed(1)}%)
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No entries in range.</TableCell></TableRow>}
            {rows.length > 0 && (
              <TableRow className="font-semibold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatHours(totals.hours)}</TableCell>
                <TableCell className="text-right">{formatNaira(totals.revenue)}</TableCell>
                <TableCell className="text-right">{formatNaira(totals.cost)}</TableCell>
                <TableCell className={`text-right ${marginOf(totals.revenue, totals.cost) < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {formatNaira(marginOf(totals.revenue, totals.cost))} ({marginPctOf(totals.revenue, totals.cost).toFixed(1)}%)
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
