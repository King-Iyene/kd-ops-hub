import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Loader2,
  Plus,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  Users,
  Send,
  AlertCircle,
  X,
  Info,
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import {
  formatDate,
  formatDateTime,
  formatNaira,
  formatNairaCompact,
} from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { renderPayslipHtml } from '@/lib/payslip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { createTransferRecipient, initiateTransfer, getBankCode } from '@/lib/paystack';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { displayName } from '@/lib/name';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';

interface BonusLine {
  type: string;
  amount: number;
}

interface AllowancesSnapshot {
  housing_pct: number;
  transport_per_emp: number;
  meal_per_emp: number;
  total: number;
}

interface PayrollRun {
  id: string;
  period: string;
  period_type?: 'monthly' | 'quarterly' | 'annual';
  employee_count?: number;
  total_contractor_ngn: number;
  total_employee_ngn: number;
  total_expenses_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  total_burn_ngn: number;
  bonuses_json?: BonusLine[] | null;
  allowances_json?: AllowancesSnapshot | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'paid';
  created_at: string;
  approved_by: string | null;
}

const PENSION_RATE = 0.08;           // 8% employee contribution
const EMPLOYER_PENSION_RATE = 0.10;  // 10% employer contribution
const NHF_RATE = 0.025;              // 2.5%

function calculateNigerianPAYE(monthlySalaryNgn: number): number {
  const annualGross = monthlySalaryNgn * 12;
  const bands = [
    { limit: 300_000,   rate: 0.07 },
    { limit: 300_000,   rate: 0.11 },
    { limit: 500_000,   rate: 0.15 },
    { limit: 500_000,   rate: 0.19 },
    { limit: 1_600_000, rate: 0.21 },
    { limit: Infinity,  rate: 0.24 },
  ];
  let remaining = annualGross;
  let annualTax = 0;
  for (const band of bands) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band.limit);
    annualTax += taxable * band.rate;
    remaining -= taxable;
  }
  return annualTax / 12;
}

const monthLabel = (period: string, periodType?: string): string => {
  const [y, m] = period.split('-');
  const year = parseInt(y, 10);
  if (periodType === 'annual') return `${year} Annual Payroll`;
  if (periodType === 'quarterly') {
    const q = Math.ceil(parseInt(m, 10) / 3);
    return `Q${q} ${year} Payroll`;
  }
  const date = new Date(year, parseInt(m, 10) - 1, 1);
  if (periodType === 'monthly') {
    return `${date.toLocaleString('en-GB', { month: 'long', year: 'numeric' })} Payroll`;
  }
  return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
};

const monthPeriod = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;


const BONUS_TYPES = [
  'Performance Bonus',
  '13th Month',
  'Christmas Bonus',
  'Ramadan Bonus',
  'Annual Leave Allowance',
  'Other',
] as const;

const Payroll = () => {
  usePageTitle('Payroll');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [dialog, setDialog] = useState(false);
  const [working, setWorking] = useState(false);
  const [salaryErrors, setSalaryErrors] = useState<string[]>([]);
  const [disburseTarget, setDisburseTarget] = useState<{ run: PayrollRun; payslips: any[] } | null>(null);
  const [disbursing, setDisbursing] = useState(false);
  const [disburseErrors, setDisburseErrors] = useState<string[]>([]);
  const [confirmPaidRun, setConfirmPaidRun] = useState<PayrollRun | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('kdops_payroll_banner_dismissed') === 'true',
  );
  const [form, setForm] = useState<{
    period: string;
    period_type: 'monthly' | 'quarterly' | 'annual';
    bonuses: BonusLine[];
    housing_allowance_pct: number;
    transport_per_emp: number;
    meal_per_emp: number;
  }>({
    period: monthPeriod(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
    period_type: 'monthly',
    bonuses: [],
    housing_allowance_pct: 0,
    transport_per_emp: 0,
    meal_per_emp: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('payroll_runs')
      .select('*')
      .order('period', { ascending: false });
    setRuns((data as PayrollRun[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addBonus = () =>
    setForm((f) => ({ ...f, bonuses: [...f.bonuses, { type: 'Performance Bonus', amount: 0 }] }));
  const removeBonus = (i: number) =>
    setForm((f) => ({ ...f, bonuses: f.bonuses.filter((_, idx) => idx !== i) }));
  const updateBonus = (i: number, field: 'type' | 'amount', val: any) =>
    setForm((f) => ({
      ...f,
      bonuses: f.bonuses.map((b, idx) => (idx === i ? { ...b, [field]: val } : b)),
    }));

  // Draft a payroll summary for a given yyyy-mm by pulling that month's
  // approved expenses, processed payment batches (contractor payouts), and
  // a simple employee cost model based on PAYE/Pension/NHF defaults.
  // NOTE: Features 1/2/3/6 store extended columns in payroll_runs. Run this
  // migration before using those features:
  //   ALTER TABLE payroll_runs
  //     ADD COLUMN IF NOT EXISTS employee_count integer,
  //     ADD COLUMN IF NOT EXISTS period_type text DEFAULT 'monthly',
  //     ADD COLUMN IF NOT EXISTS bonuses_json jsonb,
  //     ADD COLUMN IF NOT EXISTS allowances_json jsonb;
  const draftRun = async () => {
    if (!form.period) return;
    const [y, m] = form.period.split('-');
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    setWorking(true);
    try {
      const [contractorRes, expensesRes, employeeRes] = await Promise.all([
        supabase
          .from('payment_batches')
          .select('total_amount, payment_date, status')
          .in('status', ['processed', 'funded'])
          .gte('payment_date', start.toISOString())
          .lte('payment_date', end.toISOString()),
        supabase
          .from('expenses')
          .select('amount_ngn, date, status')
          .eq('status', 'approved')
          .gte('date', start.toISOString())
          .lte('date', end.toISOString()),
        supabase
          .from('profiles')
          .select('salary_ngn')
          .eq('status', 'active')
          .neq('role', 'driver'),
      ]);

      const totalContractor =
        (contractorRes.data || []).reduce(
          (s, r: any) => s + Number(r.total_amount || 0),
          0,
        ) || 0;
      const totalExpenses =
        (expensesRes.data || []).reduce(
          (s, r: any) => s + Number(r.amount_ngn || 0),
          0,
        ) || 0;
      const totalEmployee =
        (employeeRes.data || []).reduce(
          (s, r: any) => s + Number(r.salary_ngn || 0),
          0,
        ) || 0;
      const empCount = (employeeRes.data || []).length;
      const paye = calculateNigerianPAYE(totalContractor + totalEmployee);
      const pension = (totalContractor + totalEmployee) * PENSION_RATE;
      const nhf = (totalContractor + totalEmployee) * NHF_RATE;
      const employerPension = totalEmployee * EMPLOYER_PENSION_RATE;
      const bonusTotal = form.bonuses.reduce((s, b) => s + Number(b.amount || 0), 0);
      const housingAllowance = totalEmployee * (form.housing_allowance_pct / 100);
      const transportAllowance = empCount * form.transport_per_emp;
      const mealSubsidy = empCount * form.meal_per_emp;
      const totalAllowances = housingAllowance + transportAllowance + mealSubsidy;
      const burn =
        totalContractor + totalEmployee + totalExpenses +
        paye + pension + nhf + employerPension +
        bonusTotal + totalAllowances;

      // Core upsert — works with the existing schema.
      const { error } = await supabase.from('payroll_runs').upsert(
        {
          period: form.period,
          total_contractor_ngn: totalContractor,
          total_employee_ngn: totalEmployee,
          total_expenses_ngn: totalExpenses,
          paye_ngn: paye,
          pension_ngn: pension,
          nhf_ngn: nhf,
          total_burn_ngn: burn,
          status: 'draft',
          created_by: profile?.id || null,
        },
        { onConflict: 'period' },
      );

      // Extended columns — best-effort; silently ignored if DB migration not run.
      await supabase.from('payroll_runs').update({
        period_type: form.period_type,
        employee_count: empCount,
        bonuses_json: form.bonuses.length > 0 ? form.bonuses : null,
        allowances_json: totalAllowances > 0
          ? { housing_pct: form.housing_allowance_pct, transport_per_emp: form.transport_per_emp, meal_per_emp: form.meal_per_emp, total: totalAllowances }
          : null,
      } as any).eq('period', form.period);
      if (error) throw error;
      await logAudit(
        'payroll_created',
        `Payroll draft for ${monthLabel(form.period)} (${formatNaira(burn)} total burn)`,
        profile,
      );
      toast({ title: 'Payroll drafted', description: monthLabel(form.period) });
      setDialog(false);
      load();
    } catch (err: any) {
      toast({
        title: 'Draft failed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  const submit = async (run: PayrollRun) => {
    const { error } = await supabase
      .from('payroll_runs')
      .update({ status: 'pending_approval' })
      .eq('id', run.id);
    if (error) {
      toast({ title: 'Submit failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'payroll_submitted',
      `Payroll ${monthLabel(run.period)} submitted for approval`,
      profile,
    );
    toast({ title: 'Payroll submitted for approval' });
    load();
  };

  const approve = async (run: PayrollRun) => {
    const { error } = await supabase
      .from('payroll_runs')
      .update({ status: 'approved', approved_by: profile?.id || null })
      .eq('id', run.id);
    if (error) {
      toast({ title: 'Approve failed', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'payroll_approved',
      `Payroll ${monthLabel(run.period)} approved (${formatNaira(run.total_burn_ngn)})`,
      profile,
    );
    toast({ title: 'Payroll approved' });
    load();
  };

  const generatePayslips = async (run: PayrollRun) => {
    setWorking(true);
    setSalaryErrors([]);
    try {
      const { data: employees, error: fetchErr } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, role, salary_ngn')
        .eq('status', 'active')
        .neq('role', 'driver')
        .gt('salary_ngn', 0);
      if (fetchErr) throw fetchErr;

      const list = (employees || []) as any[];
      if (list.length === 0) {
        toast({
          title: 'No active employees with salaries configured',
          description: 'Add salary amounts in employee profiles first.',
          variant: 'destructive',
        });
        return;
      }

      const { data: settings } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      const companyName = (settings as any)?.company_name || 'KD Squares Ltd';

      let succeeded = 0;
      let failed = 0;
      for (const e of list) {
        toast({
          title: `Generating payslip ${succeeded + failed + 1} of ${list.length}…`,
          description: displayName(e.first_name, e.last_name, e.full_name || e.email),
        });
        try {
          const empGross = Number(e.salary_ngn);
          const empPaye = calculateNigerianPAYE(empGross);
          const empPension = empGross * PENSION_RATE;
          const empNhf = empGross * NHF_RATE;
          const empNet = Math.max(0, empGross - empPaye - empPension - empNhf);
          const empName = displayName(e.first_name, e.last_name, e.full_name || e.email);

          const html = renderPayslipHtml({
            company_name: companyName,
            employee_name: empName,
            employee_email: e.email,
            employee_role: e.role,
            period: run.period,
            gross_ngn: empGross,
            paye_ngn: empPaye,
            pension_ngn: empPension,
            nhf_ngn: empNhf,
            net_ngn: empNet,
            generated_by: profile?.full_name || profile?.email,
          }, { autoPrint: false });

          const path = `${e.id}/${run.period}.html`;
          const { error: uploadErr } = await supabase.storage
            .from('payslips')
            .upload(path, new Blob([html], { type: 'text/html' }), {
              upsert: true,
              contentType: 'text/html',
            });
          if (uploadErr) throw uploadErr;

          const { data: urlData } = supabase.storage.from('payslips').getPublicUrl(path);

          const { error: upsertErr } = await supabase.from('payslips').upsert(
            {
              payroll_run_id: run.id,
              employee_id: e.id,
              employee_name: empName,
              employee_email: e.email,
              period: run.period,
              gross_ngn: empGross,
              paye_ngn: empPaye,
              pension_ngn: empPension,
              nhf_ngn: empNhf,
              net_ngn: empNet,
              file_url: urlData.publicUrl,
              storage_path: path,
              generated_by: profile?.id || null,
            },
            { onConflict: 'payroll_run_id,employee_id' } as any,
          );
          if (upsertErr) throw upsertErr;

          succeeded++;
        } catch (empErr: any) {
          console.warn('[KDOps] payslip generation failed for', e.email, empErr);
          failed++;
        }
      }

      await logAudit(
        'payslip_generated',
        `Generated ${succeeded} payslip(s) for ${monthLabel(run.period)}${failed ? ` (${failed} failed)` : ''}`,
        profile,
      );

      if (failed > 0) {
        toast({
          title: `${succeeded} of ${list.length} payslips generated`,
          description: `${failed} failed — check employee data and try again.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: `${succeeded} payslip${succeeded === 1 ? '' : 's'} generated`,
          description: `All payslips for ${monthLabel(run.period)} saved successfully.`,
        });
      }
    } catch (err: any) {
      toast({
        title: 'Payslip generation failed',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  const canDisburse = ['super_admin', 'admin', 'finance'].includes(profile?.role || '');

  const openDisburse = async (run: PayrollRun) => {
    setWorking(true);
    try {
      const { data: slips, error } = await supabase
        .from('payslips')
        .select('id, employee_id, employee_name, net_ngn')
        .eq('payroll_run_id', run.id);
      if (error) throw error;
      if (!slips || slips.length === 0) {
        toast({
          title: 'No payslips found',
          description: 'Generate payslips for this run before disbursing.',
          variant: 'destructive',
        });
        return;
      }
      setDisburseErrors([]);
      setDisburseTarget({ run, payslips: slips });
    } catch (err: any) {
      toast({ title: 'Failed to load payslips', description: err?.message, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const doDisburse = async () => {
    if (!disburseTarget) return;
    const { run, payslips } = disburseTarget;
    setDisbursing(true);
    const errors: string[] = [];
    let succeeded = 0;

    try {
      const today = new Date().toISOString().slice(0, 10);
      const totalNet = payslips.reduce((s, p) => s + Number(p.net_ngn || 0), 0);

      const { data: batch, error: batchErr } = await supabase
        .from('payment_batches')
        .insert({
          name: `Salary ${monthLabel(run.period)}`,
          status: 'approved',
          payment_date: today,
          total_amount: totalNet,
          beneficiary_count: payslips.length,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      for (const slip of payslips) {
        try {
          const { data: emp, error: empErr } = await supabase
            .from('profiles')
            .select('bank_name, bank_account_number, full_name, first_name, last_name')
            .eq('id', slip.employee_id)
            .single();
          if (empErr || !emp) {
            errors.push(`${slip.employee_name}: could not load profile`);
            continue;
          }
          const bankCode = getBankCode((emp as any).bank_name);
          if (!bankCode) {
            errors.push(`${slip.employee_name}: unknown bank "${(emp as any).bank_name}"`);
            continue;
          }
          if (!(emp as any).bank_account_number) {
            errors.push(`${slip.employee_name}: no bank account number on file`);
            continue;
          }

          const empName = displayName(
            (emp as any).first_name,
            (emp as any).last_name,
            (emp as any).full_name || slip.employee_name,
          );

          const { data: item, error: itemErr } = await supabase
            .from('batch_items')
            .insert({
              batch_id: (batch as any).id,
              full_name: empName,
              bank_name: (emp as any).bank_name || '',
              account_number: (emp as any).bank_account_number,
              amount_ngn: Number(slip.net_ngn || 0),
              status: 'pending',
            })
            .select()
            .single();
          if (itemErr || !item) {
            errors.push(`${empName}: failed to create payment record`);
            continue;
          }

          const recipient = await createTransferRecipient({
            name: empName,
            account_number: (emp as any).bank_account_number,
            bank_code: bankCode,
          });
          const ref = `salary_${(item as any).id.replace(/-/g, '').slice(0, 18)}`;
          const transfer = await initiateTransfer({
            recipient_code: recipient.recipient_code,
            amount_ngn: Number(slip.net_ngn || 0),
            reference: ref,
            reason: `KDOps · Salary ${monthLabel(run.period)}`,
          });

          await supabase
            .from('batch_items')
            .update({
              status: 'pending',
              paystack_recipient_code: recipient.recipient_code,
              paystack_transfer_code: transfer.transfer_code,
              paystack_reference: transfer.reference,
              failure_reason: null,
            } as any)
            .eq('id', (item as any).id);

          await logAudit(
            'paystack_transfer_initiated',
            `Salary transfer initiated for ${empName} (${formatNaira(Number(slip.net_ngn || 0))}) ref ${transfer.reference}`,
            profile,
          );
          succeeded++;
        } catch (empErr: any) {
          errors.push(`${slip.employee_name}: ${empErr?.message || 'transfer failed'}`);
        }
      }

      if (succeeded > 0) {
        await supabase.from('payroll_runs').update({ status: 'paid' }).eq('id', run.id);
        await logAudit(
          'salary_disbursed',
          `Salary disbursed for ${monthLabel(run.period)}: ${succeeded}/${payslips.length} transfers initiated${errors.length ? ` (${errors.length} failed)` : ''}`,
          profile,
        );
      }

      setDisburseErrors(errors);
      if (errors.length === 0) {
        toast({
          title: `${succeeded} salary transfer${succeeded === 1 ? '' : 's'} initiated`,
          description: `Payroll ${monthLabel(run.period)} sent via Paystack. Status updates arrive via webhook.`,
        });
        setDisburseTarget(null);
        load();
      } else {
        toast({
          title: `${succeeded} of ${payslips.length} transfers initiated`,
          description: `${errors.length} employee${errors.length === 1 ? '' : 's'} could not be processed — see dialog for details.`,
          variant: 'destructive',
        });
        if (succeeded > 0) load();
      }
    } catch (err: any) {
      toast({
        title: 'Disbursement failed',
        description: err?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setDisbursing(false);
    }
  };

  const markPaid = async () => {
    if (!confirmPaidRun) return;
    const run = confirmPaidRun;
    setConfirmPaidRun(null);
    const { error } = await supabase
      .from('payroll_runs')
      .update({ status: 'paid' })
      .eq('id', run.id);
    if (error) {
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    await logAudit(
      'payroll_paid',
      `Payroll ${monthLabel(run.period)} marked paid`,
      profile,
    );
    toast({ title: 'Payroll marked as paid' });
    load();
  };

  const exportRun = (run: PayrollRun) => {
    const header = ['metric', 'amount_ngn'];
    const bonusTotal = (run.bonuses_json || []).reduce((s, b) => s + Number(b.amount || 0), 0);
    const allowTotal = run.allowances_json?.total || 0;
    const rows: [string, number][] = [
      ['Contractor payments', run.total_contractor_ngn],
      ['Employee salaries', run.total_employee_ngn],
      ['Reimbursable expenses', run.total_expenses_ngn],
      ['PAYE (est.)', run.paye_ngn],
      ['Pension employee (est.)', run.pension_ngn],
      ['Pension employer (est.)', run.total_employee_ngn * EMPLOYER_PENSION_RATE],
      ['NHF (est.)', run.nhf_ngn],
    ];
    if (bonusTotal > 0) {
      rows.push(['Bonuses & Extras', bonusTotal]);
      (run.bonuses_json || []).forEach((b) => rows.push([`  — ${b.type}`, Number(b.amount || 0)]));
    }
    if (allowTotal > 0) rows.push(['Total allowances', allowTotal]);
    rows.push(['Total burn', run.total_burn_ngn]);
    downloadCsv(`kdops-payroll-${run.period}.csv`, toCsv(header, rows));
  };

  // Printable PDF-ready HTML — user prints from browser.
  const printRun = (run: PayrollRun) => {
    const bonusTotal = (run.bonuses_json || []).reduce((s, b) => s + Number(b.amount || 0), 0);
    const allowTotal = run.allowances_json?.total || 0;
    const bonusRows = bonusTotal > 0
      ? `<tr><td>Bonuses &amp; Extras</td><td class="right">${formatNaira(bonusTotal)}</td></tr>` +
        (run.bonuses_json || []).map((b) =>
          `<tr style="font-size:12px"><td>&nbsp;&nbsp;— ${b.type}</td><td class="right">${formatNaira(Number(b.amount || 0))}</td></tr>`,
        ).join('')
      : '';
    const allowRow = allowTotal > 0
      ? `<tr><td>Total allowances</td><td class="right">${formatNaira(allowTotal)}</td></tr>`
      : '';
    const empRow = run.employee_count != null
      ? `<tr><td>Active employees</td><td class="right">${run.employee_count}</td></tr>`
      : '';
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payroll ${run.period}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cabin:wght@400;600;700&display=swap');
      body { font-family: 'Cabin', sans-serif; padding: 32px; max-width: 820px; margin: 0 auto; color: #0a2533; }
      h1 { color: #006994; border-bottom: 3px solid #006994; padding-bottom: 8px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
      th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e8edf0; }
      th { background: #f6f9fb; color: #5b6b75; font-size: 11px; text-transform: uppercase; }
      tr.total { background: #f6f9fb; font-weight: 700; }
      .right { text-align: right; }
      .badge { display: inline-block; padding: 3px 10px; background: #D6AC50; color: #3a2e12; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    </style></head><body>
    <h1>KDOps Payroll Report</h1>
    <p><strong>Period:</strong> ${monthLabel(run.period, run.period_type)} · <span class="badge">${run.status.replace('_', ' ')}</span></p>
    <p><strong>Generated:</strong> ${formatDateTime(new Date())}</p>
    <table>
      <thead><tr><th>Line item</th><th class="right">Amount (NGN)</th></tr></thead>
      <tbody>
        ${empRow}
        <tr><td>Contractor payments</td><td class="right">${formatNaira(run.total_contractor_ngn)}</td></tr>
        <tr><td>Employee salaries</td><td class="right">${formatNaira(run.total_employee_ngn)}</td></tr>
        <tr><td>Reimbursable expenses</td><td class="right">${formatNaira(run.total_expenses_ngn)}</td></tr>
        <tr><td>PAYE (est.)</td><td class="right">${formatNaira(run.paye_ngn)}</td></tr>
        <tr><td>Pension — employee (est.)</td><td class="right">${formatNaira(run.pension_ngn)}</td></tr>
        <tr><td>Pension — employer (est.)</td><td class="right">${formatNaira(run.total_employee_ngn * EMPLOYER_PENSION_RATE)}</td></tr>
        <tr><td>NHF (est.)</td><td class="right">${formatNaira(run.nhf_ngn)}</td></tr>
        ${bonusRows}
        ${allowRow}
        <tr class="total"><td>Total burn</td><td class="right">${formatNaira(run.total_burn_ngn)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top: 32px; padding: 12px; border: 2px dashed #D6AC50; color: #6f5a25; font-size: 12px; text-align: center;">
      Generated by KDOps · ${profile?.full_name || profile?.email || 'unknown user'}
    </p>
    <script>setTimeout(() => window.print(), 300);</script>
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const latest = runs[0];
  const trend = useMemo(
    () =>
      runs
        .slice(0, 6)
        .map((r) => ({ label: monthLabel(r.period), burn: r.total_burn_ngn }))
        .reverse(),
    [runs],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Payroll Intelligence</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Process monthly payroll runs for all employees. Calculates gross pay, PAYE, employee &amp; employer pension, NHF, allowances and net pay. Supports bulk payslip export.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Monthly payroll summary across contractor payments, employees and statutory deductions.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Draft payroll
          </Button>
        </div>
      </div>

      {!bannerDismissed && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
          <p className="flex-1 leading-relaxed">
            Payroll runs calculate monthly people costs: gross salaries, PAYE tax, pension contributions, and NHF deductions. Approve a run to generate payslips. Note: KDOps records payroll figures — salary transfers must be initiated separately via the Payments module.
          </p>
          <button
            onClick={() => {
              setBannerDismissed(true);
              localStorage.setItem('kdops_payroll_banner_dismissed', 'true');
            }}
            className="shrink-0 text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Latest total burn"
          value={latest ? formatNaira(latest.total_burn_ngn) : '—'}
          subtitle={latest ? monthLabel(latest.period, latest.period_type) : 'Draft your first run'}
          icon={Banknote}
          tone="primary"
        />
        <StatCard
          title="PAYE (est.)"
          value={latest ? formatNaira(latest.paye_ngn) : '—'}
          subtitle="Due 10th next month"
          icon={FileText}
          tone="warning"
        />
        <StatCard
          title="Active employees"
          value={latest?.employee_count ?? '—'}
          subtitle={latest ? `Pension: ${formatNaira(latest.pension_ngn)}` : 'No runs yet'}
          icon={Users}
          tone="success"
        />
        <StatCard
          title="Approved runs"
          value={runs.filter((r) => r.status === 'approved' || r.status === 'paid').length}
          subtitle="This year"
          icon={CheckCircle2}
        />
      </div>

      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Burn trend — last 6 months</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => formatNairaCompact(v)} />
                <Tooltip formatter={(v: number) => formatNaira(v)} />
                <Legend />
                <Bar dataKey="burn" fill="#006994" name="Total burn" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {salaryErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Salary Configuration Required</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-2 space-y-0.5">
              {salaryErrors.map((err, i) => (
                <li key={i} className="text-sm">{err}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm">
              Configure salaries in <span className="font-medium">Employee Management</span> before generating payroll.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payroll runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} cols={7} />
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No payroll runs yet"
              description="Draft a payroll for last month to see statutory deduction estimates and total burn."
              action={
                <Button onClick={() => setDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Draft payroll
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Contractor</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">PAYE</TableHead>
                  <TableHead className="text-right">Pension (emp)</TableHead>
                  <TableHead className="text-right">Pension (er)</TableHead>
                  <TableHead className="text-right">Total burn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r, idx) => {
                  const prev = runs[idx + 1];
                  const momPct = prev && prev.total_burn_ngn > 0
                    ? ((r.total_burn_ngn - prev.total_burn_ngn) / prev.total_burn_ngn) * 100
                    : null;
                  return (
                  <TableRow key={r.id} className="kd-transition">
                    <TableCell className="font-medium">{monthLabel(r.period, r.period_type)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {r.employee_count ?? '—'}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.total_contractor_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.total_expenses_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.paye_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.pension_ngn)}
                    </TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.total_employee_ngn * EMPLOYER_PENSION_RATE)}
                    </TableCell>
                    <TableCell className="text-right currency font-semibold">
                      <div className="flex items-center justify-end gap-1">
                        {formatNaira(r.total_burn_ngn)}
                        {momPct !== null && (
                          <span className={`text-xs font-normal inline-flex items-center gap-0.5 ${momPct >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {momPct >= 0
                              ? <TrendingUp className="h-3 w-3" />
                              : <TrendingDown className="h-3 w-3" />}
                            {Math.abs(momPct).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {r.status === 'draft' && (
                          <Button size="sm" variant="outline" onClick={() => submit(r)}>
                            Submit
                          </Button>
                        )}
                        {r.status === 'pending_approval' && (
                          <Button size="sm" variant="outline" onClick={() => approve(r)}>
                            Approve
                          </Button>
                        )}
                        {r.status === 'approved' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generatePayslips(r)}
                              disabled={working}
                              title="Generate payslips for every active employee"
                            >
                              {working && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                              Generate payslips
                            </Button>
                            {canDisburse && (
                              <Button
                                size="sm"
                                onClick={() => openDisburse(r)}
                                disabled={working}
                                title="Disburse net salaries via Paystack"
                              >
                                {working
                                  ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                  : <Send className="mr-2 h-3.5 w-3.5" />}
                                Disburse salaries
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => setConfirmPaidRun(r)}>
                              Record as Manually Paid
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => exportRun(r)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => printRun(r)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Draft payroll</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Period</Label>
                <Input
                  type="month"
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Period type</Label>
                <Select
                  value={form.period_type}
                  onValueChange={(v) => setForm({ ...form, period_type: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bonuses &amp; Extras</Label>
              {form.bonuses.map((b, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={b.type} onValueChange={(v) => updateBonus(i, 'type', v)}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BONUS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-36"
                    placeholder="₦ Amount"
                    value={b.amount || ''}
                    onChange={(e) => updateBonus(i, 'amount', Number(e.target.value) || 0)}
                  />
                  <Button size="icon" variant="ghost" onClick={() => removeBonus(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addBonus}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add bonus
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Allowances</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Housing (% of basic)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={form.housing_allowance_pct || ''}
                    onChange={(e) => setForm({ ...form, housing_allowance_pct: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Transport / employee (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.transport_per_emp || ''}
                    onChange={(e) => setForm({ ...form, transport_per_emp: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Meal subsidy / employee (₦)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form.meal_per_emp || ''}
                    onChange={(e) => setForm({ ...form, meal_per_emp: Number(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              KDOps will pull approved expenses and processed payment batches for
              this period and estimate PAYE / Pension / NHF. Bonuses and allowances
              are added on top and included in the total burn.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={draftRun} disabled={working}>
              {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!disburseTarget}
        onOpenChange={(open) => { if (!open && !disbursing) { setDisburseTarget(null); setDisburseErrors([]); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm salary disbursement</DialogTitle>
          </DialogHeader>
          {disburseTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period</span>
                  <span className="font-medium">{monthLabel(disburseTarget.run.period)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Employees</span>
                  <span className="font-medium">{disburseTarget.payslips.length}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total disbursement</span>
                  <span className="currency text-success">
                    {formatNaira(disburseTarget.payslips.reduce((s, p) => s + Number(p.net_ngn || 0), 0))}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                KDOps will create a Paystack transfer for each employee's net salary using the
                bank details on their profile. Status updates arrive via the Paystack webhook.
              </p>
              {disburseErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> {disburseErrors.length} employee{disburseErrors.length === 1 ? '' : 's'} could not be processed
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {disburseErrors.map((e, i) => (
                      <li key={i} className="text-xs text-destructive">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDisburseTarget(null); setDisburseErrors([]); }}
              disabled={disbursing}
            >
              Cancel
            </Button>
            <Button onClick={doDisburse} disabled={disbursing}>
              {disbursing
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Send className="mr-2 h-4 w-4" />}
              Disburse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmPaidRun} onOpenChange={(open) => { if (!open) setConfirmPaidRun(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm manual payment record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ⚠️ This records that salaries were paid via your bank or another method. No automatic transfer will be made by KDOps. Only proceed if you have already transferred salaries manually.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmPaidRun(null)}>Cancel</Button>
            <Button onClick={markPaid}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Generated {formatDate(new Date())} · KDOps
      </p>
    </div>
  );
};

export default Payroll;
