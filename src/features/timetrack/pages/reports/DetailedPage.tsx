import { Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useReportFilters } from '../../reports/useReportFilters';
import { useReportEntries, formatHours } from '../../reports/useReportData';
import { ReportFiltersBar } from '../../reports/ReportFiltersBar';

/** Reports > Time > Time > Detailed — one row per time entry, exactly as
 * logged: day, user, task, tags, time, the clock-in/out timestamp, and
 * notes. No grouping. */
export default function DetailedPage() {
  const filters = useReportFilters();
  const { data: entries, isLoading } = useReportEntries(filters);
  const rows = entries ?? [];
  const grandTotal = rows.reduce((s, e) => s + e.duration_minutes / 60, 0);

  const exportCsv = () => {
    const csv = toCsv(
      ['Day', 'User', 'Project', 'Task', 'Tags', 'Time', 'Start', 'End', 'Notes'],
      rows.map((e) => [
        format(new Date(e.start_time), 'yyyy-MM-dd'), e.employee_name, e.project_name, e.task_name,
        e.tag_names.join('; '), (e.duration_minutes / 60).toFixed(2),
        format(new Date(e.start_time), 'HH:mm'), e.end_time ? format(new Date(e.end_time), 'HH:mm') : '',
        e.notes ?? '',
      ]),
    );
    downloadCsv(`detailed-${filters.start}-to-${filters.end}.csv`, csv);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Detailed" description="Every time entry in the selected range, one row each" icon={Search} />
      <ReportFiltersBar filters={filters} onExportCsv={exportCsv} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead><TableHead>User</TableHead><TableHead>Task</TableHead>
                <TableHead>Tags</TableHead><TableHead className="text-right">Time</TableHead>
                <TableHead>Timestamp</TableHead><TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 && (
                <TableRow className="font-semibold">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right">{formatHours(grandTotal)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              )}
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{format(new Date(e.start_time), 'd-MM-yyyy')}</TableCell>
                  <TableCell>{e.employee_name}</TableCell>
                  <TableCell>{e.project_name} / {e.task_name}</TableCell>
                  <TableCell className="text-muted-foreground">{e.tag_names.join(', ') || '—'}</TableCell>
                  <TableCell className="text-right">{formatHours(e.duration_minutes / 60)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {format(new Date(e.start_time), 'h:mm a')}{e.end_time ? `–${format(new Date(e.end_time), 'h:mm a')}` : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[220px] truncate">{e.notes ?? ''}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No entries in range.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
