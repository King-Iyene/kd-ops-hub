import { useMemo } from 'react';
import { Loader2, Gauge } from 'lucide-react';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals, CATEGORY_BADGE } from './shared';

/** TimeCamp's "Efficiency" report — productive vs. neutral vs. unproductive share, per employee. */
export default function EfficiencyPage() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const { data: employees } = useActiveEmployees();

  const rows = useMemo(() => {
    const map = new Map<string, { productive: number; neutral: number; unproductive: number; blocked: number; idle: number; uncategorized: number }>();
    for (const l of data?.logs ?? []) {
      const row = map.get(l.employee_id) ?? { productive: 0, neutral: 0, unproductive: 0, blocked: 0, idle: 0, uncategorized: 0 };
      if (l.productivity_category === 'productive') row.productive++;
      else if (l.productivity_category === 'neutral') row.neutral++;
      else if (l.productivity_category === 'unproductive') row.unproductive++;
      else if (l.productivity_category === 'blocked') row.blocked++;
      else if (l.productivity_category === 'idle') row.idle++;
      else row.uncategorized++;
      map.set(l.employee_id, row);
    }
    return [...map.entries()].map(([employeeId, r]) => {
      // Idle time is excluded from the efficiency share — it's absence, not
      // low-quality work, so folding it in would unfairly tank the score of
      // someone who simply stepped away for lunch. Blocked time stays IN the
      // denominator (and out of the numerator) — unlike idle, it's a real
      // productivity problem, not an absence.
      const activeTotal = r.productive + r.neutral + r.unproductive + r.blocked + r.uncategorized;
      const total = activeTotal + r.idle;
      const efficiency = activeTotal > 0 ? (r.productive / activeTotal) * 100 : 0;
      return { employeeId, name: employees?.find((e) => e.id === employeeId)?.full_name ?? employeeId, ...r, total, efficiency };
    }).sort((a, b) => b.efficiency - a.efficiency);
  }, [data, employees]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Efficiency" description="Productive vs. neutral vs. unproductive capture share, per employee" icon={Gauge} />
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead className="text-right">Productive</TableHead>
            <TableHead className="text-right">Neutral</TableHead><TableHead className="text-right">Unproductive</TableHead>
            <TableHead className="text-right">Blocked</TableHead>
            <TableHead className="text-right">Idle</TableHead>
            <TableHead className="text-right">Captures</TableHead><TableHead className="text-right">Efficiency</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{r.productive}</TableCell>
                <TableCell className="text-right">{r.neutral}</TableCell>
                <TableCell className="text-right">{r.unproductive}</TableCell>
                <TableCell className="text-right">
                  {r.blocked > 0 && <Badge variant="outline" className={CATEGORY_BADGE.blocked}>{r.blocked}</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  {r.idle > 0 && <Badge variant="outline" className={CATEGORY_BADGE.idle}>{r.idle}</Badge>}
                </TableCell>
                <TableCell className="text-right">{r.total}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className={r.efficiency >= 60 ? CATEGORY_BADGE.productive : r.efficiency >= 30 ? CATEGORY_BADGE.neutral : CATEGORY_BADGE.unproductive}>
                    {r.efficiency.toFixed(0)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
