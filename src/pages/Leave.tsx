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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { StatCard } from '@/components/ui-kit/StatCard';
import { usePagination } from '@/hooks/usePagination';

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

const STATUS_BADGE: Record<LeaveStatus, string> = {
  pending: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
};

const calcDays = (start: string, end: string): number => {
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  return diff < 0 ? 0 : diff + 1;
};

const Leave = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const refreshApprovals = useApprovalStore((s) => s.refresh);
  const isManager = hasRole(profile?.role, MANAGER_ROLES);

  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    leave_type: 'annual' as LeaveType,
    start_date: toIsoDate(new Date()),
    end_date: toIsoDate(new Date()),
    reason: '',
  });

  const [showReject, setShowReject] = useState<LeaveRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reqRes, profilesRes, balanceRes] = await Promise.all([
        supabase
          .from('leave_requests')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name, email'),
        supabase
          .from('leave_balances')
          .select('*')
          .eq('employee_id', profile?.id || '')
          .eq('year', new Date().getFullYear())
          .maybeSingle(),
      ]);
      if (reqRes.error) throw reqRes.error;

      setRequests((reqRes.data as LeaveRequest[]) || []);
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
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.id) fetchAll();
  }, [fetchAll, profile?.id]);

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
      annual_quota: 21,
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

  const approve = async (req: LeaveRequest) => {
    if (!isManager) {
      toast({ title: 'Not authorized', variant: 'destructive' });
      return;
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
    setActioning(showReject.id);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'rejected',
          reviewed_by: profile?.id,
          rejection_reason: rejectReason || null,
        })
        .eq('id', showReject.id);
      if (error) throw error;
      await logAudit(
        'leave_rejected',
        `Leave rejected for ${profiles.get(showReject.employee_id)?.full_name || showReject.employee_id}: ${rejectReason || 'no reason given'}`,
        profile,
      );
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
        .delete()
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

  // -- Filter / paginate ----------------------------------------------------

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const scope =
      tab === 'mine'
        ? requests.filter((r) => r.employee_id === profile?.id)
        : requests;
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
  }, [requests, search, statusFilter, profile?.id, tab, profiles]);

  const pagination = usePagination(visible, 20);

  // -- Render ---------------------------------------------------------------

  const annualLeft = balance
    ? Math.max(0, balance.annual_quota - balance.annual_used)
    : 21;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        description="Submit time off and review your team's leave requests."
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Request Leave
          </Button>
        }
      />

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
          value={requests.filter((r) => r.status === 'pending').length}
          subtitle="Across team"
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
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as any)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={6} cols={7} />
              ) : error ? (
                <ErrorState message={error} onRetry={fetchAll} />
              ) : visible.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
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
                        const canManageRow = isManager && r.status === 'pending';
                        const canCancelOwn =
                          r.employee_id === profile?.id && r.status === 'pending';
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
                              <Badge variant="secondary" className={STATUS_BADGE[r.status]}>
                                {r.status}
                              </Badge>
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
                                {!canManageRow && !canCancelOwn && (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
              <Label>Reason (optional)</Label>
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
              disabled={!rejectReason || actioning === showReject?.id}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leave;
