import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, X, Unlock, CheckSquare } from 'lucide-react';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { useTimetrackCapabilities } from '../lib/capabilities';
import { useActiveEmployees } from '@/queries/useEmployees';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { TimeApproval } from '../lib/types';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
};

export default function ApprovalsPage() {
  const { has } = useTimetrackCapabilities();
  const { profile } = useAuthStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: employees } = useActiveEmployees();
  const canApprove = has('approve_timesheets');
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'admin';

  const { data: approvals, isLoading } = useQuery({
    queryKey: ['timetrack', 'approvals', canApprove ? 'all' : profile?.id],
    queryFn: async () => {
      let q = supabase.from('time_approvals').select('*').order('week_start_date', { ascending: false });
      if (!canApprove) q = q.eq('employee_id', profile!.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as TimeApproval[];
    },
    enabled: !!profile?.id,
  });

  const [decisionTarget, setDecisionTarget] = useState<{ approval: TimeApproval; decision: 'approved' | 'rejected' } | null>(null);
  const [comment, setComment] = useState('');
  const [unlockTarget, setUnlockTarget] = useState<TimeApproval | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    if (!decisionTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('time_decide_approval', {
        p_approval_id: decisionTarget.approval.id, p_decision: decisionTarget.decision, p_comment: comment || null,
      });
      if (error) throw error;
      setDecisionTarget(null); setComment('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'approvals'] });
    } catch (err) {
      toast({ title: 'Could not record decision', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const unlock = async () => {
    if (!unlockTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('time_admin_unlock_week', { p_approval_id: unlockTarget.id, p_reason: unlockReason });
      if (error) throw error;
      setUnlockTarget(null); setUnlockReason('');
      qc.invalidateQueries({ queryKey: ['timetrack', 'approvals'] });
      toast({ title: 'Week unlocked' });
    } catch (err) {
      toast({ title: 'Could not unlock', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const counts = {
    submitted: (approvals ?? []).filter((a) => a.status === 'submitted').length,
    approved: (approvals ?? []).filter((a) => a.status === 'approved').length,
    rejected: (approvals ?? []).filter((a) => a.status === 'rejected').length,
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader title="Timesheet Approvals" description="Submitted weeks awaiting a decision, and the history of what's been decided" icon={CheckSquare} />

      <div className="kd-stat-grid kd-stagger-in">
        <StatCard title="Awaiting approval" value={counts.submitted} tone={counts.submitted > 0 ? 'warning' : 'default'} />
        <StatCard title="Approved" value={counts.approved} tone="success" />
        <StatCard title="Rejected" value={counts.rejected} tone={counts.rejected > 0 ? 'danger' : 'default'} />
      </div>

      <Table>
        <TableHeader><TableRow>
          <TableHead>Employee</TableHead><TableHead>Week of</TableHead><TableHead>Total hrs</TableHead>
          <TableHead>Billable hrs</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {(approvals ?? []).map((a) => (
            <TableRow key={a.id}>
              <TableCell>{employees?.find((e) => e.id === a.employee_id)?.full_name ?? a.employee_id}</TableCell>
              <TableCell>{a.week_start_date}</TableCell>
              <TableCell>{a.total_hours.toFixed(2)}</TableCell>
              <TableCell>{a.billable_hours.toFixed(2)}</TableCell>
              <TableCell><Badge variant="outline" className={STATUS_BADGE[a.status]}>{a.status}</Badge></TableCell>
              <TableCell className="text-right space-x-1">
                {canApprove && a.status === 'submitted' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setDecisionTarget({ approval: a, decision: 'approved' })}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setDecisionTarget({ approval: a, decision: 'rejected' })}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                  </>
                )}
                {isAdmin && a.status === 'approved' && (
                  <Button size="sm" variant="ghost" onClick={() => setUnlockTarget(a)}><Unlock className="h-3.5 w-3.5 mr-1" />Unlock</Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {(approvals ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No submitted weeks yet.</TableCell></TableRow>}
        </TableBody>
      </Table>

      <Dialog open={!!decisionTarget} onOpenChange={(v) => !v && setDecisionTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{decisionTarget?.decision === 'approved' ? 'Approve' : 'Reject'} week</DialogTitle></DialogHeader>
          <Textarea placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecisionTarget(null)}>Cancel</Button>
            <Button onClick={decide} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!unlockTarget} onOpenChange={(v) => !v && setUnlockTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Unlock approved week</DialogTitle></DialogHeader>
          <Textarea placeholder="Reason (required, min 5 characters)" value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUnlockTarget(null)}>Cancel</Button>
            <Button onClick={unlock} disabled={busy || unlockReason.trim().length < 5}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}Unlock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
