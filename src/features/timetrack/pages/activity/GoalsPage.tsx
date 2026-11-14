import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek } from 'date-fns';
import { Loader2, Target, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useActiveEmployees } from '@/queries/useEmployees';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useLogsWithIntervals } from './shared';

interface Goal {
  id: string; employee_id: string; metric: 'productive_hours' | 'efficiency_pct'; period: 'daily' | 'weekly'; target_value: number;
}

/** TimeCamp's "Goals" — per-employee productivity targets, checked against capture data already collected
 * (no new capture needed: this reads time_activity_logs for the goal's current period). */
export default function GoalsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const today = format(new Date(), 'yyyy-MM-dd');
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  const { data: goals, isLoading } = useQuery({
    queryKey: ['timetrack', 'activity-goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_activity_goals').select('*');
      if (error) throw error;
      return data as Goal[];
    },
  });
  // Pull the whole current week once; daily goals filter it down to today client-side.
  const { data: logData } = useLogsWithIntervals(weekStart, today);

  const actualsByEmployee = useMemo(() => {
    const map = new Map<string, { dailyHours: number; dailyProductive: number; dailyTotal: number; weeklyHours: number; weeklyProductive: number; weeklyTotal: number }>();
    for (const l of logData?.logs ?? []) {
      const row = map.get(l.employee_id) ?? { dailyHours: 0, dailyProductive: 0, dailyTotal: 0, weeklyHours: 0, weeklyProductive: 0, weeklyTotal: 0 };
      const intervalHrs = (logData?.intervalByEmployee.get(l.employee_id) ?? 10) / 60;
      const isToday = l.captured_at.startsWith(today);
      const isProductive = l.productivity_category === 'productive';
      row.weeklyHours += intervalHrs; row.weeklyTotal++; if (isProductive) row.weeklyProductive++;
      if (isToday) { row.dailyHours += intervalHrs; row.dailyTotal++; if (isProductive) row.dailyProductive++; }
      map.set(l.employee_id, row);
    }
    return map;
  }, [logData, today]);

  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [metric, setMetric] = useState<Goal['metric']>('productive_hours');
  const [period, setPeriod] = useState<Goal['period']>('daily');
  const [targetValue, setTargetValue] = useState('6');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!employeeId) { toast({ title: 'Choose an employee', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('time_activity_goals').upsert(
        { employee_id: employeeId, metric, period, target_value: Number(targetValue) || 0 },
        { onConflict: 'employee_id,metric,period' },
      );
      if (error) throw error;
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['timetrack', 'activity-goals'] });
    } catch (err) {
      toast({ title: 'Could not save goal', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const { error } = await supabase.from('time_activity_goals').delete().eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'activity-goals'] });
    } catch (err) {
      toast({ title: 'Could not remove goal', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Goals" description="Productivity targets per employee, checked against this week's captures" icon={Target} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="space-y-3">
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New goal</Button>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead><TableHead>Metric</TableHead><TableHead>Period</TableHead>
              <TableHead>Target</TableHead><TableHead>Actual</TableHead><TableHead className="w-40">Progress</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {(goals ?? []).map((g) => {
                const name = employees?.find((e) => e.id === g.employee_id)?.full_name ?? g.employee_id;
                const a = actualsByEmployee.get(g.employee_id);
                let actual = 0;
                if (g.metric === 'productive_hours') actual = g.period === 'daily' ? (a?.dailyHours ?? 0) : (a?.weeklyHours ?? 0);
                else actual = g.period === 'daily' ? (a?.dailyTotal ? (a.dailyProductive / a.dailyTotal) * 100 : 0) : (a?.weeklyTotal ? (a.weeklyProductive / a.weeklyTotal) * 100 : 0);
                const pct = g.target_value > 0 ? Math.min(100, (actual / g.target_value) * 100) : 0;
                return (
                  <TableRow key={g.id}>
                    <TableCell>{name}</TableCell>
                    <TableCell>{g.metric === 'productive_hours' ? 'Productive hours' : 'Efficiency %'}</TableCell>
                    <TableCell className="capitalize">{g.period}</TableCell>
                    <TableCell>{g.target_value}{g.metric === 'efficiency_pct' ? '%' : 'h'}</TableCell>
                    <TableCell>{actual.toFixed(1)}{g.metric === 'efficiency_pct' ? '%' : 'h'}</TableCell>
                    <TableCell><Progress value={pct} /></TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => remove(g.id)}>Remove</Button></TableCell>
                  </TableRow>
                );
              })}
              {(goals ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No goals set yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New goal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                <SelectContent>{(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as Goal['metric'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="productive_hours">Productive hours</SelectItem>
                  <SelectItem value="efficiency_pct">Efficiency %</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Goal['period'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Target value</Label><Input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} /></div>
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
