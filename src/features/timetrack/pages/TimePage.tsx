import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { Play, Square, Plus, Loader2, Trash2, Pencil, Timer as TimerIcon } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { fetchActiveProjects, fetchTasksForProject } from '../lib/queries';
import type { TimeEntry } from '../lib/types';

const LOCAL_KEY = 'timetrack:active-timer';

function useElapsed(startTime: string | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [startTime]);
  if (!startTime) return '00:00:00';
  const secs = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
  const h = String(Math.floor(secs / 3600)).padStart(2, '0');
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function TimePage() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: projects } = useQuery({ queryKey: ['timetrack', 'projects'], queryFn: fetchActiveProjects });
  const [timerProjectId, setTimerProjectId] = useState<string>('');
  const [timerTaskId, setTimerTaskId] = useState<string>('');
  const { data: timerTasks } = useQuery({
    queryKey: ['timetrack', 'tasks', timerProjectId],
    queryFn: () => fetchTasksForProject(timerProjectId),
    enabled: !!timerProjectId,
  });

  const { data: activeEntry, isLoading: activeLoading } = useQuery({
    queryKey: ['timetrack', 'active-timer', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', profile!.id)
        .is('end_time', null)
        .maybeSingle();
      if (error) throw error;
      return data as TimeEntry | null;
    },
    enabled: !!profile?.id,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (activeLoading) return;
    if (activeEntry) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ id: activeEntry.id, start_time: activeEntry.start_time }));
    } else {
      localStorage.removeItem(LOCAL_KEY);
    }
  }, [activeEntry, activeLoading]);

  const elapsed = useElapsed(activeEntry?.start_time ?? null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const startTimer = async () => {
    if (!timerTaskId) {
      toast({ title: 'Pick a project and task first', variant: 'destructive' });
      return;
    }
    setStarting(true);
    try {
      const { error } = await supabase.from('time_entries').insert({
        employee_id: profile!.id, task_id: timerTaskId, start_time: new Date().toISOString(), entry_source: 'timer',
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'active-timer'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] });
    } catch (err) {
      toast({ title: 'Could not start timer', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const stopTimer = async () => {
    if (!activeEntry) return;
    setStopping(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({ end_time: new Date().toISOString() })
        .eq('id', activeEntry.id);
      if (error) throw error;
      localStorage.removeItem(LOCAL_KEY);
      qc.invalidateQueries({ queryKey: ['timetrack', 'active-timer'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] });
    } catch (err) {
      toast({ title: 'Could not stop timer', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setStopping(false);
    }
  };

  const [manualOpen, setManualOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);

  const [view, setView] = useState<'day' | 'week' | 'calendar'>('day');
  const [anchorDate, setAnchorDate] = useState(new Date());

  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
  const rangeStart = view === 'week' ? weekStart : view === 'day' ? anchorDate : startOfWeek(anchorDate, { weekStartsOn: 1 });
  const rangeEnd = view === 'week' ? addDays(weekStart, 6) : view === 'day' ? anchorDate : addDays(rangeStart, 34);

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['timetrack', 'entries', profile?.id, format(rangeStart, 'yyyy-MM-dd'), format(rangeEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, time_tasks(name, time_projects(name))')
        .eq('employee_id', profile!.id)
        .gte('start_time', `${format(rangeStart, 'yyyy-MM-dd')}T00:00:00`)
        .lt('start_time', `${format(addDays(rangeEnd, 1), 'yyyy-MM-dd')}T00:00:00`)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data as (TimeEntry & { time_tasks: { name: string; time_projects: { name: string } } })[];
    },
    enabled: !!profile?.id,
  });

  const dayGroups = useMemo(() => {
    const groups: Record<string, typeof entries> = {};
    for (const e of entries ?? []) {
      const key = format(new Date(e.start_time), 'yyyy-MM-dd');
      (groups[key] ??= []).push(e);
    }
    return groups;
  }, [entries]);

  const totalMinutes = (entries ?? []).reduce((sum, e) => sum + (e.duration_minutes ?? 0), 0);

  const deleteEntry = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      const { error } = await supabase.from('time_entries').delete().eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] });
    } catch (err) {
      toast({ title: 'Could not delete', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Time Entries" description="Start a timer or log time manually — Day, Week and Calendar views" icon={TimerIcon} />

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center gap-3">
          <Select value={timerProjectId} onValueChange={(v) => { setTimerProjectId(v); setTimerTaskId(''); }} disabled={!!activeEntry}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              {(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={timerTaskId} onValueChange={setTimerTaskId} disabled={!timerProjectId || !!activeEntry}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Task" /></SelectTrigger>
            <SelectContent>
              {(timerTasks ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-3">
            <span className="font-mono text-lg tabular-nums">{activeEntry ? elapsed : '00:00:00'}</span>
            {activeEntry ? (
              <Button variant="destructive" onClick={stopTimer} disabled={stopping}>
                {stopping ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Square className="h-4 w-4 mr-1.5" />}
                Stop
              </Button>
            ) : (
              <Button onClick={startTimer} disabled={starting || !timerTaskId}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Play className="h-4 w-4 mr-1.5" />}
                Start
              </Button>
            )}
            <Button variant="outline" onClick={() => { setEditingEntry(null); setManualOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> Add entry
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchorDate(addDays(anchorDate, view === 'day' ? -1 : -7))}>Prev</Button>
            <Button variant="outline" size="sm" onClick={() => setAnchorDate(new Date())}>Today</Button>
            <Button variant="outline" size="sm" onClick={() => setAnchorDate(addDays(anchorDate, view === 'day' ? 1 : 7))}>Next</Button>
          </div>
        </div>

        <TabsContent value="day" className="mt-4">
          <EntryList
            entries={(entries ?? []).filter((e) => isToday(new Date(e.start_time)) ? isToday(anchorDate) : format(new Date(e.start_time), 'yyyy-MM-dd') === format(anchorDate, 'yyyy-MM-dd'))}
            loading={entriesLoading}
            onEdit={(e) => { setEditingEntry(e); setManualOpen(true); }}
            onDelete={deleteEntry}
          />
        </TabsContent>

        <TabsContent value="week" className="mt-4 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Week of {format(weekStart, 'MMM d, yyyy')}</span>
            <span className="font-medium text-foreground">{(totalMinutes / 60).toFixed(2)} h total</span>
          </div>
          {Object.entries(dayGroups).sort((a, b) => b[0].localeCompare(a[0])).map(([day, dayEntries]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{format(new Date(day), 'EEEE, MMM d')}</p>
              <EntryList entries={dayEntries ?? []} loading={false} onEdit={(e) => { setEditingEntry(e); setManualOpen(true); }} onDelete={deleteEntry} />
            </div>
          ))}
          <SubmitWeekButton weekStart={weekStart} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarGrid rangeStart={rangeStart} dayGroups={dayGroups} onPickDay={(d) => { setAnchorDate(d); setView('day'); }} />
        </TabsContent>
      </Tabs>

      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        entry={editingEntry}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] }); qc.invalidateQueries({ queryKey: ['timetrack', 'active-timer'] }); }}
      />
    </div>
  );
}

function EntryList({ entries, loading, onEdit, onDelete }: {
  entries: (TimeEntry & { time_tasks?: { name: string; time_projects: { name: string } } })[];
  loading: boolean; onEdit: (e: TimeEntry) => void; onDelete: (id: string) => void;
}) {
  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground py-4">No entries.</p>;
  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium truncate">
              {e.time_tasks?.time_projects?.name ?? '—'} · {e.time_tasks?.name ?? '—'}
              {e.is_billable && <span className="ml-2 text-xs text-primary">billable</span>}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {format(new Date(e.start_time), 'HH:mm')} – {e.end_time ? format(new Date(e.end_time), 'HH:mm') : 'running'}
              {e.duration_minutes != null && <> · {(e.duration_minutes / 60).toFixed(2)}h</>}
              {e.notes && <> · {e.notes}</>}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(e)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(e.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarGrid({ rangeStart, dayGroups, onPickDay }: {
  rangeStart: Date; dayGroups: Record<string, (TimeEntry & any)[] | undefined>; onPickDay: (d: Date) => void;
}) {
  const days = Array.from({ length: 35 }, (_, i) => addDays(rangeStart, i));
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        const dayEntries = dayGroups[key] ?? [];
        const hours = dayEntries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0) / 60;
        return (
          <button
            key={key}
            onClick={() => onPickDay(d)}
            className={`rounded-md border border-border/60 p-2 text-left text-xs hover:bg-accent ${isToday(d) ? 'border-primary' : ''}`}
          >
            <p className="font-medium">{format(d, 'd MMM')}</p>
            {hours > 0 && <p className="text-muted-foreground">{hours.toFixed(1)}h</p>}
          </button>
        );
      })}
    </div>
  );
}

function SubmitWeekButton({ weekStart }: { weekStart: Date }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('time_submit_week', { p_week_start: format(weekStart, 'yyyy-MM-dd') });
      if (error) throw error;
      toast({ title: 'Week submitted for approval' });
    } catch (err) {
      toast({ title: 'Could not submit', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Button onClick={submit} disabled={submitting}>
      {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
      Submit week for approval
    </Button>
  );
}

function ManualEntryDialog({ open, onOpenChange, entry, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; entry: TimeEntry | null; onSaved: () => void;
}) {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { data: projects } = useQuery({ queryKey: ['timetrack', 'projects'], queryFn: fetchActiveProjects });
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [billable, setBillable] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: tasks } = useQuery({
    queryKey: ['timetrack', 'tasks', projectId], queryFn: () => fetchTasksForProject(projectId), enabled: !!projectId,
  });

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setProjectId(entry.project_id);
      setTaskId(entry.task_id);
      setDate(format(new Date(entry.start_time), 'yyyy-MM-dd'));
      setStartTime(format(new Date(entry.start_time), 'HH:mm'));
      setEndTime(entry.end_time ? format(new Date(entry.end_time), 'HH:mm') : '17:00');
      setNotes(entry.notes ?? '');
      setBillable(entry.is_billable);
    } else {
      setProjectId(''); setTaskId(''); setDate(format(new Date(), 'yyyy-MM-dd'));
      setStartTime('09:00'); setEndTime('17:00'); setNotes(''); setBillable(false);
    }
  }, [open, entry]);

  const save = async () => {
    if (!taskId) { toast({ title: 'Pick a project and task', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        employee_id: profile!.id, task_id: taskId,
        start_time: `${date}T${startTime}:00`, end_time: `${date}T${endTime}:00`,
        notes: notes || null, is_billable: billable, entry_source: 'manual' as const,
      };
      const { error } = entry
        ? await supabase.from('time_entries').update(payload).eq('id', entry.id)
        : await supabase.from('time_entries').insert(payload);
      if (error) throw error;
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save entry', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{entry ? 'Edit entry' : 'Add manual entry'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={projectId} onValueChange={(v) => { setProjectId(v); setTaskId(''); }}>
            <SelectTrigger><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>{(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={taskId} onValueChange={setTaskId} disabled={!projectId}>
            <SelectTrigger><SelectValue placeholder="Task" /></SelectTrigger>
            <SelectContent>{(tasks ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Start</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div><Label>End</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
          </div>
          <Textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <div className="flex items-center gap-2">
            <Switch checked={billable} onCheckedChange={setBillable} id="billable-sw" />
            <Label htmlFor="billable-sw">Billable</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
