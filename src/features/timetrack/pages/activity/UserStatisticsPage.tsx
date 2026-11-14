import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Download, Users } from 'lucide-react';
import { toCsv, downloadCsv } from '@/lib/csv';
import { supabase } from '@/lib/supabase';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals } from './shared';

interface AgentRow { employee_id: string; is_enabled: boolean; app_version: string | null; last_login_at: string | null; login_count: number }

/** TimeCamp's "User statistics" report — one summary row per employee,
 * covering both the desktop-agent install (last login, app version, number
 * of logins — what the real TimeCamp page is actually about) and the capture
 * totals/productivity share (what our own v1 of this page used to be). */
export default function UserStatisticsPage() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const { data: employees } = useActiveEmployees();
  const { data: agentRows } = useQuery({
    queryKey: ['timetrack', 'agent-settings-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_agent_settings').select('employee_id, is_enabled, app_version, last_login_at, login_count');
      if (error) throw error;
      return data as AgentRow[];
    },
  });
  const agentFor = (employeeId: string) => agentRows?.find((a) => a.employee_id === employeeId);

  const rows = useMemo(() => {
    const map = new Map<string, { captures: number; productive: number; idle: number; hours: number; days: Set<string>; first: string; last: string }>();
    for (const l of data?.logs ?? []) {
      const row = map.get(l.employee_id) ?? { captures: 0, productive: 0, idle: 0, hours: 0, days: new Set<string>(), first: l.captured_at, last: l.captured_at };
      row.captures++;
      if (l.productivity_category === 'productive') row.productive++;
      if (l.productivity_category === 'idle') row.idle++;
      row.hours += (data?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
      row.days.add(format(new Date(l.captured_at), 'yyyy-MM-dd'));
      if (l.captured_at < row.first) row.first = l.captured_at;
      if (l.captured_at > row.last) row.last = l.captured_at;
      map.set(l.employee_id, row);
    }
    return [...map.entries()].map(([employeeId, r]) => {
      const activeCaptures = r.captures - r.idle;
      return {
        employeeId, name: employees?.find((e) => e.id === employeeId)?.full_name ?? employeeId,
        captures: r.captures, idle: r.idle, hours: r.hours, activeDays: r.days.size,
        productivePct: activeCaptures > 0 ? (r.productive / activeCaptures) * 100 : 0,
        first: r.first, last: r.last,
      };
    }).sort((a, b) => b.hours - a.hours);
  }, [data, employees]);

  const exportCsv = () => {
    const csv = toCsv(
      ['Employee', 'Agent installed', 'App version', 'Last login', 'Logins', 'Captures', 'Idle', 'Est. hours', 'Active days', 'Productive %'],
      rows.map((r) => {
        const agent = agentFor(r.employeeId);
        return [
          r.name, agent?.is_enabled ? 'Yes' : 'No', agent?.app_version ?? '', agent?.last_login_at ? format(new Date(agent.last_login_at), 'yyyy-MM-dd HH:mm') : '',
          String(agent?.login_count ?? 0), String(r.captures), String(r.idle), r.hours.toFixed(2), String(r.activeDays), r.productivePct.toFixed(0),
        ];
      }),
    );
    downloadCsv(`timetrack-user-statistics-${start}-to-${end}.csv`, csv);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="User statistics" description="Desktop agent install status per employee, plus capture totals and productivity share" icon={Users} />
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>App version</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead className="text-right">Logins</TableHead>
              <TableHead className="text-right">Captures</TableHead>
              <TableHead className="text-right">Idle</TableHead>
              <TableHead className="text-right">Est. hours</TableHead><TableHead className="text-right">Active days</TableHead>
              <TableHead className="text-right">Productive %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => {
                const agent = agentFor(r.employeeId);
                return (
                  <TableRow key={r.employeeId}>
                    <TableCell>
                      {r.name}{' '}
                      {agent?.is_enabled ? <Badge variant="outline" className="ml-1 text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30">installed</Badge>
                        : <Badge variant="outline" className="ml-1 text-[10px]">not installed</Badge>}
                    </TableCell>
                    <TableCell>{agent?.app_version ?? '—'}</TableCell>
                    <TableCell>{agent?.last_login_at ? format(new Date(agent.last_login_at), 'MMM d, HH:mm') : '—'}</TableCell>
                    <TableCell className="text-right">{agent?.login_count ?? 0}</TableCell>
                    <TableCell className="text-right">{r.captures}</TableCell>
                    <TableCell className="text-right">{r.idle}</TableCell>
                    <TableCell className="text-right">{r.hours.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.activeDays}</TableCell>
                    <TableCell className="text-right">{r.productivePct.toFixed(0)}%</TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
