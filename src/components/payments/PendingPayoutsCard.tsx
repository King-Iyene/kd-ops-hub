/**
 * PendingPayoutsCard — at-a-glance pending-payout summary.
 *
 * Answers the daily operator question: "how much do we owe right
 * now, what state are those batches in, and is the wallet covered?"
 *
 * Three KPIs across the top, then a tabbed list breaking down the
 * pending batches by stage so the operator sees exactly which tier
 * of attention each one needs:
 *
 *   • Awaiting approval — pending_approval. Sat with finance/admin.
 *   • Awaiting funding  — approved. Need wallet cash before
 *                         processing.
 *   • In flight         — funded / processing / partially_processed.
 *                         Money is moving.
 *   • Stuck             — anything in flight for > 24h, or pending
 *                         approval for > 3 days. Calls out batches
 *                         that have lost momentum so they don't sit
 *                         silently.
 *
 * "View all" link drops a `status=` search param on the Payments
 * URL — same page, but the main batches table re-filters via its
 * existing search-params hook. No more dead-link bug.
 *
 * "Pending now" / "Funding gap" calculation is documented in the
 * info tooltip and in the comments below so finance can audit the
 * figure rather than trusting it blindly.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertTriangle, Wallet, Calendar, Hourglass } from 'lucide-react';
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
  created_at: string;
  approved_at: string | null;
}

interface Props {
  walletBalanceNgn?: number | null;
}

// ── Status groupings ─────────────────────────────────────────────
//
// Source of truth for "Pending now" — anything in this set means
// money is committed but hasn't fully settled. Each subset feeds a
// different tab so operators see exactly which tier of attention
// each batch needs.
const AWAITING_APPROVAL = ['pending_approval', 'pending_second_approval'];
const AWAITING_FUNDING  = ['approved'];
const IN_FLIGHT         = ['funded', 'processing', 'partially_processed'];
const PENDING_ALL       = [...AWAITING_APPROVAL, ...AWAITING_FUNDING, ...IN_FLIGHT];

const MONTH_DONE_STATUSES = ['processed'];

// "Stuck" is a heuristic — a batch counts as stuck when it's been
// sitting in its current stage longer than the SLA most operators
// expect. Tunable via constants here.
const STUCK_APPROVAL_HOURS = 72;   // 3 days waiting for approval
const STUCK_INFLIGHT_HOURS = 24;   // 24h funded but not processed
function isStuck(b: PendingBatch): boolean {
  const now = Date.now();
  const ageHrs = (iso: string | null) =>
    iso ? (now - new Date(iso).getTime()) / 3_600_000 : 0;
  if (AWAITING_APPROVAL.includes(b.status)) return ageHrs(b.created_at) > STUCK_APPROVAL_HOURS;
  if (IN_FLIGHT.includes(b.status))         return ageHrs(b.approved_at ?? b.created_at) > STUCK_INFLIGHT_HOURS;
  return false;
}

type Bucket = 'all' | 'approval' | 'funding' | 'flight' | 'stuck';

const TAB_META: Record<Bucket, { label: string; statusFilter?: string }> = {
  all:      { label: 'All' },
  approval: { label: 'Awaiting approval', statusFilter: 'pending_approval' },
  funding:  { label: 'Awaiting funding',  statusFilter: 'approved' },
  flight:   { label: 'In flight',         statusFilter: 'processing' },
  stuck:    { label: 'Stuck' },
};

export function PendingPayoutsCard({ walletBalanceNgn }: Props) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<PendingBatch[]>([]);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Bucket>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const [pendRes, paidRes] = await Promise.all([
        supabase.from('payment_batches')
          .select('id, name, status, total_amount, beneficiary_count, payment_date, created_at, approved_at')
          .in('status', PENDING_ALL)
          .is('deleted_at', null)
          .order('payment_date', { ascending: true, nullsFirst: false })
          .limit(50),
        supabase.from('payment_batches')
          .select('total_amount')
          .in('status', MONTH_DONE_STATUSES)
          .gte('payment_date', monthStart.toISOString().slice(0, 10))
          .lt('payment_date', monthEnd.toISOString().slice(0, 10))
          .is('deleted_at', null),
      ]);
      if (cancelled) return;

      setBatches(((pendRes.data ?? []) as any[]) as PendingBatch[]);
      setPaidThisMonth(((paidRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.total_amount || 0), 0));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // KPI 1 — pending now: every batch in PENDING_ALL.
  const pendingTotal = useMemo(
    () => batches.reduce((s, b) => s + Number(b.total_amount || 0), 0),
    [batches],
  );

  // KPI 2 — this month: pending batches dated this month + already
  // paid this month. Gives the "we'll move ₦X this month" picture.
  const monthPlanned = useMemo(() => {
    const ymPrefix = new Date().toISOString().slice(0, 7);
    const monthPending = batches
      .filter((b) => b.payment_date?.startsWith(ymPrefix))
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    return paidThisMonth + monthPending;
  }, [batches, paidThisMonth]);

  // KPI 3 — funding gap: pending now minus wallet balance. Capped
  // at zero (negative = covered).
  const fundingGap = walletBalanceNgn != null
    ? Math.max(0, pendingTotal - walletBalanceNgn)
    : null;
  const isCovered = walletBalanceNgn != null && pendingTotal > 0 && fundingGap === 0;

  // Per-tab filtered list.
  const tabBatches = useMemo(() => {
    switch (tab) {
      case 'approval': return batches.filter((b) => AWAITING_APPROVAL.includes(b.status));
      case 'funding':  return batches.filter((b) => AWAITING_FUNDING.includes(b.status));
      case 'flight':   return batches.filter((b) => IN_FLIGHT.includes(b.status));
      case 'stuck':    return batches.filter(isStuck);
      default:         return batches;
    }
  }, [batches, tab]);

  const counts = useMemo(() => ({
    all:      batches.length,
    approval: batches.filter((b) => AWAITING_APPROVAL.includes(b.status)).length,
    funding:  batches.filter((b) => AWAITING_FUNDING.includes(b.status)).length,
    flight:   batches.filter((b) => IN_FLIGHT.includes(b.status)).length,
    stuck:    batches.filter(isStuck).length,
  }), [batches]);

  // "View all" — push a status= search param onto the current
  // Payments URL so the main table re-filters via its existing
  // search-params hook. Same page, real effect.
  const viewAll = () => {
    const filter = TAB_META[tab].statusFilter;
    const url = filter ? `/payments?status=${filter}` : '/payments';
    navigate(url);
    // Scroll the batches table into view if we're already on
    // /payments. setTimeout 0 lets the search-params reactivate
    // the filter before we scroll.
    setTimeout(() => {
      document.getElementById('batches-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Pending payouts
            <InfoHint>
              <span className="block mb-1.5"><b>Pending now</b> sums batches in any of these statuses: pending_approval, pending_second_approval, approved, funded, processing, partially_processed.</span>
              <span className="block mb-1.5"><b>This month</b> = pending batches dated this month + batches already paid this month.</span>
              <span className="block"><b>Funding gap</b> = pending_now − wallet balance (zero or negative means you're covered).</span>
            </InfoHint>
          </CardTitle>
          <button
            type="button"
            onClick={viewAll}
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 kd-transition"
          >
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPI tiles — slimmer than before, monospace numbers */}
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
              : `${formatNaira(paidThisMonth)} paid`}
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

        {/* Sub-tab strip — splits Pending into the four operator
            views so each row is on the right pile. Stuck tab gets
            an amber dot pulse to draw attention when count > 0. */}
        <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 pb-1 kd-mobile-snap-x">
          {(Object.keys(TAB_META) as Bucket[]).map((k) => {
            const isActive = tab === k;
            const count = counts[k];
            const isStuckTab = k === 'stuck';
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium kd-transition',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {isStuckTab && count > 0 && (
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    isActive ? 'bg-primary-foreground' : 'bg-amber-500 kd-status-live-warning',
                  )} />
                )}
                {TAB_META[k].label}
                <span className={cn(
                  'tabular-nums px-1 rounded-md text-[10px]',
                  isActive ? 'bg-primary-foreground/20' : 'bg-background/80',
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Compact list — bank-grade row layout: one row = 32px
            tall, monospace amount right-aligned, single subtle
            divider between rows. Inspired by Mercury / Ramp /
            Brex — minimal chrome, dense info, scannable. */}
        <div className="rounded-lg border bg-card divide-y divide-border/40">
          {loading ? (
            <>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </>
          ) : tabBatches.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {tab === 'stuck'
                ? 'Nothing stuck — every pending batch is moving on schedule.'
                : tab === 'all'
                  ? 'Nothing in flight. New batches show up here as soon as they\'re submitted.'
                  : `No batches in ${TAB_META[tab].label.toLowerCase()}.`}
            </div>
          ) : (
            tabBatches.slice(0, 6).map((b) => {
              const stuck = isStuck(b);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => navigate(`/payments/${b.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/40 kd-transition group"
                >
                  {stuck && (
                    <Hourglass className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium truncate">{b.name}</p>
                      <StatusBadge status={b.status} size="sm" />
                    </div>
                    <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {b.beneficiary_count ?? 0} recipient{b.beneficiary_count === 1 ? '' : 's'}
                      {b.payment_date && (
                        <>
                          <span className="mx-1.5 text-muted-foreground/40">·</span>
                          <Calendar className="inline h-2.5 w-2.5 mr-1 -mt-px" />
                          {formatDate(b.payment_date)}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-[13px] font-semibold tabular-nums shrink-0 font-mono">
                    {formatNaira(b.total_amount)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-foreground shrink-0 kd-transition" />
                </button>
              );
            })
          )}
        </div>

        {tabBatches.length > 6 && (
          <p className="text-[11px] text-muted-foreground/70 text-center">
            +{tabBatches.length - 6} more. Click <button onClick={viewAll} className="underline underline-offset-2 hover:text-foreground">View all</button> for the full list.
          </p>
        )}

        {/* Funding gap callout */}
        {fundingGap != null && fundingGap > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300">
              <span className="font-semibold">Top up {formatNaira(fundingGap)}</span> before processing — pending batches above are committed but not yet covered by the wallet balance.
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
  const ring: Record<string, string> = {
    warning: 'border-amber-500/30 bg-amber-500/5',
    success: 'border-emerald-500/30 bg-emerald-500/5',
    danger:  'border-red-500/30 bg-red-500/5',
    info:    'border-primary/20 bg-primary/5',
    neutral: 'border-border bg-card',
  };
  return (
    <div className={cn('rounded-lg border p-2.5', ring[tone])}>
      <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
        {label}
      </p>
      {value === null ? (
        <Skeleton className="h-6 w-20 mt-1" />
      ) : (
        <p className="text-base font-bold tabular-nums font-mono mt-0.5 leading-tight">{value}</p>
      )}
      <p className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</p>
    </div>
  );
}
