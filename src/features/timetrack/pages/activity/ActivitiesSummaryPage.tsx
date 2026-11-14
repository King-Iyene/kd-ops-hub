import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, LayoutDashboard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActivityLog, CATEGORY_BADGE, GetDesktopAppButton } from './shared';

/** TimeCamp's "Activities summary" — the day-to-day capture feed, the entry point into Computer Activities. */
export default function ActivitiesSummaryPage() {
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const { data: logs, isLoading } = useQuery({
    queryKey: ['timetrack', 'activity-logs', employeeId],
    queryFn: async () => {
      let q = supabase.from('time_activity_logs').select('*').order('captured_at', { ascending: false }).limit(200);
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as ActivityLog[];
    },
  });

  const productiveCount = (logs ?? []).filter((l) => l.productivity_category === 'productive').length;
  const unproductiveCount = (logs ?? []).filter((l) => l.productivity_category === 'unproductive').length;
  const idleCount = (logs ?? []).filter((l) => l.productivity_category === 'idle').length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Activities summary"
        description="Native desktop agent: window/app activity capture, optional screenshots — requires the standalone KD Ops Time Tracker install"
        icon={LayoutDashboard}
        actions={<GetDesktopAppButton />}
      />
      <div className="kd-stat-grid kd-stagger-in">
        <StatCard title="Captures shown" value={(logs ?? []).length} icon={LayoutDashboard} tone="default" />
        <StatCard title="Productive" value={productiveCount} tone="success" />
        <StatCard title="Unproductive" value={unproductiveCount} tone={unproductiveCount > 0 ? 'danger' : 'default'} />
        <StatCard title="Idle" value={idleCount} tone="default" />
      </div>
      <Select value={employeeId} onValueChange={setEmployeeId}>
        <SelectTrigger className="w-64"><SelectValue placeholder="All employees" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="">All employees</SelectItem>
          {(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
        </SelectContent>
      </Select>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Employee</TableHead><TableHead>App</TableHead><TableHead>Window title</TableHead><TableHead>Category</TableHead></TableRow></TableHeader>
          <TableBody>
            {(logs ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{format(new Date(l.captured_at), 'MMM d, HH:mm')}</TableCell>
                <TableCell>{employees?.find((e) => e.id === l.employee_id)?.full_name ?? l.employee_id}</TableCell>
                <TableCell>{l.app_name ?? '—'}</TableCell>
                <TableCell className="max-w-xs truncate">{l.window_title ?? '—'}</TableCell>
                <TableCell>{l.productivity_category && <Badge variant="outline" className={CATEGORY_BADGE[l.productivity_category]}>{l.productivity_category}</Badge>}</TableCell>
              </TableRow>
            ))}
            {(logs ?? []).length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">
                No activity captured yet — the desktop agent needs to be installed and enabled under Agent &amp; policy.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
