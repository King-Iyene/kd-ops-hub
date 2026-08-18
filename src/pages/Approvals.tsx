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
  ShieldCheck,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useApprovalStore } from '@/store/approvalStore';
import { logAudit, type AuditActionType } from '@/lib/audit';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { APPROVER_ROLES, hasRole } from '@/lib/roles';
import {
  approvePaymentBatch,
  rejectPaymentBatch,
  approveExpense,
  confirmSecondApproval,
  confirmSecondExpenseApproval,
  rejectExpense,
} from '@/lib/transfer-safety';
import { formatDate, formatNaira } from '@/lib/format';
import { SubPageHeader } from '@/components/SubPageHeader';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AuroraHero } from '@/components/AuroraHero';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { StickyActionBar, StickyActionBarSpacer } from '@/components/ui-kit/StickyActionBar';

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
  const [bulkApproveConfirm, setBulkApproveConfirm] = useState<{ count: number; total: number } | null>(null);

  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | Kind>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [batchRes, expenseRes, fuelRes, budgetRes, profilesRes, leaveRes] =
        await Promise.all([
          // Pull both pending_approval and pending_second_approval batches —
          // the second-approval queue is just another flavour of "needs my
          // attention" and belongs in Mission Control, not behind a hidden tab.
          supabase
            .from('payment_batches')
            .select('id, name, beneficiary_count, period, total_amount, created_by, created_at, status')
            .in('status', ['pending_approval', 'pending_second_approval'])
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('expenses')
            .select('id, category, description, amount_ngn, submitted_by, created_at, status')
            .in('status', ['pending', 'pending_second_approval'])
            .is('deleted_at', null)
            .is('fuel_request_id', null)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('fuel_requests')
            .select('id, station_name, reason, amount_ngn, driver_id, created_at, bank_name, account_number, account_name, status')
            .eq('status', 'pending')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('budgets')
            .select('id, name, period_start, period_end, total_amount_ngn, created_by, created_at, status')
            .eq('status', 'pending_approval')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200),
          supabase.from('profiles_directory').select('id, full_name, email').limit(500),
          supabase
            .from('leave_requests')
            .select('id, employee_id, start_date, end_date, leave_type, reason, status, created_at, profiles:employee_id(full_name, first_name, last_name)')
            .eq('status', 'pending')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(200),
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

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchAll);

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

  /**
   * Approve a single pending row. Batches and expenses go through the
   * SECURITY DEFINER RPCs (which enforce no-self-approval, role pools, caps,
   * and the dual-approval threshold); fuel/budget/leave still flow through
   * direct status writes because they live outside the new framework.
   */
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
      if (it.kind === 'batch') {
        const isSecond = (it.raw?.status as string) === 'pending_second_approval';
        const result = isSecond
          ? await confirmSecondApproval(rawId(it.id))
          : await approvePaymentBatch(rawId(it.id));
        await logAudit(
          isSecond ? 'batch_second_approved' : (result?.status === 'pending_second_approval' ? 'batch_first_approved' : 'batch_approved'),
          describeApprove(it),
          profile,
        );
        toast({
          title: isSecond
            ? 'Batch fully approved'
            : (result?.status === 'pending_second_approval' ? 'First approval recorded' : 'Approved'),
          description: result?.status === 'pending_second_approval'
            ? 'A second approver must confirm this batch before it can proceed.'
            : undefined,
        });
        await fetchAll();
        refreshCounts();
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(it.id);
          return next;
        });
        return;
      }

      if (it.kind === 'expense') {
        const isSecond = (it.raw?.status as string) === 'pending_second_approval';
        const result = isSecond
          ? await confirmSecondExpenseApproval(rawId(it.id))
          : await approveExpense(rawId(it.id));
        await logAudit('expense_approved', describeApprove(it), profile);
        toast({
          title: isSecond
            ? 'Expense fully approved'
            : (result?.status === 'pending_second_approval' ? 'First approval recorded' : 'Approved'),
        });
        await fetchAll();
        refreshCounts();
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(it.id);
          return next;
        });
        return;
      }

      const update: any = { status: PENDING_STATUS[it.kind].approve };
      if (it.kind === 'budget') {
        update.approved_by = profile?.id;
      }
      const { error } = await supabase
        .from(TABLES[it.kind])
        .update(update)
        .eq('id', rawId(it.id));
      if (error) throw error;

      // When a fuel request is approved, mirror the approval onto the paired
      // expense row (created at submission time, linked by fuel_request_id).
      // The expense.status='approved' flip routes through approve_expense
      // RPC so cap accounting + audit + co-approval thresholds apply. If
      // no paired row exists (legacy fuel request pre-link), insert a new
      // pending one and approve it.
      if (it.kind === 'fuel') {
        const f = it.raw || {};
        const now = new Date().toISOString();
        const { data: existing } = await supabase
          .from('expenses')
          .select('id, status')
          .eq('fuel_request_id', f.id)
          .maybeSingle();
        let expErr: { message: string } | null = null;
        let expenseId: string | undefined = (existing as any)?.id;
        if (!expenseId) {
          const { data: inserted, error } = await supabase.from('expenses').insert({
            fuel_request_id: f.id,
            category: 'fuel',
            budget_category: 'fuel',
            amount_ngn: f.amount_ngn,
            date: now.slice(0, 10),
            description: `Fuel — ${f.station_name || 'Station'} — ${f.reason || 'Fuel request'}`,
            submitted_by: f.driver_id || f.employee_id,
            status: 'pending',
            ...(f.bank_name ? {
              bank_name: f.bank_name,
              account_number: f.account_number,
              account_name: f.account_name,
            } : {}),
          }).select('id').single();
          expErr = error;
          expenseId = (inserted as any)?.id;
        }
        if (expenseId && (existing as any)?.status !== 'approved') {
          try { await approveExpense(expenseId); }
          catch (err: any) { expErr = { message: err?.message || 'approve_expense failed' }; }
        }
        if (expErr) {
          toast({
            title: 'Approved, but expense entry failed',
            description: expErr.message,
            variant: 'destructive',
          });
        }
      }

      await logAudit(AUDIT_APPROVE[it.kind], describeApprove(it), profile);

      // Notify the submitter that their request was approved. Without this,
      // approval was silent on the submitter's side — they had to check the
      // module manually to know their request went through.
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

      const KIND_LABELS: Record<string, string> = {
        batch: 'payment batch',
        expense: 'expense',
        fuel: 'fuel request',
        budget: 'budget',
        leave: 'leave request',
      };

      if (submitterId) {
        const { error: notifyErr } = await supabase.from('notifications').insert({
          user_id: submitterId,
          type: `${it.kind}_approved`,
          module: it.kind === 'batch' ? 'payments' : it.kind === 'fuel' ? 'fleet' : it.kind === 'leave' ? 'leave' : it.kind,
          priority: 'normal',
          title: `Your ${KIND_LABELS[it.kind] || it.kind} was approved`,
          body: it.amount
            ? `${it.title} — ${formatNaira(it.amount)}`
            : it.title,
        });
        if (notifyErr) {
          // Don't block approval — but log so we can see if notification
          // delivery is consistently failing.
          console.warn('[KDOps] approval notification insert failed:', notifyErr.message);
        }
      }

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
  // Bulk reject shares one reason across every selected item.
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');

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

  // Shared per-item reject logic — used by both single and bulk reject so the
  // RPC routing, paired-expense cleanup, and submitter notification stay
  // identical. Batches/expenses go through the RPCs (which clear approval state
  // and write the transfer_audit row); fuel/budget/leave use a direct update.
  const rejectItemCore = async (it: PendingItem, reason: string) => {
    if (it.kind === 'batch') {
      await rejectPaymentBatch(rawId(it.id), reason);
    } else if (it.kind === 'expense') {
      await rejectExpense(rawId(it.id), reason);
    } else {
      const patch: any = { status: PENDING_STATUS[it.kind].reject, rejection_reason: reason };
      const { error } = await supabase
        .from(TABLES[it.kind])
        .update(patch)
        .eq('id', rawId(it.id));
      if (error) throw error;
    }

    // Rejecting a fuel request also rejects its paired expense row so finance
    // no longer sees it as actionable.
    if (it.kind === 'fuel') {
      await supabase
        .from('expenses')
        .update({ status: 'rejected', rejection_reason: reason })
        .eq('fuel_request_id', rawId(it.id));
    }

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

    const KIND_LABELS: Record<string, string> = {
      batch: 'payment batch',
      expense: 'expense',
      fuel: 'fuel request',
      budget: 'budget',
      leave: 'leave request',
    };
    await writeRejectionNotification({
      entity: it.kind,
      entityLabel: KIND_LABELS[it.kind] || it.kind,
      amount: it.amount,
      reason,
      submitterId: submitterId || null,
      actor: profile,
      auditType: AUDIT_REJECT[it.kind],
      auditDescription: `${describeReject(it)} — ${reason}`,
    });
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
      await rejectItemCore(it, rejectReason.trim());
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

  /**
   * Bulk approve. Batches and expenses go one-at-a-time through their RPCs
   * (which enforce caps, role pools, no-self-approval, and dual-approval
   * thresholds) so a single bad row doesn't fail the whole batch update;
   * fuel/budget/leave use the legacy bulk path. Per-row failures are
   * collected and surfaced in the final toast — silently swallowing them
   * would let a partial-success bulk look like a full success.
   */
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
    const failures: Array<{ title: string; reason: string }> = [];

    try {
      for (const it of rows) {
        try {
          if (it.kind === 'batch') {
            const isSecond = (it.raw?.status as string) === 'pending_second_approval';
            if (isSecond) await confirmSecondApproval(rawId(it.id));
            else          await approvePaymentBatch(rawId(it.id));
            await logAudit(
              isSecond ? 'batch_second_approved' : 'batch_approved',
              describeApprove(it),
              profile,
            );
            succeeded++;
          } else if (it.kind === 'expense') {
            const isSecond = (it.raw?.status as string) === 'pending_second_approval';
            if (isSecond) await confirmSecondExpenseApproval(rawId(it.id));
            else          await approveExpense(rawId(it.id));
            await logAudit('expense_approved', describeApprove(it), profile);
            succeeded++;
          } else {
            const update: any = { status: PENDING_STATUS[it.kind].approve };
            if (it.kind === 'budget') update.approved_by = profile?.id;
            const { error } = await supabase
              .from(TABLES[it.kind])
              .update(update)
              .eq('id', rawId(it.id));
            if (error) throw error;
            await logAudit(AUDIT_APPROVE[it.kind], describeApprove(it), profile);
            succeeded++;
          }
        } catch (err: any) {
          failures.push({
            title: it.title,
            reason: err?.message || 'unknown',
          });
        }
      }

      await logAudit(
        'bulk_approved',
        `Bulk approved ${succeeded} item(s)${failures.length ? ` (${failures.length} failed)` : ''}`,
        profile,
      );

      if (succeeded > 0 && failures.length === 0) {
        toast({
          title: `Approved ${succeeded} item${succeeded === 1 ? '' : 's'}`,
        });
      } else if (succeeded > 0 && failures.length > 0) {
        toast({
          title: `Approved ${succeeded} of ${succeeded + failures.length}`,
          description: failures.map((f) => `• ${f.title}: ${f.reason}`).join('\n'),
          variant: 'destructive',
        });
      } else if (failures.length > 0) {
        toast({
          title: 'Bulk approval failed',
          description: failures.map((f) => `• ${f.title}: ${f.reason}`).join('\n'),
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

  /**
   * Bulk reject — one shared reason applied to every selected item. Reuses
   * rejectItemCore so each kind is rejected and its submitter notified exactly
   * as in single reject. Per-row failures are collected, not swallowed.
   */
  const bulkReject = async () => {
    if (!canApprove) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can bulk reject.',
        variant: 'destructive',
      });
      return;
    }
    const reason = bulkRejectReason.trim();
    if (!isValidRejectionReason(reason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const rows = items.filter((i) => selected.has(i.id));
    if (rows.length === 0) return;

    setBulkLoading(true);
    let succeeded = 0;
    const failures: Array<{ title: string; reason: string }> = [];
    try {
      for (const it of rows) {
        try {
          await rejectItemCore(it, reason);
          succeeded++;
        } catch (err: any) {
          failures.push({ title: it.title, reason: err?.message || 'unknown' });
        }
      }

      if (succeeded > 0 && failures.length === 0) {
        toast({ title: `Rejected ${succeeded} item${succeeded === 1 ? '' : 's'}` });
      } else if (succeeded > 0 && failures.length > 0) {
        toast({
          title: `Rejected ${succeeded} of ${succeeded + failures.length}`,
          description: failures.map((f) => `• ${f.title}: ${f.reason}`).join('\n'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Bulk rejection failed',
          description: failures.map((f) => `• ${f.title}: ${f.reason}`).join('\n'),
          variant: 'destructive',
        });
      }
      setBulkRejectOpen(false);
      setBulkRejectReason('');
      setSelected(new Set());
      await fetchAll();
      refreshCounts();
    } finally {
      setBulkLoading(false);
    }
  };

  const openItem = (it: PendingItem) => {
    if (it.kind === 'batch') navigate(`/payments/${rawId(it.id)}`);
    else if (it.kind === 'expense') navigate('/expenses', { state: { openExpenseId: rawId(it.id) } });
    else if (it.kind === 'fuel') navigate('/fleet');
    else if (it.kind === 'budget') navigate('/budgets');
  };

  const selectedCount = selected.size;
  const visibleAllChecked =
    pagination.slice.length > 0 &&
    pagination.slice.every((r) => selected.has(r.id));

  const totalPendingValue = items.reduce((s, i) => s + (i.amount ?? 0), 0);
  const oldestPending = items
    .map((i) => new Date(i.createdAt).getTime())
    .reduce((min, t) => Math.min(min, t), Date.now());
  const oldestDays = items.length === 0 ? 0 : Math.max(0, Math.floor((Date.now() - oldestPending) / 86_400_000));

  return (
    <div className="space-y-6">
      {/* Mission control hero */}
      <AuroraHero className="p-5 sm:p-6" scanLine={counts.total > 0} pattern="pulse">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Approvals</span>
            </div>
            <h1 className="kd-display text-3xl sm:text-4xl font-bold tracking-tight">
              {counts.total === 0 ? 'All clear.' : `${counts.total} pending`}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              {counts.total === 0
                ? 'No items waiting for review. The queue is empty.'
                : `${formatNaira(totalPendingValue)} in flight${oldestDays > 0 ? ` · oldest ${oldestDays}d` : ''}`}
            </p>
          </div>
          {/* Live status pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium">
              <span className={`h-1.5 w-1.5 rounded-full ${counts.total === 0 ? 'bg-emerald-400 kd-status-live-success' : 'bg-amber-300 kd-status-live-warning'}`} />
              {counts.total === 0 ? 'System idle' : 'Awaiting review'}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium">
              <ShieldCheck className="h-3 w-3" /> {canApprove ? 'Approver' : 'View only'}
            </span>
            <button
              type="button"
              onClick={manualRefresh}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border text-xs font-medium hover:bg-muted/80 transition-colors"
              title="Refresh now"
            >
              <RefreshCw className="h-3 w-3" /> {lastUpdatedLabel}
            </button>
          </div>
        </div>

        {/* Module pulse strip */}
        {counts.total > 0 && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { k: 'batches', label: 'Batches', n: counts.batches, icon: CreditCard },
              { k: 'expenses', label: 'Expenses', n: counts.expenses, icon: Receipt },
              { k: 'fuel', label: 'Fuel', n: counts.fuel, icon: Fuel },
              { k: 'budgets', label: 'Budgets', n: counts.budgets, icon: PiggyBank },
              { k: 'leave', label: 'Leave', n: counts.leave, icon: Calendar },
            ].map(({ k, label, n, icon: Icon }) => (
              <div key={k} className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 flex items-center gap-2.5">
                <div className={`h-7 w-7 rounded-md flex items-center justify-center ${n > 0 ? 'bg-amber-100 dark:bg-amber-400/20' : 'bg-muted'}`}>
                  <Icon className={`h-3.5 w-3.5 ${n > 0 ? 'text-amber-600 dark:text-amber-200' : 'text-muted-foreground'}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                  <p className={`kd-display text-base font-bold leading-none ${n > 0 ? '' : 'opacity-40'}`}>{n}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </AuroraHero>

      {/* Bulk action bar (only when something is selected) — inline on
          desktop, glued above the bottom tab bar on mobile so it stays in
          thumb reach while scrolling the list. */}
      {selectedCount > 0 && canApprove && (
        <>
          <div className="hidden md:flex kd-toolbar-glass rounded-lg p-3 items-center justify-between flex-wrap gap-3 kd-animate-slide-down">
            <p className="text-sm">
              <span className="font-semibold">{selectedCount}</span> item{selectedCount === 1 ? '' : 's'} selected
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => { setBulkRejectReason(''); setBulkRejectOpen(true); }}
                disabled={bulkLoading}
                className="text-destructive border-destructive/40 hover:bg-destructive/5"
              >
                <X className="mr-2 h-4 w-4" /> Reject {selectedCount} selected
              </Button>
              <Button
                onClick={() => {
                  const totalAmt = items.filter((i) => selected.has(i.id)).reduce((s, i) => s + (i.amount ?? 0), 0);
                  setBulkApproveConfirm({ count: selectedCount, total: totalAmt });
                }}
                disabled={bulkLoading}
                className="kd-magnetic"
              >
                {bulkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" /> Approve {selectedCount} selected
              </Button>
            </div>
          </div>

          {/* Mobile sticky bulk bar */}
          <div className="md:hidden fixed inset-x-0 bottom-14 z-30 bg-card/90 backdrop-blur-md border-t border-border/60 safe-bottom shadow-[0_-2px_12px_-4px_hsl(var(--primary)/0.15)] kd-animate-slide-down">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-xs">
                <span className="font-semibold text-base">{selectedCount}</span> selected
              </p>
              <div className="flex items-center gap-2 flex-1 justify-end">
                <Button
                  variant="outline"
                  onClick={() => { setBulkRejectReason(''); setBulkRejectOpen(true); }}
                  disabled={bulkLoading}
                  className="h-11 text-destructive border-destructive/40"
                >
                  <X className="mr-1.5 h-4 w-4" /> Reject
                </Button>
                <Button
                  onClick={() => {
                    const totalAmt = items.filter((i) => selected.has(i.id)).reduce((s, i) => s + (i.amount ?? 0), 0);
                    setBulkApproveConfirm({ count: selectedCount, total: totalAmt });
                  }}
                  disabled={bulkLoading}
                  className="h-11 bg-success hover:bg-success/90 text-success-foreground"
                >
                  {bulkLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Approve {selectedCount}
                </Button>
              </div>
            </div>
          </div>
          {/* Spacer so the last list item isn't hidden behind the sticky bar */}
          <div aria-hidden className="md:hidden" style={{ height: 'calc(64px + env(safe-area-inset-bottom))' }} />
        </>
      )}

      {tab !== 'all' && (
        <SubPageHeader
          parentTitle="Approvals"
          currentTitle={KIND_LABELS[tab as Kind] ?? tab}
          onBack={() => setTab('all')}
        />
      )}

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
                  {/* Desktop table */}
                  <div className="hidden md:block">
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
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="secondary" className="gap-1">
                                    <Icon className="h-3 w-3" />
                                    {KIND_LABELS[it.kind].replace(' Batches', '')}
                                  </Badge>
                                  {(it.raw?.status as string) === 'pending_second_approval' && (
                                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5">
                                      Awaiting 2nd
                                    </Badge>
                                  )}
                                </div>
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
                  </div>

                  {/* Mobile card list — same data, thumb-friendly */}
                  <div className="md:hidden p-3 space-y-2">
                    {pagination.slice.map((it) => {
                      const Icon = KIND_ICONS[it.kind];
                      const busy = actioning === it.id;
                      const isSelected = selected.has(it.id);
                      return (
                        <MobileCard
                          key={it.id}
                          accentClassName={
                            it.kind === 'batch' ? 'bg-blue-500'
                            : it.kind === 'expense' ? 'bg-amber-500'
                            : it.kind === 'fuel' ? 'bg-orange-500'
                            : it.kind === 'budget' ? 'bg-emerald-500'
                            : 'bg-violet-500'
                          }
                          className={isSelected ? 'ring-2 ring-primary/40' : ''}
                        >
                          <MobileCardHeader>
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {canApprove && (
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(v) =>
                                    toggleSelected(it.id, Boolean(v))
                                  }
                                  aria-label={`Select ${it.title}`}
                                  className="shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              )}
                              <button
                                className="text-left min-w-0 flex-1"
                                onClick={() => openItem(it)}
                              >
                                <div className="flex flex-wrap items-center gap-1 mb-1">
                                  <Badge variant="secondary" className="gap-1">
                                    <Icon className="h-3 w-3" />
                                    <span className="text-[10px]">{KIND_LABELS[it.kind].replace(' Batches', '')}</span>
                                  </Badge>
                                  {(it.raw?.status as string) === 'pending_second_approval' && (
                                    <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5">
                                      <span className="text-[10px]">Awaiting 2nd</span>
                                    </Badge>
                                  )}
                                </div>
                                <MobileCardTitle className="text-sm">{it.title}</MobileCardTitle>
                                {it.subtitle && (
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {it.subtitle}
                                  </p>
                                )}
                              </button>
                            </div>
                            <MobileCardMeta className="text-base currency">
                              {it.amount != null ? formatNaira(it.amount) : '—'}
                            </MobileCardMeta>
                          </MobileCardHeader>

                          <MobileCardRow label="Submitted by">
                            {it.submittedBy || '—'}
                          </MobileCardRow>
                          <MobileCardRow label="Date">
                            {formatDate(it.createdAt)}
                          </MobileCardRow>

                          {canApprove && (
                            <MobileCardFooter>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => rejectOne(it)}
                                className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/5"
                              >
                                <X className="h-4 w-4 mr-1.5" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => approveOne(it)}
                                className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                              >
                                {busy ? (
                                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4 mr-1.5" />
                                )}
                                Approve
                              </Button>
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

      <Dialog
        open={bulkRejectOpen}
        onOpenChange={(v) => {
          if (!v) { setBulkRejectOpen(false); setBulkRejectReason(''); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {selectedCount} selected item{selectedCount === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>
              One reason is applied to every selected item, and each submitter is
              notified so they can re-edit and resubmit. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bulkRejectReason}
            onChange={(e) => setBulkRejectReason(e.target.value)}
            placeholder="e.g. Duplicate submissions — please consolidate and resubmit."
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkRejectOpen(false); setBulkRejectReason(''); }} disabled={bulkLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={bulkReject}
              disabled={bulkLoading || !isValidRejectionReason(bulkRejectReason)}
            >
              {bulkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject {selectedCount} with reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!bulkApproveConfirm} onOpenChange={(v) => { if (!v) setBulkApproveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk approval</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to approve{' '}
              <span className="font-semibold">{bulkApproveConfirm?.count} item{bulkApproveConfirm?.count === 1 ? '' : 's'}</span>{' '}
              totalling{' '}
              <span className="font-semibold">{formatNaira(bulkApproveConfirm?.total ?? 0)}</span>.
              This will trigger payment processing and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setBulkApproveConfirm(null); bulkApprove(); }}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              Approve all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Approvals;
