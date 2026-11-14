import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck, Settings } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { GetDesktopAppButton } from './shared';

interface AgentSettings {
  employee_id: string; is_enabled: boolean; capture_interval_minutes: number;
  screenshots_enabled: boolean; blur_screenshots: boolean; retention_days: number;
}

/** Per-employee enable/interval/screenshot settings, plus the company-wide agent behavior
 * policy and weekly tracking-hours schedule — admin config, not one of TimeCamp's own report
 * leaves, so it's kept as one page rather than split to match the nav 1:1. */
export default function AgentConfigPage() {
  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Agent & policy" description="Enable the desktop agent per employee and set company-wide tracking behavior" icon={Settings} actions={<GetDesktopAppButton />} />
      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Per-employee settings</TabsTrigger>
          <TabsTrigger value="policy">Tracking policy</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" className="mt-4"><AgentSettingsTab /></TabsContent>
        <TabsContent value="policy" className="mt-4"><PolicyTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AgentSettingsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['timetrack', 'agent-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_agent_settings').select('*');
      if (error) throw error;
      return data as AgentSettings[];
    },
  });

  const upsert = async (employeeId: string, patch: Partial<AgentSettings>) => {
    try {
      const existing = settings?.find((s) => s.employee_id === employeeId);
      const { error } = await supabase.from('time_agent_settings').upsert({
        employee_id: employeeId,
        is_enabled: existing?.is_enabled ?? false,
        capture_interval_minutes: existing?.capture_interval_minutes ?? 10,
        screenshots_enabled: existing?.screenshots_enabled ?? false,
        blur_screenshots: existing?.blur_screenshots ?? true,
        retention_days: existing?.retention_days ?? 30,
        ...patch,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'agent-settings'] });
    } catch (err) {
      toast({ title: 'Could not update settings', description: errorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-2">
        Disabled by default for everyone — the agent refuses to capture anything for an employee without an enabled row here (enforced server-side, not just in the UI).
      </p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Employee</TableHead><TableHead>Enabled</TableHead><TableHead>Interval (min)</TableHead>
          <TableHead>Screenshots</TableHead><TableHead>Blur</TableHead><TableHead>Retention (days)</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {(employees ?? []).map((e) => {
            const s = settings?.find((x) => x.employee_id === e.id);
            return (
              <TableRow key={e.id}>
                <TableCell>{e.full_name}</TableCell>
                <TableCell><Switch checked={s?.is_enabled ?? false} onCheckedChange={(v) => upsert(e.id, { is_enabled: v })} /></TableCell>
                <TableCell>
                  <Input type="number" className="w-20 h-8" defaultValue={s?.capture_interval_minutes ?? 10}
                    onBlur={(ev) => upsert(e.id, { capture_interval_minutes: Number(ev.target.value) || 10 })} />
                </TableCell>
                <TableCell><Switch checked={s?.screenshots_enabled ?? false} onCheckedChange={(v) => upsert(e.id, { screenshots_enabled: v })} /></TableCell>
                <TableCell><Switch checked={s?.blur_screenshots ?? true} onCheckedChange={(v) => upsert(e.id, { blur_screenshots: v })} /></TableCell>
                <TableCell>
                  <Input type="number" className="w-20 h-8" defaultValue={s?.retention_days ?? 30}
                    onBlur={(ev) => upsert(e.id, { retention_days: Number(ev.target.value) || 30 })} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface AgentPolicy {
  track_window_titles: boolean; track_only_when_timer_running: boolean; dismiss_overlapping_activities: boolean;
  keep_tracking_last_task: boolean; allow_closing_agent: boolean; private_tracking_only: boolean;
  private_time_minutes_per_day: number; away_time_after_minutes: number; away_time_labels: string;
  block_away_time_outside_first_last: boolean; choose_task_when_unmatched: boolean; no_task_timeout_minutes: number;
  allow_logging_overtime: boolean; stop_tracking_when_unused_minutes: number; stop_at_daily_limit_weekdays: number[];
  disable_split_away_time: boolean; use_different_settings_for_notebooks: boolean;
}
interface TrackingHoursRow { weekday: number; from_time: string; to_time: string }
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function PolicyTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: policy, isLoading: policyLoading } = useQuery({
    queryKey: ['timetrack', 'agent-policy'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_agent_policy').select('*').eq('id', true).single();
      if (error) throw error;
      return data as AgentPolicy;
    },
  });
  const { data: hours, isLoading: hoursLoading } = useQuery({
    queryKey: ['timetrack', 'agent-tracking-hours'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_agent_tracking_hours').select('*').order('weekday');
      if (error) throw error;
      return data as TrackingHoursRow[];
    },
  });

  const [local, setLocal] = useState<AgentPolicy | null>(null);
  const [localHours, setLocalHours] = useState<TrackingHoursRow[] | null>(null);
  useEffect(() => { if (policy) setLocal(policy); }, [policy]);
  useEffect(() => { if (hours) setLocalHours(hours); }, [hours]);
  const [saving, setSaving] = useState(false);

  const savePolicy = async () => {
    if (!local) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_agent_policy').update(local).eq('id', true);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'agent-policy'] });
      toast({ title: 'Tracking policy saved' });
    } catch (err) {
      toast({ title: 'Could not save policy', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveHours = async () => {
    if (!localHours) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_agent_tracking_hours').upsert(localHours);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'agent-tracking-hours'] });
      toast({ title: 'Tracking hours saved' });
    } catch (err) {
      toast({ title: 'Could not save tracking hours', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleDailyLimitDay = (day: number) => {
    if (!local) return;
    const set = new Set(local.stop_at_daily_limit_weekdays);
    if (set.has(day)) set.delete(day); else set.add(day);
    setLocal({ ...local, stop_at_daily_limit_weekdays: Array.from(set).sort() });
  };

  if (policyLoading || hoursLoading || !local || !localHours) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Desktop application settings</CardTitle>
          <CardDescription>
            Company-wide agent behavior — applies once the native agent is installed and enabled for an employee
            (per-employee enable/interval/screenshots are on the "Per-employee settings" tab).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <ToggleRow label="Track window titles" checked={local.track_window_titles} onChange={(v) => setLocal({ ...local, track_window_titles: v })} />
            <ToggleRow label="Track only when a timer for a task is running" checked={local.track_only_when_timer_running} onChange={(v) => setLocal({ ...local, track_only_when_timer_running: v })} />
            <ToggleRow label="Dismiss activities overlapping ones already logged" checked={local.dismiss_overlapping_activities} onChange={(v) => setLocal({ ...local, dismiss_overlapping_activities: v })} />
            <ToggleRow label="When starting, keep tracking to the last task" checked={local.keep_tracking_last_task} onChange={(v) => setLocal({ ...local, keep_tracking_last_task: v })} />
            <ToggleRow label="Allow users to close the desktop application" checked={local.allow_closing_agent} onChange={(v) => setLocal({ ...local, allow_closing_agent: v })} />
            <ToggleRow label="Keep tracking entirely private to the tracked user" checked={local.private_tracking_only} onChange={(v) => setLocal({ ...local, private_tracking_only: v })} />
            <ToggleRow label="Choose a task when the app can't match any keyword" checked={local.choose_task_when_unmatched} onChange={(v) => setLocal({ ...local, choose_task_when_unmatched: v })} />
            <ToggleRow label="Allow users to log overtime activities" checked={local.allow_logging_overtime} onChange={(v) => setLocal({ ...local, allow_logging_overtime: v })} />
            <ToggleRow label="Do not allow away time before first / after last activity" checked={local.block_away_time_outside_first_last} onChange={(v) => setLocal({ ...local, block_away_time_outside_first_last: v })} />
            <ToggleRow label="Disable split away-time data" checked={local.disable_split_away_time} onChange={(v) => setLocal({ ...local, disable_split_away_time: v })} />
            <ToggleRow label="Use different settings for notebooks" checked={local.use_different_settings_for_notebooks} onChange={(v) => setLocal({ ...local, use_different_settings_for_notebooks: v })} />
          </div>

          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
            <div><Label>Private time per day (minutes)</Label><Input type="number" min={0} value={local.private_time_minutes_per_day} onChange={(e) => setLocal({ ...local, private_time_minutes_per_day: Number(e.target.value) || 0 })} /></div>
            <div><Label>Choose away-time activity after (min)</Label><Input type="number" min={1} value={local.away_time_after_minutes} onChange={(e) => setLocal({ ...local, away_time_after_minutes: Number(e.target.value) || 1 })} /></div>
            <div><Label>Stop tracking when computer unused for (min)</Label><Input type="number" min={1} value={local.stop_tracking_when_unused_minutes} onChange={(e) => setLocal({ ...local, stop_tracking_when_unused_minutes: Number(e.target.value) || 1 })} /></div>
            <div><Label>Switch to "no task" after (min, 0 = immediately)</Label><Input type="number" min={0} value={local.no_task_timeout_minutes} onChange={(e) => setLocal({ ...local, no_task_timeout_minutes: Number(e.target.value) || 0 })} /></div>
          </div>

          <div><Label>Define away-time activities (comma-separated)</Label><Textarea rows={2} placeholder="Other work-related, Meeting, Call" value={local.away_time_labels} onChange={(e) => setLocal({ ...local, away_time_labels: e.target.value })} /></div>

          <div>
            <Label className="mb-2 block">Stop tracking when daily hours limit is reached</Label>
            <div className="flex flex-wrap gap-3">
              {WEEKDAY_LABELS.map((d, i) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={local.stop_at_daily_limit_weekdays.includes(i)} onCheckedChange={() => toggleDailyLimitDay(i)} />
                  {d.slice(0, 3)}
                </label>
              ))}
            </div>
          </div>

          <Button onClick={savePolicy} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save policy</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Track time in specific hours</CardTitle>
          <CardDescription>Outside these windows the agent does not capture activity, per weekday.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead /><TableHead>From</TableHead><TableHead>To</TableHead></TableRow></TableHeader>
            <TableBody>
              {localHours.map((row) => (
                <TableRow key={row.weekday}>
                  <TableCell className="font-medium">{WEEKDAY_LABELS[row.weekday]}</TableCell>
                  <TableCell><Input type="time" step={1} className="w-36" value={row.from_time} onChange={(e) => setLocalHours(localHours.map((r) => r.weekday === row.weekday ? { ...r, from_time: e.target.value } : r))} /></TableCell>
                  <TableCell><Input type="time" step={1} className="w-36" value={row.to_time} onChange={(e) => setLocalHours(localHours.map((r) => r.weekday === row.weekday ? { ...r, to_time: e.target.value } : r))} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button className="mt-4" onClick={saveHours} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save hours</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
