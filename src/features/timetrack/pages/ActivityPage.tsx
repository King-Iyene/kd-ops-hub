import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import { Loader2, Plus, Activity, Image as ImageIcon, ShieldCheck, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { toCsv, downloadCsv } from '@/lib/csv';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

interface AgentSettings {
  employee_id: string;
  is_enabled: boolean;
  capture_interval_minutes: number;
  screenshots_enabled: boolean;
  blur_screenshots: boolean;
  retention_days: number;
}

interface ActivityLog {
  id: string;
  employee_id: string;
  window_title: string | null;
  app_name: string | null;
  productivity_category: string | null;
  captured_at: string;
}

const CATEGORY_BADGE: Record<string, string> = {
  productive: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  neutral: 'bg-muted text-muted-foreground',
  unproductive: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function ActivityPage() {
  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Activity"
        description="Native desktop agent: window/app activity capture, optional screenshots — requires the standalone KD Ops Time Tracker install"
        icon={Activity}
        actions={<GetDesktopAppButton />}
      />
      <Tabs defaultValue="log">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="log">Activity log</TabsTrigger>
          <TabsTrigger value="apps">Sites and apps</TabsTrigger>
          <TabsTrigger value="efficiency">Efficiency</TabsTrigger>
          <TabsTrigger value="stats">User statistics</TabsTrigger>
          <TabsTrigger value="screenshots">Screenshots</TabsTrigger>
          <TabsTrigger value="settings">Per-employee settings</TabsTrigger>
          <TabsTrigger value="rules">Productivity rules</TabsTrigger>
          <TabsTrigger value="policy">Tracking policy</TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="mt-4"><ActivityLogTab /></TabsContent>
        <TabsContent value="apps" className="mt-4"><SitesAndAppsTab /></TabsContent>
        <TabsContent value="efficiency" className="mt-4"><EfficiencyTab /></TabsContent>
        <TabsContent value="stats" className="mt-4"><UserStatisticsTab /></TabsContent>
        <TabsContent value="screenshots" className="mt-4"><ScreenshotsTab /></TabsContent>
        <TabsContent value="settings" className="mt-4"><AgentSettingsTab /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
        <TabsContent value="policy" className="mt-4"><PolicyTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ActivityLogTab() {
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

  return (
    <div className="space-y-4">
      <div className="kd-stat-grid kd-stagger-in">
        <StatCard title="Captures shown" value={(logs ?? []).length} icon={Activity} tone="default" />
        <StatCard title="Productive" value={productiveCount} tone="success" />
        <StatCard title="Unproductive" value={unproductiveCount} tone={unproductiveCount > 0 ? 'danger' : 'default'} />
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
                No activity captured yet — the desktop agent needs to be installed and enabled below.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" /> Screenshots (where enabled) are stored privately and viewable per-employee on request — not shown inline here to avoid a slow, sensitive-data-heavy table.
      </p>
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

function RulesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rules, isLoading } = useQuery({
    queryKey: ['timetrack', 'productivity-rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_productivity_rules').select('*').order('priority');
      if (error) throw error;
      return data as { id: string; app_name_contains: string | null; title_contains: string | null; category: string; priority: number }[];
    },
  });
  const [open, setOpen] = useState(false);
  const [appNameContains, setAppNameContains] = useState('');
  const [titleContains, setTitleContains] = useState('');
  const [category, setCategory] = useState<'productive' | 'neutral' | 'unproductive'>('productive');
  const [priority, setPriority] = useState('100');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!appNameContains.trim() && !titleContains.trim()) {
      toast({ title: 'Set at least one match condition', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('time_productivity_rules').insert({
        app_name_contains: appNameContains.trim() || null, title_contains: titleContains.trim() || null,
        category, priority: Number(priority) || 100,
      });
      if (error) throw error;
      setOpen(false); setAppNameContains(''); setTitleContains('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'productivity-rules'] });
    } catch (err) {
      toast({ title: 'Could not save rule', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await supabase.from('time_productivity_rules').delete().eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'productivity-rules'] });
    } catch (err) {
      toast({ title: 'Could not delete rule', description: errorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New rule</Button>
      <Table>
        <TableHeader><TableRow><TableHead>Priority</TableHead><TableHead>App contains</TableHead><TableHead>Title contains</TableHead><TableHead>Category</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(rules ?? []).map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.priority}</TableCell>
              <TableCell>{r.app_name_contains ?? '—'}</TableCell>
              <TableCell>{r.title_contains ?? '—'}</TableCell>
              <TableCell><Badge variant="outline" className={CATEGORY_BADGE[r.category]}>{r.category}</Badge></TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => remove(r.id)}>Remove</Button></TableCell>
            </TableRow>
          ))}
          {(rules ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No rules yet — everything classifies as neutral.</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New productivity rule</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>App name contains</Label><Input value={appNameContains} onChange={(e) => setAppNameContains(e.target.value)} placeholder="e.g. Chrome" /></div>
            <div><Label>Window title contains</Label><Input value={titleContains} onChange={(e) => setTitleContains(e.target.value)} placeholder="e.g. Figma" /></div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="productive">Productive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="unproductive">Unproductive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Priority (lower checks first)</Label><Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AgentPolicy {
  track_window_titles: boolean;
  track_only_when_timer_running: boolean;
  dismiss_overlapping_activities: boolean;
  keep_tracking_last_task: boolean;
  allow_closing_agent: boolean;
  private_tracking_only: boolean;
  private_time_minutes_per_day: number;
  away_time_after_minutes: number;
  away_time_labels: string;
  block_away_time_outside_first_last: boolean;
  choose_task_when_unmatched: boolean;
  no_task_timeout_minutes: number;
  allow_logging_overtime: boolean;
  stop_tracking_when_unused_minutes: number;
  stop_at_daily_limit_weekdays: number[];
  disable_split_away_time: boolean;
  use_different_settings_for_notebooks: boolean;
}

interface TrackingHoursRow {
  weekday: number;
  from_time: string;
  to_time: string;
}

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
            <ToggleRow label="Track window titles" checked={local.track_window_titles}
              onChange={(v) => setLocal({ ...local, track_window_titles: v })} />
            <ToggleRow label="Track only when a timer for a task is running" checked={local.track_only_when_timer_running}
              onChange={(v) => setLocal({ ...local, track_only_when_timer_running: v })} />
            <ToggleRow label="Dismiss activities overlapping ones already logged" checked={local.dismiss_overlapping_activities}
              onChange={(v) => setLocal({ ...local, dismiss_overlapping_activities: v })} />
            <ToggleRow label="When starting, keep tracking to the last task" checked={local.keep_tracking_last_task}
              onChange={(v) => setLocal({ ...local, keep_tracking_last_task: v })} />
            <ToggleRow label="Allow users to close the desktop application" checked={local.allow_closing_agent}
              onChange={(v) => setLocal({ ...local, allow_closing_agent: v })} />
            <ToggleRow label="Keep tracking entirely private to the tracked user" checked={local.private_tracking_only}
              onChange={(v) => setLocal({ ...local, private_tracking_only: v })} />
            <ToggleRow label="Choose a task when the app can't match any keyword" checked={local.choose_task_when_unmatched}
              onChange={(v) => setLocal({ ...local, choose_task_when_unmatched: v })} />
            <ToggleRow label="Allow users to log overtime activities" checked={local.allow_logging_overtime}
              onChange={(v) => setLocal({ ...local, allow_logging_overtime: v })} />
            <ToggleRow label="Do not allow away time before first / after last activity" checked={local.block_away_time_outside_first_last}
              onChange={(v) => setLocal({ ...local, block_away_time_outside_first_last: v })} />
            <ToggleRow label="Disable split away-time data" checked={local.disable_split_away_time}
              onChange={(v) => setLocal({ ...local, disable_split_away_time: v })} />
            <ToggleRow label="Use different settings for notebooks" checked={local.use_different_settings_for_notebooks}
              onChange={(v) => setLocal({ ...local, use_different_settings_for_notebooks: v })} />
          </div>

          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
            <div>
              <Label>Private time per day (minutes)</Label>
              <Input type="number" min={0} value={local.private_time_minutes_per_day}
                onChange={(e) => setLocal({ ...local, private_time_minutes_per_day: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Choose away-time activity after (min)</Label>
              <Input type="number" min={1} value={local.away_time_after_minutes}
                onChange={(e) => setLocal({ ...local, away_time_after_minutes: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <Label>Stop tracking when computer unused for (min)</Label>
              <Input type="number" min={1} value={local.stop_tracking_when_unused_minutes}
                onChange={(e) => setLocal({ ...local, stop_tracking_when_unused_minutes: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <Label>Switch to "no task" after (min, 0 = immediately)</Label>
              <Input type="number" min={0} value={local.no_task_timeout_minutes}
                onChange={(e) => setLocal({ ...local, no_task_timeout_minutes: Number(e.target.value) || 0 })} />
            </div>
          </div>

          <div>
            <Label>Define away-time activities (comma-separated)</Label>
            <Textarea rows={2} placeholder="Other work-related, Meeting, Call" value={local.away_time_labels}
              onChange={(e) => setLocal({ ...local, away_time_labels: e.target.value })} />
          </div>

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
                  <TableCell>
                    <Input type="time" step={1} className="w-36" value={row.from_time}
                      onChange={(e) => setLocalHours(localHours.map((r) => r.weekday === row.weekday ? { ...r, from_time: e.target.value } : r))} />
                  </TableCell>
                  <TableCell>
                    <Input type="time" step={1} className="w-36" value={row.to_time}
                      onChange={(e) => setLocalHours(localHours.map((r) => r.weekday === row.weekday ? { ...r, to_time: e.target.value } : r))} />
                  </TableCell>
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

/**
 * TimeCamp's own equivalent (top bar "download apps" icon) just links to a
 * marketing page with built installers. This checks the repo's real GitHub
 * Releases for a packaged build and, when one exists, shows direct
 * one-click download buttons per OS (no GitHub browsing, no git clone).
 * Until a release exists, it says so plainly — it does not send a
 * non-technical employee to a terminal.
 */
interface GhReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}
interface GhRelease {
  tag_name: string;
  assets: GhReleaseAsset[];
}

function pickAsset(assets: GhReleaseAsset[], test: (name: string) => boolean) {
  return assets.find((a) => test(a.name.toLowerCase()));
}

function useLatestDesktopRelease() {
  return useQuery({
    queryKey: ['desktop-agent-latest-release'],
    queryFn: async (): Promise<GhRelease | null> => {
      const res = await fetch(
        'https://api.github.com/repos/King-Iyene/kd-ops-hub/releases/latest',
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      if (res.status === 404) return null; // no release published yet
      if (!res.ok) throw new Error(`GitHub releases: ${res.status}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

function GetDesktopAppButton() {
  const [open, setOpen] = useState(false);
  const { data: release, isLoading, isError } = useLatestDesktopRelease();

  const win = release ? pickAsset(release.assets, (n) => n.endsWith('.exe')) : undefined;
  const mac = release ? pickAsset(release.assets, (n) => n.endsWith('.dmg')) : undefined;
  const linux = release
    ? pickAsset(release.assets, (n) => n.endsWith('.appimage') || n.endsWith('.deb'))
    : undefined;
  const hasAnyInstaller = Boolean(win || mac || linux);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4 mr-1.5" /> Get desktop app
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>KD Ops Time Tracker (desktop agent)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {isLoading && (
              <p className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking for the latest build…
              </p>
            )}

            {!isLoading && hasAnyInstaller && (
              <>
                <p className="text-muted-foreground">
                  Version {release?.tag_name} — click your operating system to download the installer.
                </p>
                <div className="flex flex-col gap-2">
                  {win && (
                    <a href={win.browser_download_url}>
                      <Button className="w-full justify-start" size="sm">
                        <Download className="h-4 w-4 mr-2" /> Download for Windows (.exe)
                      </Button>
                    </a>
                  )}
                  {mac && (
                    <a href={mac.browser_download_url}>
                      <Button className="w-full justify-start" size="sm">
                        <Download className="h-4 w-4 mr-2" /> Download for macOS (.dmg)
                      </Button>
                    </a>
                  )}
                  {linux && (
                    <a href={linux.browser_download_url}>
                      <Button className="w-full justify-start" size="sm">
                        <Download className="h-4 w-4 mr-2" /> Download for Linux
                      </Button>
                    </a>
                  )}
                </div>
              </>
            )}

            {!isLoading && !hasAnyInstaller && (
              <p className="text-muted-foreground">
                {isError
                  ? "Couldn't check for a download right now — try again in a moment."
                  : 'No installer is published yet. Check back soon — this button will switch to a direct download automatically the moment one is released.'}
              </p>
            )}

            <p className="text-muted-foreground">
              An admin must also enable tracking for that employee first, under
              <span className="font-medium text-foreground"> Per-employee settings</span> above —
              the agent refuses to capture anything otherwise, even if it's running.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function useActivityDateRange() {
  const [start, setStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  return { start, end, setStart, setEnd };
}

function ActivityDateRangeBar({ start, end, setStart, setEnd }: {
  start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-3 mb-4">
      <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
      <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
    </div>
  );
}

/** Captures in range joined with each employee's capture interval, so raw tick counts can be
 * turned into estimated tracked hours (each tick represents roughly one interval of activity). */
function useLogsWithIntervals(start: string, end: string) {
  return useQuery({
    queryKey: ['timetrack', 'activity-logs-range', start, end],
    queryFn: async () => {
      const [{ data: logs, error: logsErr }, { data: settings, error: settingsErr }] = await Promise.all([
        supabase.from('time_activity_logs').select('employee_id, app_name, window_title, productivity_category, captured_at')
          .gte('captured_at', `${start}T00:00:00`).lt('captured_at', `${end}T23:59:59`)
          .order('captured_at', { ascending: false }).limit(20000),
        supabase.from('time_agent_settings').select('employee_id, capture_interval_minutes'),
      ]);
      if (logsErr) throw logsErr;
      if (settingsErr) throw settingsErr;
      const intervalByEmployee = new Map((settings ?? []).map((s) => [s.employee_id, s.capture_interval_minutes]));
      return { logs: (logs ?? []) as ActivityLog[], intervalByEmployee };
    },
  });
}

/** TimeCamp's "Sites and Apps" report. The agent currently captures the active window's app name
 * and title but not a browser's URL/domain, so a true per-site breakdown isn't possible yet —
 * this aggregates by app only and says so plainly rather than faking a domain split. */
function SitesAndAppsTab() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);

  const rows = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of data?.logs ?? []) {
      const app = l.app_name ?? 'Unknown';
      const intervalMin = data?.intervalByEmployee.get(l.employee_id) ?? 10;
      map.set(app, (map.get(app) ?? 0) + intervalMin / 60);
    }
    return [...map.entries()].map(([app, hours]) => ({ app, hours })).sort((a, b) => b.hours - a.hours);
  }, [data]);

  const exportCsv = () => {
    const csv = toCsv(['App', 'Estimated hours'], rows.map((r) => [r.app, r.hours.toFixed(2)]));
    downloadCsv(`timetrack-apps-${start}-to-${end}.csv`, csv);
  };

  return (
    <div className="space-y-3">
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      <p className="text-xs text-muted-foreground">
        Hours are estimated from capture ticks × each employee's capture interval — not a true duration.
        Browser site/domain breakdown isn't captured by the agent yet (it reads the active window's app
        and title only), so this groups by application, not by website.
      </p>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Table>
            <TableHeader><TableRow><TableHead>Application</TableHead><TableHead className="text-right">Estimated hours</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => <TableRow key={r.app}><TableCell>{r.app}</TableCell><TableCell className="text-right">{r.hours.toFixed(2)}</TableCell></TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

/** TimeCamp's "Efficiency" report — productive vs. neutral vs. unproductive share, per employee. */
function EfficiencyTab() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const { data: employees } = useActiveEmployees();

  const rows = useMemo(() => {
    const map = new Map<string, { productive: number; neutral: number; unproductive: number; uncategorized: number }>();
    for (const l of data?.logs ?? []) {
      const row = map.get(l.employee_id) ?? { productive: 0, neutral: 0, unproductive: 0, uncategorized: 0 };
      if (l.productivity_category === 'productive') row.productive++;
      else if (l.productivity_category === 'neutral') row.neutral++;
      else if (l.productivity_category === 'unproductive') row.unproductive++;
      else row.uncategorized++;
      map.set(l.employee_id, row);
    }
    return [...map.entries()].map(([employeeId, r]) => {
      const total = r.productive + r.neutral + r.unproductive + r.uncategorized;
      const efficiency = total > 0 ? (r.productive / total) * 100 : 0;
      return { employeeId, name: employees?.find((e) => e.id === employeeId)?.full_name ?? employeeId, ...r, total, efficiency };
    }).sort((a, b) => b.efficiency - a.efficiency);
  }, [data, employees]);

  return (
    <div className="space-y-3">
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Employee</TableHead><TableHead className="text-right">Productive</TableHead>
            <TableHead className="text-right">Neutral</TableHead><TableHead className="text-right">Unproductive</TableHead>
            <TableHead className="text-right">Captures</TableHead><TableHead className="text-right">Efficiency</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{r.productive}</TableCell>
                <TableCell className="text-right">{r.neutral}</TableCell>
                <TableCell className="text-right">{r.unproductive}</TableCell>
                <TableCell className="text-right">{r.total}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className={r.efficiency >= 60 ? CATEGORY_BADGE.productive : r.efficiency >= 30 ? CATEGORY_BADGE.neutral : CATEGORY_BADGE.unproductive}>
                    {r.efficiency.toFixed(0)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** TimeCamp's "User statistics" report — one summary row per employee. */
function UserStatisticsTab() {
  const { start, end, setStart, setEnd } = useActivityDateRange();
  const { data, isLoading } = useLogsWithIntervals(start, end);
  const { data: employees } = useActiveEmployees();

  const rows = useMemo(() => {
    const map = new Map<string, { captures: number; productive: number; hours: number; days: Set<string>; first: string; last: string }>();
    for (const l of data?.logs ?? []) {
      const row = map.get(l.employee_id) ?? { captures: 0, productive: 0, hours: 0, days: new Set<string>(), first: l.captured_at, last: l.captured_at };
      row.captures++;
      if (l.productivity_category === 'productive') row.productive++;
      row.hours += (data?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
      row.days.add(format(new Date(l.captured_at), 'yyyy-MM-dd'));
      if (l.captured_at < row.first) row.first = l.captured_at;
      if (l.captured_at > row.last) row.last = l.captured_at;
      map.set(l.employee_id, row);
    }
    return [...map.entries()].map(([employeeId, r]) => ({
      employeeId, name: employees?.find((e) => e.id === employeeId)?.full_name ?? employeeId,
      captures: r.captures, hours: r.hours, activeDays: r.days.size,
      productivePct: r.captures > 0 ? (r.productive / r.captures) * 100 : 0,
      first: r.first, last: r.last,
    })).sort((a, b) => b.hours - a.hours);
  }, [data, employees]);

  const exportCsv = () => {
    const csv = toCsv(['Employee', 'Captures', 'Est. hours', 'Active days', 'Productive %'], rows.map((r) => [
      r.name, String(r.captures), r.hours.toFixed(2), String(r.activeDays), r.productivePct.toFixed(0),
    ]));
    downloadCsv(`timetrack-user-statistics-${start}-to-${end}.csv`, csv);
  };

  return (
    <div className="space-y-3">
      <ActivityDateRangeBar start={start} end={end} setStart={setStart} setEnd={setEnd} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <>
          <div className="flex justify-end"><Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1.5" />Export CSV</Button></div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead className="text-right">Captures</TableHead>
              <TableHead className="text-right">Est. hours</TableHead><TableHead className="text-right">Active days</TableHead>
              <TableHead className="text-right">Productive %</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.employeeId}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{r.captures}</TableCell>
                  <TableCell className="text-right">{r.hours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.activeDays}</TableCell>
                  <TableCell className="text-right">{r.productivePct.toFixed(0)}%</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No activity captured in range.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

interface ScreenshotRow {
  id: string;
  employee_id: string;
  storage_path: string;
  captured_at: string;
}

/** TimeCamp's "Screenshots" report. Thumbnails are loaded lazily via short-lived signed URLs from
 * the private timetrack-screenshots bucket — never public, matching the RLS on time_screenshots. */
function ScreenshotsTab() {
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});

  const { data: rows, isLoading } = useQuery({
    queryKey: ['timetrack', 'screenshots', employeeId],
    queryFn: async () => {
      let q = supabase.from('time_screenshots').select('id, employee_id, storage_path, captured_at').order('captured_at', { ascending: false }).limit(60);
      if (employeeId) q = q.eq('employee_id', employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as ScreenshotRow[];
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = (rows ?? []).filter((r) => !urls[r.id]);
      if (pending.length === 0) return;
      const entries = await Promise.all(pending.map(async (r) => {
        const { data } = await supabase.storage.from('timetrack-screenshots').createSignedUrl(r.storage_path, 300);
        return [r.id, data?.signedUrl ?? ''] as const;
      }));
      if (!cancelled) setUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  return (
    <div className="space-y-3">
      <Select value={employeeId} onValueChange={setEmployeeId}>
        <SelectTrigger className="w-64"><SelectValue placeholder="All employees" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="">All employees</SelectItem>
          {(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
        </SelectContent>
      </Select>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="rounded-md border border-border/60 overflow-hidden">
              {urls[r.id] ? (
                <img src={urls[r.id]} alt="" className="w-full aspect-video object-cover bg-muted" loading="lazy" />
              ) : (
                <div className="w-full aspect-video bg-muted flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              )}
              <div className="p-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</span>
                <span>{format(new Date(r.captured_at), 'MMM d, HH:mm')}</span>
              </div>
            </div>
          ))}
          {(rows ?? []).length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-6">
              No screenshots yet — only captured when an employee has screenshots enabled in Per-employee settings.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
