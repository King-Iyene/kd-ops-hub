import { useEffect, useState, useCallback } from 'react';
import {
  Plus, ChevronDown, ChevronUp, CheckCircle2, Clock,
  AlertCircle, Wallet, Users, Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { formatNaira } from '@/lib/format';
import { format, parseISO, addMonths } from 'date-fns';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

interface Loan {
  id: string;
  employee_id: string;
  amount_ngn: number;
  interest_rate_pct: number;
  tenure_months: number;
  monthly_installment_ngn: number;
  disbursement_date: string;
  first_repayment_date: string;
  purpose: string;
  deduct_from_payroll: boolean;
  status: 'active' | 'fully_paid' | 'written_off' | 'cancelled';
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  // aggregated
  total_repaid?: number;
}

interface Repayment {
  id: string;
  loan_id: string;
  amount_ngn: number;
  paid_date: string;
  method: string;
  notes: string | null;
}

interface Profile { id: string; full_name: string; }

function calcInstallment(amount: number, ratePercentPerAnnum: number, months: number): number {
  if (ratePercentPerAnnum === 0) return Math.ceil(amount / months);
  const r = ratePercentPerAnnum / 100 / 12;
  return Math.ceil(amount * r * Math.pow(1 + r, months) / (Math.pow(1 + r, months) - 1));
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default'|'secondary'|'destructive'|'outline' }> = {
  active:      { label: 'Active',      variant: 'default' },
  fully_paid:  { label: 'Fully Paid',  variant: 'outline' },
  written_off: { label: 'Written Off', variant: 'destructive' },
  cancelled:   { label: 'Cancelled',   variant: 'secondary' },
};

export default function Loans() {
  usePageTitle('Employee Loans');
  const { toast } = useToast();
  const { profile } = useAuthStore();

  const [loans, setLoans] = useState<Loan[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);

  // Loan dialog
  const [loanDialog, setLoanDialog] = useState(false);
  const [loanForm, setLoanForm] = useState({
    employee_id: '__none__', amount_ngn: '', interest_rate_pct: '0',
    tenure_months: '12', disbursement_date: format(new Date(), 'yyyy-MM-dd'),
    first_repayment_date: '', purpose: '', deduct_from_payroll: true, notes: '',
  });
  const [savingLoan, setSavingLoan] = useState(false);

  // Repayment dialog
  const [repayDialog, setRepayDialog] = useState(false);
  const [repayLoanId, setRepayLoanId] = useState('');
  const [repayForm, setRepayForm] = useState({ amount_ngn: '', paid_date: format(new Date(), 'yyyy-MM-dd'), method: 'payroll_deduction', notes: '' });
  const [savingRepay, setSavingRepay] = useState(false);

  // Write-off confirm
  const [writeOffTarget, setWriteOffTarget] = useState<Loan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: lData }, { data: rData }, { data: pData }] = await Promise.all([
      supabase.from('employee_loans').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('loan_repayments').select('*').order('paid_date', { ascending: false }).limit(1000),
      supabase.from('profiles').select('id, full_name').limit(200),
    ]);
    const repayList = (rData as Repayment[]) || [];
    // aggregate total repaid per loan
    const repayMap = new Map<string, number>();
    for (const r of repayList) {
      repayMap.set(r.loan_id, (repayMap.get(r.loan_id) ?? 0) + r.amount_ngn);
    }
    setRepayments(repayList);
    setLoans(((lData as Loan[]) || []).map(l => ({ ...l, total_repaid: repayMap.get(l.id) ?? 0 })));
    setProfiles((pData as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id: string | null) => id ? (profiles.find(p => p.id === id)?.full_name ?? 'Unknown') : '—';

  const calcFirstRepay = (disbDate: string, months: string) => {
    if (!disbDate) return '';
    return format(addMonths(parseISO(disbDate), 1), 'yyyy-MM-dd');
  };

  const openLoanDialog = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const firstRepay = format(addMonths(new Date(), 1), 'yyyy-MM-dd');
    setLoanForm({ employee_id: '__none__', amount_ngn: '', interest_rate_pct: '0', tenure_months: '12', disbursement_date: today, first_repayment_date: firstRepay, purpose: '', deduct_from_payroll: true, notes: '' });
    setLoanDialog(true);
  };

  const saveLoan = async () => {
    if (loanForm.employee_id === '__none__') { toast({ title: 'Select an employee', variant: 'destructive' }); return; }
    if (!loanForm.amount_ngn || !loanForm.purpose.trim()) { toast({ title: 'Amount and purpose are required', variant: 'destructive' }); return; }
    const amount = Number(loanForm.amount_ngn);
    const rate = Number(loanForm.interest_rate_pct);
    const tenure = Number(loanForm.tenure_months);
    const installment = calcInstallment(amount, rate, tenure);
    setSavingLoan(true);
    const { error } = await supabase.from('employee_loans').insert({
      employee_id: loanForm.employee_id, amount_ngn: amount, interest_rate_pct: rate,
      tenure_months: tenure, monthly_installment_ngn: installment,
      disbursement_date: loanForm.disbursement_date, first_repayment_date: loanForm.first_repayment_date,
      purpose: loanForm.purpose.trim(), deduct_from_payroll: loanForm.deduct_from_payroll,
      notes: loanForm.notes.trim() || null, created_by: profile?.id, approved_by: profile?.id, approved_at: new Date().toISOString(),
    });
    setSavingLoan(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Loan created' });
    setLoanDialog(false);
    load();
  };

  const openRepayDialog = (loanId: string, installment: number) => {
    setRepayLoanId(loanId);
    setRepayForm({ amount_ngn: String(installment), paid_date: format(new Date(), 'yyyy-MM-dd'), method: 'payroll_deduction', notes: '' });
    setRepayDialog(true);
  };

  const saveRepayment = async () => {
    if (!repayForm.amount_ngn || Number(repayForm.amount_ngn) <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' }); return;
    }
    setSavingRepay(true);
    const { error } = await supabase.from('loan_repayments').insert({
      loan_id: repayLoanId, amount_ngn: Number(repayForm.amount_ngn),
      paid_date: repayForm.paid_date, method: repayForm.method,
      notes: repayForm.notes.trim() || null, recorded_by: profile?.id,
    });
    setSavingRepay(false);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Repayment recorded' });
    setRepayDialog(false);
    load();
  };

  const writeOff = async () => {
    if (!writeOffTarget) return;
    await supabase.from('employee_loans').update({ status: 'written_off' }).eq('id', writeOffTarget.id);
    toast({ title: 'Loan written off' });
    setWriteOffTarget(null);
    load();
  };

  const exportCSV = () => {
    const header = 'Employee,Amount (₦),Tenure,Installment/mo,Disbursed,Status,Total Repaid,Outstanding';
    const rows = displayLoans.map(l => {
      const outstanding = Math.max(0, l.amount_ngn - (l.total_repaid ?? 0));
      return [nameOf(l.employee_id), l.amount_ngn, `${l.tenure_months}mo`, l.monthly_installment_ngn, l.disbursement_date, l.status, l.total_repaid ?? 0, outstanding]
        .map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `loans-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  const displayLoans = statusFilter === 'all' ? loans : loans.filter(l => l.status === statusFilter);
  const totalActive = loans.filter(l => l.status === 'active').length;
  const totalOutstanding = loans.filter(l => l.status === 'active').reduce((s, l) => s + Math.max(0, l.amount_ngn - (l.total_repaid ?? 0)), 0);
  const totalDisbursed = loans.reduce((s, l) => s + l.amount_ngn, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Employee Loans"
        description="Track staff loans, repayment schedules, and outstanding balances."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1.5" />Export</Button>
            <Button onClick={openLoanDialog}><Plus className="h-4 w-4 mr-2" />New Loan</Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Active loans', value: totalActive, icon: Users, color: 'text-primary' },
          { label: 'Total outstanding', value: formatNaira(totalOutstanding), icon: AlertCircle, color: 'text-warning' },
          { label: 'Total ever disbursed', value: formatNaira(totalDisbursed), icon: Wallet, color: 'text-muted-foreground' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap">
        {[['active','Active'],['fully_paid','Fully Paid'],['written_off','Written Off'],['all','All']].map(([v, l]) => (
          <Button key={v} size="sm" variant={statusFilter === v ? 'default' : 'outline'} onClick={() => setStatusFilter(v)}>{l}</Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : displayLoans.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No loans found. Create a new loan above.</p>
      ) : (
        <div className="space-y-3">
          {displayLoans.map(loan => {
            const outstanding = Math.max(0, loan.amount_ngn - (loan.total_repaid ?? 0));
            const progress = loan.amount_ngn > 0 ? ((loan.total_repaid ?? 0) / loan.amount_ngn) * 100 : 0;
            const loanRepayments = repayments.filter(r => r.loan_id === loan.id);
            const isExpanded = expandedLoan === loan.id;
            return (
              <Card key={loan.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{nameOf(loan.employee_id)}</CardTitle>
                        <Badge variant={STATUS_BADGE[loan.status].variant} className="text-[10px]">
                          {STATUS_BADGE[loan.status].label}
                        </Badge>
                        {loan.deduct_from_payroll && (
                          <Badge variant="outline" className="text-[10px]">Payroll deduction</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{loan.purpose}</p>
                      <p className="text-xs text-muted-foreground">
                        Disbursed {format(parseISO(loan.disbursement_date), 'd MMM yyyy')} ·
                        {' '}{loan.tenure_months} months · {formatNaira(loan.monthly_installment_ngn)}/mo
                        {loan.interest_rate_pct > 0 && ` · ${loan.interest_rate_pct}% p.a.`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                      <p className={`text-xl font-bold ${outstanding > 0 && loan.status === 'active' ? 'text-warning' : 'text-foreground'}`}>
                        {formatNaira(outstanding)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">of {formatNaira(loan.amount_ngn)}</p>
                    </div>
                  </div>

                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Repaid: {formatNaira(loan.total_repaid ?? 0)}</span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                    <Progress value={Math.min(progress, 100)} className="h-1.5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {loan.status === 'active' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => openRepayDialog(loan.id, loan.monthly_installment_ngn)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Record repayment
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setWriteOffTarget(loan)}>
                          Write off
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                      History ({loanRepayments.length})
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3">
                      {loanRepayments.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-3">No repayments recorded yet.</p>
                      ) : (
                        <div className="rounded-md border overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="border-b bg-muted/30">
                              <tr>
                                {['Date', 'Amount', 'Method', 'Notes'].map(h => (
                                  <th key={h} className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-3 py-2">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/40">
                              {loanRepayments.map(r => (
                                <tr key={r.id} className="hover:bg-muted/20">
                                  <td className="px-3 py-2 text-xs">{format(parseISO(r.paid_date), 'd MMM yyyy')}</td>
                                  <td className="px-3 py-2 text-xs font-medium text-green-700 dark:text-green-400">{formatNaira(r.amount_ngn)}</td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground capitalize">{r.method.replace(/_/g, ' ')}</td>
                                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Loan Dialog */}
      <Dialog open={loanDialog} onOpenChange={setLoanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Employee Loan</DialogTitle>
            <DialogDescription>Monthly installment is calculated automatically. Interest-free loans are most common.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select value={loanForm.employee_id} onValueChange={v => setLoanForm(p => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select employee</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Loan amount (₦) *</Label>
                <Input type="number" min={1} value={loanForm.amount_ngn} onChange={e => setLoanForm(p => ({ ...p, amount_ngn: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Interest rate (% p.a.)</Label>
                <Input type="number" min={0} max={100} step={0.5} value={loanForm.interest_rate_pct} onChange={e => setLoanForm(p => ({ ...p, interest_rate_pct: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tenure (months) *</Label>
                <Input type="number" min={1} max={120} value={loanForm.tenure_months} onChange={e => setLoanForm(p => ({ ...p, tenure_months: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly installment</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                  {loanForm.amount_ngn && loanForm.tenure_months
                    ? formatNaira(calcInstallment(Number(loanForm.amount_ngn), Number(loanForm.interest_rate_pct), Number(loanForm.tenure_months)))
                    : '—'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Disbursement date</Label>
                <Input type="date" value={loanForm.disbursement_date} onChange={e => {
                  const d = e.target.value;
                  setLoanForm(p => ({ ...p, disbursement_date: d, first_repayment_date: calcFirstRepay(d, p.tenure_months) }));
                }} />
              </div>
              <div className="space-y-1.5">
                <Label>First repayment</Label>
                <Input type="date" value={loanForm.first_repayment_date} onChange={e => setLoanForm(p => ({ ...p, first_repayment_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purpose *</Label>
              <Input value={loanForm.purpose} onChange={e => setLoanForm(p => ({ ...p, purpose: e.target.value }))} placeholder="e.g. School fees, Medical, Rent" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Deduct from payroll</p>
                <p className="text-xs text-muted-foreground">Flag the installment for payroll deduction each month</p>
              </div>
              <Switch checked={loanForm.deduct_from_payroll} onCheckedChange={v => setLoanForm(p => ({ ...p, deduct_from_payroll: v }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={loanForm.notes} onChange={e => setLoanForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoanDialog(false)}>Cancel</Button>
            <Button onClick={saveLoan} disabled={savingLoan}>{savingLoan ? 'Saving…' : 'Create loan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repayment Dialog */}
      <Dialog open={repayDialog} onOpenChange={setRepayDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Repayment</DialogTitle>
            <DialogDescription>Log a payment received against this loan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (₦)</Label>
                <Input type="number" min={1} value={repayForm.amount_ngn} onChange={e => setRepayForm(p => ({ ...p, amount_ngn: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={repayForm.paid_date} onChange={e => setRepayForm(p => ({ ...p, paid_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={repayForm.method} onValueChange={v => setRepayForm(p => ({ ...p, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payroll_deduction">Payroll deduction</SelectItem>
                  <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={repayForm.notes} onChange={e => setRepayForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRepayDialog(false)}>Cancel</Button>
            <Button onClick={saveRepayment} disabled={savingRepay}>{savingRepay ? 'Saving…' : 'Record'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Write-off confirm */}
      <AlertDialog open={!!writeOffTarget} onOpenChange={o => !o && setWriteOffTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Write off {writeOffTarget ? nameOf(writeOffTarget.employee_id) : ''}'s loan?</AlertDialogTitle>
            <AlertDialogDescription>
              Outstanding balance of {writeOffTarget ? formatNaira(Math.max(0, writeOffTarget.amount_ngn - (writeOffTarget.total_repaid ?? 0))) : ''} will be marked as a write-off. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={writeOff} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Write off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
