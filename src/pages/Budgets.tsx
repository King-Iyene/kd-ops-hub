import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDepartments } from '@/queries';
import {
  Plus,
  Search,
  PiggyBank,
  Loader2,
  Trash2,
  Pencil,
  CheckCircle2,
  Lock,
  Unlock,
  Info,
} from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { ACTUAL_DISBURSED_STATUSES, actualDisbursedForBatch, fetchSucceededBatchSums } from '@/lib/cfo-dashboard';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { APPROVER_ROLES, MANAGER_ROLES, hasRole } from '@/lib/roles';
import { formatDate, formatNaira, toIsoDate } from '@/lib/format';
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
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

interface BudgetRow {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  department_id: string | null;
  total_amount_ngn: number;
  status: string;
  notes: string | null;
  locked: boolean;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
}

interface BudgetItemRow {
  id: string;
  budget_id: string;
  category: string;
  description: string | null;
  allocated_ngn: number;
}

interface ItemDraft {
  id?: string;
  category: string;
  description: string;
  allocated_ngn: string;
}

interface Department {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed',
};

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  closed: 'bg-muted text-muted-foreground',
};

const CATEGORY_SUGGESTIONS = [
  'payroll',
  'contractor_payments',
  'fuel',
  'office_supplies',
  'travel',
  'software',
  'utilities',
  'marketing',
  'other',
];

const Budgets = () => {
  usePageTitle('Budgets');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const canManage = hasRole(profile?.role, APPROVER_ROLES);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [spendById, setSpendById] = useState<Record<string, number>>({});
  const { data: departments = [] } = useDepartments();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');

  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const [form, setForm] = useState({
    name: '',
    period_start: toIsoDate(new Date()),
    period_end: toIsoDate(new Date(new Date().getFullYear(), 11, 31)),
    department_id: 'none' as string,
    notes: '',
  });
  const [itemsDraft, setItemsDraft] = useState<ItemDraft[]>([
    { category: 'payroll', description: '', allocated_ngn: '' },
  ]);
  const [confirmDelete, setConfirmDelete] = useState<BudgetRow | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetsRes, expensesRes, batchesRes] = await Promise.all([
        supabase
          .from('budgets')
          .select('id, name, period_start, period_end, department_id, total_amount_ngn, status, notes, locked, created_by, approved_by, created_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('expenses')
          .select('amount_ngn, date, status')
          .eq('status', 'approved')
          .is('deleted_at', null)
          .limit(2000),
        supabase
          .from('payment_batches')
          .select('id, total_amount, payment_date, status')
          .in('status', [...ACTUAL_DISBURSED_STATUSES])
          .is('deleted_at', null)
          .limit(500),
      ]);

      if (budgetsRes.error) throw budgetsRes.error;
      setRows((budgetsRes.data as BudgetRow[]) || []);

      // Actual spend = approved expenses + actually-disbursed batches that fall
      // between the budget's period_start and period_end.
      const spendMap: Record<string, number> = {};
      const expenses = (expensesRes.data || []) as any[];
      const batches = (batchesRes.data || []) as any[];
      const succeededByBatch = await fetchSucceededBatchSums(batches);

      for (const b of (budgetsRes.data as BudgetRow[]) || []) {
        const start = new Date(b.period_start).getTime();
        const end = new Date(b.period_end).getTime() + 24 * 60 * 60 * 1000 - 1;
        let total = 0;
        for (const e of expenses) {
          const t = new Date(e.date).getTime();
          if (t >= start && t <= end) total += Number(e.amount_ngn || 0);
        }
        for (const bx of batches) {
          const t = new Date(bx.payment_date).getTime();
          if (t >= start && t <= end) total += actualDisbursedForBatch(bx, succeededByBatch);
        }
        spendMap[b.id] = total;
      }
      setSpendById(spendMap);
    } catch (err: any) {
      setError(err?.message || 'Failed to load budgets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  const pagination = usePagination(filtered, 20);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      period_start: toIsoDate(new Date()),
      period_end: toIsoDate(new Date(new Date().getFullYear(), 11, 31)),
      department_id: 'none',
      notes: '',
    });
    setItemsDraft([{ category: 'payroll', description: '', allocated_ngn: '' }]);
    setDialog(true);
  };

  const openEdit = async (r: BudgetRow) => {
    setEditing(r);
    setForm({
      name: r.name,
      period_start: r.period_start,
      period_end: r.period_end,
      department_id: r.department_id || 'none',
      notes: r.notes || '',
    });
    const { data, error } = await supabase
      .from('budget_items')
      .select('id, budget_id, category, description, allocated_ngn')
      .eq('budget_id', r.id)
      .order('created_at')
      .limit(1000);
    if (error) {
      toast({ title: 'Could not load line items', description: error.message, variant: 'destructive' });
      return;
    }
    const items = (data as BudgetItemRow[]) || [];
    setItemsDraft(
      items.length
        ? items.map((it) => ({
            id: it.id,
            category: it.category,
            description: it.description || '',
            allocated_ngn: String(it.allocated_ngn || 0),
          }))
        : [{ category: 'payroll', description: '', allocated_ngn: '' }],
    );
    setDialog(true);
  };

  const addItemRow = () =>
    setItemsDraft((prev) => [
      ...prev,
      { category: 'other', description: '', allocated_ngn: '' },
    ]);

  const updateItem = (idx: number, patch: Partial<ItemDraft>) =>
    setItemsDraft((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );

  const removeItem = (idx: number) =>
    setItemsDraft((prev) => prev.filter((_, i) => i !== idx));

  const draftTotal = itemsDraft.reduce(
    (sum, it) => sum + (parseFloat(it.allocated_ngn) || 0),
    0,
  );

  const save = async (submitForApproval: boolean) => {
    if (!form.name.trim()) {
      toast({ title: 'Budget name is required', variant: 'destructive' });
      return;
    }
    if (!form.period_start || !form.period_end) {
      toast({ title: 'Period is required', variant: 'destructive' });
      return;
    }
    if (new Date(form.period_end) < new Date(form.period_start)) {
      toast({ title: 'Period end must be after start', variant: 'destructive' });
      return;
    }
    const validItems = itemsDraft.filter(
      (it) => it.category.trim() && parseFloat(it.allocated_ngn) > 0,
    );
    if (validItems.length === 0) {
      toast({
        title: 'At least one line item is required',
        description: 'Add a category and a planned amount above ₦0.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const status = submitForApproval ? 'pending_approval' : editing?.status || 'draft';
      const payload = {
        name: form.name.trim(),
        period_start: form.period_start,
        period_end: form.period_end,
        // Some Supabase projects also have start_date / end_date columns
        start_date: form.period_start,
        end_date: form.period_end,
        period: `${form.period_start.slice(0, 7)} – ${form.period_end.slice(0, 7)}`,
        department_id: form.department_id === 'none' ? null : form.department_id,
        total_amount_ngn: validItems.reduce(
          (sum, it) => sum + (parseFloat(it.allocated_ngn) || 0),
          0,
        ),
        notes: form.notes || null,
        status,
      };

      let budgetId: string;
      if (editing) {
        const { error } = await supabase
          .from('budgets')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        budgetId = editing.id;
        await logAudit('budget_edited', `Budget "${payload.name}" updated`, profile);
      } else {
        const { data, error } = await supabase
          .from('budgets')
          .insert({ ...payload, created_by: profile?.id })
          .select('id')
          .single();
        if (error) throw error;
        budgetId = data.id;
        await logAudit(
          submitForApproval ? 'budget_submitted' : 'budget_created',
          `Budget "${payload.name}" ${submitForApproval ? 'submitted for approval' : 'created'} (${formatNaira(payload.total_amount_ngn)})`,
          profile,
        );
      }

      // Replace line items: simplest correct approach is delete+insert.
      const del = await supabase.from('budget_items').delete().eq('budget_id', budgetId);
      if (del.error) throw del.error;
      const toInsert = validItems.map((it) => ({
        budget_id: budgetId,
        category: it.category.trim(),
        description: it.description || null,
        allocated_ngn: parseFloat(it.allocated_ngn) || 0,
      }));
      if (toInsert.length > 0) {
        const ins = await supabase.from('budget_items').insert(toInsert);
        if (ins.error) throw ins.error;
      }

      if (submitForApproval && editing) {
        await logAudit(
          'budget_submitted',
          `Budget "${payload.name}" submitted for approval`,
          profile,
        );
      }

      toast({
        title: editing ? 'Budget updated' : 'Budget created',
        description: submitForApproval ? 'Submitted for approval.' : undefined,
      });
      setDialog(false);
      setEditing(null);
      load();
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitForApproval = async (r: BudgetRow) => {
    setActing(r.id);
    try {
      const { error } = await supabase.from('budgets').update({ status: 'pending_approval' }).eq('id', r.id);
      if (error) { toast({ title: 'Submit failed', description: error.message, variant: 'destructive' }); return; }
      await logAudit('budget_submitted', `Budget "${r.name}" submitted for approval`, profile);
      toast({ title: 'Submitted for approval' });
      load();
    } finally {
      setActing(null);
    }
  };

  const toggleLock = async (r: BudgetRow) => {
    if (!canManage) return;
    setActing(r.id);
    try {
      const next = !r.locked;
      const { error } = await supabase.from('budgets').update({ locked: next }).eq('id', r.id);
      if (error) { toast({ title: 'Could not toggle lock', description: error.message, variant: 'destructive' }); return; }
      await logAudit(next ? 'budget_locked' : 'budget_unlocked', `Budget "${r.name}" ${next ? 'locked' : 'unlocked'}`, profile);
      toast({
        title: next ? 'Budget locked' : 'Budget unlocked',
        description: next ? 'New expenses against its categories will be blocked.' : 'Submissions are allowed again.',
      });
      load();
    } finally {
      setActing(null);
    }
  };

  // Mirrors the server-side rule in approve_budget() so the button can be
  // disabled with an explanation instead of failing only after the click.
  const isSelfApprovalBlocked = (r: BudgetRow) =>
    r.created_by === profile?.id && !['admin', 'super_admin'].includes(profile?.role || '');

  const approve = async (r: BudgetRow) => {
    if (!canManage) return;
    setActing(r.id);
    try {
      // Routed through the approve_budget RPC so self-approval is blocked
      // server-side — whoever drafted this budget can't also approve it
      // unless they're admin/super_admin.
      const { error } = await supabase.rpc('approve_budget', { p_budget_id: r.id });
      if (error) { toast({ title: 'Approve failed', description: error.message, variant: 'destructive' }); return; }
      await logAudit('budget_approved', `Budget "${r.name}" approved (${formatNaira(r.total_amount_ngn)})`, profile);
      toast({ title: 'Budget approved' });
      load();
    } finally {
      setActing(null);
    }
  };

  const deleteBudget = async (r: BudgetRow) => {
    setActing(r.id);
    try {
      const { error } = await supabase.from('budgets').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
      if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
      await logAudit('budget_deleted', `Budget "${r.name}" deleted`, profile);
      toast({ title: 'Budget deleted' });
      setConfirmDelete(null);
      load();
    } finally {
      setActing(null);
    }
  };

  // Fire notifications when any budget crosses 80% / 100% utilisation.
  useEffect(() => {
    if (loading || !profile) return;
    const check = async () => {
      for (const b of rows) {
        const spent = spendById[b.id] || 0;
        const total = b.total_amount_ngn || 0;
        if (total <= 0 || b.status !== 'approved') continue;
        const pct = (spent / total) * 100;
        if (pct >= 100) {
          await supabase.from('notifications').insert({
            user_id: profile.id,
            type: 'budget_exceeded',
            title: `Budget exceeded: ${b.name}`,
            body: `${formatNaira(spent)} spent of ${formatNaira(total)}.`,
          });
        } else if (pct >= 80) {
          await supabase.from('notifications').insert({
            user_id: profile.id,
            type: 'budget_warning',
            title: `Budget at ${Math.round(pct)}%: ${b.name}`,
            body: `${formatNaira(spent)} spent of ${formatNaira(total)}.`,
          });
        }
      }
    };
    // fire and forget
    check().catch(() => {});
    // We intentionally rely on rows+spend only; re-running is idempotent in the
    // sense that the user will always see at-most one current notification per
    // page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows, spendById]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Budgets</h1>
            <InfoHint>Define departmental budgets and track actual spend. Overspend is flagged automatically so you can control costs before they escalate.</InfoHint>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Plan spend per category, track actuals, and control overruns.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New Budget
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="p-3 sm:p-4 border-b flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10 sm:h-9"
              placeholder="Search budgets..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="coin"
              title="No budgets created"
              description="Set up departments in Settings, then create budgets to track spending by department."
              action={
                canManage ? (
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Create Budget
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="w-[220px]">Utilisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((r) => {
                    const spent = spendById[r.id] || 0;
                    const total = r.total_amount_ngn || 0;
                    const pct = total > 0 ? Math.min(200, (spent / total) * 100) : 0;
                    const barColor =
                      pct >= 100
                        ? 'bg-destructive'
                        : pct >= 80
                        ? 'bg-warning'
                        : 'bg-success';
                    return (
                      <TableRow key={r.id} className="kd-transition">
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              className="font-medium hover:underline text-left"
                              onClick={() => openEdit(r)}
                            >
                              {r.name}
                            </button>
                            {r.locked && (
                              <Badge className="bg-destructive/10 text-destructive gap-1">
                                <Lock className="h-3 w-3" /> Locked
                              </Badge>
                            )}
                          </div>
                          {r.notes && (
                            <p className="text-xs text-muted-foreground truncate max-w-xs">
                              {r.notes}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(r.period_start)} – {formatDate(r.period_end)}
                        </TableCell>
                        <TableCell className="text-right currency">
                          {formatNaira(total)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right currency font-medium',
                            pct >= 100 && 'text-destructive',
                          )}
                        >
                          {formatNaira(spent)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn('h-full kd-transition', barColor)}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {total === 0 ? '—' : `${pct.toFixed(0)}%`}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={STATUS_CLASSES[r.status]}
                          >
                            {STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {r.status === 'draft' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => submitForApproval(r)}
                                disabled={!hasRole(profile?.role, MANAGER_ROLES) || acting === r.id}
                              >
                                Submit
                              </Button>
                            )}
                            {r.status === 'pending_approval' && canManage && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => approve(r)}
                                disabled={acting === r.id || isSelfApprovalBlocked(r)}
                                title={isSelfApprovalBlocked(r) ? 'You drafted this budget — another approver must review it' : undefined}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                              </Button>
                            )}
                            {canManage && r.status === 'approved' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleLock(r)}
                                title={r.locked ? 'Unlock budget' : 'Lock budget'}
                                disabled={acting === r.id}
                              >
                                {r.locked ? (
                                  <Unlock className="h-4 w-4" />
                                ) : (
                                  <Lock className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEdit(r)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDelete(r)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
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
                {pagination.slice.map((r) => {
                  const spent = spendById[r.id] || 0;
                  const total = r.total_amount_ngn || 0;
                  const pct = total > 0 ? Math.min(200, (spent / total) * 100) : 0;
                  const barColor =
                    pct >= 100 ? 'bg-destructive'
                    : pct >= 80 ? 'bg-warning'
                    : 'bg-success';
                  const accent =
                    r.status === 'draft' ? 'bg-muted-foreground'
                    : r.status === 'pending_approval' ? 'bg-amber-500'
                    : r.status === 'approved' ? 'bg-emerald-500'
                    : 'bg-muted-foreground';
                  return (
                    <MobileCard
                      key={r.id}
                      onClick={() => openEdit(r)}
                      accentClassName={accent}
                    >
                      <MobileCardHeader>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <MobileCardTitle>{r.name}</MobileCardTitle>
                            {r.locked && (
                              <Badge className="bg-destructive/10 text-destructive gap-1 h-4 px-1.5 text-[9px]">
                                <Lock className="h-2.5 w-2.5" /> Locked
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {formatDate(r.period_start)} – {formatDate(r.period_end)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn('text-base font-bold currency leading-tight', pct >= 100 && 'text-destructive')}>
                            {formatNaira(spent)}
                          </p>
                          <p className="text-[11px] text-muted-foreground currency">of {formatNaira(total)}</p>
                        </div>
                      </MobileCardHeader>

                      {/* Utilisation bar */}
                      <div className="space-y-1">
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full kd-transition', barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{total === 0 ? 'No budget' : `${pct.toFixed(0)}% utilised`}</span>
                          <Badge variant="secondary" className={cn('h-4 px-1.5 text-[9px]', STATUS_CLASSES[r.status])}>
                            {STATUS_LABELS[r.status] || r.status}
                          </Badge>
                        </div>
                      </div>

                      {r.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.notes}</p>
                      )}

                      {(r.status === 'draft' || (r.status === 'pending_approval' && canManage) || canManage) && (
                        <MobileCardFooter className="flex-wrap">
                          {r.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9"
                              onClick={(e) => { e.stopPropagation(); submitForApproval(r); }}
                              disabled={!hasRole(profile?.role, MANAGER_ROLES)}
                            >
                              Submit
                            </Button>
                          )}
                          {r.status === 'pending_approval' && canManage && (
                            <Button
                              size="sm"
                              className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                              onClick={(e) => { e.stopPropagation(); approve(r); }}
                            >
                              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve
                            </Button>
                          )}
                          {canManage && r.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 px-3"
                              onClick={(e) => { e.stopPropagation(); toggleLock(r); }}
                              title={r.locked ? 'Unlock budget' : 'Lock budget'}
                            >
                              {r.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 px-3 ml-auto"
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete(r); }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete budget</DialogTitle>
            <DialogDescription>
              Delete {confirmDelete?.name}? All budget line items will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDelete && deleteBudget(confirmDelete)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Budget' : 'New Budget'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. FY 2026 Operations Budget"
                />
              </div>
              <div className="space-y-1">
                <Label>Department</Label>
                <Select
                  value={form.department_id}
                  onValueChange={(v) => setForm({ ...form, department_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Period start</Label>
                <Input
                  type="date"
                  min="2020-01-01"
                  max="2099-12-31"
                  value={form.period_start}
                  onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Period end</Label>
                <Input
                  type="date"
                  min={form.period_start || '2020-01-01'}
                  max="2099-12-31"
                  value={form.period_end}
                  onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional — context for approvers."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line items</Label>
                <Button variant="outline" size="sm" onClick={addItemRow}>
                  <Plus className="mr-2 h-4 w-4" /> Add line
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Planned (₦)</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsDraft.map((it, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Input
                            list="budget-categories"
                            value={it.category}
                            onChange={(e) =>
                              updateItem(idx, { category: e.target.value })
                            }
                            placeholder="e.g. payroll"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={it.description}
                            onChange={(e) =>
                              updateItem(idx, { description: e.target.value })
                            }
                            placeholder="Optional"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            className="text-right"
                            value={it.allocated_ngn}
                            onChange={(e) =>
                              updateItem(idx, { allocated_ngn: e.target.value })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remove line item"
                            disabled={itemsDraft.length === 1}
                            onClick={() => removeItem(idx)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <datalist id="budget-categories">
                {CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <div className="flex justify-end text-sm">
                <span className="text-muted-foreground mr-2">Total:</span>
                <span className="font-bold currency">{formatNaira(draftTotal)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft
            </Button>
            <Button onClick={() => save(true)} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Submit for Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Budgets;
