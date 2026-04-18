import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Loader2,
  Plus,
  Download,
  FileText,
  TrendingUp,
  Users,
} from 'lucide-react';
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
import { calculatePAYE } from '@/lib/tax';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';

interface PayrollRun {
  id: string;
  period: string;
  total_contractor_ngn: number;
  total_employee_ngn: number;
  total_expenses_ngn: number;
  paye_ngn: number;
  pension_ngn: number;
  nhf_ngn: number;
  total_burn_ngn: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'paid';
  created_at: string;
  approved_by: string | null;
}

const PENSION_RATE = 0.08;  // 8% employee contribution (employer side not here)
const NHF_RATE = 0.025;     // 2.5%

const monthLabel = (period: string) => {
  const [y, m] = period.split('-');
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
  return date.toLocaleString('en-GB', { month: 'short', year: 'numeric' });
};

const monthPeriod = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const STATUS_CLASS: Record<PayrollRun['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  pending_approval: 'bg-warning/10 text-warning',
  approved: 'bg-success/10 text-success',
  paid: 'bg-info/10 text-info',
};

const Payroll = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [dialog, setDialog] = useState(false);
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState({
    period: monthPeriod(
      new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
    ),
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

  // Draft a payroll summary for a given yyyy-mm by pulling that month's
  // approved expenses, processed payment batches (contractor payouts), and
  // a simple employee cost model based on PAYE/Pension/NHF defaults.
  const draftRun = async () => {
    if (!form.period) return;
    const [y, m] = form.period.split('-');
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    setWorking(true);
    try {
      const [contractorRes, expensesRes] = await Promise.all([
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

      // Simple employee cost model — until a real payroll list exists we
      // use the contractor total as a proxy for "people costs" and
      // derive statutory deductions from that.
      const totalEmployee = 0;
      const paye = calculatePAYE(totalContractor + totalEmployee);
      const pension = (totalContractor + totalEmployee) * PENSION_RATE;
      const nhf = (totalContractor + totalEmployee) * NHF_RATE;
      const burn = totalContractor + totalEmployee + totalExpenses + paye + pension + nhf;

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

  /**
   * Payslip generation.
   *
   * Strategy for v1:
   *   1. Pull every active employee.
   *   2. Distribute the run's contractor + employee total pro-rata across the
   *      employee headcount for a sensible gross per person (Finance can
   *      override later by editing individual payslip rows).
   *   3. Apply the same PAYE / Pension / NHF rates used on the run.
   *   4. Upsert a payslips row per employee and upload a branded HTML
   *      "PDF" to the `payslips` Storage bucket under the employee id /
   *      period path.
   */
  const generatePayslips = async (run: PayrollRun) => {
    const { data: employees, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, status, salary_ngn')
      .neq('status', 'inactive');
    if (error) {
      toast({ title: 'Could not load employees', description: error.message, variant: 'destructive' });
      return;
    }
    const list = (employees || []).filter(
      (e: any) => e.role && e.role !== 'driver',
    );
    if (list.length === 0) {
      toast({
        title: 'No active employees',
        description: 'Invite or reactivate employees before generating payslips.',
        variant: 'destructive',
      });
      return;
    }
    // Use each employee's salary_ngn if set; fall back to pro-rata split.
    const fallbackGross = list.length > 0
      ? (Number(run.total_employee_ngn) + Number(run.total_contractor_ngn)) / list.length
      : 0;

    const { data: settings } = await supabase
      .from('company_settings')
      .select('company_name')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    const companyName = (settings as any)?.company_name || 'KD Squares Ltd';

    let succeeded = 0;
    let failed = 0;
    for (const e of list as any[]) {
      try {
        const empGross = Number(e.salary_ngn) > 0 ? Number(e.salary_ngn) : fallbackGross;
        const empPaye = calculatePAYE(empGross);
        const empPension = empGross * 0.08;
        const empNhf = empGross * 0.025;
        const empNet = Math.max(0, empGross - empPaye - empPension - empNhf);
        const html = renderPayslipHtml({
          company_name: companyName,
          employee_name: e.full_name || e.email,
          employee_email: e.email,
          employee_role: e.role,
          period: run.period,
          gross_ngn: empGross,
          paye_ngn: empPaye,
          pension_ngn: empPension,
          nhf_ngn: empNhf,
          net_ngn: empNet,
          generated_by: profile?.full_name || profile?.email,
        });
        const path = `${e.id}/${run.period}.html`;
        const up = await supabase.storage
          .from('payslips')
          .upload(path, new Blob([html], { type: 'text/html' }), {
            upsert: true,
            contentType: 'text/html',
          });
        const storagePath = up.data?.path || path;
        const { error: insErr } = await supabase.from('payslips').upsert(
          {
            payroll_run_id: run.id,
            employee_id: e.id,
            employee_name: e.full_name || e.email,
            employee_email: e.email,
            period: run.period,
            gross_ngn: empGross,
            paye_ngn: empPaye,
            pension_ngn: empPension,
            nhf_ngn: empNhf,
            net_ngn: empNet,
            storage_path: storagePath,
            generated_by: profile?.id || null,
          },
          { onConflict: 'payroll_run_id,employee_id' } as any,
        );
        if (insErr) throw insErr;
        succeeded++;
      } catch (err: any) {
        console.warn('[KDOps] payslip generation failed for', e.email, err);
        failed++;
      }
    }
    await logAudit(
      'payslip_generated',
      `Generated ${succeeded} payslip(s) for ${monthLabel(run.period)}${failed ? ` (${failed} failed)` : ''}`,
      profile,
    );
    toast({
      title: `${succeeded} payslip${succeeded === 1 ? '' : 's'} generated`,
      description: failed ? `${failed} failed — check console for details.` : undefined,
    });
  };

  const markPaid = async (run: PayrollRun) => {
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
    const rows = [
      ['Contractor payments', run.total_contractor_ngn],
      ['Employee salaries', run.total_employee_ngn],
      ['Reimbursable expenses', run.total_expenses_ngn],
      ['PAYE (est.)', run.paye_ngn],
      ['Pension (est.)', run.pension_ngn],
      ['NHF (est.)', run.nhf_ngn],
      ['Total burn', run.total_burn_ngn],
    ];
    downloadCsv(`kdops-payroll-${run.period}.csv`, toCsv(header, rows));
  };

  // Printable PDF-ready HTML — user prints from browser.
  const printRun = (run: PayrollRun) => {
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
    <p><strong>Period:</strong> ${monthLabel(run.period)} · <span class="badge">${run.status.replace('_', ' ')}</span></p>
    <p><strong>Generated:</strong> ${formatDateTime(new Date())}</p>
    <table>
      <thead><tr><th>Line item</th><th class="right">Amount (NGN)</th></tr></thead>
      <tbody>
        <tr><td>Contractor payments</td><td class="right">${formatNaira(run.total_contractor_ngn)}</td></tr>
        <tr><td>Employee salaries</td><td class="right">${formatNaira(run.total_employee_ngn)}</td></tr>
        <tr><td>Reimbursable expenses</td><td class="right">${formatNaira(run.total_expenses_ngn)}</td></tr>
        <tr><td>PAYE (est.)</td><td class="right">${formatNaira(run.paye_ngn)}</td></tr>
        <tr><td>Pension (est.)</td><td class="right">${formatNaira(run.pension_ngn)}</td></tr>
        <tr><td>NHF (est.)</td><td class="right">${formatNaira(run.nhf_ngn)}</td></tr>
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
      <PageHeader
        title="Payroll Intelligence"
        description="Monthly payroll summary across contractor payments, employees and statutory deductions."
        actions={
          <Button onClick={() => setDialog(true)}>
            <Plus className="mr-2 h-4 w-4" /> Draft payroll
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Latest total burn"
          value={latest ? formatNaira(latest.total_burn_ngn) : '—'}
          subtitle={latest ? monthLabel(latest.period) : 'Draft your first run'}
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
          title="Pension (est.)"
          value={latest ? formatNaira(latest.pension_ngn) : '—'}
          subtitle="Due 7th next month"
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
                  <TableHead className="text-right">Contractor</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">PAYE</TableHead>
                  <TableHead className="text-right">Pension</TableHead>
                  <TableHead className="text-right">Total burn</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className="kd-transition">
                    <TableCell className="font-medium">{monthLabel(r.period)}</TableCell>
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
                    <TableCell className="text-right currency font-semibold">
                      {formatNaira(r.total_burn_ngn)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_CLASS[r.status]}>
                        {r.status.replace('_', ' ')}
                      </Badge>
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
                              title="Generate payslips for every active employee"
                            >
                              Generate payslips
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => markPaid(r)}>
                              Mark paid
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
                ))}
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
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Period</Label>
              <Input
                type="month"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                KDOps will pull approved expenses and processed payment batches
                for this period and estimate PAYE / Pension / NHF using default
                rates. You can tweak the numbers before submitting.
              </p>
            </div>
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

      <p className="text-xs text-muted-foreground">
        Generated {formatDate(new Date())} · KDOps
      </p>
    </div>
  );
};

export default Payroll;
