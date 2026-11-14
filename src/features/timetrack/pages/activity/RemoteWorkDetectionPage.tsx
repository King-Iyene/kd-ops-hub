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
 * TimeCamp's "Remote work detection" is IP/device based. This page now carries two genuine,
 * honest signals built from data actually collected (no fabricated GPS):
 *  1. Off-hours: captures outside the company's configured tracking hours
 *     (time_agent_tracking_hours, set on the Agent & policy page).
 *  2. Outside geofence: the agent's best-effort IP geolocation (city-level, NOT device GPS —
 *     desktops have none) falls outside every configured office radius
 *     (time_office_locations, managed on the Agent & policy > Geofencing tab).
 * A row can be flagged by either, both, or neither reason.
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
  const { data: officeCount } = useQuery({
    queryKey: ['timetrack', 'office-locations-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('time_office_locations').select('id', { count: 'exact', head: true }).eq('is_active', true);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const flagged = useMemo(() => {
    const byWeekday = new Map((hours ?? []).map((h) => [h.weekday, h]));
    const out: { employee: string; app: string | null; capturedAt: string; offHours: boolean; outsideGeofence: boolean; location: string | null }[] = [];
    for (const l of data?.logs ?? []) {
      const d = new Date(l.captured_at);
      const weekday = (d.getDay() + 6) % 7; // 0=Mon..6=Sun, matching time_agent_tracking_hours
      const window = byWeekday.get(weekday);
      const hm = format(d, 'HH:mm:ss');
      const offHours = !!window && (hm < window.from_time || hm > window.to_time);
      const outsideGeofence = l.is_outside_geofence === true;
      if (!offHours && !outsideGeofence) continue;
      const location = [l.geo_city, l.geo_region, l.geo_country].filter(Boolean).join(', ') || null;
      out.push({
        employee: employees?.find((e) => e.id === l.employee_id)?.full_name ?? l.employee_id,
        app: l.app_name,
        capturedAt: l.captured_at,
        offHours,
        outsideGeofence,
        location,
      });
    }
    return out.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt)).slice(0, 200);
  }, [data, hours, employees]);

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Remote work detection" description="Captures logged outside tracking hours, or outside configured office geofences (IP-based, not device GPS)" icon={ShieldAlert} />
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {!officeCount && (
        <p className="text-xs text-muted-foreground">
          No office locations configured yet — geofence flagging is off until you add one on Agent &amp; policy &gt; Geofencing. Off-hours flagging still works below.
        </p>
      )}
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Employee</TableHead><TableHead>App</TableHead><TableHead>Location (IP)</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {flagged.map((f, i) => (
              <TableRow key={i}>
                <TableCell>{format(new Date(f.capturedAt), 'MMM d, HH:mm')}</TableCell>
                <TableCell>{f.employee}</TableCell>
                <TableCell>{f.app ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{f.location ?? '—'}</TableCell>
                <TableCell className="space-x-1.5">
                  {f.offHours && <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">off-hours</Badge>}
                  {f.outsideGeofence && <Badge variant="outline" className="bg-purple-500/15 text-purple-600 border-purple-500/30">outside geofence</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {flagged.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No off-hours or outside-geofence activity in range.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
