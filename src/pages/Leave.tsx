import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  CalendarDays,
  Loader2,
  Check,
  X,
  Plane,
  Stethoscope,
  Clock,
  Info,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { usePermission } from '@/hooks/usePermission';
import { burst } from '@/components/Burst';
import { logAudit } from '@/lib/audit';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { notifyUser, notifyRoles } from '@/lib/notify';
import { notifyRequestApproved, notifyRequestRejected } from '@/lib/notify-events';
import { useApprovalStore } from '@/store/approvalStore';
import { MANAGER_ROLES, hasRole } from '@/lib/roles';
import { formatDate, toIsoDate } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow, MobileCardFooter } from '@/components/ui-kit/MobileCard';
import { StatCard } from '@/components/ui-kit/StatCard';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { usePagination } from '@/hooks/usePagination';
import { usePageTitle } from '@/hooks/usePageTitle';

type LeaveType = 'annual' | 'sick' | 'unpaid';
type LeaveStatus = 'pending' | 'approved' | 'rejected';

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
  status: LeaveStatus;
  created_at: string;
  rejection_reason: string | null;
}

interface LeaveBalance {
  employee_id: string;
  year: number;
  annual_quota: number;
  annual_used: number;
  sick_used: number;
  unpaid_used: number;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

const LEAVE_TYPES: { value: LeaveType; label: string; icon: typeof Plane }[] = [
  { value: 'annual', label: 'Annual', icon: Plane },
  { value: 'sick', label: 'Sick', icon: Stethoscope },
  { value: 'unpaid', label: 'Unpaid', icon: Clock },
];

const TYPE_BADGE: Record<LeaveType, string> = {
  annual: 'bg-info/10 text-info',
  sick: 'bg-destructive/10 text-destructive',
  unpaid: 'bg-muted text-muted-foreground',
};


const calcDays = (start: string, end: string): number => {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  return diff < 0 ? 0 : diff + 1;
};

const TabCount = ({ n }: { n: number }) => (
  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
    {n}
  </span>
);

const Leave = () => {
  usePageTitle('Leave');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const refreshApprovals = useApprovalStore((s) => s.refresh);
  const isManager =
    profile?.role === 'super_admin' ||
    profile?.role === 'admin';
  const canApprovePerm = usePermission('leave.approve');

  const [tab, setTab] = useState<'mine' | 'team'>(isManager ? 'team' : 'mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRequests, setMyRequests] = useState<LeaveRequest[]>([]);
  const [teamRequests, setTeamRequests] = useState<LeaveRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('pending');

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    leave_type: 'annual' as LeaveType,
    start_date: toIsoDate(new Date()),
    end_date: toIsoDate(new Date()),
    reason: '',
  });

  const [showReject, setShowReject] = useState<LeaveRequest | null>(null);
  const [pendingRevert, setPendingRevert] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmDeleteLeave, setConfirmDeleteLeave] = useState<LeaveRequest | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Read role fresh from the store so we never use a stale closure value.
      const currentProfile = useAuthStore.getState().profile;
      const currentId = currentProfile?.id || '';
      const privileged =
        currentProfile?.role === 'super_admin' ||
        currentProfile?.role === 'admin';

      // My Leave — always scoped to this user.
      const myQuery = supabase
        .from('leave_requests')
        .select('*')
        .eq('employee_id', currentId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      // Team Leave — all rows for privileged roles; empty for everyone else.
      const teamQuery = privileged
        ? supabase
            .from('leave_requests')
            .select('*')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] as LeaveRequest[], error: null });

      const [myRes, teamRes, profilesRes, balanceRes] = await Promise.all([
        myQuery,
        teamQuery,
        supabase.from('profiles').select('id, full_name, email, phone').neq('is_anonymised', true).limit(500),
        supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', currentId)
          .eq('year', new Date().getFullYear())
          .maybeSingle(),
      ]);
      if (myRes.error) throw myRes.error;
      if (teamRes.error) throw teamRes.error;

      setMyRequests((myRes.data as LeaveRequest[]) || []);
      setTeamRequests((teamRes.data as LeaveRequest[]) || []);
      const map = new Map<string, ProfileRow>();
      for (const p of (profilesRes.data || []) as ProfileRow[]) {
        map.set(p.id, p);
      }
      setProfiles(map);
      setBalance((balanceRes.data as LeaveBalance) || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load leave requests.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile?.id) fetchAll();
  }, [fetchAll, profile?.id]);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchAll);

  // Bootstrap a balance row for the current employee/year if missing.
  useEffect(() => {
    if (!profile?.id || balance || loading) return;
    supabase
      .from('leave_balances')
      .upsert(
        {
          employee_id: profile.id,
          year: new Date().getFullYear(),
        },
        { onConflict: 'employee_id,year' },
      )
      .then(({ error }) => {
        if (!error) fetchAll();
      });
  }, [profile?.id, balance, loading, fetchAll]);

  // -- Submit ---------------------------------------------------------------

  const submitRequest = async () => {
    const days = calcDays(form.start_date, form.end_date);
    if (days <= 0) {
      toast({ title: 'End date must be on/after start date', variant: 'destructive' });
      return;
    }
    if (!form.reason.trim()) {
      toast({ title: 'Reason is required', description: 'Please enter a reason for your leave request.', variant: 'destructive' });
      return;
    }
    if (
      form.leave_type === 'annual' &&
      balance &&
      balance.annual_used + days > balance.annual_quota
    ) {
      toast({
        title: 'Not enough annual leave',
        description: `You have ${Math.max(0, balance.annual_quota - balance.annual_used)} days left.`,
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('leave_requests').insert({
        employee_id: profile?.id || '',
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        days_requested: days,
        reason: form.reason || null,
      });
      if (error) throw error;
      await logAudit(
        'leave_requested',
        `Leave requested: ${form.leave_type} ${formatDate(form.start_date)} → ${formatDate(form.end_date)} (${days} day${days === 1 ? '' : 's'})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'operations'],
        type: 'leave_requested',
        module: 'leave',
        title: 'Leave request submitted',
        body: `${form.leave_type} · ${formatDate(form.start_date)} → ${formatDate(form.end_date)} (${days} day${days === 1 ? '' : 's'})`,
      });
      toast({ title: 'Leave request submitted' });
      setShowForm(false);
      setForm({
        leave_type: 'annual',
        start_date: toIsoDate(new Date()),
        end_date: toIsoDate(new Date()),
        reason: '',
      });
      fetchAll();
      refreshApprovals();
    } catch (err: any) {
      toast({
        title: 'Submit failed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // -- Approve / reject -----------------------------------------------------

  const updateBalanceFor = async (req: LeaveRequest) => {
    // Increment the relevant counter for the requesting employee in the year
    // their leave starts.
    const year = new Date(req.start_date).getFullYear();
    const { data: existing } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', req.employee_id)
      .eq('year', year)
      .maybeSingle();
    const base = (existing as LeaveBalance) || {
      employee_id: req.employee_id,
      year,
      // Nigerian Labour Act minimum: 6 working days for under 1 year of
      // service. 12 is the conservative default — finance can raise it per
      // employee. (Previously hard-coded to 21 which is rich by local norms.)
      annual_quota: 12,
      annual_used: 0,
      sick_used: 0,
      unpaid_used: 0,
    };
    const updates = { ...base };
    if (req.leave_type === 'annual') updates.annual_used += req.days_requested;
    if (req.leave_type === 'sick') updates.sick_used += req.days_requested;
    if (req.leave_type === 'unpaid') updates.unpaid_used += req.days_requested;
    await supabase
      .from('leave_balances')
      .upsert(updates, { onConflict: 'employee_id,year' });
  };

  /**
   * Reverse an approval: set the request back to pending and decrement the
   * employee's used-days counter. Used when a manager approved by mistake or
   * the leave was withdrawn after approval.
   */
  const revertApproval = async (req: LeaveRequest) => {
    if (!isManager) {
      toast({ title: 'Not authorized', variant: 'destructive' });
      return;
    }
    setPendingRevert(null);
    setActioning(req.id);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'pending', reviewed_by: null })
        .eq('id', req.id);
      if (error) throw error;

      // Restore the days back into the balance
      const year = new Date(req.start_date).getFullYear();
      const { data: existing } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('employee_id', req.employee_id)
        .eq('year', year)
        .maybeSingle();
      if (existing) {
        const updates = { ...(existing as LeaveBalance) };
        if (req.leave_type === 'annual') updates.annual_used = Math.max(0, updates.annual_used - req.days_requested);
        if (req.leave_type === 'sick') updates.sick_used = Math.max(0, updates.sick_used - req.days_requested);
        if (req.leave_type === 'unpaid') updates.unpaid_used = Math.max(0, updates.unpaid_used - req.days_requested);
        await supabase
          .from('leave_balances')
          .upsert(updates, { onConflict: 'employee_id,year' });
      }

      await logAudit(
        'leave_reverted',
        `Leave approval reverted for ${profiles.get(req.employee_id)?.full_name || req.employee_id} (${req.days_requested} days)`,
        profile,
      );
      await notifyUser({
        userId: req.employee_id,
        type: 'leave_reverted',
        module: 'leave',
        title: 'Leave approval reverted',
        body: `Your ${req.leave_type} leave (${req.days_requested} day${req.days_requested === 1 ? '' : 's'}) is back to pending. Contact your manager.`,
      });
      toast({ title: 'Approval reverted' });
      fetchAll();
      refreshApprovals();
    } catch (err: any) {
      toast({ title: 'Could not revert', description: err?.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const approve = async (req: LeaveRequest) => {
    if (!isManager) {
      toast({ title: 'Not authorized', variant: 'destructive' });
      return;
    }
    // Re-check the balance at APPROVAL time, not just at submission. Without
    // this, an employee can stack several pending annual-leave requests that
    // each pass the submit-time check, then a manager approves them all and
    // pushes annual_used past the quota. Annual is the only quota-capped type.
    if (req.leave_type === 'annual') {
      const year = new Date(req.start_date).getFullYear();
      const { data: bal } = await supabase
        .from('leave_balances')
        .select('annual_quota, annual_used')
        .eq('employee_id', req.employee_id)
        .eq('year', year)
        .maybeSingle();
      const quota = (bal as any)?.annual_quota ?? 12;
      const used = (bal as any)?.annual_used ?? 0;
      if (used + req.days_requested > quota) {
        toast({
          title: 'Would exceed leave balance',
          description: `This request is ${req.days_requested} day${req.days_requested === 1 ? '' : 's'}, but only ${Math.max(0, quota - used)} remain this year. Reject it or adjust the employee's quota first.`,
          variant: 'destructive',
        });
        return;
      }
    }
    setActioning(req.id);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'approved', reviewed_by: profile?.id })
        .eq('id', req.id);
      if (error) throw error;
      await updateBalanceFor(req);
      await logAudit(
        'leave_approved',
        `Leave approved for ${profiles.get(req.employee_id)?.full_name || req.employee_id} (${req.days_requested} days)`,
        profile,
      );
      await notifyUser({
        userId: req.employee_id,
        type: 'leave_approved',
        module: 'leave',
        title: 'Your leave request was approved',
        body: `${req.leave_type} · ${req.days_requested} day${req.days_requested === 1 ? '' : 's'}`,
      });
      // Best-effort SMS — never blocks if Termii key is missing or phone is null.
      try {
        const phone = profiles.get(req.employee_id)?.phone;
        if (phone) {
          await supabase.functions.invoke('send-email', {
            body: {
              channel: 'sms',
              to: phone.replace(/^\+/, ''),
              message: `Your ${req.leave_type} leave request (${req.days_requested} day${req.days_requested === 1 ? '' : 's'}) has been approved. – KDOps`,
            },
          });
        }
      } catch { /* SMS is best-effort */ }
      // Best-effort templated email to the requester.
      const requesterProfile = profiles.get(req.employee_id);
      void notifyRequestApproved({
        requesterEmail: requesterProfile?.email ?? null,
        requesterName: requesterProfile?.full_name || 'there',
        kind: `${req.leave_type} leave`,
        summary: `${req.days_requested} day${req.days_requested === 1 ? '' : 's'} · ${req.start_date} → ${req.end_date}`,
        approverName: profile?.full_name || 'Manager',
        link: `${window.location.origin}/leave`,
      });
      burst({ palette: 'success', count: 50 });
      toast({ title: 'Leave approved' });
      fetchAll();
      refreshApprovals();
    } catch (err: any) {
      toast({ title: 'Approval failed', description: err?.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const reject = async () => {
    if (!showReject) return;
    if (!isManager) return;
    if (!isValidRejectionReason(rejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    setActioning(showReject.id);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'rejected',
          reviewed_by: profile?.id,
          rejection_reason: rejectReason.trim(),
        })
        .eq('id', showReject.id);
      if (error) throw error;
      await writeRejectionNotification({
        entity: 'leave',
        entityLabel: 'leave request',
        reason: rejectReason.trim(),
        submitterId: showReject.employee_id,
        actor: profile,
        auditType: 'leave_rejected',
        auditDescription: `Leave rejected for ${profiles.get(showReject.employee_id)?.full_name || showReject.employee_id}: ${rejectReason.trim()}`,
      });
      // Best-effort SMS — never blocks if Termii key is missing or phone is null.
      try {
        const phone = profiles.get(showReject.employee_id)?.phone;
        if (phone) {
          await supabase.functions.invoke('send-email', {
            body: {
              channel: 'sms',
              to: phone.replace(/^\+/, ''),
              message: `Your leave request has been rejected. Reason: ${rejectReason.trim()}. – KDOps`,
            },
          });
        }
      } catch { /* SMS is best-effort */ }
      // Best-effort templated email to the requester.
      const rejProfile = profiles.get(showReject.employee_id);
      void notifyRequestRejected({
        requesterEmail: rejProfile?.email ?? null,
        requesterName: rejProfile?.full_name || 'there',
        kind: `${showReject.leave_type} leave`,
        summary: `${showReject.days_requested} day${showReject.days_requested === 1 ? '' : 's'} · ${showReject.start_date} → ${showReject.end_date}`,
        approverName: profile?.full_name || 'Manager',
        reason: rejectReason.trim(),
        link: `${window.location.origin}/leave`,
      });
      toast({ title: 'Leave rejected' });
      setShowReject(null);
      setRejectReason('');
      fetchAll();
      refreshApprovals();
    } catch (err: any) {
      toast({ title: 'Reject failed', description: err?.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const cancel = async (req: LeaveRequest) => {
    setActioning(req.id);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status: 'cancelled' })
        .eq('id', req.id);
      if (error) throw error;
      await logAudit('leave_cancelled', `Leave request cancelled (${req.days_requested} days)`, profile);
      toast({ title: 'Request cancelled' });
      fetchAll();
      refreshApprovals();
    } catch (err: any) {
      toast({ title: 'Cancel failed', description: err?.message, variant: 'destructive' });
    } finally {
      setActioning(null);
    }
  };

  const deleteLeaveRequest = async (req: LeaveRequest) => {
    const { error } = await supabase
      .from('leave_requests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    const empName = profiles.get(req.employee_id)?.full_name || req.employee_id;
    await logAudit('leave_deleted', `Leave request for ${empName} deleted (${req.days_requested} days)`, profile);
    toast({ title: 'Leave request deleted' });
    setConfirmDeleteLeave(null);
    fetchAll();
    refreshApprovals();
  };

  // -- Filter / paginate ----------------------------------------------------

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scope = tab === 'mine' ? myRequests : teamRequests;
    return scope.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      const empName = profiles.get(r.employee_id)?.full_name || '';
      return (
        empName.toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        r.leave_type.toLowerCase().includes(q)
      );
    });
  }, [myRequests, teamRequests, search, statusFilter, tab, profiles]);

  const pagination = usePagination(visible, 20);

  const statusCounts = useMemo(() => {
    const scope = tab === 'mine' ? myRequests : teamRequests;
    return {
      all: scope.length,
      pending: scope.filter((r) => r.status === 'pending').length,
      approved: scope.filter((r) => r.status === 'approved').length,
      rejected: scope.filter((r) => r.status === 'rejected').length,
    };
  }, [tab, myRequests, teamRequests]);

  // -- Render ---------------------------------------------------------------

  const annualLeft = balance
    ? Math.max(0, balance.annual_quota - balance.annual_used)
    : 12;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Leave</h1>
            <InfoHint>Request and manage employee time off. Tracks annual, sick and other leave types with manager approval workflows and live balance calculations.</InfoHint>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Submit time off and review your team's leave requests.</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            type="button"
            onClick={manualRefresh}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" /> {lastUpdatedLabel}
          </button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Request Leave
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Annual Leave Left"
          value={`${annualLeft} days`}
          subtitle={`${balance?.annual_used || 0} of ${balance?.annual_quota || 21} used`}
          icon={Plane}
          tone="primary"
        />
        <StatCard
          title="Sick Days Taken"
          value={`${balance?.sick_used || 0} days`}
          subtitle="This year"
          icon={Stethoscope}
          tone="danger"
        />
        <StatCard
          title="Unpaid Days"
          value={`${balance?.unpaid_used || 0} days`}
          subtitle="This year"
          icon={Clock}
          tone="warning"
        />
        <StatCard
          title="Pending Requests"
          value={(isManager ? teamRequests : myRequests).filter((r) => r.status === 'pending').length}
          subtitle={isManager ? 'Across team' : 'My requests'}
          icon={CalendarDays}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'mine' | 'team')}>
        <TabsList>
          <TabsTrigger value="mine">My Leave</TabsTrigger>
          {isManager && <TabsTrigger value="team">Team Leave</TabsTrigger>}
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <div className="p-4 border-b flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by employee, reason, type..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    pagination.reset();
                  }}
                />
              </div>
              <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); pagination.reset(); }}>
                <TabsList>
                  <TabsTrigger value="all">All <TabCount n={statusCounts.all} /></TabsTrigger>
                  <TabsTrigger value="pending">Pending <TabCount n={statusCounts.pending} /></TabsTrigger>
                  <TabsTrigger value="approved">Approved <TabCount n={statusCounts.approved} /></TabsTrigger>
                  <TabsTrigger value="rejected">Rejected <TabCount n={statusCounts.rejected} /></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={6} cols={7} />
              ) : error ? (
                <ErrorState message={error} onRetry={fetchAll} />
              ) : visible.length === 0 ? (
                <EmptyState
                  illustration="plane"
                  title="No leave requests"
                  description={
                    tab === 'mine'
                      ? 'Request annual, sick, or unpaid leave to get started.'
                      : 'No leave to review across the team right now.'
                  }
                  action={
                    <Button onClick={() => setShowForm(true)}>
                      <Plus className="mr-2 h-4 w-4" /> Request Leave
                    </Button>
                  }
                />
              ) : (
                <>
                  <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tab === 'team' && <TableHead>Employee</TableHead>}
                        <TableHead>Type</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead className="text-right">Days</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.slice.map((r) => {
                        const emp = profiles.get(r.employee_id);
                        const busy = actioning === r.id;
                        const canManageRow = isManager && canApprovePerm && r.status === 'pending';
                        const canCancelOwn =
                          r.employee_id === profile?.id && r.status === 'pending';
                        const canRevertApproved =
                          isManager && canApprovePerm && r.status === 'approved';
                        return (
                          <TableRow key={r.id} className="kd-transition">
                            {tab === 'team' && (
                              <TableCell className="font-medium">
                                {emp?.full_name || r.employee_id}
                                {emp?.email && (
                                  <p className="text-xs text-muted-foreground">{emp.email}</p>
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge variant="secondary" className={TYPE_BADGE[r.leave_type]}>
                                {r.leave_type}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(r.start_date)}</TableCell>
                            <TableCell>{formatDate(r.end_date)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {r.days_requested}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-muted-foreground">
                              {r.reason || '—'}
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={r.status} />
                              {r.status === 'rejected' && r.rejection_reason && (
                                <p className="text-xs text-destructive mt-1">
                                  {r.rejection_reason}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {canManageRow && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => approve(r)}
                                    >
                                      {busy ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Check className="h-4 w-4 text-success" />
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => {
                                        setShowReject(r);
                                        setRejectReason('');
                                      }}
                                    >
                                      <X className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </>
                                )}
                                {canCancelOwn && !canManageRow && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => cancel(r)}
                                  >
                                    Cancel
                                  </Button>
                                )}
                                {canRevertApproved && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setPendingRevert(r)}
                                    className="text-xs"
                                    title="Revert approval and restore balance"
                                  >
                                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revert'}
                                  </Button>
                                )}
                                {isManager && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setConfirmDeleteLeave(r)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                                {!canManageRow && !canCancelOwn && !canRevertApproved && !isManager && (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>

                  {/* Mobile: card list with the same per-row actions. */}
                  <div className="md:hidden divide-y divide-border/60">
                    {pagination.slice.map((r) => {
                      const emp = profiles.get(r.employee_id);
                      const busy = actioning === r.id;
                      const canManageRow = isManager && canApprovePerm && r.status === 'pending';
                      const canCancelOwn = r.employee_id === profile?.id && r.status === 'pending';
                      const canRevertApproved = isManager && canApprovePerm && r.status === 'approved';
                      return (
                        <MobileCard key={r.id} className="rounded-none border-0 shadow-none bg-transparent backdrop-blur-none">
                          <MobileCardHeader>
                            <MobileCardTitle>
                              {tab === 'team' ? (emp?.full_name || r.employee_id) : <span className="capitalize">{r.leave_type} leave</span>}
                            </MobileCardTitle>
                            <MobileCardMeta>{r.days_requested} day{r.days_requested === 1 ? '' : 's'}</MobileCardMeta>
                          </MobileCardHeader>
                          {tab === 'team' && (
                            <MobileCardRow label="Type">
                              <Badge variant="secondary" className={TYPE_BADGE[r.leave_type]}>{r.leave_type}</Badge>
                            </MobileCardRow>
                          )}
                          <MobileCardRow label="Dates">{formatDate(r.start_date)} → {formatDate(r.end_date)}</MobileCardRow>
                          <MobileCardRow label="Status"><StatusBadge status={r.status} /></MobileCardRow>
                          {r.reason && (
                            <MobileCardRow label="Reason"><span className="truncate">{r.reason}</span></MobileCardRow>
                          )}
                          {(canManageRow || canCancelOwn || canRevertApproved || isManager) && (
                            <MobileCardFooter>
                              {canManageRow && (
                                <>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => approve(r)} className="text-success border-success/40">
                                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Approve
                                  </Button>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { setShowReject(r); setRejectReason(''); }} className="text-destructive border-destructive/40">
                                    <X className="h-4 w-4 mr-1" /> Reject
                                  </Button>
                                </>
                              )}
                              {canCancelOwn && !canManageRow && (
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => cancel(r)}>Cancel</Button>
                              )}
                              {canRevertApproved && (
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => setPendingRevert(r)}>
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Revert'}
                                </Button>
                              )}
                              {isManager && (
                                <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteLeave(r)} className="text-destructive ml-auto" title="Delete">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </MobileCardFooter>
                          )}
                        </MobileCard>
                      );
                    })}
                  </div>

                  <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    totalItems={pagination.totalItems}
                    pageSize={pagination.pageSize}
                    onPrev={pagination.prev}
                    onNext={pagination.next}
                    hasPrev={pagination.hasPrev}
                    hasNext={pagination.hasNext}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Leave type</Label>
              <Select
                value={form.leave_type}
                onValueChange={(v) =>
                  setForm({ ...form, leave_type: v as LeaveType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <t.icon className="h-3.5 w-3.5" />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Family event, medical, etc."
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Days requested:{' '}
              <span className="font-semibold text-foreground">
                {calcDays(form.start_date, form.end_date)}
              </span>
              {form.leave_type === 'annual' && balance && (
                <>
                  {' '}
                  · Remaining annual balance:{' '}
                  <span className="font-semibold text-foreground">
                    {Math.max(0, balance.annual_quota - balance.annual_used)} days
                  </span>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button onClick={submitRequest} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!showReject}
        onOpenChange={(v) => {
          if (!v) {
            setShowReject(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={reject}
              disabled={!isValidRejectionReason(rejectReason) || actioning === showReject?.id}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteLeave} onOpenChange={(v) => { if (!v) setConfirmDeleteLeave(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete leave request</DialogTitle>
            <DialogDescription>
              Delete this leave request ({confirmDeleteLeave?.days_requested} day{confirmDeleteLeave?.days_requested === 1 ? '' : 's'})? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteLeave(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteLeave && deleteLeaveRequest(confirmDeleteLeave)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingRevert} onOpenChange={(v) => { if (!v) setPendingRevert(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert leave approval?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRevert ? (
                <>
                  Revert approval for {profiles.get(pendingRevert.employee_id)?.full_name || pendingRevert.employee_id}
                  {' '}({pendingRevert.days_requested} day{pendingRevert.days_requested === 1 ? '' : 's'})?
                  Their leave balance will be restored.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingRevert && revertApproval(pendingRevert)}>
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Leave;
