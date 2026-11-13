import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import {
  Play, Square, Loader2, Trash2, Pencil, Copy, Timer as TimerIcon,
  DollarSign, Tag as TagIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { useToast } from '@/hooks/use-toast';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { fetchActiveProjects, fetchTasksForProject, fetchAllTags, fetchAllActiveTasks } from '../lib/queries';
import { enqueue, flushQueue, queueLength } from '../lib/offlineQueue';
import type { TimeEntry, TimeTag } from '../lib/types';

const LOCAL_KEY = 'timetrack:active-timer';

/** Deterministic color per project id, used for the dot next to each entry
 * and for its segment on the day timeline — same project always gets the
 * same color so the two views read together. */
function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 65% 50%)`;
}

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
  const { has } = useTimetrackCapabilities();
  const canViewAll = has('view_others_time');
  const { data: employees } = useActiveEmployees();

  // Which employee's timesheet is on screen. Defaults to your own; a
  // manager with view_others_time can switch to a teammate's — read-only,
  // the way TimeCamp's own "People" switcher on this page works. You can
  // only ever start/stop YOUR OWN timer, never someone else's.
  const [viewEmployeeId, setViewEmployeeId] = useState<string | undefined>(undefined);
  const effectiveEmployeeId = viewEmployeeId ?? profile?.id;
  const viewingSelf = effectiveEmployeeId === profile?.id;

  const { data: projects } = useQuery({ queryKey: ['timetrack', 'projects'], queryFn: fetchActiveProjects });
  const { data: allTasks } = useQuery({ queryKey: ['timetrack', 'all-tasks'], queryFn: fetchAllActiveTasks });
  const [timerProjectId, setTimerProjectId] = useState<string>('');
  const [timerTaskId, setTimerTaskId] = useState<string>('');
  const [startNote, setStartNote] = useState('');

  const { data: activeEntry, isLoading: activeLoading } = useQuery({
    queryKey: ['timetrack', 'active-timer', effectiveEmployeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', effectiveEmployeeId!)
        .is('end_time', null)
        .maybeSingle();
      if (error) throw error;
      return data as TimeEntry | null;
    },
    enabled: !!effectiveEmployeeId,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!viewingSelf || activeLoading) return;
    if (activeEntry) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ id: activeEntry.id, start_time: activeEntry.start_time }));
    } else {
      localStorage.removeItem(LOCAL_KEY);
    }
  }, [activeEntry, activeLoading, viewingSelf]);

  const elapsed = useElapsed(activeEntry?.start_time ?? null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const startTimer = async (taskId?: string, projectId?: string, note?: string) => {
    const useTaskId = taskId ?? timerTaskId;
    const useProjectId = projectId ?? timerProjectId;
    if (!useTaskId || !useProjectId) {
      toast({ title: 'Pick a project and task first', variant: 'destructive' });
      return;
    }
    setStarting(true);
    try {
      const { error } = await supabase.from('time_entries').insert({
        employee_id: profile!.id, task_id: useTaskId, project_id: useProjectId, start_time: new Date().toISOString(),
        notes: (note ?? startNote) || null, entry_source: 'timer',
      });
      if (error) throw error;
      setStartNote('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'active-timer'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] });
    } catch (err) {
      toast({ title: 'Could not start timer', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const stopTimer = async (endTime?: string) => {
    if (!activeEntry) return;
    setStopping(true);
    try {
      if (!navigator.onLine) {
        enqueue({ type: 'update_entry', entryId: activeEntry.id, payload: { end_time: endTime ?? new Date().toISOString() } });
        toast({ title: 'Saved offline', description: "No connection — this will sync once you're back online." });
        localStorage.removeItem(LOCAL_KEY);
        // Optimistically clear it from the UI now — the server-side row is
        // still open until the queued update actually syncs, but there's no
        // reason to make the user stare at a running clock they already stopped.
        qc.setQueryData(['timetrack', 'active-timer', profile?.id], null);
        setStopping(false);
        return;
      }
      const { error } = await supabase
        .from('time_entries')
        .update({ end_time: endTime ?? new Date().toISOString() })
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
  const [duplicateFrom, setDuplicateFrom] = useState<TimeEntry | null>(null);

  const [view, setView] = useState<'day' | 'week' | 'calendar'>('day');
  const [anchorDate, setAnchorDate] = useState(new Date());

  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
  const rangeStart = view === 'week' ? weekStart : view === 'day' ? anchorDate : startOfWeek(anchorDate, { weekStartsOn: 1 });
  const rangeEnd = view === 'week' ? addDays(weekStart, 6) : view === 'day' ? anchorDate : addDays(rangeStart, 34);

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['timetrack', 'entries', effectiveEmployeeId, format(rangeStart, 'yyyy-MM-dd'), format(rangeEnd, 'yyyy-MM-dd')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*, time_tasks(name, project_id, time_projects(id, name)), time_entry_tags(time_tags(id, name))')
        .eq('employee_id', effectiveEmployeeId!)
        .gte('start_time', `${format(rangeStart, 'yyyy-MM-dd')}T00:00:00`)
        .lt('start_time', `${format(addDays(rangeEnd, 1), 'yyyy-MM-dd')}T00:00:00`)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return data as (TimeEntry & { time_tasks: { name: string; project_id: string; time_projects: { id: string; name: string } }; time_entry_tags: { time_tags: TimeTag }[] })[];
    },
    enabled: !!effectiveEmployeeId,
  });

  // Day-view only: real activity-agent capture points for this employee on
  // this day that don't fall inside any logged time entry — rendered as
  // "(unassigned computer activities)", same label TimeCamp uses for the
  // same idea. Each capture point counts for the gap to the next point,
  // capped at 15 min so a period the agent was simply off doesn't inflate
  // the total. Empty for anyone not running the desktop agent — correct,
  // not a placeholder.
  const { data: unassignedMinutes } = useQuery({
    queryKey: ['timetrack', 'unassigned-activity', effectiveEmployeeId, format(anchorDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      const dayStart = `${format(anchorDate, 'yyyy-MM-dd')}T00:00:00`;
      const dayEnd = `${format(addDays(anchorDate, 1), 'yyyy-MM-dd')}T00:00:00`;
      const { data, error } = await supabase
        .from('time_activity_logs')
        .select('captured_at')
        .eq('employee_id', effectiveEmployeeId!)
        .gte('captured_at', dayStart)
        .lt('captured_at', dayEnd)
        .order('captured_at', { ascending: true });
      if (error) throw error;
      const points = (data ?? []).map((r) => new Date(r.captured_at).getTime());
      if (points.length === 0) return 0;
      const dayEntries = (entries ?? []).filter((e) => format(new Date(e.start_time), 'yyyy-MM-dd') === format(anchorDate, 'yyyy-MM-dd'));
      const covered = (t: number) => dayEntries.some((e) => {
        const s = new Date(e.start_time).getTime();
        const en = e.end_time ? new Date(e.end_time).getTime() : Date.now();
        return t >= s && t < en;
      });
      let unassigned = 0;
      for (let i = 0; i < points.length; i++) {
        if (covered(points[i])) continue;
        const gapMs = i + 1 < points.length ? points[i + 1] - points[i] : 60_000;
        unassigned += Math.min(gapMs, 15 * 60_000);
      }
      return Math.round(unassigned / 60_000); // minutes
    },
    enabled: !!effectiveEmployeeId && view === 'day',
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

  const dayEntries = (entries ?? []).filter((e) => format(new Date(e.start_time), 'yyyy-MM-dd') === format(anchorDate, 'yyyy-MM-dd'));

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Timesheet"
        description="Start a timer or log time manually — Day, Week and Calendar views"
        icon={TimerIcon}
        actions={canViewAll ? (
          <Select value={effectiveEmployeeId ?? ''} onValueChange={(v) => setViewEmployeeId(v === profile?.id ? undefined : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Whose timesheet?" /></SelectTrigger>
            <SelectContent>
              {(employees ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.id === profile?.id ? `${e.full_name} — you` : e.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : undefined}
      />

      <OfflineSyncBanner />

      {!viewingSelf && (
        <p className="text-xs text-muted-foreground">
          Viewing {employees?.find((e) => e.id === effectiveEmployeeId)?.full_name ?? 'this employee'}'s timesheet — read-only.
          Switch back to "you" above to track your own time.
        </p>
      )}

      {viewingSelf && (
        <Card className={activeEntry ? 'border-primary/50' : undefined}>
          <CardContent className="pt-6 flex flex-wrap items-center gap-3">
            <TimerCombobox
              projects={projects ?? []}
              tasks={allTasks ?? []}
              disabled={!!activeEntry}
              activeLabel={activeEntry ? `${activeEntry.notes ? activeEntry.notes + ' · ' : ''}${allTasks?.find((t) => t.id === activeEntry.task_id)?.time_projects?.name ?? ''}` : undefined}
              onPick={(task) => {
                setTimerProjectId(task.project_id);
                setTimerTaskId(task.id);
                startTimer(task.id, task.project_id);
              }}
            />
            {!activeEntry && (
              <Input
                placeholder="note"
                value={startNote}
                onChange={(e) => setStartNote(e.target.value)}
                className="w-40"
              />
            )}

            <div className="ml-auto flex items-center gap-3">
              <span className="font-mono text-lg tabular-nums">{activeEntry ? elapsed : '00:00:00'}</span>
              {activeEntry ? (
                <Button variant="destructive" onClick={() => stopTimer()} disabled={stopping}>
                  {stopping ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Square className="h-4 w-4 mr-1.5" />}
                  Stop
                </Button>
              ) : (
                <Button onClick={() => startTimer()} disabled={starting || !timerTaskId}>
                  {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Play className="h-4 w-4 mr-1.5" />}
                  Start
                </Button>
              )}
              <Button variant="link" className="px-0" onClick={() => { setEditingEntry(null); setDuplicateFrom(null); setManualOpen(true); }}>
                Add manually
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

        <TabsContent value="day" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{format(anchorDate, 'EEEE, MMMM d, yyyy')}</p>
          <DayTimeline entries={dayEntries} />
          <EntryList
            entries={dayEntries}
            loading={entriesLoading}
            readOnly={!viewingSelf}
            onEdit={(e) => { setEditingEntry(e); setDuplicateFrom(null); setManualOpen(true); }}
            onDuplicate={(e) => { setEditingEntry(null); setDuplicateFrom(e); setManualOpen(true); }}
            onDelete={deleteEntry}
          />
          {(dayEntries.length > 0 || (unassignedMinutes ?? 0) > 0) && (
            <div className="flex items-center justify-between rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {(unassignedMinutes ?? 0) > 0
                  ? `(unassigned computer activities) · ${((unassignedMinutes ?? 0) / 60).toFixed(2)}h`
                  : ''}
              </span>
              <span className="font-medium text-foreground">
                {(dayEntries.reduce((s, e) => s + (e.duration_minutes ?? 0), 0) / 60).toFixed(2)}h total
              </span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="week" className="mt-4 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Week of {format(weekStart, 'MMM d, yyyy')}</span>
            <span className="font-medium text-foreground">{(totalMinutes / 60).toFixed(2)} h total</span>
          </div>
          {Object.entries(dayGroups).sort((a, b) => b[0].localeCompare(a[0])).map(([day, entriesForDay]) => (
            <div key={day}>
              <p className="text-xs font-semibold text-muted-foreground mb-1">{format(new Date(day), 'EEEE, MMM d')}</p>
              <EntryList
                entries={entriesForDay ?? []}
                loading={false}
                readOnly={!viewingSelf}
                onEdit={(e) => { setEditingEntry(e); setDuplicateFrom(null); setManualOpen(true); }}
                onDuplicate={(e) => { setEditingEntry(null); setDuplicateFrom(e); setManualOpen(true); }}
                onDelete={deleteEntry}
              />
            </div>
          ))}
          {viewingSelf && <SubmitWeekButton weekStart={weekStart} />}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <CalendarGrid rangeStart={rangeStart} dayGroups={dayGroups} onPickDay={(d) => { setAnchorDate(d); setView('day'); }} />
        </TabsContent>
      </Tabs>

      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        entry={editingEntry}
        duplicateFrom={duplicateFrom}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] }); qc.invalidateQueries({ queryKey: ['timetrack', 'active-timer'] }); }}
      />

      {viewingSelf && <IdlePopup activeEntry={activeEntry ?? null} onStopAtIdleTime={stopTimer} />}
    </div>
  );
}

/**
 * "What are you working on?" quick-start combobox — matches TimeCamp's own
 * timer bar: one search box over every project's tasks, grouped by project,
 * picking one starts the timer immediately (no separate confirm step).
 */
function TimerCombobox({ projects, tasks, disabled, activeLabel, onPick }: {
  projects: { id: string; name: string }[];
  tasks: { id: string; name: string; project_id: string; time_projects: { id: string; name: string } | null }[];
  disabled: boolean;
  activeLabel?: string;
  onPick: (task: { id: string; name: string; project_id: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => {
    const byProject: Record<string, { projectName: string; tasks: typeof tasks }> = {};
    for (const t of tasks) {
      const pid = t.project_id;
      const pname = t.time_projects?.name ?? projects.find((p) => p.id === pid)?.name ?? 'Unknown project';
      (byProject[pid] ??= { projectName: pname, tasks: [] }).tasks.push(t);
    }
    return Object.values(byProject).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [tasks, projects]);

  if (disabled) {
    return (
      <div className="flex-1 min-w-0 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm truncate">
        {activeLabel || 'Tracking…'}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex-1 min-w-0 text-left rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50 transition-colors"
        >
          What are you working on?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type project name or task" />
          <CommandList>
            <CommandEmpty>No matching project or task.</CommandEmpty>
            {grouped.map((g) => (
              <CommandGroup key={g.projectName} heading={g.projectName}>
                {g.tasks.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`${g.projectName} ${t.name}`}
                    onSelect={() => { onPick(t); setOpen(false); }}
                  >
                    {t.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** 24-hour visual timeline for the selected day — each tracked entry drawn
 * as a colored segment positioned by its time-of-day, same idea as
 * TimeCamp's hour-ruler bar above the day's entry list. */
function DayTimeline({ entries }: { entries: (TimeEntry & { time_tasks?: { project_id: string } })[] }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="space-y-1">
      <div className="relative h-3 rounded-sm bg-muted/40">
        {entries.map((e) => {
          const start = new Date(e.start_time);
          const end = e.end_time ? new Date(e.end_time) : new Date();
          const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
          const startMin = (start.getTime() - dayStart.getTime()) / 60_000;
          const endMin = Math.min(1440, (end.getTime() - dayStart.getTime()) / 60_000);
          const leftPct = Math.max(0, (startMin / 1440) * 100);
          const widthPct = Math.max(0.3, ((endMin - startMin) / 1440) * 100);
          const color = colorForId(e.time_tasks?.project_id ?? e.id);
          return (
            <div
              key={e.id}
              title={`${format(start, 'HH:mm')} – ${e.end_time ? format(end, 'HH:mm') : 'running'}`}
              className="absolute top-0 h-full rounded-sm"
              style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: color }}
            />
          );
        })}
      </div>
      <div className="relative h-3 text-[9px] text-muted-foreground">
        {hours.filter((h) => h % 2 === 0).map((h) => (
          <span key={h} className="absolute -translate-x-1/2" style={{ left: `${(h / 24) * 100}%` }}>
            {h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Pure client-side idle detection — no native agent needed. While a timer
 * is running, tracks real mouse/keyboard activity; past the configured
 * threshold it offers to stop the timer AT the last-activity time (not
 * now), so idle minutes don't silently get billed.
 */
function IdlePopup({ activeEntry, onStopAtIdleTime }: { activeEntry: TimeEntry | null; onStopAtIdleTime: (endTime?: string) => void }) {
  const { data: idleSettings } = useQuery({
    queryKey: ['timetrack', 'idle-settings-public'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_idle_settings').select('idle_threshold_minutes, is_enabled').eq('id', true).single();
      if (error) throw error;
      return data as { idle_threshold_minutes: number; is_enabled: boolean };
    },
    staleTime: 5 * 60_000,
  });

  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const [showIdleDialog, setShowIdleDialog] = useState(false);
  const [idleSince, setIdleSince] = useState<number | null>(null);

  useEffect(() => {
    const reset = () => setLastActivity(Date.now());
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    window.addEventListener('scroll', reset);
    return () => {
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
      window.removeEventListener('scroll', reset);
    };
  }, []);

  useEffect(() => {
    if (!activeEntry || !idleSettings?.is_enabled || showIdleDialog) return;
    const id = setInterval(() => {
      const idleMs = Date.now() - lastActivity;
      if (idleMs >= idleSettings.idle_threshold_minutes * 60_000) {
        setIdleSince(lastActivity);
        setShowIdleDialog(true);
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [activeEntry, idleSettings, lastActivity, showIdleDialog]);

  const keepWorking = () => {
    setLastActivity(Date.now());
    setShowIdleDialog(false);
  };

  const discardIdleTime = () => {
    if (idleSince) onStopAtIdleTime(new Date(idleSince).toISOString());
    setShowIdleDialog(false);
    setLastActivity(Date.now());
  };

  if (!activeEntry) return null;

  return (
    <AlertDialog open={showIdleDialog} onOpenChange={setShowIdleDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still working?</AlertDialogTitle>
          <AlertDialogDescription>
            Your timer has been running with no activity for a while. Keep tracking this time, or stop the
            timer at the point you went idle?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={keepWorking}>Keep all time — I was working</AlertDialogCancel>
          <AlertDialogAction onClick={discardIdleTime}>Stop timer at idle point</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OfflineSyncBanner() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(() => queueLength());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const sync = async () => {
      if (queueLength() === 0) return;
      setSyncing(true);
      const { synced } = await flushQueue();
      setPending(queueLength());
      setSyncing(false);
      if (synced > 0) {
        qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] });
        qc.invalidateQueries({ queryKey: ['timetrack', 'active-timer'] });
      }
    };
    const onOnline = () => sync();
    window.addEventListener('online', onOnline);
    sync(); // try once on mount too, in case we reconnected before this page loaded
    return () => window.removeEventListener('online', onOnline);
  }, [qc]);

  if (pending === 0 && !syncing) return null;

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      {syncing ? 'Syncing offline changes…' : `${pending} change${pending === 1 ? '' : 's'} saved offline, waiting to sync.`}
    </div>
  );
}

function EntryList({ entries, loading, readOnly, onEdit, onDuplicate, onDelete }: {
  entries: (TimeEntry & { time_tasks?: { name: string; project_id?: string; time_projects: { name: string } }; time_entry_tags?: { time_tags: TimeTag }[] })[];
  loading: boolean; readOnly: boolean; onEdit: (e: TimeEntry) => void; onDuplicate: (e: TimeEntry) => void; onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const toggleBillable = async (e: TimeEntry) => {
    try {
      const { error } = await supabase.from('time_entries').update({ is_billable: !e.is_billable }).eq('id', e.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'entries'] });
    } catch (err) {
      toast({ title: 'Could not update', description: errorMessage(err), variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (entries.length === 0) return <p className="text-sm text-muted-foreground py-4">No entries.</p>;
  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: colorForId(e.time_tasks?.project_id ?? e.id) }}
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">
              {e.time_tasks?.time_projects?.name ?? '—'} · {e.time_tasks?.name ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {e.notes || 'note'}
              {e.time_entry_tags && e.time_entry_tags.length > 0 && (
                <span className="inline-flex items-center gap-1 ml-2">
                  <TagIcon className="h-2.5 w-2.5" />
                  {e.time_entry_tags.map((t) => t.time_tags.name).join(', ')}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && toggleBillable(e)}
            className={`shrink-0 ${e.is_billable ? 'text-primary' : 'text-muted-foreground/40'} ${readOnly ? '' : 'hover:text-primary'}`}
            title={e.is_billable ? 'Billable' : 'Not billable'}
          >
            <DollarSign className="h-4 w-4" />
          </button>
          <div className="text-xs text-muted-foreground tabular-nums shrink-0 w-40 text-right">
            {format(new Date(e.start_time), 'hh:mm a')} – {e.end_time ? format(new Date(e.end_time), 'hh:mm a') : 'running'}
          </div>
          <div className="text-xs font-medium tabular-nums shrink-0 w-14 text-right">
            {e.duration_minutes != null ? `${(e.duration_minutes / 60).toFixed(2)}h` : '—'}
          </div>
          {!readOnly && (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(e)} title="Duplicate"><Copy className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(e)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(e.id)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </div>
          )}
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

function ManualEntryDialog({ open, onOpenChange, entry, duplicateFrom, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; entry: TimeEntry | null; duplicateFrom: TimeEntry | null; onSaved: () => void;
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
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: tasks } = useQuery({
    queryKey: ['timetrack', 'tasks', projectId], queryFn: () => fetchTasksForProject(projectId), enabled: !!projectId,
  });
  const { data: allTags } = useQuery({ queryKey: ['timetrack', 'tags'], queryFn: fetchAllTags });

  useEffect(() => {
    if (!open) return;
    const source = entry ?? duplicateFrom;
    if (source) {
      setProjectId(source.project_id);
      setTaskId(source.task_id);
      setDate(entry ? format(new Date(source.start_time), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
      setStartTime(format(new Date(source.start_time), 'HH:mm'));
      setEndTime(source.end_time ? format(new Date(source.end_time), 'HH:mm') : '17:00');
      setNotes(source.notes ?? '');
      setBillable(source.is_billable);
      (async () => {
        const { data } = await supabase.from('time_entry_tags').select('tag_id').eq('time_entry_id', source.id);
        setTagIds((data ?? []).map((r) => r.tag_id));
      })();
    } else {
      setProjectId(''); setTaskId(''); setDate(format(new Date(), 'yyyy-MM-dd'));
      setStartTime('09:00'); setEndTime('17:00'); setNotes(''); setBillable(false); setTagIds([]);
    }
  }, [open, entry, duplicateFrom]);

  const toggleTag = (id: string) => {
    setTagIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!taskId) { toast({ title: 'Pick a project and task', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        employee_id: profile!.id, task_id: taskId, project_id: projectId,
        start_time: `${date}T${startTime}:00`, end_time: `${date}T${endTime}:00`,
        notes: notes || null, is_billable: billable, entry_source: 'manual' as const,
      };

      if (!navigator.onLine) {
        if (entry) {
          enqueue({ type: 'update_entry', entryId: entry.id, payload });
        } else {
          enqueue({ type: 'insert_entry', payload });
        }
        toast({ title: "Saved offline", description: "No connection — this entry will sync automatically once you're back online. Tags don't sync offline — re-apply them once you're back online." });
        onOpenChange(false);
        onSaved();
        return;
      }

      let entryId = entry?.id;
      if (entry) {
        const { error } = await supabase.from('time_entries').update(payload).eq('id', entry.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('time_entries').insert(payload).select('id').single();
        if (error) throw error;
        entryId = data.id;
      }

      // Replace the tag set for this entry: delete then re-insert the current selection.
      if (entryId) {
        const { error: delErr } = await supabase.from('time_entry_tags').delete().eq('time_entry_id', entryId);
        if (delErr) throw delErr;
        if (tagIds.length > 0) {
          const { error: insErr } = await supabase.from('time_entry_tags').insert(
            tagIds.map((tag_id) => ({ time_entry_id: entryId, tag_id }))
          );
          if (insErr) throw insErr;
        }
      }

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
        <DialogHeader><DialogTitle>{entry ? 'Edit entry' : duplicateFrom ? 'Duplicate entry' : 'Add manual entry'}</DialogTitle></DialogHeader>
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
          {(allTags ?? []).length > 0 && (
            <div>
              <Label className="mb-1.5 block">Tags</Label>
              <div className="flex flex-wrap gap-3">
                {(allTags ?? []).map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm">
                    <Checkbox checked={tagIds.includes(t.id)} onCheckedChange={() => toggleTag(t.id)} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
