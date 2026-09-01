import { useMemo, useState } from 'react';
import {
  FileText, ExternalLink, Download, TrendingUp, Wallet,
  ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, XCircle,
  AlertCircle, RotateCcw, Filter, Banknote, Receipt, ChevronDown,
  ChevronUp, CreditCard,
} from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const BATCH_TYPE_LABEL: Record<string, string> = {
  employee_salary: 'Salary',
  employee_allowance: 'Allowance',
  employee_reimbursement: 'Reimbursement',
  contractor: 'Contractor',
  advance: 'Advance',
  prize: 'Bonus/Prize',
};

const BATCH_TYPE_ICON: Record<string, typeof Banknote> = {
  employee_salary: Banknote,
  employee_allowance: CreditCard,
  employee_reimbursement: Receipt,
  contractor: FileText,
  advance: ArrowUpRight,
  prize: TrendingUp,
};

const BATCH_TYPE_STYLE: Record<string, string> = {
  employee_salary: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  employee_allowance: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20',
  employee_reimbursement: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  contractor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  advance: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  prize: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20',
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; style: string; label: string }> = {
  succeeded: { icon: CheckCircle2, style: 'text-emerald-600 dark:text-emerald-400', label: 'Paid' },
  pending: { icon: Clock, style: 'text-amber-600 dark:text-amber-400', label: 'Pending' },
  failed: { icon: XCircle, style: 'text-red-600 dark:text-red-400', label: 'Failed' },
  reversed: { icon: RotateCcw, style: 'text-red-600 dark:text-red-400', label: 'Reversed' },
  processing: { icon: AlertCircle, style: 'text-blue-600 dark:text-blue-400', label: 'Processing' },
};

function formatNgn(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  return '₦' + v.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type FilterType = 'all' | 'salary' | 'allowance' | 'reimbursement' | 'contractor' | 'advance' | 'prize';

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All Transactions' },
  { value: 'salary', label: 'Salary' },
  { value: 'allowance', label: 'Allowances' },
  { value: 'reimbursement', label: 'Reimbursements' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'advance', label: 'Advances' },
  { value: 'prize', label: 'Bonus/Prize' },
];

const FILTER_TO_BATCH: Record<FilterType, string | null> = {
  all: null,
  salary: 'employee_salary',
  allowance: 'employee_allowance',
  reimbursement: 'employee_reimbursement',
  contractor: 'contractor',
  advance: 'advance',
  prize: 'prize',
};

interface Props {
  payslips: any[];
  payments?: any[];
  loading?: boolean;
  humanPeriod: (p: string) => string;
  previewPayslip: (slip: any) => void;
  downloadPayslip: (slip: any) => void;
}

export default function PayrollTab({ payslips, payments = [], loading, humanPeriod, previewPayslip, downloadPayslip }: Props) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [showAllPayslips, setShowAllPayslips] = useState(false);

  const sortedPayslips = useMemo(
    () => [...payslips].sort((a, b) => (b.period || '').localeCompare(a.period || '')),
    [payslips],
  );

  const ytd = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const yearSlips = sortedPayslips.filter(s => s.period?.startsWith(currentYear));
    return {
      gross: yearSlips.reduce((sum, s) => sum + (Number(s.gross_ngn) || 0), 0),
      net: yearSlips.reduce((sum, s) => sum + (Number(s.net_ngn) || 0), 0),
      paye: yearSlips.reduce((sum, s) => sum + (Number(s.paye_ngn) || 0), 0),
      pension: yearSlips.reduce((sum, s) => sum + (Number(s.pension_ngn) || 0), 0),
      nhf: yearSlips.reduce((sum, s) => sum + (Number(s.nhf_ngn) || 0), 0),
      months: yearSlips.length,
    };
  }, [payslips]);

  const totalDisbursed = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const salaryTotal = sortedPayslips
      .filter(s => s.period?.startsWith(currentYear))
      .reduce((sum, s) => sum + (Number(s.net_ngn) || 0), 0);
    const otherTotal = payments
      .filter((p: any) => {
        const period = p.payment_batches?.period;
        return period?.startsWith(currentYear) && p.status === 'succeeded';
      })
      .reduce((sum, p: any) => sum + (Number(p.amount_ngn) || 0), 0);
    return salaryTotal + otherTotal;
  }, [sortedPayslips, payments]);

  const allTransactions = useMemo(() => {
    const items: any[] = payments.map((p: any) => ({
      id: p.id,
      type: 'payment' as const,
      batchType: p.payment_batches?.batch_type || 'unknown',
      batchName: p.payment_batches?.name || '—',
      amount: Number(p.amount_ngn) || 0,
      status: p.status,
      date: p.processed_at || p.created_at,
      period: p.payment_batches?.period,
      narration: p.narration,
    }));

    const batchTypeFilter = FILTER_TO_BATCH[filter];
    if (batchTypeFilter) {
      return items
        .filter(i => i.batchType === batchTypeFilter)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [payments, filter]);

  const paymentsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of payments) {
      const bt = p.payment_batches?.batch_type || 'unknown';
      counts[bt] = (counts[bt] || 0) + 1;
    }
    return counts;
  }, [payments]);

  const displayPayslips = showAllPayslips ? sortedPayslips : sortedPayslips.slice(0, 6);
  const hasData = sortedPayslips.length > 0 || payments.length > 0;

  return (
    <div className="mt-4 space-y-4">
      {/* YTD Summary */}
      {(ytd.months > 0 || totalDisbursed > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="relative overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-5 w-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">YTD Gross</p>
              </div>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(ytd.gross)}</p>
              <p className="text-xs text-muted-foreground">{ytd.months} month{ytd.months !== 1 ? 's' : ''}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-5 w-5 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <Banknote className="h-3 w-3 text-blue-500" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">YTD Net</p>
              </div>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(ytd.net)}</p>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-5 w-5 rounded-md bg-red-500/10 flex items-center justify-center">
                  <ArrowDownRight className="h-3 w-3 text-red-500" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">YTD Deductions</p>
              </div>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(ytd.paye + ytd.pension + ytd.nhf)}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {ytd.paye > 0 && <span>PAYE {formatNgn(ytd.paye)}</span>}
                {ytd.pension > 0 && <span>Pen. {formatNgn(ytd.pension)}</span>}
                {ytd.nhf > 0 && <span>NHF {formatNgn(ytd.nhf)}</span>}
              </div>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="h-5 w-5 rounded-md bg-amber-500/10 flex items-center justify-center">
                  <Wallet className="h-3 w-3 text-amber-500" />
                </div>
                <p className="text-xs text-muted-foreground font-medium">Total Disbursed</p>
              </div>
              <p className="text-lg font-semibold tabular-nums">{formatNgn(totalDisbursed)}</p>
              <p className="text-xs text-muted-foreground">salary + other</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payslips */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Payslips
            </CardTitle>
            {sortedPayslips.length > 0 && (
              <Badge variant="secondary" className="text-xs tabular-nums">
                {sortedPayslips.length} payslip{sortedPayslips.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading payroll data…</div>
          ) : sortedPayslips.length === 0 ? (
            <EmptyState compact icon={FileText} title="No payslips yet" description="Finance generates payslips at the end of each month." />
          ) : (
            <>
              <div className="divide-y">
                {displayPayslips.map((slip: any) => (
                  <div key={slip.id} className="flex items-center justify-between px-4 py-3 gap-2 hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{humanPeriod(slip.period)}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground tabular-nums flex-wrap">
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
              {sortedPayslips.length > 6 && (
                <div className="px-4 py-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full gap-1 text-muted-foreground"
                    onClick={() => setShowAllPayslips(v => !v)}
                  >
                    {showAllPayslips ? (
                      <>Show Less <ChevronUp className="h-3.5 w-3.5" /></>
                    ) : (
                      <>Show All {sortedPayslips.length} Payslips <ChevronDown className="h-3.5 w-3.5" /></>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* All Transactions */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              All Transactions
            </CardTitle>
            <div className="flex items-center gap-1.5 flex-wrap">
              {FILTER_OPTIONS.map(opt => {
                const batchKey = FILTER_TO_BATCH[opt.value];
                const count = opt.value === 'all' ? payments.length : (batchKey ? paymentsByType[batchKey] || 0 : 0);
                if (opt.value !== 'all' && count === 0) return null;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFilter(opt.value)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                      filter === opt.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/50 text-muted-foreground border-transparent hover:bg-muted',
                    )}
                  >
                    {opt.label}
                    {count > 0 && (
                      <span className={cn(
                        'text-[10px] tabular-nums rounded-full px-1.5 py-0',
                        filter === opt.value ? 'bg-primary-foreground/20' : 'bg-muted-foreground/15',
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">Loading transactions…</div>
          ) : allTransactions.length === 0 ? (
            <EmptyState
              compact
              icon={Receipt}
              title={filter === 'all' ? 'No transactions yet' : `No ${FILTER_OPTIONS.find(o => o.value === filter)?.label.toLowerCase() || ''} transactions`}
              description="Payment records will appear here as batches are processed."
            />
          ) : (
            <div className="divide-y">
              {allTransactions.map((txn) => {
                const statusConf = STATUS_CONFIG[txn.status] || STATUS_CONFIG.pending;
                const StatusIcon = statusConf.icon;
                const TypeIcon = BATCH_TYPE_ICON[txn.batchType] || FileText;
                return (
                  <div key={txn.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border',
                      BATCH_TYPE_STYLE[txn.batchType] || 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20',
                    )}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{txn.batchName}</span>
                        <span className={cn(
                          'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                          BATCH_TYPE_STYLE[txn.batchType] || 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20',
                        )}>
                          {BATCH_TYPE_LABEL[txn.batchType] || txn.batchType}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{formatDate(txn.date)}</span>
                        {txn.period && <span className="text-muted-foreground/60">·</span>}
                        {txn.period && <span>{txn.period}</span>}
                        {txn.narration && (
                          <>
                            <span className="text-muted-foreground/60">·</span>
                            <span className="truncate max-w-[180px]">{txn.narration}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{formatNgn(txn.amount)}</div>
                      <div className={cn('flex items-center justify-end gap-1 text-xs', statusConf.style)}>
                        <StatusIcon className="h-3 w-3" />
                        <span>{statusConf.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!hasData && !loading && (
        <EmptyState compact icon={FileText} title="No payment history" description="No payslips or payments have been recorded for this team member yet." />
      )}
    </div>
  );
}
