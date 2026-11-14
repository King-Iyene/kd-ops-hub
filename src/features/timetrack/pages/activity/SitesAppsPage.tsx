import { useMemo } from 'react';
import { Loader2, Download, Globe } from 'lucide-react';
import { toCsv, downloadCsv } from '@/lib/csv';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals, captureDomain } from './shared';

/** TimeCamp's "Sites and Apps" report. Real per-site domain breakdown is only
 * possible where the agent can get a browser's active-tab URL at all, which
 * is macOS only (Windows/Linux have no OS-level API for it — see the url
 * column's migration note). Rows with a captured domain show the site;
 * everything else falls back to grouping by application, same as before. */
export default function SitesAppsPage() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);

  const rows = useMemo(() => {
    const map = new Map<string, { hours: number; isSite: boolean }>();
    for (const l of data?.logs ?? []) {
      if (l.productivity_category === 'idle') continue;
      const domain = captureDomain(l);
      const key = domain ?? l.app_name ?? 'Unknown';
      const intervalMin = data?.intervalByEmployee.get(l.employee_id) ?? 10;
      const row = map.get(key) ?? { hours: 0, isSite: domain !== null };
      row.hours += intervalMin / 60;
      map.set(key, row);
    }
    return [...map.entries()].map(([key, r]) => ({ key, ...r })).sort((a, b) => b.hours - a.hours);
  }, [data]);

  const exportCsv = () => {
    const csv = toCsv(['Site / App', 'Type', 'Estimated hours'], rows.map((r) => [r.key, r.isSite ? 'Site' : 'App', r.hours.toFixed(2)]));
    downloadCsv(`timetrack-apps-${start}-to-${end}.csv`, csv);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Sites and apps" description="Site and application usage, by estimated hours" icon={Globe} />
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      <p className="text-xs text-muted-foreground">
        Hours are estimated from capture ticks × each employee's capture interval, not a true duration.
        Real site/domain breakdown only works on macOS — Windows and Linux have no OS-level way for the
        agent to read a browser's active tab URL (that needs a browser extension, out of scope here), so
        those rows fall back to grouping by application instead.
      </p>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Table>
            <TableHeader><TableRow><TableHead>Site / Application</TableHead><TableHead className="text-right">Estimated hours</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="flex items-center gap-2">
                    {r.key}
                    {r.isSite && <Badge variant="outline" className="text-[10px]">site</Badge>}
                  </TableCell>
                  <TableCell className="text-right">{r.hours.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
