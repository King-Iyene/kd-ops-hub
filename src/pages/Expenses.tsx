import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
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
  ExternalLink,
  Paperclip,
  Info,
  Trash2,
  RefreshCw,
  RotateCcw,
  BanknoteIcon,
  Pencil,
} from 'lucide-react';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/hooks/use-confirm';
import { compressImage } from '@/lib/image-compression';
import { friendlyDbError } from '@/lib/db-errors';
import { useAuthStore } from '@/store/authStore';
import { usePermission } from '@/hooks/usePermission';
import { ChartGradients, GlassTooltip, axisTick, chartAnim, chartTheme } from '@/components/ChartKit';
import { burst } from '@/components/Burst';
import { logAudit } from '@/lib/audit';
import { validateFile } from '@/lib/file-validation';
import { writeRejectionNotification, isValidRejectionReason } from '@/lib/rejections';
import { OcrReceiptScanner, OcrResult } from '@/components/OcrReceiptScanner';
import { generateElaHeatmap } from '@/lib/receiptForensics';
import { notifyUser, notifyRoles } from '@/lib/notify';
import { notifyApprovalDecision } from '@/lib/approval-notify';
import {
  approveExpense,
  approvePaymentBatch,
  confirmSecondExpenseApproval,
  createExpensePaymentBatch,
  rejectExpense,
} from '@/lib/transfer-safety';
import { formatNaira, formatNairaCompact, formatDate, toIsoDate } from '@/lib/format';
import { EXPENSE_CATEGORY_KEYS, expenseCategoryLabel } from '@/lib/expense-categories';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
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
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
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
import { usePageTitle } from '@/hooks/usePageTitle';
import { toCsv, downloadCsv } from '@/lib/csv';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { cn } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

const CATEGORIES = EXPENSE_CATEGORY_KEYS;

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
  fuel_request_id: string | null;
  is_reimbursement: boolean | null;
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
  receipt_url: string | null;
  is_anomaly: boolean | null;
  anomaly_type: string | null;
  admin_note: string | null;
  vendor_name: string | null;
  profiles?: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
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

const TabCount = ({ n }: { n: number }) => (
  <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
    {n}
  </span>
);

const Expenses = () => {
  usePageTitle('Expenses');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const canApprovePerm = usePermission('expenses.approve');
  const canProcessPerm = usePermission('expenses.process_payments');
  const isApprover =
    (profile?.role === 'admin' ||
    profile?.role === 'finance' ||
    profile?.role === 'super_admin') && canApprovePerm;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  // Per-category maximum ₦ amount — pulled from company_settings.expense_limits.
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [dualThreshold, setDualThreshold] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(
    'pending',
  );
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
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
  const [isReimbursement, setIsReimbursement] = useState(true);
  const [showBankSection, setShowBankSection] = useState(false);
  const [bankBannerDismissed, setBankBannerDismissed] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [confirmPayment, setConfirmPayment] = useState<Expense | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [bulkApproveConfirm, setBulkApproveConfirm] = useState<{ count: number; total: number } | null>(null);
  const [confirmDeleteExpense, setConfirmDeleteExpense] = useState<Expense | null>(null);

  // Tamper-analysis (ELA) preview — same on-demand visual aid used on fuel
  // receipts in Fleet.tsx, generic over any receipt URL.
  const [elaTarget, setElaTarget] = useState<{ id: string; url: string } | null>(null);
  const [elaResult, setElaResult] = useState<{ heatmapDataUrl: string } | null>(null);
  const [elaLoading, setElaLoading] = useState(false);
  const [elaError, setElaError] = useState('');
  const openElaAnalysis = async (id: string, url: string) => {
    setElaTarget({ id, url });
    setElaResult(null);
    setElaError('');
    setElaLoading(true);
    try {
      const result = await generateElaHeatmap(url);
      setElaResult({ heatmapDataUrl: result.heatmapDataUrl });
    } catch (err: any) {
      setElaError(err?.message || "Couldn't generate analysis for this image.");
    } finally {
      setElaLoading(false);
    }
  };

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
        .select('*, profiles:submitted_by(full_name, first_name, last_name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (!privileged) query = query.eq('submitted_by', currentProfile?.id || '');
      const [expensesRes, budgetsRes, itemsRes, settingsRes] = await Promise.all([
        query,
        supabase
          .from('budgets')
          .select('id, name, period_start, period_end, status, locked, total_amount_ngn')
          .eq('status', 'approved')
          .is('deleted_at', null),
        supabase.from('budget_items').select('budget_id, category').limit(20000),
        supabase
          .from('company_settings')
          .select('expense_limits, dual_approval_threshold_ngn')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle(),
      ]);
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When navigated here from Approvals with a specific expense id, auto-open
  // the detail dialog once the expense list has loaded.
  const autoOpenHandled = useRef(false);
  useEffect(() => {
    if (autoOpenHandled.current) return;
    const openId = (location.state as any)?.openExpenseId;
    if (!openId || !expenses.length) return;
    const target = expenses.find((e) => e.id === openId);
    if (target) {
      setDetailExpense(target);
      autoOpenHandled.current = true;
    }
  }, [expenses, location.state]);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchData);

  // -- Payment helpers -------------------------------------------------------

  const canProcessPayment = (e: Expense) =>
    isApprover &&
    canProcessPerm &&
    e.status === 'approved' &&
    // Block re-pay: once a payment batch exists for this expense, the Pay
    // button must hide. The webhook flips payment_status to processed/failed
    // once Paystack confirms — but if the webhook is delayed, payment_reference
    // is still our source of truth that "this expense already has a batch in
    // flight". Only canRetryPayment (payment_status === 'failed') reopens it.
    !e.payment_reference &&
    (e.payment_status === 'pending' || e.payment_status == null) &&
    !!e.account_number &&
    !!e.bank_name &&
    !!e.account_name;

  const canRetryPayment = (e: Expense) =>
    isApprover &&
    canProcessPerm &&
    e.status === 'approved' &&
    e.payment_status === 'failed' &&
    !!e.account_number &&
    !!e.bank_name &&
    !!e.account_name;

  const paymentBadge = (status: Expense['payment_status']) => {
    if (!status || status === 'pending')
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-400 dark:border-yellow-500/30">Pending Payment</Badge>;
    if (status === 'processing')
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30">Processing</Badge>;
    if (status === 'processed')
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30">Paid</Badge>;
    if (status === 'failed')
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/30">Failed</Badge>;
    return null;
  };

  const processExpensePayment = async (expense: Expense) => {
    setProcessingPayment(true);
    let batchId: string | null = null;
    try {
      // create_expense_payment_batch wraps the four-step expense → batch
      // creation flow in one SECURITY DEFINER transaction: cap check + batch
      // INSERT + line-item INSERT + expense link, atomically. Closes B-2:
      // the previous client-side path could leave an orphan batch on a
      // network blip and skipped check_transfer_caps entirely.
      const created = await createExpensePaymentBatch(expense.id);
      batchId = (created as any)?.id ?? null;
      if (!batchId) throw new Error('Could not materialize payment batch');

      // For fuel-linked expenses, flip the parent fuel_request to
      // 'payment_sent' so the employee sees the "Upload Receipt" prompt and
      // the admin no longer sees a stale "Mark Payment Sent" / "Pay" button.
      if (expense.fuel_request_id) {
        await supabase
          .from('fuel_requests')
          .update({ status: 'payment_sent', payment_sent_at: new Date().toISOString() })
          .eq('id', expense.fuel_request_id);
      }

      // Auto-approve the new batch on the operator's behalf — the underlying
      // expense is already fully approved, so the Pay click stands in for
      // the batch's first approval. The RPC still enforces caps and routes
      // to pending_second_approval above the caller's co-approval threshold,
      // preserving dual-approval on high-value payments.
      let postApproveStatus: string = 'pending_approval';
      try {
        const updated = await approvePaymentBatch(batchId);
        postApproveStatus = (updated as any)?.status || 'approved';
      } catch (rpcErr: any) {
        toast({
          title: 'Auto-approve blocked',
          description: rpcErr?.message || 'Caps or eligibility prevented auto-approval. Batch left pending for manual approval.',
          variant: 'destructive',
        });
      }

      const batchName = (created as any)?.name || `Expense — ${expense.account_name}`;

      await notifyRoles({
        roles: ['super_admin', 'admin', 'finance'],
        type: 'batch_submitted',
        module: 'payments',
        priority: postApproveStatus === 'pending_second_approval' ? 'high' : 'normal',
        title: postApproveStatus === 'pending_second_approval'
          ? 'Expense payment awaiting second approval'
          : postApproveStatus === 'approved'
            ? 'Expense payment approved — fund + process'
            : 'Expense payment batch awaiting approval',
        body: `${batchName} — ${formatNaira(Number(expense.amount_ngn))}`,
      });

      await logAudit(
        'expense_payment_batched',
        `Expense payment dispatched (status: ${postApproveStatus}) — ${expense.account_name} — ${formatNaira(Number(expense.amount_ngn))}`,
        profile,
      );

      // Navigate immediately to the batch page so the operator can fund and
      // process in one flow. The batch is fully created + auto-approved here.
      navigate(`/payments/${batchId}`);
    } catch (err: any) {
      // The RPC is atomic: a failure means no batch was created, so there is
      // nothing to compensate for here. The expense.payment_status stays NULL
      // and the row remains "ready to pay" for the next attempt.
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

  // -- Edit / Submit --------------------------------------------------------

  const openEditForm = (e: Expense) => {
    setEditingExpense(e);
    setForm({
      category: e.category,
      amount_ngn: e.mileage_km ? '' : String(e.amount_ngn || ''),
      date: e.date || toIsoDate(new Date()),
      description: e.description || '',
      mileage_km: e.mileage_km ? String(e.mileage_km) : '',
      rate_per_km_ngn: e.rate_per_km_ngn ? String(e.rate_per_km_ngn) : String(DEFAULT_MILEAGE_RATE),
    });
    if (e.bank_name || e.account_number || e.account_name) {
      setShowBankSection(true);
      setBankDetails({
        bank_name: e.bank_name || '',
        account_number: e.account_number || '',
        account_name: e.account_name || '',
        verified: !!(e.bank_name && e.account_number && e.account_name),
      });
    } else {
      setShowBankSection(false);
      setBankDetails(EMPTY_BANK);
    }
    setIsReimbursement(e.is_reimbursement ?? true);
    setReceiptFile(null);
    setShowForm(true);
  };

  const submitExpense = async () => {
    if (submitting) return;
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

    if (!form.description.trim()) {
      toast({ title: 'Description is required', variant: 'destructive' });
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

    // Company-level expense policy: warn (don't hard-block) so the user can
    // proceed knowing it'll need extra scrutiny — Expensify / Concur model.
    // The over-cap claim is flagged for approvers via a "policy exceeded"
    // notice on submission, and dual-approval routing already kicks in above
    // the dual_approval_threshold so there's no audit hole.
    const policyLimit = limits[form.category];
    if (policyLimit && amount > policyLimit) {
      const ok = await confirm({
        title: 'Over policy cap',
        description:
          `Heads up — this is over the ${form.category.replace(/_/g, ' ')} policy cap of ${formatNaira(policyLimit)}.\n\n` +
          `It will be submitted but flagged for higher scrutiny. Continue?`,
      });
      if (!ok) return;
    }

    if (form.category === 'repair' && amount > 10000 && !receiptFile) {
      toast({
        title: 'Receipt required',
        description: 'Vehicle repair claims over ₦10,000 must include a receipt.',
        variant: 'destructive',
      });
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    // Upload receipt if one was selected.
    let receiptUrl: string | null = null;
    if (receiptFile) {
      const compressed = await compressImage(receiptFile);
      const filename = `${crypto.randomUUID()}-${compressed.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(filename, compressed, { contentType: compressed.type || undefined });
      if (uploadErr) {
        toast({ title: 'Receipt upload failed', description: uploadErr.message, variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(filename);
      receiptUrl = urlData.publicUrl;
    }

    const payload = {
      category: form.category,
      budget_category: form.category,
      amount_ngn: amount,
      mileage_km: mileageKm,
      rate_per_km_ngn: ratePerKm,
      date: form.date,
      description: form.description.trim(),
      is_reimbursement: isReimbursement,
      ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
      ...(bankDetails.verified
        ? {
            bank_name: bankDetails.bank_name,
            account_number: bankDetails.account_number,
            account_name: bankDetails.account_name,
          }
        : {}),
    };

    let error: { message: string } | null = null;
    if (editingExpense) {
      const res = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', editingExpense.id);
      error = res.error;
    } else {
      const res = await supabase.from('expenses').insert({
        ...payload,
        submitted_by: profile?.id || '',
        status: 'pending',
      }).select('id');
      error = res.error;
    }

    if (error) {
      toast({ title: 'Could not save expense', description: friendlyDbError(error), variant: 'destructive' });
    } else {
      if (editingExpense) {
        await logAudit(
          'expense_submitted',
          `Expense updated: ${form.category} — ${formatNaira(amount)}`,
          profile,
        );
        toast({ title: 'Expense updated' });
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
      }
      setShowForm(false);
      setEditingExpense(null);
      setForm({
        category: 'other',
        amount_ngn: '',
        date: toIsoDate(new Date()),
        description: '',
        mileage_km: '',
        rate_per_km_ngn: String(DEFAULT_MILEAGE_RATE),
      });
      setIsReimbursement(true);
      setShowBankSection(false);
      setBankDetails(EMPTY_BANK);
      setReceiptFile(null);
      await fetchData();
    }
    setSubmitting(false);
  };

  // -- Approve / reject -----------------------------------------------------

  const [rejectingExpense, setRejectingExpense] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // When an expense is linked to a fuel request, keep the fuel_request row
  // in sync so the Approvals module and Fleet page reflect the real state.
  const syncFuelRequest = async (
    fuelRequestId: string | null,
    status: 'approved' | 'rejected' | 'paid',
  ) => {
    if (!fuelRequestId) return;
    await supabase.from('fuel_requests').update({ status }).eq('id', fuelRequestId);
  };

  /**
   * Approve / reject an expense. All approval state changes go through the
   * SECURITY DEFINER RPCs which enforce no-self-approval, role pools, transfer
   * caps, and the dual-approval threshold. The legacy direct-status-write
   * path was removed in the approval framework migration — direct writes are
   * now refused by trigger.
   */
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

    const amountNgn = Number(expense.amount_ngn || 0);
    const cat = expense.category.replace(/_/g, ' ');
    const amtStr = formatNaira(amountNgn);

    try {
      const isSecond = expense.status === 'pending_second_approval';
      const result = isSecond
        ? await confirmSecondExpenseApproval(expense.id)
        : await approveExpense(expense.id);

      if (result?.status === 'pending_second_approval') {
        await logAudit(
          'expense_first_approval',
          `First approval for high-value expense: ${cat} — ${amtStr}`,
          profile,
        );
        toast({
          title: 'First approval recorded',
          description: 'A second approver must confirm this expense.',
        });
        await notifyRoles({
          roles: ['super_admin', 'admin', 'finance'],
          type: 'expense_needs_second_approval',
          module: 'expenses',
          title: 'High-value expense awaiting second approval',
          body: `${cat} — ${amtStr}`,
        });
      } else {
        await logAudit(
          'expense_approved',
          isSecond
            ? `Expense fully approved (2nd approval): ${cat} — ${amtStr}`
            : `Expense approved: ${cat} — ${amtStr}`,
          profile,
        );
        await syncFuelRequest(expense.fuel_request_id, 'approved');
        if (expense.submitted_by) {
          // In-app + email — submitters need a real signal that their expense
          // moved forward; in-app alone gets buried.
          await notifyApprovalDecision({
            userId: expense.submitted_by,
            decision: 'approved',
            entity: 'expense',
            entityLabel: `${cat} — ${amtStr}`,
            module: 'expenses',
          });
        }
        burst({ palette: 'success', count: isSecond ? 50 : 40 });
        toast({ title: isSecond ? 'Expense fully approved' : 'Expense approved' });
      }
      fetchData();
    } catch (err: any) {
      toast({
        title: 'Approval failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const doReject = async () => {
    if (!rejectingExpense) return;
    if (!isValidRejectionReason(rejectReason)) {
      toast({ title: 'Reason is required (min 10 chars)', variant: 'destructive' });
      return;
    }
    const e = rejectingExpense;
    try {
      await rejectExpense(e.id, rejectReason.trim());
    } catch (err: any) {
      toast({
        title: 'Reject failed',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
      return;
    }
    await syncFuelRequest(e.fuel_request_id, 'rejected');
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
    // Email the submitter as well — rejections are high-stakes and easily
    // missed in the in-app feed alone.
    if (e.submitted_by) {
      await notifyApprovalDecision({
        userId: e.submitted_by,
        decision: 'rejected',
        entity: 'expense',
        entityLabel: `${e.category.replace(/_/g, ' ')} — ${formatNaira(e.amount_ngn || 0)}`,
        reason: rejectReason.trim(),
        module: 'expenses',
      });
    }
    toast({ title: 'Expense rejected' });
    setRejectingExpense(null);
    setRejectReason('');
    fetchData();
  };

  const doReopen = async (e: Expense) => {
    if (!isApprover) return;
    const ok = await confirm(
      'Reopen this expense? It will go back to pending for re-review.',
    );
    if (!ok) return;
    const { error } = await supabase.rpc('reopen_expense', { p_expense_id: e.id });
    if (error) {
      toast({ title: 'Reopen failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'expense_reopened',
      `Expense reopened: ${e.category.replace(/_/g, ' ')} — ${formatNaira(e.amount_ngn || 0)}`,
      profile,
    );
    if (e.submitted_by) {
      await notifyUser(e.submitted_by, {
        type: 'expense_reopened',
        module: 'expenses',
        title: 'Expense reopened',
        body: `Your ${e.category.replace(/_/g, ' ')} expense (${formatNaira(e.amount_ngn || 0)}) has been reopened for re-review.`,
      });
    }
    toast({ title: 'Expense reopened' });
    fetchData();
  };

  const missingBankDetails = (e: Expense) =>
    e.status === 'approved' && (!e.account_number || !e.bank_name || !e.account_name);

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
      is_reimbursement: (e as any).is_reimbursement ?? false,
      receipt_url: (e as any).receipt_url ?? null,
      bank_name: (e as any).bank_name ?? null,
      account_number: (e as any).account_number ?? null,
      account_name: (e as any).account_name ?? null,
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

  const deleteExpense = async (e: Expense) => {
    // Best-effort: also remove the receipt file from storage so we don't
    // leak orphan files. The receipt_url stored on the row is a Supabase
    // storage URL — extract the path and call remove().
    const receiptUrl = (e as any).receipt_url as string | null | undefined;
    if (receiptUrl) {
      const m = receiptUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/receipts\/(.+?)(?:\?|$)/);
      const path = m ? decodeURIComponent(m[1]) : null;
      if (path) await supabase.storage.from('receipts').remove([path]);
    }

    const { error } = await supabase
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', e.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit('expense_deleted', `Expense deleted: ${e.category} — ${formatNaira(e.amount_ngn || 0)}`, profile);
    toast({ title: 'Expense deleted' });
    setConfirmDeleteExpense(null);
    fetchData();
  };

  const bulkApproveAll = () => {
    if (!isApprover) return;
    const pending = expenses.filter((e) => e.status === 'pending');
    if (pending.length === 0) return;
    const total = pending.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
    setBulkApproveConfirm({ count: pending.length, total });
  };

  /**
   * Days an expense has been waiting for approval (rounded down). Returns
   * null when the expense is no longer pending — ageing only matters while
   * the row is sitting on someone's desk.
   */
  const ageingDays = (e: Expense): number | null => {
    if (e.status !== 'pending' && e.status !== 'pending_second_approval') return null;
    const ms = Date.now() - new Date(e.created_at).getTime();
    return Math.max(0, Math.floor(ms / 86_400_000));
  };

  /** Approved expenses that have a verified bank account and no batch yet. */
  const payableExpenses = useMemo(
    () =>
      expenses.filter(
        (e) =>
          e.status === 'approved' &&
          !e.payment_reference &&
          (e.payment_status === 'pending' || e.payment_status == null) &&
          !!e.account_number && !!e.bank_name && !!e.account_name,
      ),
    [expenses],
  );

  const unpayableApproved = useMemo(
    () => expenses.filter((e) => e.status === 'approved' && (!e.account_number || !e.bank_name || !e.account_name)),
    [expenses],
  );

  const [bulkPayConfirm, setBulkPayConfirm] = useState<{ count: number; total: number } | null>(null);
  const [bulkPaying, setBulkPaying] = useState(false);

  const promptBulkPay = () => {
    if (!isApprover || !canProcessPerm) return;
    if (payableExpenses.length === 0) return;
    const total = payableExpenses.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
    setBulkPayConfirm({ count: payableExpenses.length, total });
  };

  /**
   * Pay every payable expense in sequence. Each becomes its own batch (via
   * createExpensePaymentBatch) and is auto-approved. Errors are collected
   * per-expense so a single failure doesn't roll back the rest. Final toast
   * summarises succeeded / failed counts; user navigates to /payments to
   * fund + process.
   */
  const doBulkPay = async () => {
    if (!bulkPayConfirm) return;
    setBulkPayConfirm(null);
    setBulkPaying(true);
    let succeeded = 0;
    const failures: Array<{ title: string; reason: string }> = [];
    try {
      for (const e of payableExpenses) {
        try {
          const created = await createExpensePaymentBatch(e.id);
          const batchId = (created as any)?.id;
          if (!batchId) throw new Error('No batch id returned');
          try {
            await approvePaymentBatch(batchId);
          } catch {
            // Auto-approve may be blocked by caps / dual-approval; that's fine
            // — the batch exists and will sit pending for manual approval.
          }
          succeeded++;
        } catch (err: any) {
          failures.push({
            title: `${e.category.replace(/_/g, ' ')} (${formatNaira(e.amount_ngn || 0)})`,
            reason: err?.message || 'unknown',
          });
        }
      }
      const total = payableExpenses.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
      await logAudit(
        'bulk_paid',
        `Bulk-paid ${succeeded} of ${payableExpenses.length} approved expenses (${formatNaira(total)})`,
        profile,
      );
      if (failures.length === 0) {
        toast({
          title: `Created ${succeeded} payment batch${succeeded === 1 ? '' : 'es'}`,
          description: 'Open Payments to fund and process.',
        });
      } else {
        toast({
          title: `Created ${succeeded} of ${payableExpenses.length}`,
          description: failures.map((f) => `• ${f.title}: ${f.reason}`).join('\n'),
          variant: 'destructive',
        });
      }
      fetchData();
      // Take user straight to the Payments queue so they can act.
      if (succeeded > 0) navigate('/payments');
    } finally {
      setBulkPaying(false);
    }
  };

  /** Approve every pending expense in the table — one RPC call per row so a
   *  single denial (cap blown, role mismatch) doesn't roll the whole bulk back. */
  const doBulkApprove = async () => {
    if (!bulkApproveConfirm) return;
    setBulkApproveConfirm(null);
    setBulkLoading(true);
    const pending = expenses.filter((e) => e.status === 'pending');
    let succeeded = 0;
    const failures: Array<{ title: string; reason: string }> = [];
    try {
      for (const e of pending) {
        try {
          const result = await approveExpense(e.id);
          succeeded++;
          if (e.fuel_request_id && result?.status === 'approved') {
            await syncFuelRequest(e.fuel_request_id, 'approved');
          }
        } catch (err: any) {
          failures.push({
            title: `${e.category.replace(/_/g, ' ')} (${formatNaira(e.amount_ngn || 0)})`,
            reason: err?.message || 'unknown',
          });
        }
      }
      const total = pending.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
      await logAudit(
        'bulk_approved',
        `Bulk approved ${succeeded} of ${pending.length} expenses (${formatNaira(total)})`,
        profile,
      );
      if (failures.length === 0) {
        toast({
          title: `Approved ${succeeded} expense${succeeded === 1 ? '' : 's'}`,
          description: `${formatNaira(total)} total`,
        });
      } else {
        toast({
          title: `Approved ${succeeded} of ${pending.length}`,
          description: failures.map((f) => `• ${f.title}: ${f.reason}`).join('\n'),
          variant: 'destructive',
        });
      }
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
    let succeeded = 0;
    const failures: Array<{ title: string; reason: string }> = [];
    try {
      for (const e of rows) {
        try {
          const result = await approveExpense(e.id);
          succeeded++;
          if (e.fuel_request_id && result?.status === 'approved') {
            await syncFuelRequest(e.fuel_request_id, 'approved');
          }
        } catch (err: any) {
          failures.push({
            title: `${e.category.replace(/_/g, ' ')} (${formatNaira(e.amount_ngn || 0)})`,
            reason: err?.message || 'unknown',
          });
        }
      }
      const total = rows.reduce((s, e) => s + Number(e.amount_ngn || 0), 0);
      await logAudit(
        'bulk_approved',
        `Bulk approved ${succeeded} of ${rows.length} selected expenses (${formatNaira(total)})`,
        profile,
      );
      if (failures.length === 0) {
        burst({ palette: 'success', count: 70 });
        toast({ title: `Approved ${succeeded} selected` });
      } else {
        toast({
          title: `Approved ${succeeded} of ${rows.length}`,
          description: failures.map((f) => `• ${f.title}: ${f.reason}`).join('\n'),
          variant: 'destructive',
        });
      }
      setSelected(new Set());
      fetchData();
    } finally {
      setBulkLoading(false);
    }
  };

  // -- Filter / paginate ----------------------------------------------------

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (statusFilter === 'pending') {
        if (e.status !== 'pending' && e.status !== 'pending_second_approval') return false;
      } else if (statusFilter !== 'all' && e.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        (e.description || '').toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [expenses, search, statusFilter, categoryFilter]);

  const pagination = usePagination(filtered, 20);

  const statusCounts = useMemo(() => ({
    all: expenses.length,
    pending: expenses.filter(
      (e) => e.status === 'pending' || e.status === 'pending_second_approval',
    ).length,
    approved: expenses.filter((e) => e.status === 'approved').length,
    rejected: expenses.filter((e) => e.status === 'rejected').length,
  }), [expenses]);

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

  const submitterName = (e: Expense) =>
    e.profiles?.first_name
      ? `${e.profiles.first_name} ${e.profiles.last_name || ''}`.trim()
      : e.profiles?.full_name || '—';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
            <InfoHint>Submit, review and approve employee expense claims. Approvers can bulk-approve pending claims and export records for accounting.</InfoHint>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Track and manage expense claims.</p>
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
          {isApprover && canProcessPerm && payableExpenses.length > 0 && (
            <Button
              variant="outline"
              onClick={promptBulkPay}
              disabled={bulkPaying}
              className="text-success border-success/40 hover:bg-success/5"
            >
              {bulkPaying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CreditCard className="mr-2 h-4 w-4" />
              Pay all approved ({payableExpenses.length})
            </Button>
          )}
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> New Expense
          </Button>
        </div>
      </div>

      {/* Trend chart — managers only */}
      {isApprover && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Approved Spend — Last 6 Months</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridLine} vertical={false} />
                <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatNairaCompact(v)} tick={axisTick} axisLine={false} tickLine={false} />
                <ChartTooltip
                  content={<GlassTooltip />}
                  formatter={(v: number) => formatNaira(v)}
                  cursor={{ fill: chartTheme.primary, fillOpacity: 0.05 }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="fuel" stackId="a" fill="url(#kd-grad-primary)" name="Fuel" {...chartAnim} />
                <Bar dataKey="transport" stackId="a" fill="url(#kd-grad-cyan)" name="Transport" {...chartAnim} />
                <Bar dataKey="mileage" stackId="a" fill="url(#kd-grad-gold)" name="Mileage" {...chartAnim} />
                <Bar dataKey="office_supplies" stackId="a" fill="url(#kd-grad-success)" name="Office" {...chartAnim} />
                <Bar dataKey="other" stackId="a" fill="url(#kd-grad-violet)" name="Other" {...chartAnim} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {isApprover && unpayableApproved.length > 0 && !bankBannerDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-300 dark:border-orange-500/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-3">
          <BanknoteIcon className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-orange-800 dark:text-orange-300">
              {unpayableApproved.length} approved expense{unpayableApproved.length > 1 ? 's' : ''} can't be paid
            </p>
            <p className="text-orange-700/80 dark:text-orange-400/70 mt-0.5">
              Bank details are missing. Reopen them so employees can add their bank information, or contact them directly.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md p-1 text-orange-500 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
            onClick={() => setBankBannerDismissed(true)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card>
        <div className="p-3 sm:p-4 border-b flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10 sm:h-9"
              placeholder="Search description or category..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); pagination.reset(); }} className="w-full sm:w-auto">
            <TabsList className="h-auto flex-wrap w-full sm:w-auto">
              <TabsTrigger value="all" className="flex-1 sm:flex-initial">All <TabCount n={statusCounts.all} /></TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 sm:flex-initial">Pending <TabCount n={statusCounts.pending} /></TabsTrigger>
              <TabsTrigger value="approved" className="flex-1 sm:flex-initial">Approved <TabCount n={statusCounts.approved} /></TabsTrigger>
              <TabsTrigger value="rejected" className="flex-1 sm:flex-initial">Rejected <TabCount n={statusCounts.rejected} /></TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[180px] h-10 sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {expenseCategoryLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isApprover && selected.size > 0 && (
            <Button
              size="sm"
              onClick={bulkApproveSelected}
              disabled={bulkLoading}
              className="w-full sm:w-auto h-10 sm:h-9"
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
              <div className="hidden md:block">
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
                    {isApprover && <TableHead>Submitted by</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    {isApprover && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((e) => (
                    <TableRow
                      key={e.id}
                      className="kd-transition cursor-pointer"
                      onClick={() => setDetailExpense(e)}
                    >
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
                      <TableCell className="max-w-xs">
                        <div className="truncate">{e.description || '—'}</div>
                        {e.vendor_name && (
                          <div className="text-[10px] text-muted-foreground truncate">{e.vendor_name}</div>
                        )}
                        {e.receipt_url && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <a
                              href={e.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              onClick={(evt) => evt.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" /> View Receipt
                            </a>
                            {e.category === 'repair' && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                onClick={(evt) => { evt.stopPropagation(); openElaAnalysis(e.id, e.receipt_url!); }}
                              >
                                Tamper Analysis
                              </button>
                            )}
                          </div>
                        )}
                      </TableCell>
                      {isApprover && (
                        <TableCell>
                          {submitterName(e)}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            <StatusBadge status={e.status} />
                            {e.is_anomaly && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      'gap-1 cursor-default',
                                      e.anomaly_type?.includes('duplicate_receipt')
                                        ? 'border-red-400 text-red-700 bg-red-50 dark:bg-red-950/20'
                                        : 'border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/20',
                                    )}
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    {e.anomaly_type?.includes('duplicate_receipt') ? 'High Risk' : 'Review'}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  {e.admin_note || e.anomaly_type || 'Flagged for review'}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
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
                          {(() => {
                            const days = ageingDays(e);
                            if (days === null || days < 3) return null;
                            const tone = days >= 7 ? 'text-red-600 font-semibold' : days >= 5 ? 'text-amber-600 font-medium' : 'text-muted-foreground';
                            return (
                              <span className={`text-[10px] ${tone}`}>
                                Awaiting {days}d
                              </span>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {e.status === 'approved' && paymentBadge(e.payment_status)}
                          {missingBankDetails(e) && (
                            <Badge variant="outline" className="gap-1 border-orange-400 text-orange-700 bg-orange-50 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-500/30 text-[10px]">
                              <BanknoteIcon className="h-3 w-3" /> No bank details
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      {isApprover && (
                        <TableCell className="text-right" onClick={(evt) => evt.stopPropagation()}>
                          <div className="flex justify-end gap-1 items-center">
                            {(e.status === 'pending' || e.status === 'pending_second_approval') && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Edit expense"
                                onClick={() => openEditForm(e)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
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
                            {(
                              (e.status === 'rejected' && isApprover) ||
                              (['pending', 'pending_second_approval'].includes(e.status) &&
                                ['super_admin', 'admin'].includes(profile?.role || ''))
                            ) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteExpense(e)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
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
                            {e.status === 'approved' && !e.payment_reference && (e.payment_status === 'pending' || e.payment_status == null) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Reopen — send back to pending"
                                onClick={() => doReopen(e)}
                              >
                                <RotateCcw className="h-4 w-4 text-amber-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>

              {/* Mobile card list — same data, thumb-friendly */}
              <div className="md:hidden p-3 space-y-2">
                {pagination.slice.map((e) => {
                  const isPending = e.status === 'pending';
                  const isPendingSecond = e.status === 'pending_second_approval';
                  const isRejected = e.status === 'rejected';
                  const isApproved = e.status === 'approved';
                  const accent =
                    isPending || isPendingSecond ? 'bg-amber-500'
                    : isApproved ? 'bg-emerald-500'
                    : isRejected ? 'bg-red-500'
                    : 'bg-muted-foreground';
                  const isSelected = selected.has(e.id);
                  return (
                    <MobileCard
                      key={e.id}
                      onClick={() => setDetailExpense(e)}
                      accentClassName={accent}
                      className={isSelected ? 'ring-2 ring-primary/40' : ''}
                    >
                      <MobileCardHeader>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {isApprover && isPending && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(v) => toggleSelected(e.id, Boolean(v))}
                              aria-label={`Select ${e.category}`}
                              className="shrink-0"
                              onClick={(evt) => evt.stopPropagation()}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {e.category === 'mileage' && (
                                <CarFront className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                              <MobileCardTitle className="capitalize">
                                {e.category?.replace(/_/g, ' ')}
                              </MobileCardTitle>
                            </div>
                            {e.mileage_km && (
                              <p className="text-[10px] text-muted-foreground">
                                {e.mileage_km} km × {formatNaira(e.rate_per_km_ngn || 0)}/km
                              </p>
                            )}
                          </div>
                        </div>
                        <MobileCardMeta className="currency text-base">
                          {formatNaira(e.amount_ngn)}
                        </MobileCardMeta>
                      </MobileCardHeader>

                      {e.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {e.description}
                        </p>
                      )}
                      {e.vendor_name && (
                        <MobileCardRow label="Vendor">{e.vendor_name}</MobileCardRow>
                      )}

                      <MobileCardRow label="Date">{formatDate(e.date)}</MobileCardRow>
                      {isApprover && (
                        <MobileCardRow label="Submitted by">
                          {submitterName(e)}
                        </MobileCardRow>
                      )}
                      {missingBankDetails(e) && (
                        <div className="flex items-start gap-1.5 rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/20 px-2.5 py-1.5 text-xs text-orange-800 dark:text-orange-400">
                          <BanknoteIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>Bank details missing — this expense can't be paid until added.</span>
                        </div>
                      )}
                      <MobileCardRow label="Status">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={e.status} />
                          {isApproved && paymentBadge(e.payment_status)}
                          {e.is_anomaly && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'gap-1 cursor-default',
                                e.anomaly_type?.includes('duplicate_receipt')
                                  ? 'border-red-400 text-red-700 bg-red-50 dark:bg-red-950/20'
                                  : 'border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/20',
                              )}
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {e.anomaly_type?.includes('duplicate_receipt') ? 'High Risk' : 'Review'}
                            </Badge>
                          )}
                        </span>
                      </MobileCardRow>
                      {e.receipt_url && (
                        <MobileCardRow label="Receipt">
                          <span className="inline-flex items-center gap-3">
                            <a
                              href={e.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary"
                              onClick={(evt) => evt.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" /> View
                            </a>
                            {e.category === 'repair' && (
                              <button
                                type="button"
                                className="text-muted-foreground"
                                onClick={(evt) => { evt.stopPropagation(); openElaAnalysis(e.id, e.receipt_url!); }}
                              >
                                Tamper Analysis
                              </button>
                            )}
                          </span>
                        </MobileCardRow>
                      )}

                      {(isApprover && (isPending || isPendingSecond || (isRejected && isApprover) || isApproved || canProcessPayment(e) || canRetryPayment(e))) || ((isPending || isPendingSecond) && e.submitted_by === profile?.id) ? (
                        <MobileCardFooter>
                          {(isPending || isPendingSecond) && (e.submitted_by === profile?.id || isApprover) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9"
                              onClick={(evt) => { evt.stopPropagation(); openEditForm(e); }}
                            >
                              <Pencil className="h-4 w-4 mr-1.5" /> Edit
                            </Button>
                          )}
                          {isPending && isApprover && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/5"
                                onClick={(evt) => { evt.stopPropagation(); handleAction(e, 'rejected'); }}
                              >
                                <X className="h-4 w-4 mr-1.5" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                                onClick={(evt) => { evt.stopPropagation(); handleAction(e, 'approved'); }}
                              >
                                <Check className="h-4 w-4 mr-1.5" /> Approve
                              </Button>
                            </>
                          )}
                          {isPendingSecond && e.approved_by !== profile?.id && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-9 border-destructive/40 text-destructive hover:bg-destructive/5"
                                onClick={(evt) => { evt.stopPropagation(); handleAction(e, 'rejected'); }}
                              >
                                <X className="h-4 w-4 mr-1.5" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 h-9 bg-success hover:bg-success/90 text-success-foreground"
                                onClick={(evt) => { evt.stopPropagation(); handleAction(e, 'approved'); }}
                              >
                                <Check className="h-4 w-4 mr-1.5" /> 2nd approve
                              </Button>
                            </>
                          )}
                          {isPendingSecond && e.approved_by === profile?.id && (
                            <span className="text-xs text-muted-foreground italic w-full text-center py-2">
                              You approved · awaiting 2nd
                            </span>
                          )}
                          {canProcessPayment(e) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9 text-success border-success/40 hover:bg-success/5"
                              onClick={(evt) => { evt.stopPropagation(); setConfirmPayment(e); }}
                            >
                              <CreditCard className="mr-1.5 h-4 w-4" /> Pay
                            </Button>
                          )}
                          {canRetryPayment(e) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9"
                              onClick={(evt) => { evt.stopPropagation(); setConfirmPayment(e); }}
                            >
                              <CreditCard className="mr-1.5 h-4 w-4" /> Retry
                            </Button>
                          )}
                          {isApproved && e.payment_status === 'processing' && (
                            <span className="text-xs text-muted-foreground inline-flex items-center gap-1 w-full justify-center py-2">
                              <Loader2 className="h-3 w-3 animate-spin" /> Processing
                            </span>
                          )}
                          {isApproved && !e.payment_reference && (e.payment_status === 'pending' || e.payment_status == null) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9 border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                              onClick={(evt) => { evt.stopPropagation(); doReopen(e); }}
                            >
                              <RotateCcw className="h-4 w-4 mr-1.5" /> Reopen
                            </Button>
                          )}
                          {isRejected && e.submitted_by === profile?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 h-9"
                              onClick={(evt) => { evt.stopPropagation(); resubmitExpense(e); }}
                            >
                              Re-edit & Resubmit
                            </Button>
                          )}
                          {isRejected && isApprover && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="flex-1 h-9 text-destructive"
                              onClick={(evt) => { evt.stopPropagation(); setConfirmDeleteExpense(e); }}
                            >
                              <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                            </Button>
                          )}
                        </MobileCardFooter>
                      ) : null}
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

      <ResponsiveDialog
        open={showForm}
        onOpenChange={(v) => { setShowForm(v); if (!v) { setReceiptFile(null); setEditingExpense(null); } }}
        title={editingExpense ? 'Edit Expense' : 'New Expense Claim'}
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingExpense(null); }}>
              Cancel
            </Button>
            <Button
              onClick={submitExpense}
              disabled={submitting || !form.category || !!lockingBudget}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingExpense ? 'Save changes' : 'Submit'}
            </Button>
          </>
        }
      >
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
                    <SelectItem key={c} value={c}>
                      {expenseCategoryLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(
                    'flex flex-col items-start rounded-lg border p-3 text-sm kd-transition',
                    isReimbursement
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted/50',
                  )}
                  onClick={() => setIsReimbursement(true)}
                >
                  <span className="font-medium">Reimbursement</span>
                  <span className="text-xs mt-0.5 opacity-80">I paid from my own pocket</span>
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex flex-col items-start rounded-lg border p-3 text-sm kd-transition',
                    !isReimbursement
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-input bg-background text-muted-foreground hover:bg-muted/50',
                  )}
                  onClick={() => setIsReimbursement(false)}
                >
                  <span className="font-medium">Company charge</span>
                  <span className="text-xs mt-0.5 opacity-80">Direct payment from company</span>
                </button>
              </div>
            </div>

            {form.category === 'mileage' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Distance (km)</Label>
                  <Input
                    type="number"
                    min="0"
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
                    min="0"
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
                    min="0"
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
                    min="2020-01-01"
                    max={toIsoDate(new Date())}
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
                  min="2020-01-01"
                  max={toIsoDate(new Date())}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>Description <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="What was the expense for?"
              />
            </div>

            <div className="space-y-1">
              <Label>Receipt (Optional)</Label>
              <OcrReceiptScanner
                className="mb-1"
                onExtracted={(result: OcrResult, file: File) => {
                  if (result.amount_ngn) setForm((f) => ({ ...f, amount_ngn: result.amount_ngn! }));
                  if (result.date) setForm((f) => ({ ...f, date: result.date! }));
                  if (result.description) setForm((f) => ({ ...f, description: f.description || result.description! }));
                  setReceiptFile(file);
                }}
              />
              {receiptFile ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium text-foreground truncate">{receiptFile.name}</span>
                  <span>— {(receiptFile.size / 1024).toFixed(1)} KB</span>
                  <button
                    type="button"
                    className="ml-auto text-muted-foreground hover:text-destructive"
                    onClick={() => setReceiptFile(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                    <span className="flex-1 border-t" /><span>or attach manually</span><span className="flex-1 border-t" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/50 kd-transition w-full">
                    <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate text-muted-foreground">Attach image or PDF…</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (!validateFile(f, toast)) {
                          e.target.value = '';
                          return;
                        }
                        setReceiptFile(f);
                      }}
                    />
                  </label>
                </>
              )}
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

            <div className="pt-3 border-t-2 border-amber-300 dark:border-amber-500/50">
              {!showBankSection ? (
                <div
                  className="flex items-start gap-3 rounded-lg border-2 border-amber-400 dark:border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 p-4 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50 hover:border-amber-500 transition-colors shadow-sm"
                  onClick={() => setShowBankSection(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') setShowBankSection(true); }}
                >
                  <div className="shrink-0 rounded-full bg-amber-200 dark:bg-amber-800/50 p-2">
                    <BanknoteIcon className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Add your bank details for payment</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Without bank details, approved expenses can't be paid out. Tap here to add your bank name, account number, and account name.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border-2 border-amber-400 dark:border-amber-500/60 bg-amber-50/50 dark:bg-amber-950/20 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold inline-flex items-center gap-2 text-amber-900 dark:text-amber-200">
                      <BanknoteIcon className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                      Bank account for payment
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
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!confirmPayment}
        onOpenChange={(v) => { if (!v) setConfirmPayment(null); }}
        title="Confirm Payment"
        footer={
          <>
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
          </>
        }
      >
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
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!rejectingExpense}
        onOpenChange={(v) => {
          if (!v) {
            setRejectingExpense(null);
            setRejectReason('');
          }
        }}
        title="Reject expense"
        footer={
          <>
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
          </>
        }
      >
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
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!detailExpense}
        onOpenChange={(v) => { if (!v) setDetailExpense(null); }}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Expense Detail
          </span>
        }
        footer={
          <div className="flex items-center gap-2 w-full">
            {detailExpense && (detailExpense.status === 'pending' || detailExpense.status === 'pending_second_approval') && (
              detailExpense.submitted_by === profile?.id || isApprover
            ) && (
              <Button
                variant="outline"
                onClick={() => { setDetailExpense(null); if (detailExpense) openEditForm(detailExpense); }}
              >
                <Pencil className="h-4 w-4 mr-1.5" /> Edit
              </Button>
            )}
            {detailExpense && isApprover && detailExpense.status === 'approved' && !detailExpense.payment_reference && (detailExpense.payment_status === 'pending' || detailExpense.payment_status == null) && (
              <Button
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                onClick={() => { setDetailExpense(null); if (detailExpense) doReopen(detailExpense); }}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" /> Reopen
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setDetailExpense(null)}>Close</Button>
          </div>
        }
      >
          {detailExpense && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {isApprover && (
                  <div>
                    <p className="text-xs text-muted-foreground">Submitted by</p>
                    <p className="font-medium">{submitterName(detailExpense)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Submitted on</p>
                  <p className="font-medium">{formatDate(detailExpense.created_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium capitalize">{detailExpense.category?.replace(/_/g, ' ')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expense date</p>
                  <p className="font-medium">{formatDate(detailExpense.date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-semibold currency">{formatNaira(detailExpense.amount_ngn)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={detailExpense.status} />
                    {detailExpense.is_anomaly && (
                      <Badge
                        variant="outline"
                        className={cn(
                          'gap-1 cursor-default',
                          detailExpense.anomaly_type?.includes('duplicate_receipt')
                            ? 'border-red-400 text-red-700 bg-red-50 dark:bg-red-950/20'
                            : 'border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/20',
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {detailExpense.anomaly_type?.includes('duplicate_receipt') ? 'High Risk' : 'Review'}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {detailExpense.is_anomaly && detailExpense.admin_note && (
                <div className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{detailExpense.admin_note}</span>
                </div>
              )}
              {detailExpense.mileage_km && (
                <div>
                  <p className="text-xs text-muted-foreground">Mileage</p>
                  <p className="currency">{detailExpense.mileage_km} km × {formatNaira(detailExpense.rate_per_km_ngn || 0)}/km</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="whitespace-pre-wrap">{detailExpense.description || '—'}</p>
              </div>
              {detailExpense.vendor_name && (
                <div>
                  <p className="text-xs text-muted-foreground">Vendor / Garage</p>
                  <p className="font-medium">{detailExpense.vendor_name}</p>
                </div>
              )}
              {detailExpense.receipt_url && (
                <div>
                  <p className="text-xs text-muted-foreground">Receipt</p>
                  <div className="flex items-center gap-3">
                    <a
                      href={detailExpense.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View Receipt
                    </a>
                    {detailExpense.category === 'repair' && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                        onClick={() => openElaAnalysis(detailExpense.id, detailExpense.receipt_url!)}
                      >
                        Tamper Analysis
                      </button>
                    )}
                  </div>
                </div>
              )}
              {detailExpense.status === 'approved' && (
                <div>
                  <p className="text-xs text-muted-foreground">Payment status</p>
                  {paymentBadge(detailExpense.payment_status)}
                </div>
              )}
              {(detailExpense.bank_name || detailExpense.account_number) && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-xs">
                  <p className="font-medium">Bank Account</p>
                  {detailExpense.bank_name && (
                    <p><span className="text-muted-foreground">Bank: </span>{detailExpense.bank_name}</p>
                  )}
                  {detailExpense.account_number && (
                    <p><span className="text-muted-foreground">Account: </span>{detailExpense.account_number}</p>
                  )}
                  {detailExpense.account_name && (
                    <p><span className="text-muted-foreground">Name: </span>{detailExpense.account_name}</p>
                  )}
                </div>
              )}
              {missingBankDetails(detailExpense) && (
                <div className="flex items-start gap-2 rounded-md border border-orange-400 bg-orange-50 dark:bg-orange-950/20 px-3 py-2.5 text-xs text-orange-800 dark:text-orange-400">
                  <BanknoteIcon className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Bank details missing</p>
                    <p className="mt-0.5">This expense is approved but can't be paid until the employee adds their bank account, name, and number. Reopen the expense so they can update it, or contact them directly.</p>
                  </div>
                </div>
              )}
            </div>
          )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!bulkApproveConfirm}
        onOpenChange={(open) => { if (!open) setBulkApproveConfirm(null); }}
        title="Approve all pending expenses?"
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkApproveConfirm(null)}>Cancel</Button>
            <Button onClick={doBulkApprove}>Confirm</Button>
          </>
        }
      >
          {bulkApproveConfirm && (
            <p className="text-sm text-muted-foreground">
              Approve {bulkApproveConfirm.count} expense claim{bulkApproveConfirm.count === 1 ? '' : 's'} totalling {formatNaira(bulkApproveConfirm.total)}? This cannot be undone.
            </p>
          )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!bulkPayConfirm}
        onOpenChange={(open) => { if (!open) setBulkPayConfirm(null); }}
        title="Pay all approved expenses?"
        description="Each expense becomes its own payment batch and is auto-approved. You'll be redirected to Payments to fund and process."
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkPayConfirm(null)}>Cancel</Button>
            <Button onClick={doBulkPay}>
              <CreditCard className="mr-2 h-4 w-4" /> Create batches
            </Button>
          </>
        }
      >
          {bulkPayConfirm && (
            <p className="text-sm text-muted-foreground">
              {bulkPayConfirm.count} approved expense{bulkPayConfirm.count === 1 ? '' : 's'} · total {formatNaira(bulkPayConfirm.total)}.
            </p>
          )}
      </ResponsiveDialog>

      <ResponsiveDialog
        open={!!confirmDeleteExpense}
        onOpenChange={(v) => { if (!v) setConfirmDeleteExpense(null); }}
        title="Delete expense"
        description={`Delete this ${confirmDeleteExpense?.category?.replace(/_/g, ' ')} expense (${formatNaira(confirmDeleteExpense?.amount_ngn || 0)})? This cannot be undone.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDeleteExpense(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmDeleteExpense && deleteExpense(confirmDeleteExpense)}>
              Delete
            </Button>
          </>
        }
      >
      </ResponsiveDialog>

      {/* Tamper-analysis (ELA) preview — on-demand visual aid, not a verdict. */}
      <ResponsiveDialog
        open={!!elaTarget}
        onOpenChange={(v) => { if (!v) { setElaTarget(null); setElaResult(null); setElaError(''); } }}
        size="lg"
        title="Tamper Analysis"
        description="Highlights areas that carry a different compression history than the rest of the photo. This is a visual aid, not proof of tampering — ordinary re-compression (e.g. a receipt forwarded through WhatsApp) produces similar patterns. Use your judgment alongside other context."
      >
          <div className="space-y-2">
            {elaLoading && (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating analysis…
              </div>
            )}
            {elaError && (
              <div className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{elaError}</span>
              </div>
            )}
            {elaResult && (
              <img
                src={elaResult.heatmapDataUrl}
                alt="Error-level analysis heatmap"
                className="w-full rounded-md border"
              />
            )}
          </div>
      </ResponsiveDialog>
    </div>
  );
};

export default Expenses;
