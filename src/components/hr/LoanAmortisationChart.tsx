import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CircleDollarSign, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Loan amortisation view.
 *
 * Displays for a single employee_loans row:
 *   • Progress bar (paid vs outstanding)
 *   • Area chart of scheduled balance over the tenure
 *   • Amortisation table (per-month principal, interest, cumulative paid,
 *     outstanding balance) — computed client-side from stored fields.
 *   • Actual repayments (loan_repayments) overlaid on the schedule so
 *     over/under payment is immediately visible.
 *
 * Read-only. Pure math + Recharts. Zero new dependencies.
 */

interface Loan {
  id: string;
  amount_ngn: number;
  interest_rate_pct: number;
  tenure_months: number;
  monthly_installment_ngn: number;
  disbursement_date: string;
  first_repayment_date: string;
  status: string;
  deduct_from_payroll: boolean;
  purpose: string;
}

interface Repayment {
  id: string;
  amount_ngn: number;
  paid_date: string;
  method: string;
}

interface Row {
  month: number;
  label: string;
  scheduled_principal: number;
  scheduled_interest: number;
  scheduled_balance: number;
  actual_paid_cumulative: number;
}

// Simple flat-rate amortisation (mirrors what most Nigerian SMBs use for
// staff loans): interest is computed on the ORIGINAL principal each month.
// If interest_rate_pct = 0 this collapses to straight principal payments.
function amortise(loan: Loan, repayments: Repayment[]): Row[] {
  const monthly_interest_rate = (loan.interest_rate_pct / 100) / 12;
  const rows: Row[] = [];
  let balance = Number(loan.amount_ngn);
  const monthlyInterest = Number(loan.amount_ngn) * monthly_interest_rate;

  // Group actuals by month index (offset from first_repayment_date)
  const start = new Date(loan.first_repayment_date);
  const paidByMonth: number[] = new Array(loan.tenure_months).fill(0);
  let paidCumulative = 0;
  for (const r of repayments.sort((a, b) => a.paid_date.localeCompare(b.paid_date))) {
    const d = new Date(r.paid_date);
    const idx = Math.max(0, Math.min(
      loan.tenure_months - 1,
      (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth()),
    ));
    paidByMonth[idx] += Number(r.amount_ngn);
  }

  for (let m = 0; m < loan.tenure_months; m++) {
    const scheduled_principal =
      m === loan.tenure_months - 1
        ? Math.max(0, balance) // last month clears the remainder
        : Math.max(0, Number(loan.monthly_installment_ngn) - monthlyInterest);
    balance = Math.max(0, balance - scheduled_principal);
    paidCumulative += paidByMonth[m];
    const label = new Date(start.getFullYear(), start.getMonth() + m, 1)
      .toLocaleString('en-GB', { month: 'short', year: '2-digit' });
    rows.push({
      month: m + 1,
      label,
      scheduled_principal: Math.round(scheduled_principal),
      scheduled_interest: Math.round(monthlyInterest),
      scheduled_balance: Math.round(balance),
      actual_paid_cumulative: Math.round(paidCumulative),
    });
  }
  return rows;
}

interface Props {
  loanId: string;
}

export const LoanAmortisationChart = ({ loanId }: Props) => {
  const [loan, setLoan] = useState<Loan | null>(null);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [lRes, rRes] = await Promise.all([
        supabase.from('employee_loans').select('*').eq('id', loanId).maybeSingle(),
        supabase.from('loan_repayments').select('*').eq('loan_id', loanId).order('paid_date'),
      ]);
      setLoan((lRes.data as Loan) || null);
      setRepayments(((rRes.data ?? []) as Repayment[]));
      setLoading(false);
    })();
  }, [loanId]);

  const rows = useMemo(() => (loan ? amortise(loan, repayments) : []), [loan, repayments]);

  const stats = useMemo(() => {
    if (!loan) return null;
    const totalPaid = repayments.reduce((s, r) => s + Number(r.amount_ngn), 0);
    const outstanding = Math.max(0, Number(loan.amount_ngn) - totalPaid);
    const totalInterest = rows.reduce((s, r) => s + r.scheduled_interest, 0);
    const progressPct = loan.amount_ngn > 0
      ? Math.min(100, Math.round((totalPaid / Number(loan.amount_ngn)) * 100))
      : 100;
    // Months completed based on actual repayments (proxy = payments made ≥ monthly_installment)
    const monthsPaid = repayments.length;
    const monthsRemaining = Math.max(0, loan.tenure_months - monthsPaid);
    return { totalPaid, outstanding, totalInterest, progressPct, monthsPaid, monthsRemaining };
  }, [loan, repayments, rows]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading loan…
        </CardContent>
      </Card>
    );
  }
  if (!loan) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loan not found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4" /> {loan.purpose}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disbursed {formatDate(loan.disbursement_date)} · Tenure {loan.tenure_months}m
                {loan.interest_rate_pct > 0 && ` · ${loan.interest_rate_pct}% p.a.`}
              </p>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                'text-[11px]',
                loan.status === 'fully_paid' ? 'bg-emerald-100 text-emerald-700' :
                loan.status === 'active' ? 'bg-primary/10 text-primary' :
                'bg-muted text-muted-foreground',
              )}
            >
              {loan.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Principal</p>
                  <p className="text-lg font-bold currency">{formatNaira(loan.amount_ngn)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid so far</p>
                  <p className="text-lg font-bold text-emerald-600">{formatNaira(stats.totalPaid)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
                  <p className="text-lg font-bold text-primary">{formatNaira(stats.outstanding)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total interest</p>
                  <p className="text-lg font-bold">{formatNaira(stats.totalInterest)}</p>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {stats.monthsPaid} of {loan.tenure_months} months paid
                  </span>
                  <span className="font-semibold">{stats.progressPct}%</span>
                </div>
                <Progress value={stats.progressPct} className="h-2" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-primary" /> Balance over time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={rows}>
              <defs>
                <linearGradient id="loanBal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
              <RTooltip formatter={(v: any) => formatNaira(Number(v))} />
              <Legend />
              <Area
                type="monotone"
                dataKey="scheduled_balance"
                stroke="#0ea5e9"
                fill="url(#loanBal)"
                name="Scheduled balance"
              />
              <Area
                type="monotone"
                dataKey="actual_paid_cumulative"
                stroke="#10b981"
                fill="transparent"
                strokeWidth={2}
                name="Actual paid (cumulative)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Amortisation schedule</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[360px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Paid to date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.month}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right currency">
                      {formatNaira(r.scheduled_principal)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatNaira(r.scheduled_interest)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatNaira(r.scheduled_balance)}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600">
                      {formatNaira(r.actual_paid_cumulative)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoanAmortisationChart;
