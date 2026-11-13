import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Delete, LogIn, LogOut, MonitorSmartphone } from 'lucide-react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export default function KioskPage() {
  const { has, loading } = useTimetrackCapabilities();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const press = (k: string) => {
    if (k === '') return;
    if (k === 'del') { setPin((p) => p.slice(0, -1)); return; }
    if (pin.length < 6) setPin((p) => p + k);
  };

  const clock = async (action: 'in' | 'out') => {
    if (!employeeId || pin.length < 4) {
      toast({ title: 'Select an employee and enter their PIN', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('time_kiosk_clock', { p_employee_id: employeeId, p_pin: pin, p_action: action });
      if (error) throw error;
      toast({ title: action === 'in' ? 'Clocked in' : 'Clocked out' });
      setPin('');
      setEmployeeId('');
    } catch (err) {
      toast({ title: 'Could not clock ' + action, description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  if (!has('track_time_for_others')) {
    return (
      <div className="space-y-3 sm:space-y-6">
        <PageHeader title="Kiosk Clock-In" description="Shared-device clock-in for employees without their own login session" icon={MonitorSmartphone} />
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          This device's account isn't authorized for kiosk clock-in. Ask an admin to grant "Track time for others"
          to whichever account is signed in here (Time Tracking → Roles).
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Kiosk Clock-In" description="Pick your name, enter your PIN, and clock in or out" icon={MonitorSmartphone} />
      <Card className="max-w-sm mx-auto">
        <CardContent className="pt-6 space-y-4">
          <Select value={employeeId} onValueChange={(v) => { setEmployeeId(v); setPin(''); }}>
            <SelectTrigger><SelectValue placeholder="Who are you?" /></SelectTrigger>
            <SelectContent>{(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>

          <div className="text-center text-2xl font-mono tracking-[0.5em] py-2 border-b border-border/60">
            {pin.replace(/./g, '•') || '— — — —'}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k, i) => (
              <Button
                key={i}
                variant="outline"
                className="h-14 text-lg"
                disabled={k === ''}
                onClick={() => press(k)}
              >
                {k === 'del' ? <Delete className="h-5 w-5" /> : k}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="outline" disabled={busy} onClick={() => clock('in')}><LogIn className="h-4 w-4 mr-1.5" />Clock in</Button>
            <Button variant="destructive" disabled={busy} onClick={() => clock('out')}><LogOut className="h-4 w-4 mr-1.5" />Clock out</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
