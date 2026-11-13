import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, addMonths, subMonths } from 'date-fns';
import { Loader2, LogIn, LogOut, BadgeCheck, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

  // Best-effort GPS stamp — never blocks clock-in/out if denied or unavailable.
  const getPosition = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 },
      );
    });

  const clockIn = async () => {
    try {
      const pos = await getPosition();
      const { error } = await supabase.from('time_attendance_entries').insert({
        employee_id: profile!.id, clock_in: new Date().toISOString(),
        clock_in_lat: pos?.lat ?? null, clock_in_lng: pos?.lng ?? null,
      });
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
      const pos = await getPosition();
      const { error } = await supabase.from('time_attendance_entries').update({
        clock_out: new Date().toISOString(), clock_out_lat: pos?.lat ?? null, clock_out_lng: pos?.lng ?? null,
      }).eq('id', open.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'attendance-open'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'attendance-recent'] });
    } catch (err) {
      toast({ title: 'Could not clock out', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Attendance" description="Daily clock-in/out — separate from project timers" icon={BadgeCheck} />
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

      <Tabs defaultValue="recent">
        <TabsList>
          <TabsTrigger value="recent">Time clock log</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="recent" className="mt-4">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
            <Table>
              <TableHeader><TableRow>
                {canViewAll && <TableHead>Employee</TableHead>}
                <TableHead>Clock in</TableHead><TableHead>Clock out</TableHead><TableHead>Hours</TableHead><TableHead>Location</TableHead></TableRow></TableHeader>
              <TableBody>
                {(recent ?? []).map((r) => (
                  <TableRow key={r.id}>
                    {canViewAll && <TableCell>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</TableCell>}
                    <TableCell>{format(new Date(r.clock_in), 'MMM d, HH:mm')}</TableCell>
                    <TableCell>{r.clock_out ? format(new Date(r.clock_out), 'MMM d, HH:mm') : <span className="text-emerald-600">in progress</span>}</TableCell>
                    <TableCell>{r.clock_out ? (((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / 3_600_000).toFixed(2)) : '—'}</TableCell>
                    <TableCell>
                      {r.clock_in_lat && r.clock_in_lng ? (
                        <a href={`https://www.google.com/maps?q=${r.clock_in_lat},${r.clock_in_lng}`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline">
                          <MapPin className="h-3.5 w-3.5" />View
                        </a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <AttendanceCalendarTab canViewAll={canViewAll} selfId={profile?.id} employees={employees} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttendanceCalendarTab({ canViewAll, selfId, employees }: {
  canViewAll: boolean; selfId: string | undefined; employees: { id: string; full_name: string }[] | undefined;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [employeeId, setEmployeeId] = useState(selfId ?? '');
  const targetEmployee = canViewAll ? employeeId : selfId;

  const rangeStart = startOfWeek(startOfMonth(month));
  const rangeEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const { data: entries, isLoading } = useQuery({
    queryKey: ['timetrack', 'attendance-calendar', targetEmployee, format(month, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_attendance_entries')
        .select('*')
        .eq('employee_id', targetEmployee!)
        .gte('clock_in', format(rangeStart, 'yyyy-MM-dd'))
        .lt('clock_in', format(rangeEnd, 'yyyy-MM-dd') + 'T23:59:59')
        .order('clock_in');
      if (error) throw error;
      return data as TimeAttendanceEntry[];
    },
    enabled: !!targetEmployee,
  });

  const hoursByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries ?? []) {
      if (!e.clock_out) continue;
      const day = format(new Date(e.clock_in), 'yyyy-MM-dd');
      const hours = (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime()) / 3_600_000;
      map.set(day, (map.get(day) ?? 0) + hours);
    }
    return map;
  }, [entries]);

  const monthTotal = [...hoursByDay.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMonth((m) => subMonths(m, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium w-32 text-center">{format(month, 'MMMM yyyy')}</span>
          <Button size="sm" variant="outline" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {canViewAll && (
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>{(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground">Month total: <strong className="text-foreground">{monthTotal.toFixed(2)}h</strong></span>
      </div>

      {!targetEmployee ? (
        <p className="text-sm text-muted-foreground">Select an employee to see their calendar.</p>
      ) : isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-xs font-medium text-muted-foreground text-center pb-1">{d}</div>
          ))}
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const hours = hoursByDay.get(key);
            const inMonth = isSameMonth(d, month);
            return (
              <div key={key} className={`rounded-md border border-border/60 p-2 min-h-[60px] text-xs ${inMonth ? '' : 'opacity-30'} ${hours ? 'bg-emerald-500/10' : ''}`}>
                <div className="text-muted-foreground">{format(d, 'd')}</div>
                {hours ? <div className="font-semibold mt-1">{hours.toFixed(1)}h</div> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
