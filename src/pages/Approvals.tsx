import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  X,
  Search,
  CreditCard,
  Receipt,
  Fuel,
  PiggyBank,
  Inbox,
  Loader2,
  Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useApprovalStore } from '@/store/approvalStore';
import { logAudit, type AuditActionType } from '@/lib/audit';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { APPROVER_ROLES, hasRole } from '@/lib/roles';
import { formatDate, formatNaira } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';

type Kind = 'batch' | 'expense' | 'fuel' | 'budget' | 'leave';

interface PendingItem {
  id: string;
  kind: Kind;
  title: string;
  subtitle?: string;
  amount: number | null;
  submittedBy?: string;
  createdAt: string;
  raw: any;
}

const KIND_LABELS: Record<Kind, string> = {
  batch: 'Payment Batches',
  expense: 'Expenses',
  fuel: 'Fuel Requests',
  budget: 'Budgets',
  leave: 'Leave Requests',
};

const KIND_ICONS: Record<Kind, typeof CreditCard> = {
  batch: CreditCard,
  expense: Receipt,
  fuel: Fuel,
  budget: PiggyBank,
  leave: Calendar,
};

const AUDIT_APPROVE: Record<Kind, AuditActionType> = {
  batch: 'batch_approved',
  expense: 'expense_approved',
  fuel: 'fuel_request_approved',
  budget: 'budget_approved',
  leave: 'leave_approved',
};
const AUDIT_REJECT: Record<Kind, AuditActionType> = {
  batch: 'batch_rejected',
  expense: 'expense_rejected',
  fuel: 'fuel_request_rejected',
  budget: 'budget_rejected',
  leave: 'leave_rejected',
};

const TABLES: Record<Kind, 'payment_batches' | 'expenses' | 'fuel_requests' | 'budgets' | 'leave_requests'> = {
  batch: 'payment_batches',
  expense: 'expenses',
  fuel: 'fuel_requests',
  budget: 'budgets',
  leave: 'leave_requests',
};

const PENDING_STATUS: Record<Kind, { approve: string; reject: string; pending: string }> = {
  batch: { approve: 'approved', reject: 'rejected', pending: 'pending_approval' },
  expense: { approve: 'approved', reject: 'rejected', pending: 'pending' },
  fuel: { approve: 'approved', reject: 'rejected', pending: 'pending' },
  budget: { approve: 'approved', reject: 'rejected', pending: 'pending_approval' },
  leave: { approve: 'approved', reject: 'rejected', pending: 'pending' },
};

const Approvals = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const refreshCounts = useApprovalStore((s) => s.refresh);
  const counts = useApprovalStore((s) => s.counts);

  const canApprove = hasRole(profile?.role, APPROVER_ROLES);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [actioning, setActioning] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | Kind>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRes, expenseRes, fuelRes, budgetRes, profilesRes, leaveRes] =
        await Promise.all([
          supabase
            .from('payment_batches')
            .select('*')
            .eq('status', 'pending_approval')
            .order('created_at', { ascending: false }),
          supabase
            .from('expenses')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
          supabase
            .from('fuel_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
          supabase
            .from('budgets')
            .select('*')
            .eq('status', 'pending_approval')
            .order('created_at', { ascending: false }),
          supabase.from('profiles').select('id, full_name, email'),
          supabase
            .from('leave_requests')
            .select('id, employee_id, start_date, end_date, leave_type, reason, status, created_at, profiles:employee_id(full_name, first_name, last_name)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false }),
        ]);

      const profilesById = new Map<string, { full_name: string; email: string }>();
      for (const p of profilesRes.data || []) {
        profilesById.set(p.id as string, {
          full_name: (p as any).full_name,
          email: (p as any).email,
        });
      }
      const nameFor = (id?: string | null) => {
        if (!id) return undefined;
        const p = profilesById.get(id);
        return p?.full_name || p?.email;
      };

      const merged: PendingItem[] = [];
      for (const b of batchRes.data || []) {
        merged.push({
          id: `batch:${(b as any).id}`,
          kind: 'batch',
          title: (b as any).name,
          subtitle: `${(b as any).beneficiary_count || 0} beneficiaries · ${(b as any).period || ''}`,
          amount: (b as any).total_amount || 0,
          submittedBy: nameFor((b as any).created_by),
          createdAt: (b as any).created_at,
          raw: b,
        });
      }
      for (const e of expenseRes.data || []) {
        merged.push({
          id: `expense:${(e as any).id}`,
          kind: 'expense',
          title: `${((e as any).category || 'expense').replace(/_/g, ' ')} expense`,
          subtitle: (e as any).description || undefined,
          amount: (e as any).amount_ngn || 0,
          submittedBy: nameFor((e as any).submitted_by),
          createdAt: (e as any).created_at,
          raw: e,
        });
      }
      for (const f of fuelRes.data || []) {
        merged.push({
          id: `fuel:${(f as any).id}`,
          kind: 'fuel',
          title: `Fuel @ ${(f as any).station_name || 'station'}`,
          subtitle: (f as any).reason || undefined,
          amount: (f as any).amount_ngn || 0,
          submittedBy: nameFor((f as any).driver_id),
          createdAt: (f as any).created_at,
          raw: f,
        });
      }
      for (const b of budgetRes.data || []) {
        merged.push({
          id: `budget:${(b as any).id}`,
          kind: 'budget',
          title: (b as any).name,
          subtitle: `${formatDate((b as any).period_start)} → ${formatDate((b as any).period_end)}`,
          amount: (b as any).total_amount_ngn || 0,
          submittedBy: nameFor((b as any).created_by),
          createdAt: (b as any).created_at,
          raw: b,
        });
      }
      for (const l of leaveRes.data || []) {
        const prof = (l as any).profiles as { full_name?: string; first_name?: string; last_name?: string } | null;
        const employeeName = prof?.full_name ||
          `${prof?.first_name || ''} ${prof?.last_name || ''}`.trim() ||
          nameFor((l as any).employee_id) ||
          'Unknown';
        const leaveType = ((l as any).leave_type as string || 'Leave');
        merged.push({
          id: `leave:${(l as any).id}`,
          kind: 'leave',
          title: `${leaveType} Leave — ${employeeName}`,
          subtitle: `${formatDate((l as any).start_date)} to ${formatDate((l as any).end_date)}${(l as any).reason ? `: ${(l as any).reason}` : ''}`,
          amount: null,
          submittedBy: employeeName,
          createdAt: (l as any).created_at,
          raw: l,
        });
      }

      merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(merged);
    } catch (err: any) {
      setError(err?.message || 'Failed to load pending approvals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    refreshCounts();
  }, [fetchAll, refreshCounts]);

  // Filter + tab scoping.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (tab !== 'all' && i.kind !== tab) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.subtitle || '').toLowerCase().includes(q) ||
        (i.submittedBy || '').toLowerCase().includes(q)
      );
    });
  }, [items, search, tab]);

  const pagination = usePagination(visible, 20);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of pagination.slice) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  };

  const describeApprove = (it: PendingItem) => {
    switch (it.kind) {
      case 'batch':
        return `Batch "${it.title}" approved (${formatNaira(it.amount ?? 0)})`;
      case 'expense':
        return `Expense approved: ${it.title} — ${formatNaira(it.amount ?? 0)}`;
      case 'fuel':
        return `Fuel request approved: ${it.title} — ${formatNaira(it.amount ?? 0)}`;
      case 'budget':
        return `Budget "${it.title}" approved (${formatNaira(it.amount ?? 0)})`;
      case 'leave':
        return `Leave request approved: ${it.title}`;
    }
  };

  const describeReject = (it: PendingItem) => {
    switch (it.kind) {
      case 'batch':
        return `Batch "${it.title}" rejected`;
      case 'expense':
        return `Expense rejected: ${it.title}`;
      case 'fuel':
        return `Fuel request rejected: ${it.title}`;
      case 'budget':
        return `Budget "${it.title}" rejected`;
      case 'leave':
        return `Leave request rejected: ${it.title}`;
    }
  };

  const rawId = (compoundId: string) => compoundId.split(':')[1];

  const approveOne = async (it: PendingItem) => {
    if (!canApprove) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can approve items.',
        variant: 'destructive',
      });
      return;
    }
    setActioning(it.id);
    try {
      const update: any = { status: PENDING_STATUS[it.kind].approve };
      if (it.kind === 'batch' || it.kind === 'budget') {
        update.approved_by = profile?.id;
      }
      const { error } = await supabase
        .from(TABLES[it.kind])
        .update(update)
        .eq('id', rawId(it.id));
      if (error) throw error;
      await logAudit(AUDIT_APPROVE[it.kind], describeApprove(it), profile);
      toast({ title: 'Approved' });
      await fetchAll();
      refreshCounts();
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(it.id);
        return next;
      });
    } catch (err: any) {
      toast({
        title: 'Approval failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActioning(null);
    }
  };

  // Rejection now funnels through a reason dialog — mandatory everywhere.
  const [rejectTarget, setRejectTarget] = useState<PendingItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const rejectOne = (it: PendingItem) => {
    if (!canApprove) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can reject items.',
        variant: 'destructive',
      });
      return;
    }
    setRejectTarget(it);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!isValidRejectionReason(rejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const it = rejectTarget;
    setActioning(it.id);
    try {
      const patch: any = { status: PENDING_STATUS[it.kind].reject };
      // Every rejectable entity has rejection_reason after phase 6.
      patch.rejection_reason = rejectReason.trim();
      const { error } = await supabase
        .from(TABLES[it.kind])
        .update(patch)
        .eq('id', rawId(it.id));
      if (error) throw error;

      // Figure out submitter for notification.
      const submitterId =
        it.kind === 'batch'
          ? it.raw?.created_by
          : it.kind === 'expense'
          ? it.raw?.submitted_by
          : it.kind === 'fuel'
          ? it.raw?.driver_id
          : it.kind === 'budget'
          ? it.raw?.created_by
          : it.raw?.employee_id;

      await writeRejectionNotification({
        entity: it.kind,
        entityLabel: it.kind === 'batch' ? 'payment batch' : it.kind,
        amount: it.amount,
        reason: rejectReason.trim(),
        submitterId: submitterId || null,
        actor: profile,
        auditType: AUDIT_REJECT[it.kind],
        auditDescription: `${describeReject(it)} — ${rejectReason.trim()}`,
      });
      toast({ title: 'Rejected with reason' });
      setRejectTarget(null);
      setRejectReason('');
      await fetchAll();
      refreshCounts();
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(it.id);
        return next;
      });
    } catch (err: any) {
      toast({
        title: 'Rejection failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActioning(null);
    }
  };

  const bulkApprove = async () => {
    if (!canApprove) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can bulk approve.',
        variant: 'destructive',
      });
      return;
    }
    const rows = items.filter((i) => selected.has(i.id));
    if (rows.length === 0) return;
    setBulkLoading(true);

    let succeeded = 0;
    let failed = 0;
    try {
      // Group by kind and run one update per group for efficiency.
      const groups: Record<Kind, PendingItem[]> = {
        batch: [],
        expense: [],
        fuel: [],
        budget: [],
        leave: [],
      };
      for (const r of rows) groups[r.kind].push(r);

      for (const kind of Object.keys(groups) as Kind[]) {
        const group = groups[kind];
        if (group.length === 0) continue;
        const update: any = { status: PENDING_STATUS[kind].approve };
        if (kind === 'batch' || kind === 'budget') {
          update.approved_by = profile?.id;
        }
        const ids = group.map((g) => rawId(g.id));
        const { error } = await supabase
          .from(TABLES[kind])
          .update(update)
          .in('id', ids);
        if (error) {
          failed += group.length;
        } else {
          succeeded += group.length;
          for (const it of group) {
            await logAudit(AUDIT_APPROVE[kind], describeApprove(it), profile);
          }
        }
      }

      await logAudit(
        'bulk_approved',
        `Bulk approved ${succeeded} item(s)${failed ? ` (${failed} failed)` : ''}`,
        profile,
      );

      if (succeeded > 0) {
        toast({
          title: `Approved ${succeeded} item${succeeded === 1 ? '' : 's'}`,
          description: failed
            ? `${failed} item(s) could not be approved.`
            : undefined,
        });
      }
      if (failed > 0 && succeeded === 0) {
        toast({
          title: 'Bulk approval failed',
          description: `${failed} item(s) could not be approved.`,
          variant: 'destructive',
        });
      }
      setSelected(new Set());
      await fetchAll();
      refreshCounts();
    } finally {
      setBulkLoading(false);
    }
  };

  const openItem = (it: PendingItem) => {
    if (it.kind === 'batch') navigate(`/payments/${rawId(it.id)}`);
    else if (it.kind === 'budget') navigate('/budgets');
    // expense and fuel live inline inside their pages — approve here.
  };

  const selectedCount = selected.size;
  const visibleAllChecked =
    pagination.slice.length > 0 &&
    pagination.slice.every((r) => selected.has(r.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals Inbox"
        description={`${counts.total} item${counts.total === 1 ? '' : 's'} waiting across all modules`}
        actions={
          selectedCount > 0 && canApprove ? (
            <Button
              onClick={() => {
                const totalAmt = items
                  .filter((i) => selected.has(i.id))
                  .reduce((s, i) => s + (i.amount ?? 0), 0);
                const yes = window.confirm(
                  `You are about to approve ${selectedCount} item${selectedCount === 1 ? '' : 's'} totalling ${formatNaira(totalAmt)}.\n\nConfirm?`,
                );
                if (yes) bulkApprove();
              }}
              disabled={bulkLoading}
            >
              {bulkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Check className="mr-2 h-4 w-4" /> Approve {selectedCount} selected
            </Button>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">
            All
            <Badge variant="secondary" className="ml-2">
              {counts.total}
            </Badge>
          </TabsTrigger>
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => {
            const Icon = KIND_ICONS[k];
            const n =
              k === 'batch'
                ? counts.batches
                : k === 'expense'
                ? counts.expenses
                : k === 'fuel'
                ? counts.fuel
                : k === 'budget'
                ? counts.budgets
                : counts.leave;
            return (
              <TabsTrigger key={k} value={k}>
                <Icon className="mr-2 h-4 w-4" />
                {KIND_LABELS[k]}
                <Badge variant="secondary" className="ml-2">
                  {n}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card>
            <div className="flex items-center gap-2 p-4 border-b flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, description, submitter..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    pagination.reset();
                  }}
                  className="pl-9"
                />
              </div>
            </div>

            <CardContent className="p-0">
              {loading ? (
                <TableSkeleton rows={6} cols={6} />
              ) : error ? (
                <ErrorState message={error} onRetry={fetchAll} />
              ) : visible.length === 0 ? (
                <EmptyState
                  illustration="radar"
                  title="All caught up"
                  description="Nothing waiting for your review right now. New submissions will appear here."
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {canApprove && (
                          <TableHead className="w-10">
                            <Checkbox
                              checked={visibleAllChecked}
                              onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
                              aria-label="Select all on this page"
                            />
                          </TableHead>
                        )}
                        <TableHead>Type</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Submitted by</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.slice.map((it) => {
                        const Icon = KIND_ICONS[it.kind];
                        const busy = actioning === it.id;
                        return (
                          <TableRow key={it.id} className="kd-transition">
                            {canApprove && (
                              <TableCell>
                                <Checkbox
                                  checked={selected.has(it.id)}
                                  onCheckedChange={(v) =>
                                    toggleSelected(it.id, Boolean(v))
                                  }
                                  aria-label={`Select ${it.title}`}
                                />
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge variant="secondary" className="gap-1">
                                <Icon className="h-3 w-3" />
                                {KIND_LABELS[it.kind].replace(' Batches', '')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <button
                                className="text-left"
                                onClick={() => openItem(it)}
                              >
                                <p className="font-medium hover:underline">
                                  {it.title}
                                </p>
                                {it.subtitle && (
                                  <p className="text-xs text-muted-foreground truncate max-w-xs">
                                    {it.subtitle}
                                  </p>
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {it.submittedBy || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(it.createdAt)}
                            </TableCell>
                            <TableCell className="text-right currency font-medium">
                              {it.amount != null ? formatNaira(it.amount) : '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={!canApprove || busy}
                                  onClick={() => approveOne(it)}
                                  title="Approve"
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
                                  disabled={!canApprove || busy}
                                  onClick={() => rejectOne(it)}
                                  title="Reject"
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
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

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(v) => {
          if (!v) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {rejectTarget?.kind === 'batch' ? 'batch' : rejectTarget?.kind || 'item'}
            </DialogTitle>
            <DialogDescription>
              Reason is required. The submitter is notified with this note so
              they can re-edit and resubmit.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Bank details don't match invoice — please re-verify."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={!isValidRejectionReason(rejectReason)}
            >
              Reject with reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Approvals;
