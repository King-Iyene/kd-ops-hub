import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Check, X, Palmtree, Settings2, Archive } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TimeLeaveRequest, TimeLeaveType } from '../lib/types';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function LeavePage() {
  const { profile } = useAuthStore();
  const { has } = useTimetrackCapabilities();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const canApprove = has('approve_leave');
  const canManageTypes = has('manage_leave_types');
  const [typesOpen, setTypesOpen] = useState(false);

  const { data: leaveTypes } = useQuery({
    queryKey: ['timetrack', 'leave-types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_leave_types').select('*').eq('is_archived', false);
      if (error) throw error;
      return data as TimeLeaveType[];
    },
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ['timetrack', 'leave-requests', canApprove],
    queryFn: async () => {
      let q = supabase.from('time_leave_requests').select('*').order('requested_at', { ascending: false });
      if (!canApprove) q = q.eq('employee_id', profile!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as TimeLeaveRequest[];
    },
    enabled: !!profile?.id,
  });

  const [open, setOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!leaveTypeId || !startDate || !endDate) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_leave_requests').insert({
        employee_id: profile!.id, leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate,
      });
      if (error) throw error;
      setOpen(false); setLeaveTypeId(''); setStartDate(''); setEndDate('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'leave-requests'] });
    } catch (err) {
      toast({ title: 'Could not submit request', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase.rpc('time_decide_leave_request', { p_request_id: id, p_decision: decision });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'leave-requests'] });
    } catch (err) {
      toast({ title: 'Could not record decision', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const cancelOwn = async (id: string) => {
    try {
      const { error } = await supabase.from('time_leave_requests').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['timetrack', 'leave-requests'] });
      toast({ title: 'Request cancelled' });
    } catch (err) {
      toast({ title: 'Could not cancel request', description: errorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const pendingCount = (requests ?? []).filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        title="Leave"
        description="Request time off, or review and decide requests awaiting approval"
        icon={Palmtree}
        actions={
          <div className="flex gap-2">
            {canManageTypes && <Button variant="outline" onClick={() => setTypesOpen(true)}><Settings2 className="h-4 w-4 mr-1.5" />Manage leave types</Button>}
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Request leave</Button>
          </div>
        }
      />
      {canApprove && (
        <div className="kd-stat-grid kd-stagger-in">
          <StatCard title="Pending" value={pendingCount} tone={pendingCount > 0 ? 'warning' : 'default'} />
          <StatCard title="Approved" value={(requests ?? []).filter((r) => r.status === 'approved').length} tone="success" />
          <StatCard title="Rejected" value={(requests ?? []).filter((r) => r.status === 'rejected').length} tone="danger" />
        </div>
      )}
      <Table>
        <TableHeader><TableRow>
          {canApprove && <TableHead>Employee</TableHead>}
          <TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(requests ?? []).map((r) => (
            <TableRow key={r.id}>
              {canApprove && <TableCell>{employees?.find((e) => e.id === r.employee_id)?.full_name ?? r.employee_id}</TableCell>}
              <TableCell>{leaveTypes?.find((t) => t.id === r.leave_type_id)?.name ?? '—'}</TableCell>
              <TableCell>{r.start_date} – {r.end_date}</TableCell>
              <TableCell><Badge variant="outline" className={STATUS_BADGE[r.status]}>{r.status}</Badge></TableCell>
              <TableCell className="text-right space-x-1">
                {canApprove && r.status === 'pending' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => decide(r.id, 'approved')}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => decide(r.id, 'rejected')}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>
                )}
                {r.employee_id === profile?.id && r.status === 'pending' && (
                  <Button size="sm" variant="ghost" onClick={() => cancelOwn(r.id)}>Cancel</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {(requests ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No leave requests.</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request leave</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{(leaveTypes ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label>End</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManageTypes && (
        <Dialog open={typesOpen} onOpenChange={setTypesOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Manage leave types</DialogTitle></DialogHeader>
            <LeaveTypesManager />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function LeaveTypesManager() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: allTypes, isLoading } = useQuery({
    queryKey: ['timetrack', 'leave-types-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('time_leave_types').select('*').order('is_archived').order('name');
      if (error) throw error;
      return data as TimeLeaveType[];
    },
  });
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['timetrack', 'leave-types-all'] });
    qc.invalidateQueries({ queryKey: ['timetrack', 'leave-types'] });
  };

  const update = async (id: string, patch: Partial<TimeLeaveType>) => {
    try {
      const { error } = await supabase.from('time_leave_types').update(patch).eq('id', id);
      if (error) throw error;
      refresh();
    } catch (err) {
      toast({ title: 'Could not update leave type', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('time_leave_types').insert({ name: newName.trim() });
      if (error) throw error;
      setNewName('');
      refresh();
    } catch (err) {
      toast({ title: 'Could not create leave type', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Name</TableHead><TableHead>Requires approval</TableHead><TableHead>Paid</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(allTypes ?? []).map((t) => (
            <TableRow key={t.id} className={t.is_archived ? 'opacity-50' : ''}>
              <TableCell>{t.name}</TableCell>
              <TableCell><Switch checked={t.requires_approval} disabled={t.is_archived} onCheckedChange={(v) => update(t.id, { requires_approval: v })} /></TableCell>
              <TableCell><Switch checked={t.is_paid} disabled={t.is_archived} onCheckedChange={(v) => update(t.id, { is_paid: v })} /></TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => update(t.id, { is_archived: !t.is_archived })}>
                  <Archive className="h-3.5 w-3.5 mr-1" />{t.is_archived ? 'Restore' : 'Archive'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-end gap-2">
        <div className="flex-1"><Label>New leave type</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Bereavement" /></div>
        <Button onClick={create} disabled={saving || !newName.trim()}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Add</Button>
      </div>
    </div>
  );
}
