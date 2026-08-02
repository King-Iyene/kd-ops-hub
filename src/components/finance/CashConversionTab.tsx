import { useEffect, useState } from 'react';
import { ArrowRight, TrendingUp, TrendingDown, Timer, CreditCard, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { formatNaira } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fetchCashConversionData, type CashConversionResult, type CccBand } from '@/lib/cash-conversion';

const BAND_STYLE: Record<CccBand, { tone: string; label: string }> = {
  excellent: { tone: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30', label: 'Excellent' },
  good:      { tone: 'bg-blue-500/15 text-blue-700 border-blue-500/30',          label: 'Good' },
  fair:      { tone: 'bg-amber-500/15 text-amber-700 border-amber-500/30',       label: 'Fair' },
  poor:      { tone: 'bg-destructive/15 text-destructive border-destructive/30',  label: 'Poor' },
};

function fmt(days: number | null): string {
  if (days == null) return '—';
  return `${days.toFixed(1)} days`;
}

export default function CashConversionTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CashConversionResult | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setData(await fetchCashConversionData(90));
      } catch (err: any) {
        toast({ title: 'Could not load cash conversion data', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const band = data ? BAND_STYLE[data.band] : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The cash conversion cycle measures how quickly money flows through the business — from paying suppliers to collecting from clients.
      </p>

      {/* ─── CCC headline ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4 text-primary" /> Cash Conversion Cycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data && !loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">No data available.</p>
          ) : data ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">DSO</p>
                <p className="text-2xl font-bold">{fmt(data.dso.dso_days)}</p>
                <p className="text-[10px] text-muted-foreground">Days Sales Outstanding</p>
              </div>

              <div className="hidden sm:flex items-center text-muted-foreground">
                <span className="text-lg">−</span>
              </div>

              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">DPO</p>
                <p className="text-2xl font-bold">{fmt(data.dpo.dpo_days)}</p>
                <p className="text-[10px] text-muted-foreground">Days Payable Outstanding</p>
              </div>

              <div className="hidden sm:flex items-center text-muted-foreground">
                <span className="text-lg">=</span>
              </div>

              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">CCC</p>
                <p className="text-3xl font-bold">{fmt(data.ccc_days)}</p>
                {band && <Badge variant="outline" className={cn('mt-1', band.tone)}>{band.label}</Badge>}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ─── Breakdown cards ───────────────────────────────────────── */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Receipt className="h-4 w-4 text-blue-500" /> Receivables (DSO)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding invoices</span>
                <span className="font-medium">{formatNaira(data.dso.outstanding_receivables_ngn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Trailing {data.dso.trailing_days}-day revenue</span>
                <span className="font-medium">{formatNaira(data.dso.trailing_revenue_ngn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Daily revenue avg</span>
                <span className="font-medium">
                  {data.dso.trailing_days > 0 && data.dso.trailing_revenue_ngn > 0
                    ? formatNaira(data.dso.trailing_revenue_ngn / data.dso.trailing_days)
                    : '—'}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>DSO</span>
                <span className="flex items-center gap-1">
                  {fmt(data.dso.dso_days)}
                  {data.dso.dso_days != null && data.dso.dso_days <= 30 && <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />}
                  {data.dso.dso_days != null && data.dso.dso_days > 45 && <TrendingUp className="h-3.5 w-3.5 text-destructive" />}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {data.dso.dso_days == null
                  ? 'No trailing revenue to compute DSO.'
                  : data.dso.dso_days <= 30
                    ? 'Healthy — you collect within a month on average.'
                    : data.dso.dso_days <= 60
                      ? 'Could improve — aim to bring this under 30 days.'
                      : 'Slow collections — consider tightening payment terms or chasing overdue invoices.'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-amber-500" /> Payables (DPO)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Approved unpaid expenses</span>
                <span className="font-medium">{formatNaira(data.dpo.outstanding_payables_ngn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Trailing {data.dpo.trailing_days}-day outflows</span>
                <span className="font-medium">{formatNaira(data.dpo.trailing_cost_ngn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Daily cost avg</span>
                <span className="font-medium">
                  {data.dpo.trailing_days > 0 && data.dpo.trailing_cost_ngn > 0
                    ? formatNaira(data.dpo.trailing_cost_ngn / data.dpo.trailing_days)
                    : '—'}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>DPO</span>
                <span className="flex items-center gap-1">
                  {fmt(data.dpo.dpo_days)}
                  {data.dpo.dpo_days != null && data.dpo.dpo_days >= 30 && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {data.dpo.dpo_days == null
                  ? 'No trailing costs to compute DPO.'
                  : data.dpo.dpo_days >= 30
                    ? 'Good — you are holding payables long enough to optimize cash flow.'
                    : 'You are paying suppliers quickly — consider negotiating longer terms if cash is tight.'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Interpretation ────────────────────────────────────────── */}
      {data && data.ccc_days != null && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <ArrowRight className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm space-y-1">
                {data.ccc_days <= 0 ? (
                  <p>Your CCC is <span className="font-semibold text-emerald-600 dark:text-emerald-400">negative</span> — you collect from clients before you pay suppliers. This is an ideal cash position.</p>
                ) : data.ccc_days <= 30 ? (
                  <p>Your CCC is <span className="font-semibold">under 30 days</span> — cash cycles through the business quickly. Maintain this by staying on top of collections.</p>
                ) : data.ccc_days <= 60 ? (
                  <p>Your CCC is <span className="font-semibold text-amber-600 dark:text-amber-400">{data.ccc_days.toFixed(0)} days</span> — consider tightening invoice terms or negotiating longer supplier payment windows to improve cash flow.</p>
                ) : (
                  <p>Your CCC is <span className="font-semibold text-destructive">{data.ccc_days.toFixed(0)} days</span> — cash is tied up for a long time. Prioritize collections and explore extended payment terms with suppliers.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
