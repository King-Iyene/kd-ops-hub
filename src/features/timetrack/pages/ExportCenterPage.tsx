import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Download, Plus, Trash2, Send, FileDown } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type DataType = 'time_entries' | 'activity' | 'expenses';
type Frequency = 'daily' | 'weekly' | 'monthly';

interface ExportSchedule {
  id: string;
  name: string;
  data_type: DataType;
  lookback_days: number;
  frequency: Frequency;
  day_of_week: number | null;
  day_of_month: number | null;
  recipient_email: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string;
}

const DATA_TYPE_LABEL: Record<DataType, string> = {
  time_entries: 'Time entries',
  activity: 'Activity (computer tracking)',
  expenses: 'Expenses',
};
const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * TimeCamp's own Export Center: pick a data type, date range, and format,
 * plus an optional scheduled/recurring export. On-demand export runs
 * entirely client-side against the same RLS-scoped tables the rest of the
 * app already queries. Only CSV is supported today — honestly labeled, no
 * fake xlsx/PDF buttons. Recurring exports are handled server-side by the
 * timetrack-export-runner edge function (admin-only, since a schedule can
 * reach everyone's data, not just the admin's own).
 */
export default function ExportCenterPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [onDemand, setOnDemand] = useState({ data_type: 'time_entries' as DataType, days: '30' });
  const [exporting, setExporting] = useState(false);

  const runOnDemandExport = async () => {
    setExporting(true);
    try {
      const since = new Date(Date.now() - Number(onDemand.days || 30) * 86_400_000).toISOString();
      let header: string[];
      let rows: unknown[][];
      if (onDemand.data_type === 'time_entries') {
        const { data, error } = await supabase.from('time_entries')
          .select('employee_id, project_id, task_id, start_time, end_time, duration_minutes, is_billable, invoiced, notes')
          .gte('start_time', since).order('start_time', { ascending: false }).limit(20000);
        if (error) throw error;
        header = ['employee_id', 'project_id', 'task_id', 'start_time', 'end_time', 'duration_minutes', 'is_billable', 'invoiced', 'notes'];
        rows = (data ?? []).map((r) => [r.employee_id, r.project_id, r.task_id, r.start_time, r.end_time, r.duration_minutes, r.is_billable, r.invoiced, r.notes]);
      } else if (onDemand.data_type === 'activity') {
        const { data, error } = await supabase.from('time_activity_logs')
          .select('employee_id, app_name, window_title, url, productivity_category, is_outside_geofence, captured_at')
          .gte('captured_at', since).order('captured_at', { ascending: false }).limit(20000);
        if (error) throw error;
        header = ['employee_id', 'app_name', 'window_title', 'url', 'productivity_category', 'is_outside_geofence', 'captured_at'];
        rows = (data ?? []).map((r) => [r.employee_id, r.app_name, r.window_title, r.url, r.productivity_category, r.is_outside_geofence, r.captured_at]);
      } else {
        const { data, error } = await supabase.from('time_expenses')
          .select('employee_id, project_id, client_id, category_id, amount, currency, expense_date, is_billable, status, description')
          .gte('expense_date', since.slice(0, 10)).order('expense_date', { ascending: false }).limit(20000);
        if (error) throw error;
        header = ['employee_id', 'project_id', 'client_id', 'category_id', 'amount', 'currency', 'expense_date', 'is_billable', 'status', 'description'];
        rows = (data ?? []).map((r) => [r.employee_id, r.project_id, r.client_id, r.category_id, r.amount, r.currency, r.expense_date, r.is_billable, r.status, r.description]);
      }
      downloadCsv(`${onDemand.data_type}-export-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(header, rows));
    } catch (err) {
      toast({ title: 'Export failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['timetrack', 'export-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_export_schedules').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as ExportSchedule[];
    },
  });

  const [form, setForm] = useState({
    name: '', data_type: 'time_entries' as DataType, lookback_days: '7', frequency: 'weekly' as Frequency,
    day_of_week: '0', day_of_month: '1', recipient_email: '',
  });
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const addSchedule = async () => {
    if (!form.name.trim() || !form.recipient_email.trim()) {
      toast({ title: 'Enter a name and recipient email', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('time_export_schedules').insert({
        name: form.name.trim(),
        data_type: form.data_type,
        lookback_days: Number(form.lookback_days) || 7,
        frequency: form.frequency,
        day_of_week: form.frequency === 'weekly' ? Number(form.day_of_week) : null,
        day_of_month: form.frequency === 'monthly' ? Number(form.day_of_month) : null,
        recipient_email: form.recipient_email.trim(),
      });
      if (error) throw error;
      setForm({ name: '', data_type: 'time_entries', lookback_days: '7', frequency: 'weekly', day_of_week: '0', day_of_month: '1', recipient_email: '' });
      qc.invalidateQueries({ queryKey: ['timetrack', 'export-schedules'] });
      toast({ title: 'Scheduled export created' });
    } catch (err) {
      toast({ title: 'Could not create schedule', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (sched: ExportSchedule, isActive: boolean) => {
    try {
      const { error } = await supabase.from('time_export_schedules').update({ is_active: isActive }).eq('id', sched.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'export-schedules'] });
    } catch (err) {
      toast({ title: 'Could not update schedule', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const removeSchedule = async (sched: ExportSchedule) => {
    try {
      const { error } = await supabase.from('time_export_schedules').delete().eq('id', sched.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'export-schedules'] });
    } catch (err) {
      toast({ title: 'Could not remove schedule', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const sendNow = async (sched: ExportSchedule) => {
    setSendingId(sched.id);
    try {
      const { data, error } = await supabase.functions.invoke('timetrack-export-runner', { body: { schedule_id: sched.id } });
      if (error) throw error;
      const result = data?.results?.[sched.id];
      if (result && result.ok === false) throw new Error(result.error ?? 'Export runner reported a failure');
      toast({ title: 'Export sent', description: `Emailed to ${sched.recipient_email}` });
      qc.invalidateQueries({ queryKey: ['timetrack', 'export-schedules'] });
    } catch (err) {
      toast({ title: 'Could not send export', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Export Center" description="Download data on demand, or set up a recurring export emailed on a schedule" icon={FileDown} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">On-demand export</CardTitle>
          <CardDescription>Downloads straight to your browser — CSV only for now.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-3 items-end max-w-2xl">
            <div>
              <Label>Data type</Label>
              <Select value={onDemand.data_type} onValueChange={(v) => setOnDemand({ ...onDemand, data_type: v as DataType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DATA_TYPE_LABEL).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Last N days</Label><Input type="number" min={1} value={onDemand.days} onChange={(e) => setOnDemand({ ...onDemand, days: e.target.value })} /></div>
            <Button onClick={runOnDemandExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Download className="h-4 w-4 mr-1.5" />}
              Download CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled / recurring exports</CardTitle>
          <CardDescription>Runs server-side on the schedule below and emails a download link to the recipient (link expires after 7 days).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid sm:grid-cols-6 gap-3 items-end">
            <div className="sm:col-span-2"><Label>Name</Label><Input placeholder="Weekly time entries" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Data type</Label>
              <Select value={form.data_type} onValueChange={(v) => setForm({ ...form, data_type: v as DataType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(DATA_TYPE_LABEL).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Frequency</Label>
              <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v as Frequency })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.frequency === 'weekly' && (
              <div>
                <Label>Day</Label>
                <Select value={form.day_of_week} onValueChange={(v) => setForm({ ...form, day_of_week: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{WEEKDAY_LABELS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.frequency === 'monthly' && (
              <div><Label>Day of month</Label><Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm({ ...form, day_of_month: e.target.value })} /></div>
            )}
            <div><Label>Lookback (days)</Label><Input type="number" min={1} max={366} value={form.lookback_days} onChange={(e) => setForm({ ...form, lookback_days: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Recipient email</Label><Input type="email" value={form.recipient_email} onChange={(e) => setForm({ ...form, recipient_email: e.target.value })} /></div>
          </div>
          <Button onClick={addSchedule} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add schedule
          </Button>

          {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Data</TableHead><TableHead>Frequency</TableHead>
                <TableHead>Recipient</TableHead><TableHead>Next run</TableHead><TableHead>Active</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {(schedules ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{DATA_TYPE_LABEL[s.data_type]}</TableCell>
                    <TableCell>{s.frequency}</TableCell>
                    <TableCell className="text-muted-foreground">{s.recipient_email}</TableCell>
                    <TableCell>{new Date(s.next_run_at).toLocaleString()}</TableCell>
                    <TableCell><Switch checked={s.is_active} onCheckedChange={(v) => toggleActive(s, v)} /></TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => sendNow(s)} disabled={sendingId === s.id}>
                        {sendingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeSchedule(s)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(schedules ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No scheduled exports yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
