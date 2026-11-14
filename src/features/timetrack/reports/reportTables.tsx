import { eachDayOfInterval, format, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatHours } from './useReportData';

/** Shared "Download Excel (XLSX)" — matches the button TimeCamp shows on
 * its own Pivot Table and finance reports. */
export function downloadXlsx(filename: string, header: string[], rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Shared grid builder for every "by days" style report: one row per
 * groupKey, one column per calendar day in range. */
export function buildDayGrid<T extends { start_time: string; duration_minutes: number | null }>(
  entries: T[], start: string, end: string, rowKeyFn: (e: T) => string,
) {
  const dates = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((d) => format(d, 'yyyy-MM-dd'));
  const rowMap = new Map<string, { cells: Record<string, number>; total: number }>();
  for (const e of entries) {
    const rowKey = rowKeyFn(e);
    const day = format(new Date(e.start_time), 'yyyy-MM-dd');
    const row = rowMap.get(rowKey) ?? { cells: {}, total: 0 };
    const hours = (e.duration_minutes ?? 0) / 60;
    row.cells[day] = (row.cells[day] ?? 0) + hours;
    row.total += hours;
    rowMap.set(rowKey, row);
  }
  const rows = [...rowMap.entries()].map(([label, r]) => ({ label, ...r })).sort((a, b) => b.total - a.total);
  const dayTotals = Object.fromEntries(dates.map((d) => [d, rows.reduce((s, r) => s + (r.cells[d] ?? 0), 0)]));
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { dates, rows, dayTotals, grandTotal };
}

export function DayGridTable({
  dates, rows, dayTotals, grandTotal, rowHeader,
}: {
  dates: string[];
  rows: { label: string; cells: Record<string, number>; total: number }[];
  dayTotals?: Record<string, number>;
  grandTotal?: number;
  rowHeader: string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">{rowHeader}</TableHead>
            {dates.map((d) => <TableHead key={d} className="text-right whitespace-nowrap">{format(new Date(d), 'd MMM')}</TableHead>)}
            <TableHead className="text-right font-semibold">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dayTotals && grandTotal !== undefined && (
            <TableRow className="font-semibold">
              <TableCell className="sticky left-0 bg-background">Total</TableCell>
              {dates.map((d) => <TableCell key={d} className="text-right">{dayTotals[d] ? formatHours(dayTotals[d]) : '—'}</TableCell>)}
              <TableCell className="text-right">{formatHours(grandTotal)}</TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="sticky left-0 bg-background font-medium">{r.label}</TableCell>
              {dates.map((d) => <TableCell key={d} className="text-right">{r.cells[d] ? formatHours(r.cells[d]) : '—'}</TableCell>)}
              <TableCell className="text-right font-semibold">{formatHours(r.total)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={dates.length + 2} className="text-center text-muted-foreground py-8">No entries in range.</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function dayGridCsvRows(rowHeader: string, dates: string[], rows: { label: string; cells: Record<string, number>; total: number }[]) {
  return { header: [rowHeader, ...dates, 'Total'], rows: rows.map((r) => [r.label, ...dates.map((d) => (r.cells[d] ?? 0).toFixed(2)), r.total.toFixed(2)]) };
}

/** Cross-tab builder: rows × columns of summed hours, with a Totals column
 * and a Total row — the shape behind "By tasks", "By projects", "Pivot
 * Table" and "Margin"-style reports. */
export function buildCrossTab<T>(
  entries: T[], rowKeyFn: (e: T) => string, colKeyFn: (e: T) => string, valueFn: (e: T) => number,
) {
  const colSet = new Set<string>();
  const rowMap = new Map<string, { cells: Record<string, number>; total: number }>();
  for (const e of entries) {
    const rowKey = rowKeyFn(e);
    const colKey = colKeyFn(e);
    colSet.add(colKey);
    const row = rowMap.get(rowKey) ?? { cells: {}, total: 0 };
    const v = valueFn(e);
    row.cells[colKey] = (row.cells[colKey] ?? 0) + v;
    row.total += v;
    rowMap.set(rowKey, row);
  }
  const columns = [...colSet].sort();
  const rows = [...rowMap.entries()].map(([label, r]) => ({ label, ...r })).sort((a, b) => b.total - a.total);
  const colTotals = Object.fromEntries(columns.map((c) => [c, rows.reduce((s, r) => s + (r.cells[c] ?? 0), 0)]));
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { columns, rows, colTotals, grandTotal };
}

export function CrossTabTable({
  columns, rows, colTotals, grandTotal, rowHeader, formatValue = formatHours,
}: {
  columns: string[];
  rows: { label: string; cells: Record<string, number>; total: number }[];
  colTotals: Record<string, number>;
  grandTotal: number;
  rowHeader: string;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">{rowHeader}</TableHead>
            {columns.map((c) => <TableHead key={c} className="text-right whitespace-nowrap">{c}</TableHead>)}
            <TableHead className="text-right font-semibold text-emerald-600">Totals</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="sticky left-0 bg-background font-medium">{r.label}</TableCell>
              {columns.map((c) => <TableCell key={c} className="text-right">{r.cells[c] ? formatValue(r.cells[c]) : '—'}</TableCell>)}
              <TableCell className="text-right font-semibold">{formatValue(r.total)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow><TableCell colSpan={columns.length + 2} className="text-center text-muted-foreground py-8">No entries in range.</TableCell></TableRow>
          )}
          {rows.length > 0 && (
            <TableRow className="font-semibold border-t-2">
              <TableCell className="sticky left-0 bg-background">Total</TableCell>
              {columns.map((c) => <TableCell key={c} className="text-right">{formatValue(colTotals[c] ?? 0)}</TableCell>)}
              <TableCell className="text-right">{formatValue(grandTotal)}</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function crossTabCsvRows(rowHeader: string, columns: string[], rows: { label: string; cells: Record<string, number>; total: number }[], colTotals: Record<string, number>, grandTotal: number) {
  return {
    header: [rowHeader, ...columns, 'Total'],
    rows: [
      ...rows.map((r) => [r.label, ...columns.map((c) => (r.cells[c] ?? 0).toFixed(2)), r.total.toFixed(2)]),
      ['Total', ...columns.map((c) => (colTotals[c] ?? 0).toFixed(2)), grandTotal.toFixed(2)],
    ],
  };
}
