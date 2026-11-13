import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Plus, Activity, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
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
      />
      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Activity log</TabsTrigger>
          <TabsTrigger value="settings">Per-employee settings</TabsTrigger>
          <TabsTrigger value="rules">Productivity rules</TabsTrigger>
        </TabsList>
        <TabsContent value="log" className="mt-4"><ActivityLogTab /></TabsContent>
        <TabsContent value="settings" className="mt-4"><AgentSettingsTab /></TabsContent>
        <TabsContent value="rules" className="mt-4"><RulesTab /></TabsContent>
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
