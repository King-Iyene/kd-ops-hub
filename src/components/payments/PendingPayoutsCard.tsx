/**
 * PendingPayoutsCard — at-a-glance pending-payout summary.
 *
 * Bank-grade compact: a single-line header strip showing the three
 * KPIs (Pending now / This month / Funding gap) inline, a slim tab
 * row, and a 28px-row list. Inspired by the "Pending" widget in
 * Monzo/Starling/Revolut — high information density without
 * sacrificing scannability.
 *
 * Sub-tabs split Pending into the four operator views so each row
 * is on the right pile:
 *
 *   • Awaiting approval — pending_approval / pending_second_approval
 *   • Awaiting funding  — approved
 *   • In flight         — funded / processing / partially_processed
 *   • Stuck             — anything in flight > 24h, or pending
 *                         approval > 3 days. Calls out batches that
 *                         have lost momentum so they don't sit
 *                         silently. Failed-with-unresolved-items
 *                         batches also surface here so operators
 *                         see exactly what's blocking close-out.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertTriangle, Wallet, Hourglass } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
  // effective_amount = money-still-to-move for this batch. For pre-dispatch
  // statuses this equals batch.total_amount; for partially_processed / failed
  // it's the sum of items that are neither succeeded nor manually resolved.
  // The RPC always returns > 0 (fully-cancelled batches are pre-filtered out).
  total_amount: number;
  beneficiary_count: number | null;
  payment_date: string | null;
  created_at: string;
  approved_at: string | null;
}

interface Props {
  walletBalanceNgn?: number | null;
}

const AWAITING_APPROVAL = ['pending_approval', 'pending_second_approval'];
const AWAITING_FUNDING  = ['approved'];
const IN_FLIGHT         = ['funded', 'processing', 'partially_processed'];
// 'failed' batches stay in Pending as long as they still have uncancelled
// items — those recipients still need to be patched / retried. Once every
// item is cancelled via the "Cancel" action (mark_batch_item_resolved with
// method='cancelled'), the RPC's outstanding-items filter drops the batch's
// contribution to 0 and it disappears from both the KPI total and count.
// Undoing any cancel automatically pulls it back.
const PENDING_ALL       = [...AWAITING_APPROVAL, ...AWAITING_FUNDING, ...IN_FLIGHT, 'failed'];

const STUCK_APPROVAL_HOURS = 72;
const STUCK_INFLIGHT_HOURS = 24;
function isStuck(b: PendingBatch): boolean {
  const now = Date.now();
  const ageHrs = (iso: string | null) =>
    iso ? (now - new Date(iso).getTime()) / 3_600_000 : 0;
  if (AWAITING_APPROVAL.includes(b.status)) return ageHrs(b.created_at) > STUCK_APPROVAL_HOURS;
  if (IN_FLIGHT.includes(b.status))         return ageHrs(b.approved_at ?? b.created_at) > STUCK_INFLIGHT_HOURS;
  // Any failed batch that made it into this list still has uncancelled items
  // (the row list filters out fully-resolved failed batches implicitly via
  // the KPI check below). Always classify as stuck so it surfaces at the top.
  if (b.status === 'failed')                return true;
  return false;
}

type Bucket = 'all' | 'approval' | 'funding' | 'flight' | 'stuck';

const TAB_META: Record<Bucket, { label: string; statusFilter?: string }> = {
  all:      { label: 'All' },
  approval: { label: 'Approval', statusFilter: 'pending_approval' },
  funding:  { label: 'Funding',  statusFilter: 'approved' },
  flight:   { label: 'In flight', statusFilter: 'processing' },
  stuck:    { label: 'Stuck' },
};

export function PendingPayoutsCard({ walletBalanceNgn }: Props) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<PendingBatch[]>([]);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  // Server-computed totals that IGNORE the 50-row row-list limit. Without
  // these the KPI was truncating at whichever 50 batches happened to be at
  // the top of the payment-date ordering, so finance saw a moving lower
  // bound. The RPC sums outstanding liability across every non-draft,
  // non-closed batch — no cap — and adjusts partially_processed / failed
  // batches to only count their unpaid items.
  const [summary, setSummary] = useState<{
    total: number;
    count: number;
    monthPending: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Bucket>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const [listRes, paidRes, summaryRes] = await Promise.all([
        // Row list + sub-tab counts come from pending_batches_list — the
        // SAME server function used by pending_payouts_summary. So the
        // header count / total / gap and the row-list count / sub-tabs
        // agree by construction, and fully-cancelled failed batches
        // (effective_amount = 0) are pre-excluded server-side.
        supabase.rpc('pending_batches_list'),
        // "Paid this month" sums actual money out.
        supabase.rpc('paid_total_in_period', {
          p_start: monthStart.toISOString().slice(0, 10),
          p_end:   monthEnd.toISOString().slice(0, 10),
        }),
        supabase.rpc('pending_payouts_summary'),
      ]);
      if (cancelled) return;

      // The list RPC returns `effective_amount` instead of `total_amount`.
      // The row-list UI reads .total_amount, so alias here to keep the shape.
      const listRows = (listRes.data ?? []) as any[];
      if (listRes.error || !Array.isArray(listRes.data)) {
        // Fallback path (only used if the RPC is temporarily unavailable).
        // No LIMIT — the KPI must never silently truncate. PostgREST caps
        // rows at its server-side max (default 1000; raise via the
        // `db.max_rows` project setting if you cross that threshold).
        const fbRes = await supabase.from('payment_batches')
          .select('id, name, status, total_amount, beneficiary_count, payment_date, created_at, approved_at')
          .in('status', PENDING_ALL)
          .is('deleted_at', null)
          .order('payment_date', { ascending: true, nullsFirst: false });
        setBatches(((fbRes.data ?? []) as any[]) as PendingBatch[]);
      } else {
        setBatches(listRows.map((r) => ({
          id:                r.id,
          name:              r.name,
          status:            r.status,
          total_amount:      Number(r.effective_amount ?? 0),
          beneficiary_count: r.beneficiary_count,
          payment_date:      r.payment_date,
          created_at:        r.created_at,
          approved_at:       r.approved_at,
        })) as PendingBatch[]);
      }
      setPaidThisMonth(Number(paidRes.data ?? 0));
      const s = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
      if (s) {
        setSummary({
          total:        Number((s as any).total_amount ?? 0),
          count:        Number((s as any).batch_count ?? 0),
          monthPending: Number((s as any).month_pending_amount ?? 0),
        });
      } else {
        setSummary(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // KPIs prefer the server-side summary; only fall back to the client sum
  // of the (capped) row list if the RPC hasn't returned yet or errored.
  const pendingTotal = summary?.total
    ?? batches.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const pendingCount = summary?.count ?? batches.length;

  const monthPlanned = useMemo(() => {
    if (summary) return paidThisMonth + summary.monthPending;
    const ymPrefix = new Date().toISOString().slice(0, 7);
    const monthPending = batches
      .filter((b) => b.payment_date?.startsWith(ymPrefix))
      .reduce((s, b) => s + Number(b.total_amount || 0), 0);
    return paidThisMonth + monthPending;
  }, [batches, paidThisMonth, summary]);

  const fundingGap = walletBalanceNgn != null
    ? Math.max(0, pendingTotal - walletBalanceNgn)
    : null;
  const isCovered = walletBalanceNgn != null && pendingTotal > 0 && fundingGap === 0;

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

  const viewAll = () => {
    const filter = TAB_META[tab].statusFilter;
    const url = filter ? `/payments?status=${filter}` : '/payments';
    navigate(url);
    setTimeout(() => {
      document.getElementById('batches-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* ── Single-line KPI strip ─────────────────────────────────
            Three figures inline, divided by hairlines. No tile chrome,
            no big card padding — same pattern as Mercury / Wise's
            "Money in / Money out" overview strip. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-border/50 border-b divide-y sm:divide-y-0">
          <KpiCell
            label="Pending"
            value={loading ? null : formatNaira(pendingTotal)}
            sub={loading ? '' : `${pendingCount} batch${pendingCount === 1 ? '' : 'es'}`}
            tone={pendingTotal > 0 ? 'warning' : 'neutral'}
            icon={<Wallet className="h-3 w-3" />}
            hint={
              <>
                <span className="block mb-1"><b>Pending</b> = outstanding money across every batch in pending_approval, approved, funded, processing, partially_processed, or failed. Partial / failed batches count only their uncancelled items. Fully cancelled batches disappear automatically; undoing a cancel puts them back.</span>
                <span className="block mb-1"><b>This month</b> = pending dated this month + already paid this month.</span>
                <span className="block"><b>Gap</b> = pending − wallet balance (zero or negative means covered).</span>
              </>
            }
          />
          <KpiCell
            label="This month"
            value={loading ? null : formatNaira(monthPlanned)}
            sub={loading ? '' : `${formatNaira(paidThisMonth)} paid`}
            tone="info"
          />
          <KpiCell
            label="Funding gap"
            value={
              loading ? null
                : fundingGap == null ? '—'
                : isCovered ? 'Covered'
                : formatNaira(fundingGap)
            }
            sub={
              fundingGap == null ? 'Wallet not loaded'
                : isCovered ? 'Wallet covers'
                : 'Top up'
            }
            tone={fundingGap && fundingGap > 0 ? 'danger' : isCovered ? 'success' : 'neutral'}
          />
        </div>

        {/* ── Sub-tab strip + View all ──────────────────────────────
            Inline with the action — saves a row. Tabs are slimmer
            (text-[10px], h-6), counts integrated as suffix not chip. */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-muted/20">
          <div className="flex items-center gap-0.5 overflow-x-auto kd-mobile-snap-x">
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
                    'shrink-0 inline-flex items-center gap-1 rounded-md px-2 h-6 text-[11px] kd-transition',
                    isActive
                      ? 'bg-foreground text-background font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background',
                  )}
                >
                  {isStuckTab && count > 0 && (
                    <span className={cn(
                      'h-1 w-1 rounded-full',
                      isActive ? 'bg-background' : 'bg-amber-500 kd-status-live-warning',
                    )} />
                  )}
                  <span>{TAB_META[k].label}</span>
                  <span className={cn(
                    'tabular-nums text-[10px]',
                    isActive ? 'opacity-70' : 'opacity-50',
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={viewAll}
            className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground kd-transition"
          >
            View all <ArrowRight className="h-2.5 w-2.5" />
          </button>
        </div>

        {/* ── 28px row list ─────────────────────────────────────────
            One row = name + status + amount on a single line. No
            secondary text by default — recipient count and date on
            hover via title attr. Failure / stuck cases get a leading
            colored bar so the row remains scannable. */}
        <div className="divide-y divide-border/40">
          {loading ? (
            <>
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </>
          ) : tabBatches.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
              {tab === 'stuck'
                ? 'Nothing stuck — every pending batch is moving on schedule.'
                : tab === 'all'
                  ? 'Nothing pending. New batches show up here as soon as they\'re submitted.'
                  : `No batches in ${TAB_META[tab].label.toLowerCase()}.`}
            </div>
          ) : (
            tabBatches.slice(0, 4).map((b) => {
              const stuck = isStuck(b);
              const subtitle = `${b.beneficiary_count ?? 0} recipient${b.beneficiary_count === 1 ? '' : 's'}${b.payment_date ? ' · pay ' + formatDate(b.payment_date) : ''}`;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => navigate(`/payments/${b.id}`)}
                  className={cn(
                    'w-full grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 h-8 text-left hover:bg-muted/40 kd-transition',
                    stuck && 'bg-amber-500/[0.04]',
                  )}
                  title={subtitle}
                >
                  {stuck ? (
                    <Hourglass className="h-3 w-3 text-amber-500 shrink-0" />
                  ) : (
                    <span className="h-3 w-3 shrink-0" />
                  )}
                  <span className="text-[12px] truncate">{b.name}</span>
                  <StatusBadge status={b.status} size="sm" />
                  <span className="text-[12px] font-mono font-semibold tabular-nums">
                    {formatNaira(b.total_amount)}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {tabBatches.length > 4 && (
          <button
            type="button"
            onClick={viewAll}
            className="w-full px-3 py-1.5 border-t text-[10px] text-muted-foreground hover:bg-muted/30 hover:text-foreground kd-transition flex items-center justify-center gap-1"
          >
            +{tabBatches.length - 4} more · View all
            <ArrowRight className="h-2.5 w-2.5" />
          </button>
        )}

        {fundingGap != null && fundingGap > 0 && (
          <div className="border-t px-3 py-1.5 flex items-start gap-1.5 bg-amber-500/5">
            <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[10px] leading-snug text-amber-800 dark:text-amber-300">
              Top up <span className="font-semibold font-mono">{formatNaira(fundingGap)}</span> before processing.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCell({
  label, value, sub, tone, icon, hint,
}: {
  label: string;
  value: string | null;
  sub: string;
  tone: 'warning' | 'success' | 'danger' | 'info' | 'neutral';
  icon?: React.ReactNode;
  hint?: React.ReactNode;
}) {
  const valueClass: Record<string, string> = {
    warning: 'text-amber-700 dark:text-amber-400',
    success: 'text-emerald-700 dark:text-emerald-400',
    danger:  'text-red-700 dark:text-red-400',
    info:    'text-foreground',
    neutral: 'text-foreground',
  };
  return (
    <div className="px-3 py-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
        {icon}
        <span>{label}</span>
        {hint && <InfoHint>{hint}</InfoHint>}
      </div>
      {value === null ? (
        <Skeleton className="h-4 w-16 mt-1" />
      ) : (
        <p className={cn('text-[15px] font-bold tabular-nums font-mono mt-0.5 leading-tight truncate', valueClass[tone])}>
          {value}
        </p>
      )}
      <p className="text-[9.5px] text-muted-foreground mt-0.5 truncate">{sub}</p>
    </div>
  );
}
