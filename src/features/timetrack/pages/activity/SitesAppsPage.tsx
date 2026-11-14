import { useMemo } from 'react';
import { Loader2, Download, Globe } from 'lucide-react';
import { toCsv, downloadCsv } from '@/lib/csv';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals } from './shared';

/** TimeCamp's "Sites and Apps" report. The agent currently captures the active window's app name
 * and title but not a browser's URL/domain, so a true per-site breakdown isn't possible yet —
 * this aggregates by app only and says so plainly rather than faking a domain split. */
export default function SitesAppsPage() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);

  const rows = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of data?.logs ?? []) {
      const app = l.app_name ?? 'Unknown';
      const intervalMin = data?.intervalByEmployee.get(l.employee_id) ?? 10;
      map.set(app, (map.get(app) ?? 0) + intervalMin / 60);
    }
    return [...map.entries()].map(([app, hours]) => ({ app, hours })).sort((a, b) => b.hours - a.hours);
  }, [data]);

  const exportCsv = () => {
    const csv = toCsv(['App', 'Estimated hours'], rows.map((r) => [r.app, r.hours.toFixed(2)]));
    downloadCsv(`timetrack-apps-${start}-to-${end}.csv`, csv);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Sites and apps" description="Application usage, by estimated hours" icon={Globe} />
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      <p className="text-xs text-muted-foreground">
        Hours are estimated from capture ticks × each employee's capture interval — not a true duration.
        Browser site/domain breakdown isn't captured by the agent yet (it reads the active window's app
        and title only), so this groups by application, not by website.
      </p>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Table>
            <TableHeader><TableRow><TableHead>Application</TableHead><TableHead className="text-right">Estimated hours</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => <TableRow key={r.app}><TableCell>{r.app}</TableCell><TableCell className="text-right">{r.hours.toFixed(2)}</TableCell></TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
