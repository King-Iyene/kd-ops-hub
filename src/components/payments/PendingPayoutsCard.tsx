/**
 * PendingPayoutsCard — answers the operator's daily "how much do
 * we owe right now?" question without forcing them to open every
 * batch.
 *
 * Three figures stacked in a single card:
 *   1. Pending now — sum of total_amount across batches in
 *      pending_approval / approved / funded / processing /
 *      partially_processed (anything not finished).
 *   2. This month — same sum but filtered to payment_date in the
 *      current calendar month, plus already-paid batches so the
 *      operator sees "we'll move ₦X this month" not just what's
 *      outstanding.
 *   3. Funding gap — pending now − wallet balance. Positive means
 *      "fund this much before processing"; zero or negative means
 *      "you're covered".
 *
 * Below the figures, a compact list of the top-N pending batches
 * with status pill + amount + click-through to the batch detail.
 * That cuts out the manual "open each batch to read the amount"
 * trip the operator was making before.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, Wallet, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface PendingBatch {
  id: string;
  name: string;
  status: string;
  total_amount: number;
  beneficiary_count: number | null;
  payment_date: string | null;
}

interface Props {
  walletBalanceNgn?: number | null;
}

// Statuses that count as "pending payout" — money committed but
// not yet moved. Everything in this set still needs cash in the
// Paystack wallet to settle.
const PENDING_STATUSES = [
  'pending_approval',
  'approved',
  'funded',
  'processing',
  'partially_processed',
];

const MONTH_DONE_STATUSES = ['processed'];

export function PendingPayoutsCard({ walletBalanceNgn }: Props) {
  const [batches, setBatches] = useState<PendingBatch[]>([]);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      // One query for all pending batches (newest first) — the
      // operator can scan or click through. Limit 50 because the
      // card surfaces a top-N preview, not an exhaustive list.
      // Paid-this-month is a separate aggregate so it isn't
      // capped by the limit.
      const [pendRes, paidRes] = await Promise.all([
        supabase.from('payment_batches')
          .select('id, name, status, total_amount, beneficiary_count, payment_date')
          .in('status', PENDING_STATUSES)
          .is('deleted_at', null)
          .order('payment_date', { ascending: true, nullsFirst: false })
          .limit(50),
        supabase.from('payment_batches')
          .select('total_amount')
          .in('status', MONTH_DONE_STATUSES)
          .gte('payment_date', monthStart.slice(0, 10))
          .lt('payment_date', monthEnd.slice(0, 10))
          .is('deleted_at', null),
      ]);
      if (cancelled) return;

      setBatches(((pendRes.data ?? []) as any[]) as PendingBatch[]);
      setPaidThisMonth(((paidRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.total_amount || 0), 0));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const pendingTotal = useMemo(
    () => batches.reduce((s, b) => s + Number(b.total_amount || 0), 0),
    [batches],
  );

  const monthBatches = useMemo(() => {
    const now = new Date();
    const ymPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return batches.filter((b) => b.payment_date?.startsWith(ymPrefix));
  }, [batches]);

  const monthPending = monthBatches.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const monthPlanned = monthPending + paidThisMonth;

  const fundingGap = walletBalanceNgn != null
    ? Math.max(0, pendingTotal - walletBalanceNgn)
    : null;
  const isCovered = walletBalanceNgn != null && fundingGap === 0 && pendingTotal > 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Pending payouts
            <InfoHint>
              Total amount committed across batches that haven't fully
              settled yet — pending approval, approved, funded,
              processing, or partial. Click any row below to open the
              batch and see its recipients.
            </InfoHint>
          </CardTitle>
          <Link
            to="/payments"
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 kd-transition"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Three KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <KpiTile
            label="Pending now"
            value={loading ? null : formatNaira(pendingTotal)}
            sublabel={loading ? '' : `${batches.length} batch${batches.length === 1 ? '' : 'es'}`}
            tone={pendingTotal > 0 ? 'warning' : 'neutral'}
          />
          <KpiTile
            label="This month"
            value={loading ? null : formatNaira(monthPlanned)}
            sublabel={loading
              ? ''
              : `${formatNaira(paidThisMonth)} paid · ${formatNaira(monthPending)} pending`}
            tone="info"
          />
          <KpiTile
            label="Funding gap"
            value={
              loading ? null
                : fundingGap == null ? '—'
                : isCovered ? '✓ Covered'
                : formatNaira(fundingGap)
            }
            sublabel={
              fundingGap == null
                ? 'Wallet not loaded'
                : isCovered
                  ? 'Wallet covers pending'
                  : 'Top up before processing'
            }
            tone={fundingGap && fundingGap > 0 ? 'danger' : 'success'}
          />
        </div>

        {/* Top pending batches — quick scan instead of opening each one */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>Pending batches</span>
            <span>Amount</span>
          </div>
          {loading ? (
            <>
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </>
          ) : batches.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              Nothing in flight. New batches show up here as soon as they're submitted.
            </p>
          ) : (
            batches.slice(0, 6).map((b) => (
              <Link
                key={b.id}
                to={`/payments/${b.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card hover:bg-muted/40 px-3 py-2 kd-transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <StatusBadge status={b.status} size="sm" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                    {b.beneficiary_count ?? 0} recipient{b.beneficiary_count === 1 ? '' : 's'}
                    {b.payment_date && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <Calendar className="h-3 w-3" />
                        {formatDate(b.payment_date)}
                      </>
                    )}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums shrink-0">
                  {formatNaira(b.total_amount)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
              </Link>
            ))
          )}
          {batches.length > 6 && (
            <p className="text-[11px] text-muted-foreground/70 text-center pt-1">
              +{batches.length - 6} more — open the Payments page for the full list.
            </p>
          )}
        </div>

        {/* Funding-gap callout */}
        {fundingGap != null && fundingGap > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
              <span className="font-semibold">Top up {formatNaira(fundingGap)}</span> in
              the Paystack wallet before processing — the pending batches above are
              committed but not yet covered by the wallet balance.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiTile({
  label, value, sublabel, tone,
}: {
  label: string;
  value: string | null;
  sublabel: string;
  tone: 'warning' | 'success' | 'danger' | 'info' | 'neutral';
}) {
  const toneRing: Record<string, string> = {
    warning: 'border-amber-500/30 bg-amber-500/5',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    danger:  'border-red-500/30 bg-red-500/5',
    info:    'border-primary/20 bg-primary/5',
    neutral: 'border-border bg-card',
  };
  return (
    <div className={cn('rounded-xl border p-3', toneRing[tone])}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {value === null ? (
        <Skeleton className="h-7 w-24 mt-1" />
      ) : (
        <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
      )}
      <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
    </div>
  );
}
