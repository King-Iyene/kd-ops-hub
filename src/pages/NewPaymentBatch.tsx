import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira, formatDate } from '@/lib/format';
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
import {
  Loader2, Trash2, ArrowLeft, ArrowRight, Check, Search, Plus,
  Users, Banknote, CreditCard, Gift, AlertTriangle, Building2,
} from 'lucide-react';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';

type BatchType = 'contractor' | 'employee_salary' | 'advance' | 'prize';

interface BatchItem {
  full_name: string;
  bank_name: string;
  account_number: string;
  amount_ngn: number;
  reference: string;
  contractor_id?: string;
  employee_id?: string;
  item_type?: 'contractor' | 'employee' | 'adhoc';
}

interface Contractor {
  id: string;
  full_name: string;
  bank_name: string;
  account_number: string;
  default_amount_ngn: number;
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

const NewPaymentBatch = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id?: string }>();
  const isEditMode = !!editId && editId !== 'new';
  const { toast } = useToast();
  const { profile } = useAuthStore();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(isEditMode);
  const [batchType, setBatchType] = useState<BatchType>('contractor');

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
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');

  // Ad-hoc beneficiary dialog
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [adHoc, setAdHoc] = useState({ first_name: '', last_name: '', amount_ngn: '', reference: '' });
  const [adHocBank, setAdHocBank] = useState<BankAccountValue>(emptyBank);

  useEffect(() => {
    supabase
      .from('contractors')
      .select('*')
      .eq('status', 'active')
      .order('full_name')
      .then(({ data }) => setContractors((data as Contractor[]) || []));

    supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name, bank_name, bank_account_number, bank_account_name, salary_ngn, job_title')
      .eq('status', 'active')
      .order('full_name')
      .then(({ data }) => setEmployees((data as Employee[]) || []));
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
      setItems((prev) => [
        ...prev,
        {
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
        full_name: c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
        bank_name: c.bank_name,
        account_number: c.account_number,
        amount_ngn: c.default_amount_ngn || 0,
        reference: '',
        contractor_id: c.id,
      }));
    if (toAdd.length === 0) return;
    setItems((prev) => [...prev, ...toAdd]);
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
          full_name: empDisplayName(e),
          bank_name: e.bank_name || '',
          account_number: e.bank_account_number || '',
          amount_ngn: batchType === 'employee_salary' ? (e.salary_ngn || 0) : 0,
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
    const amount = parseFloat(adHoc.amount_ngn);
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
        full_name: adHocFullName,
        bank_name: adHocBank.bank_name,
        account_number: adHocBank.account_number,
        amount_ngn: amount,
        reference: adHoc.reference,
      },
    ]);
    setShowAdHoc(false);
    setAdHoc({ first_name: '', last_name: '', amount_ngn: '', reference: '' });
    setAdHocBank(emptyBank);
  };

  const totalAmount = items.reduce((sum, i) => sum + (i.amount_ngn || 0), 0);

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
        name: batchName,
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

      if (items.length > 0) {
        const batchItems = items.map((item) => ({
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

  const filteredContractors = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return contractors;
    return contractors.filter(
      (c) =>
        (c.full_name || '').toLowerCase().includes(s) ||
        c.bank_name.toLowerCase().includes(s) ||
        c.account_number.includes(s)
    );
  }, [contractors, searchTerm]);

  if (loadingEdit) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(isEditMode ? `/payments/${editId}` : '/payments')}>
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
                {BATCH_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => {
                      setBatchType(t.type);
                      // auto-fill batch name for salary runs
                      if (t.type === 'employee_salary' && !batchName) {
                        const now = new Date();
                        const month = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
                        setBatchName(`Salary Run — ${month}`);
                        setPeriod(month);
                        setPaymentDate(
                          new Date(now.getFullYear(), now.getMonth() + 1, 25)
                            .toISOString().slice(0, 10),
                        );
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
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!batchName || !paymentDate}>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
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
                      Amounts pre-filled from each employee's monthly salary
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAdHoc(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add One-off Beneficiary
                </Button>
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
                  <div className="border rounded-lg max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Employee</TableHead>
                          <TableHead>Bank Account</TableHead>
                          <TableHead className="text-right">
                            {batchType === 'employee_salary' ? 'Salary' : 'Amount'}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmployees.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-6">
                              No employees found.
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredEmployees.map((e) => {
                          const hasBank = !!e.bank_account_number;
                          const checked = selectedEmployeeIds.has(e.id);
                          return (
                            <TableRow
                              key={e.id}
                              className={cn('transition-colors', hasBank ? 'cursor-pointer' : 'opacity-60')}
                              onClick={() => hasBank && toggleEmployee(e, !checked)}
                            >
                              <TableCell onClick={(ev) => ev.stopPropagation()}>
                                <Checkbox
                                  checked={checked}
                                  disabled={!hasBank}
                                  onCheckedChange={(v) => hasBank && toggleEmployee(e, Boolean(v))}
                                />
                              </TableCell>
                              <TableCell>
                                <p className="font-medium text-sm">{empDisplayName(e)}</p>
                                <p className="text-xs text-muted-foreground">{e.job_title || '—'}</p>
                              </TableCell>
                              <TableCell>
                                {hasBank ? (
                                  <div>
                                    <p className="text-sm">{e.bank_name}</p>
                                    <p className="font-mono text-xs text-muted-foreground">{e.bank_account_number}</p>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                                    <AlertTriangle className="h-3 w-3" /> No bank set
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium text-sm">
                                {e.salary_ngn ? formatNaira(e.salary_ngn) : '—'}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
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
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => selectAllVisible(filteredContractors)} disabled={filteredContractors.length === 0}>
                      Select all {filteredContractors.length ? `(${filteredContractors.length})` : ''}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => clearAllVisible(filteredContractors)} disabled={filteredContractors.length === 0}>
                      Clear visible
                    </Button>
                    <span className="text-muted-foreground text-xs ml-auto">{items.length} selected</span>
                  </div>
                  <div className="border rounded-lg max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Name</TableHead>
                          <TableHead>Bank</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Default Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredContractors.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                              No contractors match your search.
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredContractors.map((c) => {
                          const checked = selectedIds.has(c.id);
                          return (
                            <TableRow key={c.id} className="cursor-pointer" onClick={() => toggleContractor(c, !checked)}>
                              <TableCell onClick={(ev) => ev.stopPropagation()}>
                                <Checkbox checked={checked} onCheckedChange={(v) => toggleContractor(c, Boolean(v))} />
                              </TableCell>
                              <TableCell className="font-medium">{c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown'}</TableCell>
                              <TableCell>{c.bank_name}</TableCell>
                              <TableCell>{c.account_number}</TableCell>
                              <TableCell className="text-right currency">{formatNaira(c.default_amount_ngn || 0)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Selected Beneficiaries ({items.length})</CardTitle>
                <div className="text-sm">
                  <span className="text-muted-foreground mr-2">Running total:</span>
                  <span className="font-bold currency">{formatNaira(totalAmount)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No beneficiaries selected yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount (₦)</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.full_name || 'Unknown'}</TableCell>
                          <TableCell>{item.bank_name}</TableCell>
                          <TableCell>{item.account_number}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="w-32 text-right"
                              value={item.amount_ngn}
                              onChange={(e) => updateItem(i, 'amount_ngn', parseFloat(e.target.value) || 0)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-32"
                              value={item.reference}
                              onChange={(e) => updateItem(i, 'reference', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(i)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={items.length === 0}>
              Review <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
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

            <div className="overflow-x-auto">
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
                  {items.map((item, i) => (
                    <TableRow key={i}>
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

            <div className="flex items-center justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft
                </Button>
                <Button onClick={() => handleSave(true)} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Check className="mr-2 h-4 w-4" /> Submit for Approval
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ad-hoc beneficiary dialog */}
      <Dialog open={showAdHoc} onOpenChange={setShowAdHoc}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add One-off Beneficiary</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
            <div className="grid grid-cols-2 gap-3">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdHoc(false)}>Cancel</Button>
            <Button onClick={addAdHoc} disabled={!adHocBank.verified || !adHoc.amount_ngn}>
              Add Beneficiary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewPaymentBatch;
