import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { format, parseISO } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { formatNaira } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, Plus, Banknote, Users, TrendingUp, AlertTriangle, CreditCard, Inbox,
} from 'lucide-react';

type LoanStatus = 'pending' | 'approved' | 'active' | 'fully_paid' | 'defaulted' | 'written_off';
type LoanType = 'salary_advance' | 'personal_loan' | 'emergency' | 'education' | 'housing' | 'other';
type RepaymentType = 'payroll_deduction' | 'manual' | 'bank_transfer';

interface StaffLoan {
  id: string;
  employee_id: string;
  loan_type: LoanType;
  principal_ngn: number;
  interest_rate_pct: number;
  tenure_months: number;
  monthly_deduction_ngn: number;
  outstanding_ngn: number;
  status: LoanStatus;
  approved_by: string | null;
  approved_at: string | null;
  disbursed_at: string | null;
  purpose: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  employee?: { full_name: string | null } | null;
  approver?: { full_name: string | null } | null;
}

interface LoanRepayment {
  id: string;
  loan_id: string;
  amount_ngn: number;
  repayment_type: RepaymentType;
  payroll_run_id: string | null;
  period: string | null;
  notes: string | null;
  created_at: string;
  loan?: { employee_id: string; loan_type: LoanType; employee?: { full_name: string | null } | null } | null;
}

interface Employee {
  id: string;
  full_name: string | null;
}

const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  salary_advance: 'Salary Advance',
  personal_loan: 'Personal Loan',
  emergency: 'Emergency',
  education: 'Education',
  housing: 'Housing',
  other: 'Other',
};

const LOAN_TYPE_COLORS: Record<LoanType, string> = {
  salary_advance: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  personal_loan: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  emergency: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  education: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  housing: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

const REPAYMENT_TYPE_LABELS: Record<RepaymentType, string> = {
  payroll_deduction: 'Payroll Deduction',
  manual: 'Manual',
  bank_transfer: 'Bank Transfer',
};

function statusVariant(s: LoanStatus) {
  const map: Record<LoanStatus, 'secondary' | 'default' | 'destructive' | 'outline'> = {
    pending: 'secondary',
    approved: 'default',
    active: 'default',
    fully_paid: 'default',
    defaulted: 'destructive',
    written_off: 'outline',
  };
  return map[s];
}

function statusClassName(s: LoanStatus) {
  const map: Record<LoanStatus, string> = {
    pending: '',
    approved: 'bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300',
    active: '',
    fully_paid: 'bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300',
    defaulted: '',
    written_off: '',
  };
  return map[s];
}

const STATUS_LABELS: Record<LoanStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  active: 'Active',
  fully_paid: 'Fully Paid',
  defaulted: 'Defaulted',
  written_off: 'Written Off',
};

const TAB_TRIGGER =
  'text-[12.5px] px-3 h-9 rounded-none border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none';

export default function StaffLoans() {
  usePageTitle('Staff Loans');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loans, setLoans] = useState<StaffLoan[]>([]);
  const [repayments, setRepayments] = useState<LoanRepayment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [repaymentsLoading, setRepaymentsLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailLoan, setDetailLoan] = useState<StaffLoan | null>(null);
  const [repaymentOpen, setRepaymentOpen] = useState(false);
  const [repaymentLoanId, setRepaymentLoanId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newLoan, setNewLoan] = useState({
    employee_id: '',
    loan_type: 'salary_advance' as LoanType,
    principal_ngn: '',
    interest_rate_pct: '0',
    tenure_months: '',
    monthly_deduction_ngn: '',
    purpose: '',
  });

  const [newRepayment, setNewRepayment] = useState({
    amount_ngn: '',
    repayment_type: 'payroll_deduction' as RepaymentType,
    period: '',
    notes: '',
  });

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('staff_loans')
      .select('*, employee:profiles!staff_loans_employee_id_fkey(full_name), approver:profiles!staff_loans_approved_by_fkey(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Failed to load loans', description: error.message, variant: 'destructive' });
    } else {
      setLoans(data ?? []);
    }
    setLoading(false);
  }, [toast]);

  const fetchRepayments = useCallback(async () => {
    setRepaymentsLoading(true);
    const { data, error } = await supabase
      .from('staff_loan_repayments')
      .select('*, loan:staff_loans!staff_loan_repayments_loan_id_fkey(employee_id, loan_type, employee:profiles!staff_loans_employee_id_fkey(full_name))')
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Failed to load repayments', description: error.message, variant: 'destructive' });
    } else {
      setRepayments(data ?? []);
    }
    setRepaymentsLoading(false);
  }, [toast]);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name');
    setEmployees(data ?? []);
  }, []);

  useEffect(() => {
    fetchLoans();
    fetchRepayments();
    fetchEmployees();
  }, [fetchLoans, fetchRepayments, fetchEmployees]);

  const stats = useMemo(() => {
    const total = loans.length;
    const active = loans.filter(l => l.status === 'active').length;
    const disbursed = loans
      .filter(l => ['active', 'fully_paid', 'defaulted', 'written_off'].includes(l.status))
      .reduce((s, l) => s + l.principal_ngn, 0);
    const outstanding = loans
      .filter(l => ['active', 'defaulted'].includes(l.status))
      .reduce((s, l) => s + l.outstanding_ngn, 0);
    const defaulted = loans.filter(l => l.status === 'defaulted').length;
    const closedOrActive = loans.filter(l => ['active', 'fully_paid', 'defaulted', 'written_off'].includes(l.status)).length;
    const defaultRate = closedOrActive > 0 ? (defaulted / closedOrActive) * 100 : 0;
    return { total, active, disbursed, outstanding, defaultRate };
  }, [loans]);

  const handleCreateLoan = async () => {
    if (!newLoan.employee_id || !newLoan.principal_ngn || !newLoan.tenure_months || !newLoan.monthly_deduction_ngn) {
      toast({ title: 'Missing fields', description: 'Please fill all required fields.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('staff_loans').insert({
      employee_id: newLoan.employee_id,
      loan_type: newLoan.loan_type,
      principal_ngn: parseInt(newLoan.principal_ngn, 10),
      interest_rate_pct: parseFloat(newLoan.interest_rate_pct) || 0,
      tenure_months: parseInt(newLoan.tenure_months, 10),
      monthly_deduction_ngn: parseInt(newLoan.monthly_deduction_ngn, 10),
      outstanding_ngn: parseInt(newLoan.principal_ngn, 10),
      purpose: newLoan.purpose || null,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Failed to create loan', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Loan created' });
      setCreateOpen(false);
      setNewLoan({ employee_id: '', loan_type: 'salary_advance', principal_ngn: '', interest_rate_pct: '0', tenure_months: '', monthly_deduction_ngn: '', purpose: '' });
      fetchLoans();
    }
  };

  const handleApprove = async (loan: StaffLoan) => {
    setSubmitting(true);
    const { error } = await supabase
      .from('staff_loans')
      .update({ status: 'approved', approved_by: profile?.id, approved_at: new Date().toISOString() })
      .eq('id', loan.id);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Approval failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Loan approved' });
      setDetailLoan(null);
      fetchLoans();
    }
  };

  const handleReject = async (loan: StaffLoan) => {
    setSubmitting(true);
    const { error } = await supabase
      .from('staff_loans')
      .update({ status: 'written_off', notes: 'Rejected' })
      .eq('id', loan.id);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Rejection failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Loan rejected' });
      setDetailLoan(null);
      fetchLoans();
    }
  };

  const handleRecordRepayment = async () => {
    if (!repaymentLoanId || !newRepayment.amount_ngn) {
      toast({ title: 'Missing fields', description: 'Amount is required.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const amount = parseInt(newRepayment.amount_ngn, 10);
    const { error: repError } = await supabase.from('staff_loan_repayments').insert({
      loan_id: repaymentLoanId,
      amount_ngn: amount,
      repayment_type: newRepayment.repayment_type,
      period: newRepayment.period || null,
      notes: newRepayment.notes || null,
    });
    if (repError) {
      setSubmitting(false);
      toast({ title: 'Failed to record repayment', description: repError.message, variant: 'destructive' });
      return;
    }

    const loan = loans.find(l => l.id === repaymentLoanId);
    if (loan) {
      const newOutstanding = Math.max(0, loan.outstanding_ngn - amount);
      const updates: Record<string, unknown> = { outstanding_ngn: newOutstanding };
      if (newOutstanding === 0) updates.status = 'fully_paid';
      else if (loan.status === 'approved') updates.status = 'active';
      await supabase.from('staff_loans').update(updates).eq('id', repaymentLoanId);
    }

    setSubmitting(false);
    toast({ title: 'Repayment recorded' });
    setRepaymentOpen(false);
    setNewRepayment({ amount_ngn: '', repayment_type: 'payroll_deduction', period: '', notes: '' });
    fetchLoans();
    fetchRepayments();
  };

  const repaymentPercent = (loan: StaffLoan) => {
    if (loan.principal_ngn === 0) return 100;
    return Math.round(((loan.principal_ngn - loan.outstanding_ngn) / loan.principal_ngn) * 100);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Loans"
        icon={Banknote}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Loan
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Total Loans" value={stats.total} icon={Users} />
        <StatCard title="Active Loans" value={stats.active} icon={CreditCard} tone="primary" />
        <StatCard title="Total Disbursed" value={formatNaira(stats.disbursed)} icon={TrendingUp} tone="success" />
        <StatCard title="Total Outstanding" value={formatNaira(stats.outstanding)} icon={Banknote} tone="warning" />
        <StatCard title="Default Rate" value={`${stats.defaultRate.toFixed(1)}%`} icon={AlertTriangle} tone={stats.defaultRate > 10 ? 'danger' : 'default'} />
      </div>

      <Tabs defaultValue="loans">
        <TabsList className="bg-transparent border-b rounded-none w-full justify-start px-0 h-auto">
          <TabsTrigger value="loans" className={TAB_TRIGGER}>Loans</TabsTrigger>
          <TabsTrigger value="repayments" className={TAB_TRIGGER}>Repayments</TabsTrigger>
        </TabsList>

        <TabsContent value="loans" className="mt-4">
          {loading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : loans.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No loans yet"
              description="Create the first staff loan to get started."
              action={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Loan</Button>}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Loan Type</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Monthly Deduction</TableHead>
                        <TableHead className="text-center">Tenure</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Repayment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loans.map(loan => (
                        <TableRow
                          key={loan.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setDetailLoan(loan)}
                        >
                          <TableCell className="font-medium">
                            {loan.employee?.full_name ?? 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LOAN_TYPE_COLORS[loan.loan_type]}`}>
                              {LOAN_TYPE_LABELS[loan.loan_type]}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(loan.principal_ngn)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(loan.outstanding_ngn)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(loan.monthly_deduction_ngn)}</TableCell>
                          <TableCell className="text-center">{loan.tenure_months}mo</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(loan.status)} className={statusClassName(loan.status)}>
                              {STATUS_LABELS[loan.status]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={repaymentPercent(loan)} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground tabular-nums">{repaymentPercent(loan)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="repayments" className="mt-4">
          {repaymentsLoading ? (
            <TableSkeleton rows={6} cols={5} />
          ) : repayments.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No repayments yet"
              description="Repayments will appear here once they are recorded."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Loan Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repayments.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            {r.loan?.employee?.full_name ?? 'Unknown'}
                          </TableCell>
                          <TableCell>
                            {r.loan ? (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LOAN_TYPE_COLORS[r.loan.loan_type]}`}>
                                {LOAN_TYPE_LABELS[r.loan.loan_type]}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatNaira(r.amount_ngn)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{REPAYMENT_TYPE_LABELS[r.repayment_type]}</Badge>
                          </TableCell>
                          <TableCell>{r.period ?? '—'}</TableCell>
                          <TableCell>{format(parseISO(r.created_at), 'dd MMM yyyy')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Loan Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Staff Loan</DialogTitle>
            <DialogDescription>Create a new loan for an employee.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Employee</Label>
              <Select value={newLoan.employee_id} onValueChange={v => setNewLoan(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name ?? e.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Loan Type</Label>
              <Select value={newLoan.loan_type} onValueChange={v => setNewLoan(p => ({ ...p, loan_type: v as LoanType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LOAN_TYPE_LABELS) as LoanType[]).map(k => (
                    <SelectItem key={k} value={k}>{LOAN_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Principal (NGN)</Label>
                <Input type="number" min="1" value={newLoan.principal_ngn} onChange={e => setNewLoan(p => ({ ...p, principal_ngn: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Interest Rate (%)</Label>
                <Input type="number" min="0" step="0.01" value={newLoan.interest_rate_pct} onChange={e => setNewLoan(p => ({ ...p, interest_rate_pct: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Tenure (months)</Label>
                <Input type="number" min="1" value={newLoan.tenure_months} onChange={e => setNewLoan(p => ({ ...p, tenure_months: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Monthly Deduction (NGN)</Label>
                <Input type="number" min="1" value={newLoan.monthly_deduction_ngn} onChange={e => setNewLoan(p => ({ ...p, monthly_deduction_ngn: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Purpose</Label>
              <Textarea value={newLoan.purpose} onChange={e => setNewLoan(p => ({ ...p, purpose: e.target.value }))} placeholder="Reason for the loan" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateLoan} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Create Loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Loan Detail Dialog */}
      <Dialog open={!!detailLoan} onOpenChange={open => { if (!open) setDetailLoan(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Loan Details</DialogTitle>
            <DialogDescription>
              {detailLoan?.employee?.full_name ?? 'Employee'} &mdash; {detailLoan ? LOAN_TYPE_LABELS[detailLoan.loan_type] : ''}
            </DialogDescription>
          </DialogHeader>
          {detailLoan && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="mt-0.5">
                    <Badge variant={statusVariant(detailLoan.status)} className={statusClassName(detailLoan.status)}>
                      {STATUS_LABELS[detailLoan.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Loan Type</span>
                  <div className="mt-0.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${LOAN_TYPE_COLORS[detailLoan.loan_type]}`}>
                      {LOAN_TYPE_LABELS[detailLoan.loan_type]}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Principal</span>
                  <p className="font-medium tabular-nums">{formatNaira(detailLoan.principal_ngn)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Outstanding</span>
                  <p className="font-medium tabular-nums">{formatNaira(detailLoan.outstanding_ngn)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Monthly Deduction</span>
                  <p className="font-medium tabular-nums">{formatNaira(detailLoan.monthly_deduction_ngn)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Interest Rate</span>
                  <p className="font-medium tabular-nums">{detailLoan.interest_rate_pct}%</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tenure</span>
                  <p className="font-medium">{detailLoan.tenure_months} months</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Repayment</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Progress value={repaymentPercent(detailLoan)} className="h-2 flex-1" />
                    <span className="text-xs tabular-nums">{repaymentPercent(detailLoan)}%</span>
                  </div>
                </div>
                {detailLoan.approved_at && (
                  <div>
                    <span className="text-muted-foreground">Approved At</span>
                    <p>{format(parseISO(detailLoan.approved_at), 'dd MMM yyyy')}</p>
                  </div>
                )}
                {detailLoan.approver?.full_name && (
                  <div>
                    <span className="text-muted-foreground">Approved By</span>
                    <p>{detailLoan.approver.full_name}</p>
                  </div>
                )}
                {detailLoan.disbursed_at && (
                  <div>
                    <span className="text-muted-foreground">Disbursed At</span>
                    <p>{format(parseISO(detailLoan.disbursed_at), 'dd MMM yyyy')}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p>{format(parseISO(detailLoan.created_at), 'dd MMM yyyy')}</p>
                </div>
              </div>
              {detailLoan.purpose && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Purpose</span>
                  <p className="mt-0.5">{detailLoan.purpose}</p>
                </div>
              )}
              {detailLoan.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes</span>
                  <p className="mt-0.5">{detailLoan.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {detailLoan?.status === 'pending' && (
              <>
                <Button variant="destructive" onClick={() => detailLoan && handleReject(detailLoan)} disabled={submitting}>
                  Reject
                </Button>
                <Button onClick={() => detailLoan && handleApprove(detailLoan)} disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Approve
                </Button>
              </>
            )}
            {detailLoan && ['approved', 'active'].includes(detailLoan.status) && (
              <Button
                variant="outline"
                onClick={() => {
                  setRepaymentLoanId(detailLoan.id);
                  setRepaymentOpen(true);
                }}
              >
                Record Repayment
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Repayment Dialog */}
      <Dialog open={repaymentOpen} onOpenChange={open => { if (!open) { setRepaymentOpen(false); setRepaymentLoanId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Repayment</DialogTitle>
            <DialogDescription>Log a repayment against this loan.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Amount (NGN)</Label>
              <Input type="number" min="1" value={newRepayment.amount_ngn} onChange={e => setNewRepayment(p => ({ ...p, amount_ngn: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Repayment Type</Label>
              <Select value={newRepayment.repayment_type} onValueChange={v => setNewRepayment(p => ({ ...p, repayment_type: v as RepaymentType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(REPAYMENT_TYPE_LABELS) as RepaymentType[]).map(k => (
                    <SelectItem key={k} value={k}>{REPAYMENT_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Period</Label>
              <Input placeholder="e.g. 2026-08" value={newRepayment.period} onChange={e => setNewRepayment(p => ({ ...p, period: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>Notes</Label>
              <Textarea value={newRepayment.notes} onChange={e => setNewRepayment(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRepaymentOpen(false); setRepaymentLoanId(null); }}>Cancel</Button>
            <Button onClick={handleRecordRepayment} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
