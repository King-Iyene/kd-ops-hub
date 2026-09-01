import { useMemo } from 'react';
import { FileText, ExternalLink, Download, TrendingUp, Wallet, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const BATCH_TYPE_LABEL: Record<string, string> = {
  employee_salary: 'Salary',
  employee_allowance: 'Allowance',
  employee_reimbursement: 'Reimbursement',
  contractor: 'Contractor',
  advance: 'Advance',
  prize: 'Bonus/Prize',
};

const BATCH_TYPE_STYLE: Record<string, string> = {
  employee_salary: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  employee_allowance: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400',
  employee_reimbursement: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
  contractor: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400',
  advance: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  prize: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400',
};

const STATUS_STYLE: Record<string, string> = {
  succeeded: 'text-emerald-600 dark:text-emerald-400',
  pending: 'text-amber-600 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
  reversed: 'text-red-600 dark:text-red-400',
  processing: 'text-blue-600 dark:text-blue-400',
};

function formatNgn(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface Props {
  payslips: any[];
  payments?: any[];
  humanPeriod: (p: string) => string;
  previewPayslip: (slip: any) => void;
  downloadPayslip: (slip: any) => void;
}

export default function PayrollTab({ payslips, payments = [], humanPeriod, previewPayslip, downloadPayslip }: Props) {
  const ytd = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const yearSlips = payslips.filter(s => s.period?.startsWith(currentYear));
    return {
      gross: yearSlips.reduce((sum, s) => sum + (Number(s.gross_ngn) || 0), 0),
      net: yearSlips.reduce((sum, s) => sum + (Number(s.net_ngn) || 0), 0),
      paye: yearSlips.reduce((sum, s) => sum + (Number(s.paye_ngn) || 0), 0),
      pension: yearSlips.reduce((sum, s) => sum + (Number(s.pension_ngn) || 0), 0),
      nhf: yearSlips.reduce((sum, s) => sum + (Number(s.nhf_ngn) || 0), 0),
      months: yearSlips.length,
    };
  }, [payslips]);

  const nonSalaryPayments = useMemo(() => {
    return payments.filter((p: any) => {
      const bt = p.payment_batches?.batch_type;
      return bt && bt !== 'employee_salary';
    });
  }, [payments]);

  const hasData = payslips.length > 0 || nonSalaryPayments.length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* YTD Summary */}
      {ytd.months > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground font-medium">YTD Gross</p>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(ytd.gross)}</p>
              <p className="text-xs text-muted-foreground">{ytd.months} month{ytd.months !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground font-medium">YTD Net</p>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(ytd.net)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground font-medium">YTD PAYE</p>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(ytd.paye)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground font-medium">YTD Pension + NHF</p>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(ytd.pension + ytd.nhf)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payslips */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Payslips
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payslips.length === 0 ? (
            <EmptyState compact icon={FileText} title="No payslips yet" description="Finance generates payslips at the end of each month." />
          ) : (
            <div className="divide-y">
              {payslips.map((slip: any) => (
                <div key={slip.id} className="flex items-center justify-between px-4 py-3 gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{humanPeriod(slip.period)}</span>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground tabular-nums">
                      <span>Gross {formatNgn(slip.gross_ngn)}</span>
                      {Number(slip.paye_ngn) > 0 && (
                        <span className="flex items-center gap-0.5">
                          <ArrowDownRight className="h-3 w-3 text-red-500" />
                          PAYE {formatNgn(slip.paye_ngn)}
                        </span>
                      )}
                      {Number(slip.pension_ngn) > 0 && (
                        <span>Pension {formatNgn(slip.pension_ngn)}</span>
                      )}
                      <span className="font-medium text-foreground">
                        <ArrowUpRight className="h-3 w-3 inline text-emerald-500" />
                        Net {formatNgn(slip.net_ngn)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="gap-1 h-8 px-2" onClick={() => previewPayslip(slip)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Preview</span>
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 h-8 px-2" onClick={() => downloadPayslip(slip)}>
                      <Download className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Download</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Other Payments (allowances, reimbursements, advances, etc.) */}
      {nonSalaryPayments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Other Payments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {nonSalaryPayments.map((p: any) => {
                const bt = p.payment_batches?.batch_type || 'unknown';
                const batchName = p.payment_batches?.name || '—';
                const period = p.payment_batches?.period;
                return (
                  <div key={p.id} className="flex items-center justify-between px-4 py-3 gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${BATCH_TYPE_STYLE[bt] || 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400'}`}>
                          {BATCH_TYPE_LABEL[bt] || bt}
                        </span>
                        <span className="text-sm font-medium truncate">{batchName}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {period && <span>{period}</span>}
                        <span>{new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {p.narration && <span className="truncate max-w-[200px]">{p.narration}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{formatNgn(p.amount_ngn)}</div>
                      <div className={`text-xs capitalize ${STATUS_STYLE[p.status] || 'text-muted-foreground'}`}>
                        {p.status}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!hasData && (
        <EmptyState compact icon={FileText} title="No payment history" description="No payslips or payments have been recorded for this team member yet." />
      )}
    </div>
  );
}
