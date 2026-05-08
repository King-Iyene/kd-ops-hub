import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Search, RefreshCw, Clock,
  TrendingUp, Zap, ArrowRight, Users,
} from 'lucide-react';
import { QuickPayDialog } from '@/components/QuickPay';
import { PaystackBalanceCard } from '@/components/PaystackBalanceCard';
import { PendingPayoutsCard } from '@/components/payments/PendingPayoutsCard';
import { InfoHint } from '@/components/ui-kit/InfoHint';
import { getPaystackBalance } from '@/lib/paystack';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePermission, useFeatureAccess } from '@/hooks/usePermission';
import { APPROVER_ROLES } from '@/lib/roles';
import { StatusBadge, statusLabel } from '@/components/ui-kit/StatusBadge';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';

interface PaymentBatch {
  id: string;
  name: string;
  payment_date: string;
  period: string;
  total_amount: number;
  beneficiary_count: number;
  status: string;
  created_at: string;
  notes: string;
  batch_type?: string;
}

interface BatchStats {
  pendingCount: number;
  pendingAmount: number;
  processingCount: number;
  thisMonthAmount: number;
}

interface BalanceData {
  available: number;
  currency: string;
}

interface FundingDetails {
  bank: string | null;
  accountName: string | null;
  accountNumber: string | null;
}

// Persist the show/hide state across reloads so the choice survives a
// page refresh — operators who hide the balance for screen-share don't
// want it flashing back on every navigation.
const BALANCE_HIDDEN_KEY = 'kdops.paystack_balance_hidden';

const BATCH_TYPE_META: Record<string, { label: string; bg: string; text: string }> = {
  contractor:      { label: 'Contractor',   bg: 'bg-blue-50',    text: 'text-blue-700' },
  employee_salary: { label: 'Salary Run',   bg: 'bg-emerald-50', text: 'text-emerald-700' },
  advance:         { label: 'Advance',      bg: 'bg-amber-50',   text: 'text-amber-700' },
  prize:           { label: 'Bonus/Prize',  bg: 'bg-purple-50',  text: 'text-purple-700' },
};

const Payments = () => {
  usePageTitle('Payments');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const canQuickPay = useFeatureAccess('payments.quick_pay', APPROVER_ROLES);
  // Wallet balance + funding details are sensitive — only finance-tier
  // roles see them. A non-finance role with `payments.view` granted as
  // an exception still gets the page (so they can see batches), but the
  // wallet card stays hidden because the underlying balance call is
  // role-gated by the edge function and the funding bank/account is
  // typically considered confidential. Permission `settings.access`
  // grants the wallet too — that's the same group of people who'd be
  // configuring the funding details in Settings.
  const canSeeWallet = useFeatureAccess('settings.access', APPROVER_ROLES);
  const [batches, setBatches] = useState<PaymentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(0);

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  // Store the raw ISO timestamp so the card can render a live
  // relative figure ("just now", "5 sec ago", "2 min ago") that
  // ticks while the panel is open. The previous "07:46" clock-time
  // didn't tell operators whether the figure was 30 seconds stale or
  // 30 minutes stale.
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<string | null>(null);
  const [balanceHidden, setBalanceHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(BALANCE_HIDDEN_KEY) === '1';
  });
  const [funding, setFunding] = useState<FundingDetails | null>(null);

  const toggleBalanceHidden = () => {
    setBalanceHidden((prev) => {
      const next = !prev;
      try { localStorage.setItem(BALANCE_HIDDEN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };
  const [stats, setStats] = useState<BatchStats>({
    pendingCount: 0, pendingAmount: 0, processingCount: 0, thisMonthAmount: 0,
  });

  const [reconciling, setReconciling] = useState(false);
  const [confirmReconcile, setConfirmReconcile] = useState(false);

  const fetchBalance = useCallback(async (isRetry = false) => {
    setBalanceLoading(true);
    if (!isRetry) setBalanceError(false);
    try {
      const result = await getPaystackBalance();
      setBalance(result);
      setBalanceError(false);
      setBalanceUpdatedAt(new Date().toISOString());
    } catch {
      if (!isRetry) {
        // Race condition: session may not be restored yet on first mount.
        // One auto-retry after a short pause usually resolves it.
        setTimeout(() => fetchBalance(true), 1500);
      } else {
        setBalanceError(true);
      }
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const fetchStats = async () => {
    const now = new Date();
    // Date-only strings for the paid-total RPC (it indexes on payment_date).
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEndDate   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

    const [pendingRes, processingRes, paidRes] = await Promise.all([
      supabase.from('payment_batches').select('total_amount').eq('status', 'pending_approval').is('deleted_at', null),
      supabase.from('payment_batches').select('id', { count: 'exact', head: true }).eq('status', 'processing').is('deleted_at', null),
      // "Paid this month" — actual money out only. Cancelled and
      // paid-externally items are excluded server-side via the RPC
      // (see migration 20260508220000) so the figure tracks Paystack-
      // rail spend exclusively.
      supabase.rpc('paid_total_in_period', { p_start: monthStartDate, p_end: monthEndDate }),
    ]);

    const pendingRows = (pendingRes.data || []) as { total_amount: number }[];
    setStats({
      pendingCount: pendingRows.length,
      pendingAmount: pendingRows.reduce((s, r) => s + (r.total_amount || 0), 0),
      processingCount: processingRes.count || 0,
      thisMonthAmount: Number(paidRes.data ?? 0),
    });
  };

  const fetchBatches = async () => {
    setLoading(true);
    let query = supabase
      .from('payment_batches')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const fetched = (data as PaymentBatch[]) || [];

    const stale = fetched.filter((b) => b.status === 'processing' || b.status === 'partially_processed');
    if (stale.length > 0) {
      const staleIds = stale.map((b) => b.id);
      const { data: allItems } = await supabase
        .from('batch_items')
        .select('batch_id, status')
        .in('batch_id', staleIds);

      const itemsByBatch = new Map<string, { status: string }[]>();
      for (const it of (allItems || []) as { batch_id: string; status: string }[]) {
        const arr = itemsByBatch.get(it.batch_id) ?? [];
        arr.push({ status: it.status });
        itemsByBatch.set(it.batch_id, arr);
      }

      const updates: Promise<unknown>[] = [];
      for (const b of stale) {
        const items = itemsByBatch.get(b.id) ?? [];
        if (items.length === 0) continue;
        const anyPending = items.some((r) => r.status === 'pending' || r.status === 'retry');
        const anyFailed = items.some((r) => r.status === 'failed');
        const anySucceeded = items.some((r) => r.status === 'succeeded');
        // 'failed' when EVERY non-pending item failed (no succeeded).
        // 'partially_processed' when failures coexist with successes.
        const correct = anyPending ? 'processing'
          : anyFailed && !anySucceeded ? 'failed'
          : anyFailed ? 'partially_processed'
          : 'processed';
        if (correct !== b.status) {
          // Route through the SECURITY DEFINER sync RPC so direct status
          // writes from authenticated stay blocked. RPC is idempotent and
          // bounded — only flips processing/partially/funded → derived state.
          updates.push(
            supabase.rpc('sync_batch_status_from_items', { p_batch_id: b.id }),
          );
          b.status = correct;
        }
      }
      if (updates.length > 0) await Promise.all(updates);
    }

    setBatches(fetched);
    setLoading(false);
  };

  const reconcileNow = async () => {
    if (reconciling) return;
    setConfirmReconcile(false);
    setReconciling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('paystack-reconciliation', {
        body: {},
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Reconciliation complete',
        description: `Checked ${data?.items_checked ?? 0} · ${data?.succeeded ?? 0} succeeded · ${data?.failed ?? 0} failed · ${data?.unchanged ?? 0} unchanged`,
      });
      fetchBatches();
      fetchStats();
    } catch (err: any) {
      toast({ title: 'Reconciliation failed', description: err?.message, variant: 'destructive' });
    } finally {
      setReconciling(false);
    }
  };


  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  useEffect(() => { fetchBatches(); fetchStats(); }, [statusFilter, page]);

  // Funding-account details live on company_settings (one row). We pull just
  // the three fields we need and pass the result down to the balance card so
  // operators can copy the bank / account / number without leaving Payments.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('paystack_funding_bank, paystack_funding_account_name, paystack_funding_account_number')
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setFunding({
          bank: data.paystack_funding_bank ?? null,
          accountName: data.paystack_funding_account_name ?? null,
          accountNumber: data.paystack_funding_account_number ?? null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchBatches);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return batches;
    const s = debouncedSearch.toLowerCase();
    return batches.filter((b) => b.name.toLowerCase().includes(s));
  }, [batches, debouncedSearch]);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Payment Batches</h1>
            <InfoHint>
              Manage bulk payments through draft → approval → funding → processing with a full audit trail.
            </InfoHint>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage partner and contractor payments
            <button
              type="button"
              onClick={manualRefresh}
              className="ml-3 inline-flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-3 w-3" /> {lastUpdatedLabel}
            </button>
          </p>
        </div>

        <div className="flex items-start gap-3 flex-wrap justify-end w-full sm:w-auto">
          {canSeeWallet && <PaystackBalanceCard
            balance={balance}
            balanceLoading={balanceLoading}
            balanceError={balanceError}
            balanceUpdatedAt={balanceUpdatedAt}
            balanceHidden={balanceHidden}
            toggleBalanceHidden={toggleBalanceHidden}
            fetchBalance={fetchBalance}
            funding={funding}
          />}

          {/* Action buttons — full-width row on mobile so taps are easy */}
          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            {canQuickPay && <QuickPayDialog />}
            {canQuickPay && (
              <Button
                variant="outline"
                onClick={() => setConfirmReconcile(true)}
                disabled={reconciling}
                className="flex-1 sm:flex-initial h-10 sm:h-9"
                title="Re-check stuck transfers with Paystack"
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', reconciling && 'animate-spin')} />
                Reconcile
              </Button>
            )}
            <Button onClick={() => navigate('/payments/new')} className="flex-1 sm:flex-initial h-10 sm:h-9">
              <Plus className="mr-2 h-4 w-4" /> New Batch
            </Button>
          </div>
        </div>
      </div>

      {/* Pending payouts overview — answers the daily "how much do
          we owe right now?" without forcing the operator to open
          every single batch one by one. Side-by-side with the
          wallet card on wide screens, stacked on mobile. */}
      {canSeeWallet && (
        <PendingPayoutsCard walletBalanceNgn={balance?.available ?? null} />
      )}

      {/* ── Stats row ──────────────────────────────────────────────
          UK bank style (Monzo/Starling/Revolut): rounded-2xl cards
          with soft pastel surfaces, prominent display amounts in
          bold, and a friendly icon medallion. Generous padding so
          the figures breathe — the headline amount is the hero. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: 'Pending approval',
            value: stats.pendingCount,
            sub: formatNaira(stats.pendingAmount),
            icon: Clock,
            color: 'text-amber-700',
            bg: 'bg-gradient-to-br from-amber-50 to-amber-100/40',
            ring: 'ring-1 ring-amber-200/60',
            iconBg: 'bg-amber-100/80 text-amber-700',
          },
          {
            label: 'Processing now',
            value: stats.processingCount,
            sub: 'Active transfers',
            icon: Zap,
            color: 'text-blue-700',
            bg: 'bg-gradient-to-br from-blue-50 to-blue-100/40',
            ring: 'ring-1 ring-blue-200/60',
            iconBg: 'bg-blue-100/80 text-blue-700',
          },
          {
            label: 'Paid this month',
            value: formatNaira(stats.thisMonthAmount),
            sub: 'Completed batches',
            icon: TrendingUp,
            color: 'text-emerald-700',
            bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/40',
            ring: 'ring-1 ring-emerald-200/60',
            iconBg: 'bg-emerald-100/80 text-emerald-700',
          },
        ].map(({ label, value, sub, icon: Icon, color, bg, ring, iconBg }) => (
          <div key={label} className={cn('rounded-2xl px-5 py-4 kd-transition hover:shadow-[var(--shadow-md)]', bg, ring)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-muted-foreground/90">{label}</p>
                <p className={cn('text-[26px] font-bold mt-1 leading-none tracking-tight tabular-nums', color)}>{value}</p>
                <p className="text-[11px] text-muted-foreground/80 mt-1.5">{sub}</p>
              </div>
              <div className={cn('rounded-2xl p-2.5 shrink-0', iconBg)}>
                <Icon className="h-4 w-4" strokeWidth={2.25} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters + list ─────────────────────────────────────── */}
      <div className="space-y-3" id="batches-list">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Tabs scroll horizontally on mobile so they don't wrap into a
              second row that pushes the table down. Snap to each pill. */}
          {/* Pill tabs — Monzo/Starling style: rounded-full,
              friendly hover, active gets a soft fill rather than
              a hard background. */}
          <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }} className="w-full sm:w-auto">
            <div className="-mx-1 overflow-x-auto kd-mobile-snap-x sm:overflow-visible">
              <TabsList className="h-9 bg-muted/40 rounded-full inline-flex w-max sm:flex sm:w-auto sm:flex-wrap sm:gap-y-1 p-1">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'pending_approval', label: 'Pending' },
                  { value: 'processing', label: 'Processing' },
                  { value: 'processed', label: 'Completed' },
                  { value: 'partially_processed', label: 'Partial' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'rejected', label: 'Rejected' },
                  { value: 'draft', label: 'Draft' },
                ].map(({ value, label }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="text-[12px] px-3.5 h-7 rounded-full shrink-0 data-[state=active]:bg-background data-[state=active]:shadow-[var(--shadow-sm)] data-[state=active]:font-semibold"
                  >
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search batches…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            illustration="coin"
            title={statusFilter === 'all' ? 'No payment batches yet' : `No ${statusLabel(statusFilter)?.toLowerCase() || statusFilter} batches`}
            description="Create a batch to pay contractors in bulk or use Quick Pay for one-off transfers."
            action={
              <Button onClick={() => navigate('/payments/new')}>
                <Plus className="mr-2 h-4 w-4" /> Create Batch
              </Button>
            }
          />
        ) : (
          /* UK bank style batch rows: rounded-2xl card per row, roomy
             padding, big right-aligned amount in display weight,
             pastel category chip on the left, accent strip for status. */
          <div className="space-y-2">
            {filtered.map((batch) => {
              const typeMeta = batch.batch_type ? BATCH_TYPE_META[batch.batch_type] : null;
              const isProcessing = batch.status === 'processing' || batch.status === 'partially_processed';
              const accentColor = isProcessing ? 'bg-blue-400'
                : batch.status === 'pending_approval' ? 'bg-amber-400'
                : batch.status === 'rejected' || batch.status === 'failed' ? 'bg-red-400'
                : batch.status === 'processed' ? 'bg-emerald-400'
                : 'bg-muted-foreground/30';
              return (
                <div
                  key={batch.id}
                  onClick={() => navigate(`/payments/${batch.id}`)}
                  className={cn(
                    'group relative flex items-center gap-4 rounded-2xl border border-border/60 bg-card px-5 py-4 cursor-pointer kd-transition overflow-hidden',
                    'hover:shadow-[var(--shadow-md)] hover:border-primary/20',
                    batch.status === 'draft' && 'opacity-80',
                  )}
                >
                  {/* Color accent strip */}
                  <span className={cn('absolute left-0 top-0 h-full w-1', accentColor)} />

                  {/* Type chip — Monzo-style soft pastel */}
                  {typeMeta && (
                    <div className="hidden sm:flex shrink-0">
                      <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold', typeMeta.bg, typeMeta.text)}>
                        {typeMeta.label}
                      </span>
                    </div>
                  )}

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-[15px] leading-snug truncate">{batch.name}</p>
                      {typeMeta && (
                        <span className={cn('sm:hidden inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', typeMeta.bg, typeMeta.text)}>
                          {typeMeta.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 text-[12px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {batch.beneficiary_count} {batch.beneficiary_count === 1 ? 'recipient' : 'recipients'}
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>Pay {formatDate(batch.payment_date)}</span>
                      <span className="hidden sm:inline text-muted-foreground/40">·</span>
                      <span className="hidden sm:inline">Created {formatDate(batch.created_at)}</span>
                    </div>
                  </div>

                  {/* Amount + status — big display amount on right,
                      Monzo-style. tabular-nums so digits align across rows. */}
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-[18px] tabular-nums leading-none tracking-tight">{formatNaira(batch.total_amount || 0)}</p>
                    <div className="mt-1.5 flex items-center justify-end gap-1.5">
                      <StatusBadge status={batch.status} size="sm" />
                      {isProcessing && (
                        <span className="flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                      )}
                    </div>
                  </div>

                  <ArrowRight className="shrink-0 h-4 w-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 kd-transition" />
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" size="sm" disabled={filtered.length < 1000} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmReconcile} onOpenChange={setConfirmReconcile}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconcile pending transfers?</AlertDialogTitle>
            <AlertDialogDescription>
              This re-checks every payment that has been stuck in "pending" for more than 1 hour.
              Use this if a payment seems stuck without ever reaching Paystack confirmation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={reconcileNow}>Run reconcile</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Payments;
