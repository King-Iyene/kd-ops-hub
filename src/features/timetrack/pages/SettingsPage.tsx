import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Settings as SettingsIcon, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface RoundingSettings {
  round_to_minutes: number;
  round_direction: 'nearest' | 'up' | 'down';
  is_enabled: boolean;
}
interface IdleSettings {
  idle_threshold_minutes: number;
  is_enabled: boolean;
}

export default function TimeSettingsPage() {
  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Time Settings" description="Rounding rules, idle-time threshold, and kiosk device PINs" icon={SettingsIcon} />
      <RoundingCard />
      <IdleCard />
      <KioskPinsCard />
    </div>
  );
}

function RoundingCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['timetrack', 'rounding-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_rounding_settings').select('*').eq('id', true).single();
      if (error) throw error;
      return data as RoundingSettings;
    },
  });
  const [local, setLocal] = useState<RoundingSettings | null>(null);
  useEffect(() => { if (data) setLocal(data); }, [data]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!local) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_rounding_settings').update(local).eq('id', true);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'rounding-settings'] });
      toast({ title: 'Rounding settings saved' });
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !local) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Time rounding</CardTitle>
        <CardDescription>Applied server-side when an entry is saved — consistent no matter how the entry was created. Off by default.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch checked={local.is_enabled} onCheckedChange={(v) => setLocal({ ...local, is_enabled: v })} />
          <Label>Enable rounding</Label>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <Label>Round to nearest</Label>
            <Select value={String(local.round_to_minutes)} onValueChange={(v) => setLocal({ ...local, round_to_minutes: Number(v) })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 30, 60].map((m) => <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Direction</Label>
            <Select value={local.round_direction} onValueChange={(v) => setLocal({ ...local, round_direction: v as RoundingSettings['round_direction'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nearest">Nearest</SelectItem>
                <SelectItem value="up">Always up</SelectItem>
                <SelectItem value="down">Always down</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
      </CardContent>
    </Card>
  );
}

function IdleCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery({
    queryKey: ['timetrack', 'idle-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_idle_settings').select('*').eq('id', true).single();
      if (error) throw error;
      return data as IdleSettings;
    },
  });
  const [local, setLocal] = useState<IdleSettings | null>(null);
  useEffect(() => { if (data) setLocal(data); }, [data]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!local) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_idle_settings').update(local).eq('id', true);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'idle-settings'] });
      qc.invalidateQueries({ queryKey: ['timetrack', 'idle-settings-public'] });
      toast({ title: 'Idle settings saved' });
    } catch (err) {
      toast({ title: 'Could not save', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !local) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Idle-time popup</CardTitle>
        <CardDescription>While a timer is running, a "still working?" popup appears after this many minutes of no mouse/keyboard activity — no native agent needed.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch checked={local.is_enabled} onCheckedChange={(v) => setLocal({ ...local, is_enabled: v })} />
          <Label>Enable idle popup</Label>
        </div>
        <div className="max-w-xs">
          <Label>Idle threshold (minutes)</Label>
          <Input type="number" min={1} value={local.idle_threshold_minutes}
            onChange={(e) => setLocal({ ...local, idle_threshold_minutes: Number(e.target.value) || 1 })} />
        </div>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Save</Button>
      </CardContent>
    </Card>
  );
}

function KioskPinsCard() {
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  const setKioskPin = async () => {
    if (!employeeId || !/^[0-9]{4,6}$/.test(pin)) {
      toast({ title: 'Pick an employee and a 4-6 digit PIN', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('time_set_kiosk_pin', { p_employee_id: employeeId, p_pin: pin });
      if (error) throw error;
      setPin('');
      toast({ title: 'Kiosk PIN set' });
    } catch (err) {
      toast({ title: 'Could not set PIN', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" />Kiosk PINs</CardTitle>
        <CardDescription>
          Set a 4-6 digit PIN per employee for shared-device clock-in. The device itself still needs
          to be logged in as an account granted the "Track time for others" capability — a PIN alone
          is never enough.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>New PIN</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>{(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input className="w-28" maxLength={6} placeholder="1234" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
              </TableCell>
              <TableCell>
                <Button size="sm" onClick={setKioskPin} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Set PIN</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
