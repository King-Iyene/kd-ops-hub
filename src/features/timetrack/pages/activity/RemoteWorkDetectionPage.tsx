import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useActivityDateRange, ActivityDateRangeBar, useLogsWithIntervals } from './shared';

interface TrackingHoursRow { weekday: number; from_time: string; to_time: string }

/**
 * TimeCamp's "Remote work detection" is IP/device based, which this product doesn't capture.
 * What's real and useful here: flagging captures outside the company's configured tracking
 * hours (time_agent_tracking_hours, set on the Agent & policy page) — a genuine, honest
 * off-hours-activity signal built from data already collected, not a fabricated location check.
 */
export default function RemoteWorkDetectionPage() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const { data: employees } = useActiveEmployees();
  const { data: hours } = useQuery({
    queryKey: ['timetrack', 'agent-tracking-hours'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_agent_tracking_hours').select('*');
      if (error) throw error;
      return data as TrackingHoursRow[];
    },
  });

  const flagged = useMemo(() => {
    const byWeekday = new Map((hours ?? []).map((h) => [h.weekday, h]));
    const out: { employee: string; app: string | null; capturedAt: string }[] = [];
    for (const l of data?.logs ?? []) {
      const d = new Date(l.captured_at);
      const weekday = (d.getDay() + 6) % 7; // 0=Mon..6=Sun, matching time_agent_tracking_hours
      const window = byWeekday.get(weekday);
      if (!window) continue;
      const hm = format(d, 'HH:mm:ss');
      if (hm < window.from_time || hm > window.to_time) {
        out.push({ employee: employees?.find((e) => e.id === l.employee_id)?.full_name ?? l.employee_id, app: l.app_name, capturedAt: l.captured_at });
      }
    }
    return out.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 200);
  }, [data, hours, employees]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Remote work detection" description="Captures logged outside the configured tracking-hours window, per weekday" icon={ShieldAlert} />
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Employee</TableHead><TableHead>App</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {flagged.map((f, i) => (
              <TableRow key={i}>
                <TableCell>{format(new Date(f.capturedAt), 'MMM d, HH:mm')}</TableCell>
                <TableCell>{f.employee}</TableCell>
                <TableCell>{f.app ?? '—'}</TableCell>
                <TableCell><Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">off-hours</Badge></TableCell>
              </TableRow>
            ))}
            {flagged.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No off-hours activity in range.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
