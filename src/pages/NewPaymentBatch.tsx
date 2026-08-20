import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { useFeatureAccess } from '@/hooks/usePermission';
import { APPROVER_ROLES } from '@/lib/roles';
import { formatNaira, formatDate, maskAccountNumber } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Loader2, Trash2, ArrowLeft, ArrowRight, Check, Search, Plus, Upload,
  Users, Banknote, CreditCard, Gift, AlertTriangle, Building2,
} from 'lucide-react';
import { StickyActionBar, StickyActionBarSpacer } from '@/components/ui-kit/StickyActionBar';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
  MobileCardFooter,
} from '@/components/ui-kit/MobileCard';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { BeneficiaryCsvImport, type ImportedBeneficiary } from '@/components/BeneficiaryCsvImport';
import { heyreachDisplayStatus } from '@/lib/heyreach-status';
import { computePayslip } from '@/lib/tax';

type BatchType = 'contractor' | 'employee_salary' | 'advance' | 'prize';

// Paystack's `transfer/bulk` endpoint caps each call at 100 items;
// our dispatcher loops single-call transfers so the same ceiling
// applies operationally — at 100+ recipients the batch becomes
// hard to review/approve and slow to process. Operators that
// genuinely need more split into multiple batches.
const MAX_RECIPIENTS_PER_BATCH = 100;
// Soft warning threshold — UI flips amber a few rows before the
// hard cap so the operator gets a heads-up they're filling up.
const WARN_RECIPIENTS = 80;

interface BatchItem {
  _key: string;
  full_name: string;
  bank_name: string;
  account_number: string;
  account_name?: string | null;
  amount_ngn: number;
  reference: string;
  contractor_id?: string;
  employee_id?: string;
  item_type?: 'contractor' | 'employee' | 'adhoc';
  // Ad-hoc only: persist this payee to the contractors table on save.
  _saveAsContractor?: boolean;
}

interface Contractor {
  id: string;
  full_name: string;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
  // HeyReach signal — surfaced as a status indicator on each contractor row
  // (no longer blocks payment; lifecycle/connection state is informational).
  status?: string | null;
  heyreach_status?: string | null;
  heyreach_email?: string | null;
  linkedin_url?: string | null;
}

interface Employee {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  salary_ngn: number | null;
  job_title: string | null;
  pension_enabled: boolean | null;
  nhf_enabled: boolean | null;
  paye_enabled: boolean | null;
  use_salary_components: boolean | null;
  basic_ngn: number | null;
  housing_ngn: number | null;
  transport_ngn: number | null;
  other_allowances_ngn: number | null;
}

const BATCH_TYPES: {
  type: BatchType;
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: string;
}[] = [
  {
    type: 'contractor',
    icon: <Building2 className="h-5 w-5" />,
    label: 'Contractor Payment',
    desc: 'Pay partners & contractors',
    color: 'text-blue-600',
  },
  {
    type: 'employee_salary',
    icon: <Banknote className="h-5 w-5" />,
    label: 'Employee Salary Run',
    desc: 'Monthly salary disbursement',
    color: 'text-emerald-600',
  },
  {
    type: 'advance',
    icon: <CreditCard className="h-5 w-5" />,
    label: 'Salary Advance',
    desc: 'Short-term advance payment',
    color: 'text-amber-600',
  },
  {
    type: 'prize',
    icon: <Gift className="h-5 w-5" />,
    label: 'Bonus / Prize',
    desc: '13th month, performance, etc.',
    color: 'text-purple-600',
  },
];

const emptyBank: BankAccountValue = {
  bank_name: '',
  account_number: '',
  account_name: '',
  verified: false,
};

// Naira amounts can only be as fine as 1 kobo (2 dp). Clamp entered values so a
// stray sub-kobo figure can't disagree with the kobo amount sent to Paystack.
const round2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

const NewPaymentBatch = () => {
  usePageTitle('New Payment Batch');
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!editId && editId !== 'new';
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);
  const [batchType, setBatchType] = useState<BatchType>('contractor');

  // Per-batch-type permissions. `payments.create` alone gives Contractor
  // access (default for finance / admin). The HR-tier batches (salary,
  // advance, bonus) need their own grant — admin / finance have all four
  // by default; operations / field_staff have none unless an admin
  // toggles them on. Cards filter against `allowedBatchTypes` below so
  // a user only sees the types they can actually create.
  const canContractor = useFeatureAccess('payments.batch.contractor', APPROVER_ROLES);
  const canSalary     = useFeatureAccess('payments.batch.salary',     APPROVER_ROLES);
  const canAdvance    = useFeatureAccess('payments.batch.advance',    APPROVER_ROLES);
  const canBonus      = useFeatureAccess('payments.batch.bonus',      APPROVER_ROLES);
  const allowedBatchTypes = useMemo<BatchType[]>(() => {
    const out: BatchType[] = [];
    if (canContractor) out.push('contractor');
    if (canSalary)     out.push('employee_salary');
    if (canAdvance)    out.push('advance');
    if (canBonus)      out.push('prize');
    return out;
  }, [canContractor, canSalary, canAdvance, canBonus]);

  // If the user lands on a type they aren't allowed to create (e.g. via
  // bookmark, deep link, or because they were just downgraded), pull
  // them back to the first allowed type. Avoids the silent state where
  // the form is committed to a type whose card was filtered out.
  useEffect(() => {
    if (allowedBatchTypes.length > 0 && !allowedBatchTypes.includes(batchType)) {
      setBatchType(allowedBatchTypes[0]);
    }
  }, [allowedBatchTypes, batchType]);

  // Step 1
  const [batchName, setBatchName] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [period, setPeriod] = useState('');
  const [notes, setNotes] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');
  const [repaymentMonths, setRepaymentMonths] = useState(3);
  const [bonusType, setBonusType] = useState('Performance Bonus');

  // Step 2
  const [items, setItems] = useState<BatchItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Hide deactivated contractors from the picker by default — keeps the
  // payment-prep view focused on people the operator actually expects to
  // pay this month. Set to true to include offboarded partners (e.g. for a
  // final settlement); the toggle below makes it a one-click opt-in.
  const [showInactiveContractors, setShowInactiveContractors] = useState(false);
  const debouncedSearch = useDebounce(searchTerm);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

  // Amount entry mode for the selected beneficiaries: 'different' (type a value
  // per row, the default) or 'same' (one value applied to everyone). In 'same'
  // mode the per-row inputs are driven by `bulkAmount` and read-only.
  const [amountMode, setAmountMode] = useState<'same' | 'different'>('different');
  const [bulkAmount, setBulkAmount] = useState('');

  // Ad-hoc beneficiary dialog
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [adHoc, setAdHoc] = useState({ first_name: '', last_name: '', amount_ngn: '', reference: '' });
  const [adHocBank, setAdHocBank] = useState<BankAccountValue>(emptyBank);
  // Default ON: a one-off beneficiary is saved to the contractors table so they
  // can be reused. Operators can untick for a genuine one-time payee.
  const [adHocSaveContractor, setAdHocSaveContractor] = useState(true);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, bank_name, bank_account_number, bank_account_name, salary_ngn, job_title, pension_enabled, nhf_enabled, paye_enabled, use_salary_components, basic_ngn, housing_ngn, transport_ngn, other_allowances_ngn')
      .eq('status', 'active')
      .order('full_name')
      .limit(500)
      .then(({ data }) => setEmployees((data as Employee[]) || []));
  }, []);

  // Contractors load server-side so the search spans the ENTIRE roster (700+),
  // not just a first page. Mirrors the Contractors page search (name / account
  // / email). Lifecycle / HeyReach status is shown as a row indicator but
  // doesn't block payment.
  //
  // Active-only by default: deactivated contractors are excluded from the
  // picker so a month-end run isn't cluttered with offboarded partners. The
  // "Include inactive" toggle below lets the operator opt in (final
  // settlement edge cases) without redeploying.
  useEffect(() => {
    const term = debouncedSearch.trim().replace(/[,()%]/g, ' ').trim();
    let q = supabase
      .from('contractors')
      .select('*')
      .order('full_name')
      .limit(term ? 200 : 500);
    if (!showInactiveContractors) {
      q = q.eq('status', 'active');
    }
    if (term) {
      q = q.or(
        `full_name.ilike.%${term}%,account_number.ilike.%${term}%,email.ilike.%${term}%,heyreach_email.ilike.%${term}%`,
      );
    }
    q.then(({ data }) => setContractors((data as Contractor[]) || []));
  }, [debouncedSearch, showInactiveContractors]);

  // Pre-populate a single contractor when navigated from ContractorProfile
  useEffect(() => {
    if (isEditMode) return;
    const contractorId = searchParams.get('contractor_id');
    if (!contractorId) return;
    const name = decodeURIComponent(searchParams.get('contractor_name') || '');
    const bank = decodeURIComponent(searchParams.get('contractor_bank') || '');
    const account = decodeURIComponent(searchParams.get('contractor_account') || '');
    const amount = Number(searchParams.get('contractor_amount') || 0);
    setBatchType('contractor');
    const now = new Date();
    const monthLong = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
    const monthShort = now.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
    setBatchName(`Contractor Payment — ${name}`);
    setPeriod(monthShort);
    setPaymentDate(now.toISOString().slice(0, 10));
    setItems([{
      _key: crypto.randomUUID(),
      full_name: name,
      bank_name: bank,
      account_number: account,
      amount_ngn: amount,
      reference: `${name} — ${monthLong}`,
      contractor_id: contractorId,
      item_type: 'contractor',
    }]);
    setStep(2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isEditMode || !editId) return;
    const loadDraft = async () => {
      setLoadingEdit(true);
      try {
        const [batchRes, itemsRes] = await Promise.all([
          supabase.from('payment_batches').select('*').eq('id', editId).single(),
          supabase.from('batch_items').select('*').eq('batch_id', editId).order('created_at'),
        ]);
        if (batchRes.error || !batchRes.data) {
          toast({ title: 'Batch not found', variant: 'destructive' });
          navigate('/payments');
          return;
        }
        const b = batchRes.data as any;
        if (b.status !== 'draft') {
          toast({ title: 'Only draft batches can be edited', variant: 'destructive' });
          navigate(`/payments/${editId}`);
          return;
        }
        setBatchType((b.batch_type as BatchType) || 'contractor');
        setBatchName(b.name || '');
        setPaymentDate(b.payment_date || '');
        setScheduledDate(b.scheduled_date ? b.scheduled_date.slice(0, 16) : '');
        setPeriod(b.period || '');
        setNotes(b.notes || '');
        setAdvanceReason(b.advance_reason || '');
        setRepaymentMonths(b.repayment_months || 3);
        setBonusType(b.bonus_type || 'Performance Bonus');
        const loadedItems: BatchItem[] = (itemsRes.data || []).map((it: any) => ({
          _key: it.id || crypto.randomUUID(),
          full_name: it.full_name || '',
          bank_name: it.bank_name || '',
          account_number: it.account_number || '',
          amount_ngn: it.amount_ngn || 0,
          reference: it.reference || '',
          contractor_id: it.contractor_id || undefined,
          employee_id: it.employee_id || undefined,
          item_type: it.item_type || 'adhoc',
        }));
        setItems(loadedItems);
        setStep(2);
      } finally {
        setLoadingEdit(false);
      }
    };
    loadDraft();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const selectedIds = useMemo(
    () => new Set(items.map((i) => i.contractor_id).filter(Boolean)),
    [items]
  );

  const toggleContractor = (c: Contractor, checked: boolean) => {
    if (checked) {
      if (selectedIds.has(c.id)) return;
      if (items.length >= MAX_RECIPIENTS_PER_BATCH) {
        toast({
          title: `Batch full — ${MAX_RECIPIENTS_PER_BATCH} recipients max`,
          description: 'Paystack caps a single batch at 100 transfers. Submit this one and create a second batch for the rest.',
          variant: 'destructive',
        });
        return;
      }
      setItems((prev) => [
        ...prev,
        {
          _key: crypto.randomUUID(),
          full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
          bank_name: c.bank_name,
          account_number: c.account_number,
          amount_ngn: c.default_amount_ngn || 0,
          reference: '',
          contractor_id: c.id,
        },
      ]);
    } else {
      setItems((prev) => prev.filter((i) => i.contractor_id !== c.id));
    }
  };

  const selectAllVisible = (visible: Contractor[]) => {
    const toAdd = visible
      .filter((c) => !selectedIds.has(c.id))
      .map((c) => ({
        _key: crypto.randomUUID(),
        full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
        bank_name: c.bank_name,
        account_number: c.account_number,
        amount_ngn: c.default_amount_ngn || 0,
        reference: '',
        contractor_id: c.id,
      }));
    if (toAdd.length === 0) return;
    // Trim against the per-batch cap so a wide select-all doesn't
    // blow past 100 silently. Any leftovers stay unselected and
    // can go in a follow-up batch.
    const remaining = MAX_RECIPIENTS_PER_BATCH - items.length;
    if (remaining <= 0) {
      toast({
        title: `Batch full — ${MAX_RECIPIENTS_PER_BATCH} recipients max`,
        description: 'Submit this one and create a second batch for the rest.',
        variant: 'destructive',
      });
      return;
    }
    const trimmed = toAdd.slice(0, remaining);
    if (trimmed.length < toAdd.length) {
      toast({
        title: `Added ${trimmed.length} — batch is now full`,
        description: `${toAdd.length - trimmed.length} additional recipient${toAdd.length - trimmed.length === 1 ? '' : 's'} skipped. Create a second batch to include them.`,
      });
    }
    setItems((prev) => [...prev, ...trimmed]);
  };

  const clearAllVisible = (visible: Contractor[]) => {
    const visibleIds = new Set(visible.map((c) => c.id));
    setItems((prev) => prev.filter((i) => !i.contractor_id || !visibleIds.has(i.contractor_id)));
  };

  const removeItem = (index: number) => setItems(items.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof BatchItem, value: string | number) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  // Set the same amount on every selected beneficiary at once.
  const applyAmountToAll = (raw: string) => {
    const v = round2(parseFloat(raw));
    const amount = Number.isFinite(v) && v >= 0 ? v : 0;
    setItems((prev) => prev.map((i) => ({ ...i, amount_ngn: amount })));
  };

  // Switch between per-row and single-amount entry. Entering 'same' seeds the
  // shared field from an existing amount so nothing is silently zeroed.
  const switchAmountMode = (mode: 'same' | 'different') => {
    setAmountMode(mode);
    if (mode === 'same') {
      const seed = items.find((i) => i.amount_ngn > 0)?.amount_ngn ?? 0;
      const seedStr = seed ? String(seed) : '';
      setBulkAmount(seedStr);
      if (seed) applyAmountToAll(seedStr);
    }
  };

  const employeeNetSalary = (e: Employee): number => {
    const gross = e.salary_ngn || 0;
    if (gross <= 0) return 0;
    const slip = computePayslip({
      grossMonthlyNgn: gross,
      pensionEnabled: e.pension_enabled !== false,
      nhfEnabled: e.nhf_enabled === true,
      payeEnabled: e.paye_enabled !== false,
      useComponents: e.use_salary_components === true,
      basicMonthlyNgn: e.basic_ngn || 0,
      housingMonthlyNgn: e.housing_ngn || 0,
      transportMonthlyNgn: e.transport_ngn || 0,
    });
    return slip.netMonthlyNgn;
  };

  // Employee helpers
  const selectedEmployeeIds = useMemo(
    () => new Set(items.map((i) => i.employee_id).filter(Boolean)),
    [items],
  );

  const empDisplayName = (e: Employee) =>
    e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unknown';

  const toggleEmployee = (e: Employee, checked: boolean) => {
    if (checked) {
      if (selectedEmployeeIds.has(e.id)) return;
      setItems((prev) => [
        ...prev,
        {
          _key: crypto.randomUUID(),
          full_name: empDisplayName(e),
          bank_name: e.bank_name || '',
          account_number: e.bank_account_number || '',
          amount_ngn: batchType === 'employee_salary' ? employeeNetSalary(e) : 0,
          reference: '',
          employee_id: e.id,
          item_type: 'employee',
        },
      ]);
    } else {
      setItems((prev) => prev.filter((i) => i.employee_id !== e.id));
    }
  };

  const filteredEmployees = useMemo(() => {
    const s = employeeSearchTerm.trim().toLowerCase();
    if (!s) return employees;
    return employees.filter(
      (e) =>
        empDisplayName(e).toLowerCase().includes(s) ||
        (e.job_title || '').toLowerCase().includes(s),
    );
  }, [employees, employeeSearchTerm]);

  const isEmployeeBatchType = batchType === 'employee_salary' || batchType === 'advance' || batchType === 'prize';

  const addAdHoc = () => {
    if (!adHocBank.verified) {
      toast({
        title: 'Verify the account first',
        description: 'Beneficiary account must be verified before adding.',
        variant: 'destructive',
      });
      return;
    }
    if (items.length >= MAX_RECIPIENTS_PER_BATCH) {
      toast({
        title: `Batch full — ${MAX_RECIPIENTS_PER_BATCH} recipients max`,
        description: 'Submit this one and create a second batch for the rest.',
        variant: 'destructive',
      });
      return;
    }
    const amount = round2(parseFloat(adHoc.amount_ngn) || 0);
    if (!adHoc.amount_ngn || amount <= 0) {
      toast({
        title: 'Amount required',
        description: 'Amount must be greater than ₦0.',
        variant: 'destructive',
      });
      return;
    }
    const adHocFullName = `${adHoc.first_name.trim()} ${adHoc.last_name.trim()}`.trim() || adHocBank.account_name;
    setItems((prev) => [
      ...prev,
      {
        _key: crypto.randomUUID(),
        full_name: adHocFullName,
        bank_name: adHocBank.bank_name,
        account_number: adHocBank.account_number,
        account_name: adHocBank.account_name || adHocFullName,
        amount_ngn: amount,
        reference: adHoc.reference,
        _saveAsContractor: adHocSaveContractor,
      },
    ]);
    setShowAdHoc(false);
    setAdHoc({ first_name: '', last_name: '', amount_ngn: '', reference: '' });
    setAdHocBank(emptyBank);
    setAdHocSaveContractor(true);
  };

  const handleCsvImport = (rows: ImportedBeneficiary[]) => {
    const remaining = MAX_RECIPIENTS_PER_BATCH - items.length;
    if (remaining <= 0) {
      toast({
        title: `Batch full — ${MAX_RECIPIENTS_PER_BATCH} recipients max`,
        description: 'Submit this one and create a second batch for the rest.',
        variant: 'destructive',
      });
      return;
    }
    const toAdd = rows.slice(0, remaining).map((r) => ({
      _key: crypto.randomUUID(),
      full_name: r.full_name,
      bank_name: r.bank_name,
      account_number: r.account_number,
      amount_ngn: r.amount_ngn,
      reference: r.reference,
      item_type: 'adhoc' as const,
    }));
    setItems((prev) => [...prev, ...toAdd]);
    if (toAdd.length < rows.length) {
      toast({
        title: `Imported ${toAdd.length} — batch is now full`,
        description: `${rows.length - toAdd.length} additional beneficiar${rows.length - toAdd.length === 1 ? 'y' : 'ies'} skipped. Create a second batch to include them.`,
      });
    } else {
      toast({ title: `Imported ${toAdd.length} beneficiaries from CSV` });
    }
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.amount_ngn || 0), 0);
  // Beneficiaries with no/zero amount block advancing — a payout row must have
  // a positive amount (catch it before Review, not only at save).
  const zeroAmountCount = items.filter((i) => !(Number(i.amount_ngn) > 0)).length;

  const handleSave = async (submit: boolean) => {
    const zeroItems = items.filter((i) => !i.amount_ngn || Number(i.amount_ngn) <= 0);
    if (zeroItems.length > 0) {
      toast({
        title: `${zeroItems.length} beneficiar${zeroItems.length === 1 ? 'y has' : 'ies have'} ₦0 amount`,
        description: 'Set amounts for all beneficiaries before saving.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const batchPayload = {
        name: batchName.trim(),
        payment_date: paymentDate,
        scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
        period,
        notes,
        total_amount: totalAmount,
        beneficiary_count: items.length,
        batch_type: batchType,
        advance_reason: batchType === 'advance' ? advanceReason || null : null,
        bonus_type: batchType === 'prize' ? bonusType || null : null,
        repayment_months: batchType === 'advance' ? repaymentMonths : 1,
      };

      let batchId: string;
      if (isEditMode && editId) {
        const { error } = await supabase
          .from('payment_batches')
          .update({ ...batchPayload, status: submit ? 'pending_approval' : 'draft' })
          .eq('id', editId);
        if (error) throw error;
        batchId = editId;
        // Delete existing items and re-insert fresh ones.
        const { error: delErr } = await supabase.from('batch_items').delete().eq('batch_id', batchId);
        if (delErr) throw delErr;
      } else {
        const { data: batch, error } = await supabase
          .from('payment_batches')
          .insert({ ...batchPayload, status: submit ? 'pending_approval' : 'draft', created_by: profile?.id })
          .select()
          .single();
        if (error) throw error;
        batchId = batch.id;
      }

      // Persist any ad-hoc beneficiaries the operator chose to save as
      // contractors. Reuse an existing contractor with the same bank account
      // (avoids duplicates); otherwise create one. Failure here is non-fatal —
      // the beneficiary still goes into the batch as an ad-hoc line.
      const persisted = items.map((i) => ({ ...i }));
      for (const it of persisted) {
        if (!it._saveAsContractor || it.contractor_id || it.employee_id) continue;
        if (!/^\d{10}$/.test(it.account_number || '')) continue;
        try {
          const { data: existing } = await supabase
            .from('contractors')
            .select('id')
            .eq('account_number', it.account_number)
            .eq('bank_name', it.bank_name)
            .neq('status', 'deleted')
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            it.contractor_id = existing.id;
          } else {
            const { data: created } = await supabase
              .from('contractors')
              .insert({
                full_name: it.full_name,
                bank_name: it.bank_name,
                account_number: it.account_number,
                account_name: it.account_name || it.full_name,
                default_amount_ngn: it.amount_ngn,
                status: 'active',
              } as never)
              .select('id')
              .single();
            if (created?.id) it.contractor_id = created.id;
          }
          if (it.contractor_id) it.item_type = 'contractor';
        } catch {
          // keep as ad-hoc line
        }
      }

      if (persisted.length > 0) {
        const batchItems = persisted.map((item) => ({
          batch_id: batchId,
          contractor_id: item.contractor_id || null,
          employee_id: item.employee_id || null,
          item_type: item.item_type || 'adhoc',
          full_name: item.full_name,
          bank_name: item.bank_name,
          account_number: item.account_number,
          amount_ngn: item.amount_ngn,
          reference: item.reference,
          status: 'pending',
        }));
        const { data: insertedItems } = await supabase.from('batch_items').insert(batchItems).select();

        // Phase 3 — create employee_advances records for salary advance batches
        if (batchType === 'advance' && submit && insertedItems) {
          const advanceInserts = insertedItems
            .filter((bi: any) => bi.employee_id)
            .map((bi: any) => ({
              employee_id: bi.employee_id,
              source_batch_id: batchId,
              source_batch_item_id: bi.id,
              amount_ngn: bi.amount_ngn,
              outstanding_ngn: bi.amount_ngn,
              repayment_months: repaymentMonths,
              start_period: period || null,
            }));
          if (advanceInserts.length > 0) {
            await supabase.from('employee_advances').insert(advanceInserts);
          }
        }
      }

      await logAudit(
        submit ? 'batch_submitted' : isEditMode ? 'batch_edited' : 'batch_created',
        submit
          ? `Batch "${batchName}" submitted for approval (${items.length} beneficiaries, ${formatNaira(totalAmount)})`
          : isEditMode
          ? `Batch "${batchName}" draft updated`
          : `Batch "${batchName}" saved as draft`,
        profile,
      );

      toast({ title: submit ? 'Batch submitted for approval' : isEditMode ? 'Draft updated' : 'Batch saved as draft' });
      navigate(isEditMode ? `/payments/${editId}` : '/payments');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Search is performed server-side (see the load effect), so the loaded set is
  // already scoped to the query — expose it directly.
  const filteredContractors = contractors;

  // Visible selectable count (all contractors are payable now; kept for the
  // "Select all (N)" affordance and to disable it when the list is empty).
  const selectableVisibleCount = useMemo(
    () => filteredContractors.filter((c) => heyreachDisplayStatus(c).payable).length,
    [filteredContractors],
  );

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" aria-label="Go back" onClick={() => navigate(isEditMode ? `/payments/${editId}` : '/payments')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEditMode ? 'Edit Payment Batch' : 'New Payment Batch'}</h1>
          <p className="text-muted-foreground text-sm">{isEditMode ? 'Editing draft' : `Step ${step} of 3`}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Payment Type &amp; Details</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            {/* Batch type selector */}
            <div>
              <Label className="text-sm mb-3 block">What type of payment is this?</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {BATCH_TYPES.filter((t) => allowedBatchTypes.includes(t.type)).map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => {
                      setBatchType(t.type);
                      // Auto-fill batch name + period + payment date for whichever
                      // type was picked, so the operator never sees an empty form.
                      // Only runs when the operator hasn't already started typing.
                      if (!batchName) {
                        const now = new Date();
                        const monthLong = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
                        const monthShort = now.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
                        // The next upcoming 25th — THIS month's if it hasn't
                        // passed yet, otherwise next month's. Previously this
                        // always jumped a full month ahead (now.getMonth() + 1
                        // unconditionally), so picking "Employee Salary" on
                        // any day 1-25 silently pre-filled a payment date a
                        // month later than intended — the root cause of
                        // salary batches carrying a payment_date weeks after
                        // they were actually dispatched.
                        const next25Month = now.getDate() <= 25 ? now.getMonth() : now.getMonth() + 1;
                        const next25 = new Date(now.getFullYear(), next25Month, 25)
                          .toISOString().slice(0, 10);
                        const today = now.toISOString().slice(0, 10);

                        if (t.type === 'employee_salary') {
                          setBatchName(`Salary Run — ${monthLong}`);
                          setPeriod(monthShort);
                          setPaymentDate(next25);
                        } else if (t.type === 'advance') {
                          setBatchName(`Salary Advance — ${monthLong}`);
                          setPeriod(monthShort);
                          setPaymentDate(today);
                        } else if (t.type === 'prize') {
                          // 'prize' is the existing key for bonus / one-off awards
                          setBatchName(`Bonus Run — ${monthLong}`);
                          setPeriod(monthShort);
                          setPaymentDate(today);
                        } else if (t.type === 'contractor') {
                          setBatchName(`Contractor Payment — ${monthLong}`);
                          setPeriod(monthShort);
                          setPaymentDate(today);
                        }
                      }
                    }}
                    className={cn(
                      'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all',
                      batchType === t.type
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30',
                    )}
                  >
                    <div className={cn('rounded-lg p-1.5 bg-muted', t.color)}>
                      {t.icon}
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              {allowedBatchTypes.length === 0 && (
                <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">No batch types unlocked</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ask an admin to grant at least one of <span className="font-mono">payments.batch.contractor</span>,{' '}
                    <span className="font-mono">.salary</span>, <span className="font-mono">.advance</span> or{' '}
                    <span className="font-mono">.bonus</span> on your profile.
                  </p>
                </div>
              )}
            </div>

            {/* Advance reason / bonus type */}
            {batchType === 'advance' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Advance Reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={advanceReason}
                    onChange={(e) => setAdvanceReason(e.target.value)}
                    placeholder="e.g. Medical emergency, school fees, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Repayment Plan</Label>
                  <Select value={String(repaymentMonths)} onValueChange={(v) => setRepaymentMonths(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 month (full deduction next salary)</SelectItem>
                      <SelectItem value="2">2 months</SelectItem>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Monthly deduction will appear on employee payslips and the employee profile.
                  </p>
                </div>
              </div>
            )}
            {batchType === 'prize' && (
              <div className="space-y-2">
                <Label>Bonus Type</Label>
                <Select value={bonusType} onValueChange={setBonusType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Performance Bonus', '13th Month', 'Christmas Bonus', 'Ramadan Bonus',
                      'Annual Leave Allowance', 'Other'].map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Batch Name</Label>
                <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. 30/03/26 — LinkedIn 1-20" />
              </div>
              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Payment Period</Label>
                <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. March 2026" />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Execution (optional)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to process immediately after approval. Set a future
                  date/time to schedule the batch for execution.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
            </div>
            <StickyActionBar>
              <Button
                onClick={() => setStep(2)}
                disabled={!batchName || !paymentDate}
                className="flex-1 md:flex-none h-11 md:h-9"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </StickyActionBar>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle>
                    {isEmployeeBatchType ? 'Select Employees' : 'Select Contractors'}
                  </CardTitle>
                  {batchType === 'employee_salary' && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Amounts pre-filled as net pay (after PAYE, pension, NHF deductions)
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowCsvImport(true)}>
                    <Upload className="mr-2 h-4 w-4" /> Import from CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAdHoc(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Add One-off Beneficiary
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Employee picker */}
              {isEmployeeBatchType && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={employeeSearchTerm}
                      onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                      placeholder="Search employees..."
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline"
                      onClick={() => {
                        filteredEmployees.filter((e) => e.bank_account_number).forEach((e) => {
                          if (!selectedEmployeeIds.has(e.id)) toggleEmployee(e, true);
                        });
                      }}
                    >
                      Select all with bank
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => setItems((prev) => prev.filter((i) => !i.employee_id))}
                    >
                      Clear employees
                    </Button>
                    <span className="text-muted-foreground text-xs ml-auto">
                      {items.filter((i) => i.employee_id).length} selected
                    </span>
                  </div>
                  {/* Compact picker — matches contractor picker. h-9
                      label rows, hairline divide-y, mono account
                      subtitle. */}
                  <div className="border rounded-lg max-h-80 overflow-y-auto bg-card divide-y divide-border/40">
                    {filteredEmployees.length === 0 ? (
                      <div className="text-center text-muted-foreground text-[12px] py-6">
                        No employees match your search.
                      </div>
                    ) : (
                      filteredEmployees.map((e) => {
                        const hasBank = !!e.bank_account_number;
                        const checked = selectedEmployeeIds.has(e.id);
                        const name = empDisplayName(e);
                        return (
                          <label
                            key={e.id}
                            className={cn(
                              'flex items-center gap-3 px-3 h-9 kd-transition',
                              hasBank ? 'cursor-pointer' : 'opacity-60',
                              checked ? 'bg-primary/[0.04]' : hasBank && 'hover:bg-muted/30',
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={!hasBank}
                              onCheckedChange={(v) => hasBank && toggleEmployee(e, Boolean(v))}
                              className="h-3.5 w-3.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[12.5px] font-medium truncate">{name}</span>
                                {hasBank ? (
                                  <span className="hidden sm:inline text-[10.5px] text-muted-foreground/80 font-mono tracking-tight truncate">
                                    {e.bank_name} · {e.bank_account_number || '—'}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10.5px] text-amber-600 shrink-0">
                                    <AlertTriangle className="h-2.5 w-2.5" /> No bank
                                  </span>
                                )}
                              </div>
                              {hasBank && (
                                <span className="sm:hidden text-[10px] text-muted-foreground/80 font-mono tracking-tight block truncate">
                                  {e.bank_name} · {e.bank_account_number || '—'}
                                </span>
                              )}
                            </div>
                            <span className="text-[12px] font-mono font-semibold tabular-nums shrink-0 text-muted-foreground">
                              {e.salary_ngn ? formatNaira(e.salary_ngn) : '—'}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}

              {/* Contractor picker */}
              {!isEmployeeBatchType && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search contractors..."
                      className="pl-9"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => selectAllVisible(filteredContractors)} disabled={selectableVisibleCount === 0}>
                      Select all {selectableVisibleCount ? `(${selectableVisibleCount})` : ''}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => clearAllVisible(filteredContractors)} disabled={filteredContractors.length === 0}>
                      Clear visible
                    </Button>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none ml-1" title="Off by default — month-end runs ignore offboarded partners. Tick to include them (e.g. final settlement payouts).">
                      <Checkbox
                        checked={showInactiveContractors}
                        onCheckedChange={(v) => setShowInactiveContractors(Boolean(v))}
                        className="h-3.5 w-3.5"
                      />
                      Include inactive
                    </label>
                    <span className="text-muted-foreground text-xs ml-auto">{items.length} selected</span>
                  </div>
                  {/* Compact picker — row = 36px tall. Beneficiary on
                      left (checkbox + name + bank · acc subtitle in
                      mono), default amount on right in mono. Hairline
                      divide-y, no chunky table chrome. Pattern lifted
                      from Wise / Mercury batch composer. */}
                  <div className="border rounded-lg max-h-80 overflow-y-auto bg-card divide-y divide-border/40">
                    {filteredContractors.length === 0 ? (
                      <div className="text-center text-muted-foreground text-[12px] py-6">
                        No contractors match your search.
                      </div>
                    ) : (
                      filteredContractors.map((c) => {
                        const checked = selectedIds.has(c.id);
                        const name = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
                        const st = heyreachDisplayStatus(c);
                        const showStatus = st.key !== 'active';
                        return (
                          <label
                            key={c.id}
                            title={showStatus ? st.reason : undefined}
                            className={cn(
                              'flex items-center gap-3 px-3 h-9 kd-transition',
                              checked ? 'bg-primary/[0.04] cursor-pointer' : 'cursor-pointer hover:bg-muted/30',
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => toggleContractor(c, Boolean(v))}
                              className="h-3.5 w-3.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[12.5px] font-medium truncate">{name}</span>
                                {showStatus && (
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0',
                                      st.className,
                                    )}
                                    title={st.reason}
                                  >
                                    <span className={cn('h-1.5 w-1.5 rounded-full', st.dotClass)} /> {st.label}
                                  </span>
                                )}
                                {c.bank_name && (
                                  <span className="hidden sm:inline text-[10.5px] text-muted-foreground/80 font-mono tracking-tight truncate">
                                    {c.bank_name} · {c.account_number || '—'}
                                  </span>
                                )}
                              </div>
                              {c.bank_name && (
                                <span className="sm:hidden text-[10px] text-muted-foreground/80 font-mono tracking-tight block truncate">
                                  {c.bank_name} · {c.account_number || '—'}
                                </span>
                              )}
                            </div>
                            <span className="text-[12px] font-mono font-semibold tabular-nums shrink-0 text-muted-foreground">
                              {formatNaira(c.default_amount_ngn || 0)}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Selected Beneficiaries
                  {/* Count chip with progressive tone — green under
                      the warn threshold, amber as it fills up, red
                      at the cap. The hard MAX is 100 because Paystack's
                      transfer/bulk endpoint caps each call at 100 and
                      our dispatcher loops single-call transfers. */}
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                      items.length >= MAX_RECIPIENTS_PER_BATCH
                        ? 'bg-red-500/15 text-red-700 dark:text-red-300'
                        : items.length >= WARN_RECIPIENTS
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                    )}
                  >
                    {items.length} / {MAX_RECIPIENTS_PER_BATCH}
                  </span>
                </CardTitle>
                <div className="text-sm">
                  <span className="text-muted-foreground mr-2">Running total:</span>
                  <span className="font-bold currency">{formatNaira(totalAmount)}</span>
                </div>
              </div>

              {/* Amount entry mode — same amount for everyone, or per-row. */}
              {items.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <div className="inline-flex rounded-lg border border-border/70 p-0.5 text-[12px] font-medium">
                    {(['different', 'same'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => switchAmountMode(mode)}
                        className={cn(
                          'rounded-md px-2.5 py-1 kd-transition',
                          amountMode === mode
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {mode === 'different' ? 'Different amounts' : 'Same amount'}
                      </button>
                    ))}
                  </div>
                  {amountMode === 'same' && (
                    <div className="relative w-44">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={bulkAmount}
                        placeholder="Amount for everyone"
                        className="pl-7 h-8 tabular-nums"
                        onChange={(e) => {
                          setBulkAmount(e.target.value);
                          applyAmountToAll(e.target.value);
                        }}
                      />
                    </div>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {amountMode === 'same'
                      ? 'One amount applied to all selected beneficiaries.'
                      : 'Type an amount per beneficiary below.'}
                  </span>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="text-[12px] text-muted-foreground text-center py-8">
                  No beneficiaries selected yet.
                </p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Beneficiary</th>
                          <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Amount (₦)</th>
                          <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Reference</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {items.map((item, i) => (
                          <tr key={item._key} className="hover:bg-muted/20 kd-transition">
                            <td className="px-3 py-1.5 max-w-[280px]">
                              <div className="text-[12.5px] font-medium truncate">{item.full_name || 'Unknown'}</div>
                              {item.bank_name && (
                                <div className="text-[10.5px] text-muted-foreground/80 font-mono tracking-tight truncate">
                                  {item.bank_name} · {item.account_number || '—'}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <Input
                                type="number"
                                min={0}
                                className={cn(
                                  'w-28 h-7 text-right text-[12px] font-mono tabular-nums disabled:opacity-60',
                                  !(Number(item.amount_ngn) > 0) && 'border-destructive focus-visible:ring-destructive',
                                )}
                                value={item.amount_ngn}
                                disabled={amountMode === 'same'}
                                title={
                                  amountMode === 'same'
                                    ? 'Switch to "Different amounts" to edit individually'
                                    : !(Number(item.amount_ngn) > 0) ? 'Enter an amount greater than ₦0' : undefined
                                }
                                onChange={(e) => updateItem(i, 'amount_ngn', round2(Math.max(0, parseFloat(e.target.value) || 0)))}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <Input
                                className="w-32 h-7 text-[11px] font-mono"
                                value={item.reference}
                                onChange={(e) => updateItem(i, 'reference', e.target.value)}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Remove item"
                                onClick={() => removeItem(i)}
                                className="h-7 w-7"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list — same data, thumb-friendly */}
                  <div className="md:hidden p-3 space-y-2">
                    {items.map((item, i) => (
                      <MobileCard key={item._key}>
                        <MobileCardHeader>
                          <MobileCardTitle>{item.full_name || 'Unknown'}</MobileCardTitle>
                          <MobileCardMeta className="currency">
                            {formatNaira(item.amount_ngn)}
                          </MobileCardMeta>
                        </MobileCardHeader>
                        {item.bank_name && (
                          <MobileCardRow label="Bank">
                            {item.bank_name} · {item.account_number || '—'}
                          </MobileCardRow>
                        )}
                        <MobileCardRow label="Amount (₦)">
                          <Input
                            type="number"
                            className={cn(
                              'w-28 h-8 ml-auto text-right text-xs font-mono tabular-nums disabled:opacity-60',
                              !(Number(item.amount_ngn) > 0) && 'border-destructive focus-visible:ring-destructive',
                            )}
                            value={item.amount_ngn}
                            disabled={amountMode === 'same'}
                            title={
                              amountMode === 'same'
                                ? 'Switch to "Different amounts" to edit individually'
                                : !(Number(item.amount_ngn) > 0) ? 'Enter an amount greater than ₦0' : undefined
                            }
                            onChange={(e) => updateItem(i, 'amount_ngn', round2(parseFloat(e.target.value) || 0))}
                          />
                        </MobileCardRow>
                        <MobileCardRow label="Reference">
                          <Input
                            className="w-36 ml-auto h-8 text-xs font-mono"
                            value={item.reference}
                            onChange={(e) => updateItem(i, 'reference', e.target.value)}
                          />
                        </MobileCardRow>
                        <MobileCardFooter>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeItem(i)}
                            className="w-full h-9 border-destructive/40 text-destructive hover:bg-destructive/5"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                          </Button>
                        </MobileCardFooter>
                      </MobileCard>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {zeroAmountCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <b>{zeroAmountCount}</b> beneficiar{zeroAmountCount === 1 ? 'y has' : 'ies have'} no amount.
                Set an amount greater than ₦0 for {zeroAmountCount === 1 ? 'it' : 'each'} before continuing.
              </span>
            </div>
          )}

          <StickyActionBar
            status={items.length > 0 ? `${items.length} recipient${items.length === 1 ? '' : 's'} selected` : undefined}
          >
            <Button variant="outline" onClick={() => setStep(1)} className="h-11 md:h-9">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={items.length === 0 || zeroAmountCount > 0} className="flex-1 md:flex-none h-11 md:h-9">
              Review <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </StickyActionBar>
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Review Batch</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div><p className="text-xs text-muted-foreground">Batch Name</p><p className="font-medium text-sm">{batchName}</p></div>
              <div><p className="text-xs text-muted-foreground">Payment Date</p><p className="font-medium text-sm">{paymentDate}</p></div>
              <div><p className="text-xs text-muted-foreground">Beneficiaries</p><p className="font-medium text-sm">{items.length}</p></div>
              <div><p className="text-xs text-muted-foreground">Total Amount</p><p className="font-bold text-lg currency">{formatNaira(totalAmount)}</p></div>
            </div>

            {items.some((i) => i.item_type === 'adhoc' && !i.account_name) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-300">Unverified bank accounts</p>
                  <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                    {items.filter((i) => i.item_type === 'adhoc' && !i.account_name).length} CSV-imported beneficiar{items.filter((i) => i.item_type === 'adhoc' && !i.account_name).length === 1 ? 'y has' : 'ies have'} not been bank-verified. Payments may fail or reach the wrong account. Consider verifying accounts before submitting.
                  </p>
                </div>
              </div>
            )}

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item._key}>
                      <TableCell className="font-medium">{item.full_name || 'Unknown'}</TableCell>
                      <TableCell>{item.bank_name}</TableCell>
                      <TableCell>{item.account_number}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(item.amount_ngn)}</TableCell>
                      <TableCell>{item.reference}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile card list — same data, thumb-friendly */}
            <div className="md:hidden space-y-2">
              {items.map((item) => (
                <MobileCard key={item._key}>
                  <MobileCardHeader>
                    <MobileCardTitle>{item.full_name || 'Unknown'}</MobileCardTitle>
                    <MobileCardMeta className="currency">
                      {formatNaira(item.amount_ngn)}
                    </MobileCardMeta>
                  </MobileCardHeader>
                  <MobileCardRow label="Bank">{item.bank_name || '—'}</MobileCardRow>
                  <MobileCardRow label="Account">{item.account_number || '—'}</MobileCardRow>
                  {item.reference && (
                    <MobileCardRow label="Reference">{item.reference}</MobileCardRow>
                  )}
                </MobileCard>
              ))}
            </div>

            <StickyActionBar>
              <Button variant="outline" onClick={() => setStep(2)} className="h-11 md:h-9">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button variant="outline" onClick={() => handleSave(false)} disabled={saving} className="h-11 md:h-9">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft
              </Button>
              <Button onClick={() => handleSave(true)} disabled={saving} className="flex-1 md:flex-none h-11 md:h-9">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Check className="mr-2 h-4 w-4" /> Submit for Approval
              </Button>
            </StickyActionBar>
          </CardContent>
        </Card>
      )}
      <StickyActionBarSpacer />

      {/* Ad-hoc beneficiary dialog */}
      <Dialog open={showAdHoc} onOpenChange={setShowAdHoc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add One-off Beneficiary</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First name *</Label>
                <Input
                  value={adHoc.first_name}
                  onChange={(e) => setAdHoc({ ...adHoc, first_name: e.target.value })}
                  placeholder={adHocBank.account_name ? adHocBank.account_name.split(' ')[0] : 'Ada'}
                />
              </div>
              <div className="space-y-1">
                <Label>Last name *</Label>
                <Input
                  value={adHoc.last_name}
                  onChange={(e) => setAdHoc({ ...adHoc, last_name: e.target.value })}
                  placeholder="Okonkwo"
                />
              </div>
            </div>
            <BankAccountField value={adHocBank} onChange={setAdHocBank} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input
                  type="number"
                  value={adHoc.amount_ngn}
                  onChange={(e) => setAdHoc({ ...adHoc, amount_ngn: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Reference</Label>
                <Input
                  value={adHoc.reference}
                  onChange={(e) => setAdHoc({ ...adHoc, reference: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 cursor-pointer">
              <Checkbox
                checked={adHocSaveContractor}
                onCheckedChange={(v) => setAdHocSaveContractor(Boolean(v))}
                className="mt-0.5"
              />
              <span className="text-sm leading-snug">
                Save as a contractor for future payments
                <span className="block text-[11px] text-muted-foreground">
                  Adds them to your contractor list (skipped if a contractor already has this bank account). Untick for a true one-off.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdHoc(false)}>Cancel</Button>
            <Button onClick={addAdHoc} disabled={!adHocBank.verified || !adHoc.amount_ngn}>
              Add Beneficiary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BeneficiaryCsvImport
        open={showCsvImport}
        onOpenChange={setShowCsvImport}
        onImport={handleCsvImport}
      />
    </div>
  );
};

export default NewPaymentBatch;
