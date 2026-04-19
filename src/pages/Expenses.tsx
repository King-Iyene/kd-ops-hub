import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Loader2,
  Plus,
  Check,
  X,
  Download,
  Search,
  Receipt,
  CarFront,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { notifyUser, notifyRoles } from '@/lib/notify';
import { formatNaira, formatNairaCompact, formatDate, toIsoDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { ErrorState } from '@/components/ui-kit/ErrorState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { toCsv, downloadCsv } from '@/lib/csv';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { createTransferRecipient, initiateTransfer, getBankCode } from '@/lib/paystack';

const CATEGORIES = [
  'fuel',
  'transport',
  'mileage',
  'office_supplies',
  'client_entertainment',
  'other',
] as const;

interface Expense {
  id: string;
  submitted_by: string;
  category: string;
  budget_category: string | null;
  amount_ngn: number;
  date: string;
  description: string | null;
  status: 'pending' | 'pending_second_approval' | 'approved' | 'rejected';
  mileage_km: number | null;
  rate_per_km_ngn: number | null;
  created_at: string;
  // Approval tracking
  approved_by: string | null;
  approved_at: string | null;
  approved_by_secondary: string | null;
  approved_by_secondary_at: string | null;
  // Payment fields
  payment_status: 'pending' | 'processing' | 'processed' | 'failed' | null;
  payment_reference: string | null;
  account_number: string | null;
  bank_name: string | null;
  account_name: string | null;
}

interface BudgetSummary {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  status: string;
  locked: boolean;
  total_amount_ngn: number;
  // Categories that are part of this budget
  categories: string[];
}

const DEFAULT_MILEAGE_RATE = 100; // ₦/km — sensible default for Nigeria

// Compute a normalized "mileage" amount from km × rate.
const mileageAmount = (km: number, rate: number) =>
  Math.max(0, Math.round(km * rate * 100) / 100);

const Expenses = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const isApprover =
    profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'super_admin';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  // Per-category maximum ₦ amount — pulled from company_settings.expense_limits.
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [dualThreshold, setDualThreshold] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Expense['status']>(
    'all',
  );
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    category: 'other',
    amount_ngn: '',
    date: toIsoDate(new Date()),
    description: '',
    mileage_km: '',
    rate_per_km_ngn: String(DEFAULT_MILEAGE_RATE),
  });

  const EMPTY_BANK: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };
  const [bankDetails, setBankDetails] = useState<BankAccountValue>(EMPTY_BANK);
  const [showBankSection, setShowBankSection] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState<Expense | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Read role fresh from the store on every call so we never use a stale
      // closure value (avoids the edge case where profile loads after the
      // callback was first created, leaving isApprover incorrectly false).
      const currentProfile = useAuthStore.getState().profile;
      const privileged =
        currentProfile?.role === 'super_admin' ||
        currentProfile?.role === 'admin' ||
        currentProfile?.role === 'finance';

      let query = supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });
      if (!privileged) query = query.eq('submitted_by', currentProfile?.id || '');
      const [expensesRes, budgetsRes, itemsRes, settingsRes] = await Promise.all([
        query,
        supabase
          .from('budgets')
          .select('id, name, period_start, period_end, status, locked, total_amount_ngn')
          .eq('status', 'approved'),
        supabase.from('budget_items').select('budget_id, category'),
        supabase
          .from('company_settings')
          .select('expense_limits, dual_approval_threshold_ngn')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
      console.log('[KDOps] expenses fetch:', {
        count: expensesRes.data?.length,
        error: expensesRes.error?.message,
        privileged,
        userId: currentProfile?.id,
      });
      if (expensesRes.error) throw expensesRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

      const rawThreshold = Number((settingsRes.data as any)?.dual_approval_threshold_ngn ?? 0);
      setDualThreshold(Number.isFinite(rawThreshold) && rawThreshold > 0 ? rawThreshold : 0);

      const rawLimits =
        (settingsRes.data as any)?.expense_limits || ({} as Record<string, number>);
      // Coerce any string values from the JSON column into numbers.
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(rawLimits)) {
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        if (Number.isFinite(n) && n > 0) cleaned[k] = n;
      }
      setLimits(cleaned);

      const itemsByBudget = new Map<string, string[]>();
      for (const it of (itemsRes.data || []) as any[]) {
        if (!itemsByBudget.has(it.budget_id))
          itemsByBudget.set(it.budget_id, []);
        itemsByBudget.get(it.budget_id)!.push(it.category);
      }

      setExpenses((expensesRes.data as Expense[]) || []);
      setBudgets(
        ((budgetsRes.data as any[]) || []).map((b) => ({
          ...b,
          categories: itemsByBudget.get(b.id) || [],
        })),
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -- Payment helpers -------------------------------------------------------

  const canProcessPayment = (e: Expense) =>
    isApprover &&
    e.status === 'approved' &&
    (e.payment_status === 'pending' || e.payment_status == null) &&
    !!e.account_number &&
    !!e.bank_name &&
    !!e.account_name;

  const canRetryPayment = (e: Expense) =>
    isApprover &&
    e.status === 'approved' &&
    e.payment_status === 'failed' &&
    !!e.account_number &&
    !!e.bank_name &&
    !!e.account_name;

  const paymentBadge = (status: Expense['payment_status']) => {
    if (!status || status === 'pending')
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending Payment</Badge>;
    if (status === 'processing')
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Processing</Badge>;
    if (status === 'processed')
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Paid</Badge>;
    if (status === 'failed')
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Failed</Badge>;
    return null;
  };

  const processExpensePayment = async (expense: Expense) => {
    setProcessingPayment(true);
    let batchId: string | null = null;
    let itemId: string | null = null;
    try {
      const { data: batch, error: batchErr } = await supabase
        .from('payment_batches')
        .insert({
          name: `Expense Reimbursement — ${expense.account_name}`,
          payment_description: `Expense: ${expense.description || expense.category}`,
          payment_category: 'expense_reimbursement',
          is_quick_pay: true,
          total_amount: expense.amount_ngn,
          beneficiary_count: 1,
          status: 'approved',
          created_by: profile?.id,
        })
        .select('id')
        .single();
      if (batchErr) throw new Error(batchErr.message);
      batchId = batch.id;

      const { data: batchItem, error: itemErr } = await supabase
        .from('batch_items')
        .insert({
          batch_id: batchId,
          full_name: expense.account_name,
          bank_name: expense.bank_name,
          account_number: expense.account_number,
          amount_ngn: expense.amount_ngn,
          status: 'pending',
        })
        .select('id')
        .single();
      if (itemErr) throw new Error(itemErr.message);
      itemId = batchItem.id;

      await supabase
        .from('expenses')
        .update({ payment_reference: batchId, payment_status: 'processing' })
        .eq('id', expense.id);

      const bankCode = getBankCode(expense.bank_name!);
      if (!bankCode) throw new Error(`Unrecognised bank: ${expense.bank_name}`);

      const recipient = await createTransferRecipient({
        name: expense.account_name!,
        account_number: expense.account_number!,
        bank_code: bankCode,
      });

      const ref = `kdops_${itemId.replace(/-/g, '').slice(0, 20)}`;
      const transfer = await initiateTransfer({
        recipient_code: recipient.recipient_code,
        amount_ngn: Number(expense.amount_ngn),
        reference: ref,
        reason: 'KDOps Expense Reimbursement',
      });

      await supabase
        .from('batch_items')
        .update({
          paystack_recipient_code: recipient.recipient_code,
          paystack_transfer_code: transfer.transfer_code,
          paystack_reference: transfer.reference,
        })
        .eq('id', itemId);

      await supabase
        .from('payment_batches')
        .update({ status: 'processing' })
        .eq('id', batchId);

      await logAudit(
        'expense_payment_initiated',
        `Expense payment initiated — ${expense.account_name} — ${formatNaira(Number(expense.amount_ngn))} (ref ${transfer.reference})`,
        profile,
      );
      toast({
        title: 'Payment initiated',
        description: `${formatNaira(Number(expense.amount_ngn))} to ${expense.account_name}`,
      });
    } catch (err: any) {
      if (batchId) {
        await supabase
          .from('expenses')
          .update({ payment_status: 'failed' })
          .eq('id', expense.id);
      }
      if (itemId) {
        await supabase
          .from('batch_items')
          .update({ status: 'failed', failure_reason: err?.message })
          .eq('id', itemId);
      }
      toast({
        title: 'Payment failed to initiate',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setProcessingPayment(false);
      setConfirmPayment(null);
      fetchData();
    }
  };

  // -- Lock enforcement -----------------------------------------------------

  /**
   * Returns the locked budget covering this category on this date, if any.
   * Returns null when submission is allowed.
   */
  const findLockingBudget = (
    category: string,
    onDate: string,
  ): BudgetSummary | null => {
    const t = new Date(onDate).getTime();
    for (const b of budgets) {
      if (!b.locked) continue;
      const s = new Date(b.period_start).getTime();
      const e = new Date(b.period_end).getTime() + 24 * 60 * 60 * 1000 - 1;
      if (t < s || t > e) continue;
      if (b.categories.includes(category)) return b;
    }
    return null;
  };

  // -- Submit ---------------------------------------------------------------

  const submitExpense = async () => {
    if (!form.category) {
      toast({ title: 'Pick a category', variant: 'destructive' });
      return;
    }

    let amount = parseFloat(form.amount_ngn) || 0;
    let mileageKm: number | null = null;
    let ratePerKm: number | null = null;

    if (form.category === 'mileage') {
      mileageKm = parseFloat(form.mileage_km);
      ratePerKm = parseFloat(form.rate_per_km_ngn);
      if (!Number.isFinite(mileageKm) || mileageKm <= 0) {
        toast({ title: 'Enter the kilometres driven', variant: 'destructive' });
        return;
      }
      if (!Number.isFinite(ratePerKm) || ratePerKm <= 0) {
        toast({ title: 'Enter a valid ₦/km rate', variant: 'destructive' });
        return;
      }
      amount = mileageAmount(mileageKm, ratePerKm);
    } else if (amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    const blocker = findLockingBudget(form.category, form.date);
    if (blocker) {
      toast({
        title: 'Budget locked',
        description: `Submissions in "${form.category}" are blocked by budget "${blocker.name}".`,
        variant: 'destructive',
      });
      return;
    }

    // Company-level expense policy: block if over the per-category cap.
    const policyLimit = limits[form.category];
    if (policyLimit && amount > policyLimit) {
      toast({
        title: 'Above expense policy limit',
        description: `The ${form.category.replace(/_/g, ' ')} category is capped at ${formatNaira(policyLimit)}. Ask Finance to raise the limit or split this expense.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    const { data: inserted, error } = await supabase.from('expenses').insert({
      submitted_by: profile?.id || '',
      category: form.category,
      budget_category: form.category,
      amount_ngn: amount,
      mileage_km: mileageKm,
      rate_per_km_ngn: ratePerKm,
      date: form.date,
      description: form.description || null,
      status: 'pending',
      ...(bankDetails.verified
        ? {
            bank_name: bankDetails.bank_name,
            account_number: bankDetails.account_number,
            account_name: bankDetails.account_name,
          }
        : {}),
    }).select();
    console.log('[KDOps] expense insert:', { inserted, error, userId: profile?.id });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      await logAudit(
        'expense_submitted',
        `Expense submitted: ${form.category} — ${formatNaira(amount)}${mileageKm ? ` (${mileageKm} km × ${formatNaira(ratePerKm || 0)}/km)` : ''}`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'expense_submitted',
        module: 'expenses',
        title: 'Expense submitted for approval',
        body: `${form.category.replace(/_/g, ' ')} — ${formatNaira(amount)}`,
      });
      toast({ title: 'Expense submitted' });
      setShowForm(false);
      setForm({
        category: 'other',
        amount_ngn: '',
        date: toIsoDate(new Date()),
        description: '',
        mileage_km: '',
        rate_per_km_ngn: String(DEFAULT_MILEAGE_RATE),
      });
      setShowBankSection(false);
      setBankDetails(EMPTY_BANK);
      await fetchData();
    }
    setSubmitting(false);
  };

  // -- Approve / reject -----------------------------------------------------

  const [rejectingExpense, setRejectingExpense] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleAction = async (
    expense: Expense,
    status: 'approved' | 'rejected',
  ) => {
    if (!isApprover) {
      toast({
        title: 'Not authorized',
        description: 'Only Admin or Finance roles can approve or reject expenses.',
        variant: 'destructive',
      });
      return;
    }
    if (status === 'rejected') {
      setRejectingExpense(expense);
      setRejectReason('');
      return;
    }

    const now = new Date().toISOString();
    const amountNgn = Number(expense.amount_ngn || 0);
    const cat = expense.category.replace(/_/g, ' ');
    const amtStr = formatNaira(amountNgn);

    // --- Second approval (expense is already pending_second_approval) ---
    if (expense.status === 'pending_second_approval') {
      if (expense.approved_by === profile?.id) {
        toast({
          title: 'Second approval must come from a different approver',
          description: 'You recorded the first approval on this expense.',
          variant: 'destructive',
        });
        return;
      }
      const { error } = await supabase
        .from('expenses')
        .update({
          status: 'approved',
          approved_by_secondary: profile?.id,
          approved_by_secondary_at: now,
        })
        .eq('id', expense.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      await logAudit(
        'expense_approved',
        `Expense fully approved (2nd approval): ${cat} — ${amtStr}`,
        profile,
      );
      if (expense.submitted_by) {
        await notifyUser({
          userId: expense.submitted_by,
          type: 'expense_approved',
          module: 'expenses',
          title: 'Your expense was approved',
          body: `${cat} — ${amtStr}`,
        });
      }
      toast({ title: 'Expense fully approved' });
      fetchData();
      return;
    }

    // --- First / only approval (expense is pending) ---
    const needsDual = dualThreshold > 0 && amountNgn >= dualThreshold;

    if (needsDual) {
      const { error } = await supabase
        .from('expenses')
        .update({
          status: 'pending_second_approval',
          approved_by: profile?.id,
          approved_at: now,
        })
        .eq('id', expense.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      await logAudit(
        'expense_first_approval',
        `First approval for high-value expense: ${cat} — ${amtStr} (threshold: ${formatNaira(dualThreshold)})`,
        profile,
      );
      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'expense_needs_second_approval',
        module: 'expenses',
        title: 'High-value expense awaiting second approval',
        body: `${cat} — ${amtStr}`,
      });
      toast({
        title: 'First approval recorded',
        description: 'A second approver must confirm this high-value expense.',
      });
      fetchData();
    } else {
      const { error } = await supabase
        .from('expenses')
        .update({
          status: 'approved',
          approved_by: profile?.id,
          approved_at: now,
        })
        .eq('id', expense.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      await logAudit(
        'expense_approved',
        `Expense approved: ${cat} — ${amtStr}`,
        profile,
      );
      if (expense.submitted_by) {
        await notifyUser({
          userId: expense.submitted_by,
          type: 'expense_approved',
          module: 'expenses',
          title: 'Your expense was approved',
          body: `${cat} — ${amtStr}`,
        });
      }
      toast({ title: 'Expense approved' });
      fetchData();
    }
  };

  const doReject = async () => {
    if (!rejectingExpense) return;
    if (!isValidRejectionReason(rejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const e = rejectingExpense;
    const { error } = await supabase
      .from('expenses')
      .update({ status: 'rejected', rejection_reason: rejectReason.trim() })
      .eq('id', e.id);
    if (error) {
      toast({ title: 'Reject failed', description: error.message, variant: 'destructive' });
      return;
    }
    await writeRejectionNotification({
      entity: 'expense',
      entityLabel: 'expense',
      amount: e.amount_ngn,
      reason: rejectReason.trim(),
      submitterId: e.submitted_by || null,
      actor: profile,
      auditType: 'expense_rejected',
      auditDescription: `Expense rejected: ${e.category} — ${formatNaira(e.amount_ngn || 0)} — ${rejectReason.trim()}`,
    });
    toast({ title: 'Expense rejected' });
    setRejectingExpense(null);
    setRejectReason('');
    fetchData();
  };

  /**
   * Clone a rejected expense as a new pending row so the submitter can tweak
   * and resubmit. The old row is preserved for audit.
   */
  const resubmitExpense = async (e: Expense) => {
    const { error } = await supabase.from('expenses').insert({
      submitted_by: profile?.id || '',
      category: e.category,
      budget_category: e.budget_category || e.category,
      amount_ngn: e.amount_ngn,
      mileage_km: e.mileage_km,
      rate_per_km_ngn: e.rate_per_km_ngn,
      date: e.date,
      description: e.description,
      status: 'pending',
      resubmitted_from_id: e.id,
    });
    if (error) {
      toast({ title: 'Resubmit failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'resubmission_created',
      `Expense re-edited and resubmitted: ${e.category} — ${formatNaira(e.amount_ngn || 0)}`,
      profile,
    );
    toast({ title: 'Resubmitted for approval' });
    fetchData();
  };

  const bulkApproveAll = async () => {
    if (!isApprover) return;
    const pending = expenses.filter((e) => e.status === 'pending');
    if (pending.length === 0) return;
    const total = pending.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
    const ok = window.confirm(
      `You are about to approve ${pending.length} expense claims totalling ${formatNaira(total)}. This cannot be undone. Proceed?`,
    );
    if (!ok) return;
    setBulkLoading(true);
    try {
      const ids = pending.map((p) => p.id);
      const { error } = await supabase
        .from('expenses')
        .update({ status: 'approved' })
        .in('id', ids);
      if (error) {
        toast({
          title: 'Bulk approve failed',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }
      const total = pending.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
      await logAudit(
        'bulk_approved',
        `Bulk approved ${pending.length} expenses (${formatNaira(total)})`,
        profile,
      );
      toast({
        title: `Approved ${pending.length} expense${pending.length === 1 ? '' : 's'}`,
        description: `${formatNaira(total)} total`,
      });
      setSelected(new Set());
      fetchData();
    } finally {
      setBulkLoading(false);
    }
  };

  const bulkApproveSelected = async () => {
    if (!isApprover) return;
    const rows = expenses.filter((e) => selected.has(e.id) && e.status === 'pending');
    if (rows.length === 0) return;
    setBulkLoading(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ status: 'approved' })
        .in('id', rows.map((r) => r.id));
      if (error) throw error;
      const total = rows.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
      await logAudit(
        'bulk_approved',
        `Bulk approved ${rows.length} selected expenses (${formatNaira(total)})`,
        profile,
      );
      toast({ title: `Approved ${rows.length} selected` });
      setSelected(new Set());
      fetchData();
    } catch (err: any) {
      toast({
        title: 'Bulk approve failed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setBulkLoading(false);
    }
  };

  // -- Filter / paginate ----------------------------------------------------

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (e.description || '').toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [expenses, search, statusFilter, categoryFilter]);

  const pagination = usePagination(filtered, 20);

  // -- Trend chart ----------------------------------------------------------

  const trendData = useMemo(() => {
    // Last 6 months grouped by month, broken out by category for the major
    // ones.
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-GB', { month: 'short' }),
      });
    }
    const buckets = months.map((m) => ({
      month: m.label,
      key: m.key,
      fuel: 0,
      transport: 0,
      mileage: 0,
      office_supplies: 0,
      other: 0,
      total: 0,
    }));
    for (const e of expenses) {
      if (e.status !== 'approved') continue;
      const d = new Date(e.date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.find((b) => b.key === k);
      if (!bucket) continue;
      const amt = Number(e.amount_ngn || 0);
      bucket.total += amt;
      if (
        e.category === 'fuel' ||
        e.category === 'transport' ||
        e.category === 'mileage' ||
        e.category === 'office_supplies'
      ) {
        (bucket as any)[e.category] += amt;
      } else {
        bucket.other += amt;
      }
    }
    return buckets;
  }, [expenses]);

  // -- Stats / selection ----------------------------------------------------

  const pendingCount = expenses.filter((e) => e.status === 'pending').length;
  const visibleAllChecked =
    pagination.slice.length > 0 &&
    pagination.slice
      .filter((r) => r.status === 'pending')
      .every((r) => selected.has(r.id));

  const toggleSelected = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAllVisible = (on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of pagination.slice) {
        if (r.status !== 'pending') continue;
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });

  const exportCSV = () => {
    const approved = expenses.filter((e) => e.status === 'approved');
    const header = ['date', 'category', 'amount_ngn', 'mileage_km', 'rate_per_km_ngn', 'description'];
    const rows = approved.map((e) => [
      e.date,
      e.category,
      e.amount_ngn,
      e.mileage_km ?? '',
      e.rate_per_km_ngn ?? '',
      e.description ?? '',
    ]);
    downloadCsv(`kdops-expenses-${toIsoDate(new Date())}.csv`, toCsv(header, rows));
  };

  // -- Render ---------------------------------------------------------------

  // Live preview values for mileage form
  const mileagePreview = (() => {
    const km = parseFloat(form.mileage_km);
    const rate = parseFloat(form.rate_per_km_ngn);
    if (!Number.isFinite(km) || km <= 0 || !Number.isFinite(rate) || rate <= 0)
      return null;
    return mileageAmount(km, rate);
  })();

  const lockingBudget = findLockingBudget(form.category, form.date);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Track and manage expense claims."
        actions={
          <>
            {isApprover && (
              <Button
                variant="outline"
                onClick={exportCSV}
                disabled={expenses.length === 0}
              >
                <Download className="mr-2 h-4 w-4" /> Export CSV
              </Button>
            )}
            {isApprover && pendingCount > 0 && (
              <Button
                variant="outline"
                onClick={bulkApproveAll}
                disabled={bulkLoading}
              >
                {bulkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" />
                Approve all pending ({pendingCount})
              </Button>
            )}
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Expense
            </Button>
          </>
        }
      />

      {/* Trend chart — managers only */}
      {isApprover && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Approved Spend — Last 6 Months</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
                <Tooltip formatter={(v: number) => formatNaira(v)} />
                <Legend />
                <Bar dataKey="fuel" stackId="a" fill="#006994" name="Fuel" />
                <Bar dataKey="transport" stackId="a" fill="#00ECFF" name="Transport" />
                <Bar dataKey="mileage" stackId="a" fill="#D6AC50" name="Mileage" />
                <Bar dataKey="office_supplies" stackId="a" fill="#22c55e" name="Office" />
                <Bar dataKey="other" stackId="a" fill="#a855f7" name="Other" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search description or category..."
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
              <SelectItem value="pending_second_approval">Pending 2nd Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isApprover && selected.size > 0 && (
            <Button
              size="sm"
              onClick={bulkApproveSelected}
              disabled={bulkLoading}
            >
              {bulkLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Check className="mr-2 h-4 w-4" />
              Approve {selected.size} selected
            </Button>
          )}
        </div>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchData} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No expenses match your filters"
              description="Submit a new expense or relax filters above."
              action={
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New Expense
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    {isApprover && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={visibleAllChecked}
                          onCheckedChange={(v) => toggleAllVisible(Boolean(v))}
                          aria-label="Select all pending on this page"
                        />
                      </TableHead>
                    )}
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    {isApprover && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((e) => (
                    <TableRow key={e.id} className="kd-transition">
                      {isApprover && (
                        <TableCell>
                          {e.status === 'pending' && (
                            <Checkbox
                              checked={selected.has(e.id)}
                              onCheckedChange={(v) =>
                                toggleSelected(e.id, Boolean(v))
                              }
                              aria-label={`Select ${e.category}`}
                            />
                          )}
                        </TableCell>
                      )}
                      <TableCell className="capitalize font-medium">
                        <span className="inline-flex items-center gap-2">
                          {e.category === 'mileage' && (
                            <CarFront className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {e.category?.replace(/_/g, ' ')}
                          {e.mileage_km && (
                            <span className="text-xs text-muted-foreground">
                              · {e.mileage_km} km × {formatNaira(e.rate_per_km_ngn || 0)}/km
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right currency">
                        {formatNaira(e.amount_ngn)}
                      </TableCell>
                      <TableCell>{formatDate(e.date)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {e.description || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <Badge
                            variant="secondary"
                            className={
                              e.status === 'approved'
                                ? 'bg-success/10 text-success'
                                : e.status === 'rejected'
                                ? 'bg-destructive/10 text-destructive'
                                : e.status === 'pending_second_approval'
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-warning/10 text-warning'
                            }
                          >
                            {e.status === 'pending_second_approval'
                              ? 'Pending 2nd Approval'
                              : e.status}
                          </Badge>
                          {e.status === 'pending_second_approval' && (
                            <span className="text-[10px] text-muted-foreground">
                              1 of 2 approvals
                            </span>
                          )}
                          {e.status === 'approved' && e.approved_by_secondary && (
                            <span className="text-[10px] text-muted-foreground">
                              Dual approved
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {e.status === 'approved' && paymentBadge(e.payment_status)}
                      </TableCell>
                      {isApprover && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 items-center">
                            {e.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAction(e, 'approved')}
                                >
                                  <Check className="h-4 w-4 text-success" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAction(e, 'rejected')}
                                >
                                  <X className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                            {e.status === 'pending_second_approval' && (
                              e.approved_by === profile?.id ? (
                                <span className="text-xs text-muted-foreground">
                                  You approved · awaiting 2nd
                                </span>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Give second approval"
                                    onClick={() => handleAction(e, 'approved')}
                                  >
                                    <Check className="h-4 w-4 text-success" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleAction(e, 'rejected')}
                                  >
                                    <X className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              )
                            )}
                            {e.status === 'rejected' && e.submitted_by === profile?.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => resubmitExpense(e)}
                              >
                                Re-edit & Resubmit
                              </Button>
                            )}
                            {canProcessPayment(e) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-success border-success/40 hover:bg-success/5"
                                onClick={() => setConfirmPayment(e)}
                              >
                                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Pay
                              </Button>
                            )}
                            {canRetryPayment(e) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmPayment(e)}
                              >
                                <CreditCard className="mr-1.5 h-3.5 w-3.5" /> Retry
                              </Button>
                            )}
                            {e.status === 'approved' && e.payment_status === 'processing' && (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" /> Processing
                              </span>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Expense Claim</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.category === 'mileage' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Distance (km)</Label>
                  <Input
                    type="number"
                    value={form.mileage_km}
                    onChange={(e) =>
                      setForm({ ...form, mileage_km: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Rate (₦/km)</Label>
                  <Input
                    type="number"
                    value={form.rate_per_km_ngn}
                    onChange={(e) =>
                      setForm({ ...form, rate_per_km_ngn: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  Calculated amount:{' '}
                  <span className="font-semibold currency text-foreground">
                    {mileagePreview !== null ? formatNaira(mileagePreview) : '—'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Amount (₦)</Label>
                  <Input
                    type="number"
                    value={form.amount_ngn}
                    onChange={(e) =>
                      setForm({ ...form, amount_ngn: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>
            )}
            {form.category === 'mileage' && (
              <div className="space-y-1">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="What was the expense for?"
              />
            </div>

            {lockingBudget && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Submission blocked: budget "{lockingBudget.name}" is locked for
                  this category.
                </span>
              </div>
            )}

            {limits[form.category] && (
              <div className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/5 p-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-accent" />
                <span>
                  Policy cap on {form.category.replace(/_/g, ' ')}:{' '}
                  <span className="font-semibold">
                    {formatNaira(limits[form.category])}
                  </span>
                  . Anything above is blocked automatically.
                </span>
              </div>
            )}

            <div className="pt-2 border-t">
              {!showBankSection ? (
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                  onClick={() => setShowBankSection(true)}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Add bank account for reimbursement (optional)
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Bank account for reimbursement{' '}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => { setShowBankSection(false); setBankDetails(EMPTY_BANK); }}
                    >
                      Remove
                    </button>
                  </div>
                  <BankAccountField value={bankDetails} onChange={setBankDetails} />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitExpense}
              disabled={submitting || !form.category || !!lockingBudget}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmPayment}
        onOpenChange={(v) => { if (!v) setConfirmPayment(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
          </DialogHeader>
          {confirmPayment && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Process reimbursement of{' '}
                <span className="font-semibold text-foreground">
                  {formatNaira(confirmPayment.amount_ngn)}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-foreground">
                  {confirmPayment.account_name}
                </span>
                ?
              </p>
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div><span className="text-muted-foreground">Bank: </span>{confirmPayment.bank_name}</div>
                <div><span className="text-muted-foreground">Account: </span>{confirmPayment.account_number}</div>
                <div><span className="text-muted-foreground">Category: </span>{confirmPayment.category}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPayment(null)} disabled={processingPayment}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmPayment && processExpensePayment(confirmPayment)}
              disabled={processingPayment}
            >
              {processingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Process Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectingExpense}
        onOpenChange={(v) => {
          if (!v) {
            setRejectingExpense(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject expense</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The submitter will be notified with this reason. They'll see a
            "Re-edit & Resubmit" button on the row.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingExpense(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={doReject}
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

export default Expenses;
