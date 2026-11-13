import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchActiveProjects } from '../lib/queries';
import type { TimeBillingRate, TimeProjectBillingRate } from '../lib/types';

export default function BillingRatesPage() {
  return (
    <Tabs defaultValue="global">
      <TabsList>
        <TabsTrigger value="global">Employee rates</TabsTrigger>
        <TabsTrigger value="project">Project overrides</TabsTrigger>
      </TabsList>
      <TabsContent value="global" className="mt-4"><GlobalRatesTab /></TabsContent>
      <TabsContent value="project" className="mt-4"><ProjectRatesTab /></TabsContent>
    </Tabs>
  );
}

function GlobalRatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [open, setOpen] = useState(false);
  const [revenueRate, setRevenueRate] = useState('');
  const [costRate, setCostRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  const { data: history, isLoading } = useQuery({
    queryKey: ['timetrack', 'billing-rates', selectedEmployee],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_billing_rates').select('*').eq('employee_id', selectedEmployee).order('effective_from', { ascending: false });
      if (error) throw error;
      return data as TimeBillingRate[];
    },
    enabled: !!selectedEmployee,
  });

  const save = async () => {
    if (!selectedEmployee || !revenueRate || !costRate) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('time_set_billing_rate', {
        p_employee_id: selectedEmployee, p_revenue_rate: Number(revenueRate), p_cost_rate: Number(costRate), p_effective_from: effectiveFrom,
      });
      if (error) throw error;
      setOpen(false); setRevenueRate(''); setCostRate('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'billing-rates', selectedEmployee] });
      toast({ title: 'Rate saved' });
    } catch (err) {
      toast({ title: 'Could not save rate', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select an employee" /></SelectTrigger>
          <SelectContent>{(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
        </Select>
        {selectedEmployee && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Set new rate</Button>}
      </div>

      {selectedEmployee && (isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Card><CardContent className="pt-4">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Effective from</TableHead><TableHead>Effective to</TableHead>
              <TableHead>Revenue rate/hr</TableHead><TableHead>Cost rate/hr</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(history ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.effective_from}</TableCell>
                  <TableCell>{r.effective_to ?? <span className="text-muted-foreground">current</span>}</TableCell>
                  <TableCell>{formatNaira(r.revenue_rate_per_hour)}</TableCell>
                  <TableCell>{formatNaira(r.cost_rate_per_hour)}</TableCell>
                </TableRow>
              ))}
              {(history ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No rate history — this employee can't be marked billable yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set new rate</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Effective from</Label><Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></div>
            <div><Label>Revenue rate / hour</Label><Input type="number" value={revenueRate} onChange={(e) => setRevenueRate(e.target.value)} /></div>
            <div><Label>Cost rate / hour</Label><Input type="number" value={costRate} onChange={(e) => setCostRate(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">This never overwrites history — it closes the current open-ended rate and adds a new one.</p>
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

function ProjectRatesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: projects } = useQuery({ queryKey: ['timetrack', 'projects'], queryFn: fetchActiveProjects });
  const { data: employees } = useActiveEmployees();
  const [projectId, setProjectId] = useState('');
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [revenueRate, setRevenueRate] = useState('');
  const [costRate, setCostRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  const { data: rates, isLoading } = useQuery({
    queryKey: ['timetrack', 'project-rates', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_project_billing_rates').select('*').eq('project_id', projectId).order('effective_from', { ascending: false });
      if (error) throw error;
      return data as TimeProjectBillingRate[];
    },
    enabled: !!projectId,
  });

  const save = async () => {
    if (!projectId || !revenueRate || !costRate) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('time_set_project_billing_rate', {
        p_project_id: projectId, p_employee_id: employeeId || null,
        p_revenue_rate: Number(revenueRate), p_cost_rate: Number(costRate), p_effective_from: effectiveFrom,
      });
      if (error) throw error;
      setOpen(false); setRevenueRate(''); setCostRate(''); setEmployeeId('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'project-rates', projectId] });
    } catch (err) {
      toast({ title: 'Could not save override', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select a project" /></SelectTrigger>
          <SelectContent>{(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        {projectId && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />New override</Button>}
      </div>

      {projectId && (isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Scope</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Revenue/hr</TableHead><TableHead>Cost/hr</TableHead></TableRow></TableHeader>
          <TableBody>
            {(rates ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.employee_id ? employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id : 'All employees on project'}</TableCell>
                <TableCell>{r.effective_from}</TableCell>
                <TableCell>{r.effective_to ?? 'current'}</TableCell>
                <TableCell>{formatNaira(r.revenue_rate_per_hour)}</TableCell>
                <TableCell>{formatNaira(r.cost_rate_per_hour)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project rate override</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee (leave blank to apply to all)</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="All employees" /></SelectTrigger>
                <SelectContent>{(employees ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Effective from</Label><Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></div>
            <div><Label>Revenue rate / hour</Label><Input type="number" value={revenueRate} onChange={(e) => setRevenueRate(e.target.value)} /></div>
            <div><Label>Cost rate / hour</Label><Input type="number" value={costRate} onChange={(e) => setCostRate(e.target.value)} /></div>
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
