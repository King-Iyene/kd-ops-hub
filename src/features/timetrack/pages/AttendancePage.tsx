import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, LogIn, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TimeAttendanceEntry } from '../lib/types';

export default function AttendancePage() {
  const { profile } = useAuthStore();
  const { has } = useTimetrackCapabilities();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const canViewAll = has('view_others_time');

  const { data: open, isLoading: openLoading } = useQuery({
    queryKey: ['timetrack', 'attendance-open', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_attendance_entries').select('*').eq('employee_id', profile!.id).is('clock_out', null).maybeSingle();
      if (error) throw error;
      return data as TimeAttendanceEntry | null;
    },
    enabled: !!profile?.id,
  });

  const { data: recent, isLoading } = useQuery({
    queryKey: ['timetrack', 'attendance-recent', canViewAll, profile?.id],
    queryFn: async () => {
      let q = supabase.from('time_attendance_entries').select('*').order('clock_in', { ascending: false }).limit(50);
      if (!canViewAll) q = q.eq('employee_id', profile!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as TimeAttendanceEntry[];
    },
    enabled: !!profile?.id,
  });

  const clockIn = async () => {
    try {
      const { error } = await supabase.from('time_attendance_entries').insert({ employee_id: profile!.id, clock_in: new Date().toISOString() });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'attendance-open'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'attendance-recent'] });
    } catch (err) {
      toast({ title: 'Could not clock in', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const clockOut = async () => {
    if (!open) return;
    try {
      const { error } = await supabase.from('time_attendance_entries').update({ clock_out: new Date().toISOString() }).eq('id', open.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'attendance-open'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'attendance-recent'] });
    } catch (err) {
      toast({ title: 'Could not clock out', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex items-center gap-3">
          {openLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : open ? (
            <>
              <span className="text-sm">Clocked in since {format(new Date(open.clock_in), 'HH:mm')}</span>
              <Button variant="destructive" onClick={clockOut}><LogOut className="h-4 w-4 mr-1.5" />Clock out</Button>
            </>
          ) : (
            <Button onClick={clockIn}><LogIn className="h-4 w-4 mr-1.5" />Clock in</Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow>
            {canViewAll && <TableHead>Employee</TableHead>}
            <TableHead>Clock in</TableHead><TableHead>Clock out</TableHead><TableHead>Hours</TableHead></TableRow></TableHeader>
          <TableBody>
            {(recent ?? []).map((r) => (
              <TableRow key={r.id}>
                {canViewAll && <TableCell>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</TableCell>}
                <TableCell>{format(new Date(r.clock_in), 'MMM d, HH:mm')}</TableCell>
                <TableCell>{r.clock_out ? format(new Date(r.clock_out), 'MMM d, HH:mm') : <span className="text-emerald-600">in progress</span>}</TableCell>
                <TableCell>{r.clock_out ? (((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3_600_000).toFixed(2)) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
