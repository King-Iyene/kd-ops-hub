import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { errorMessage } from '@/lib/db-errors';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCompanySettings } from '@/queries';
import { useEffectiveRole } from '@/store/authStore';
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
  Plus, Search, RefreshCw, ArrowRight, Users,
} from 'lucide-react';
import { QuickPayDialog } from '@/components/QuickPay';
import { PaystackBalanceCard } from '@/components/PaystackBalanceCard';
import { FlutterwaveBalanceCard } from '@/components/FlutterwaveBalanceCard';
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
  is_quick_pay?: boolean | null;
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
  contractor:      { label: 'Contractor',   bg: 'bg-blue-50 dark:bg-blue-500/10',       text: 'text-blue-700 dark:text-blue-400' },
  employee_salary: { label: 'Salary Run',   bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  advance:         { label: 'Advance',      bg: 'bg-amber-50 dark:bg-amber-500/10',     text: 'text-amber-700 dark:text-amber-400' },
  prize:           { label: 'Bonus/Prize',  bg: 'bg-purple-50 dark:bg-purple-500/10',   text: 'text-purple-700 dark:text-purple-400' },
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
  const { data: companySettings } = useCompanySettings();
  const funding = useMemo<FundingDetails | null>(() => {
    const s = companySettings as any;
    if (!s) return null;
    return {
      bank: s.paystack_funding_bank ?? null,
      accountName: s.paystack_funding_account_name ?? null,
      accountNumber: s.paystack_funding_account_number ?? null,
    };
  }, [companySettings]);

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

    // Use the same server-side aggregate the KPI card uses so this tile
    // cannot silently truncate — the previous plain SELECT hit PostgREST's
    // default 1000-row cap if pending_approval ever crossed that count.
    // pending_payouts_summary excludes fully-cancelled batches, which is
    // the same rule the KPI applies; using COUNT(*) here on the same set
    // means both stat surfaces agree.
    const [summaryRes, pendingApprovalCountRes, processingRes, paidRes] = await Promise.all([
      supabase.rpc('pending_payouts_summary'),
      supabase.from('payment_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_approval')
        .is('deleted_at', null),
      supabase.from('payment_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'processing')
        .is('deleted_at', null),
      supabase.rpc('paid_total_in_period', { p_start: monthStartDate, p_end: monthEndDate }),
    ]);

    const summary = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data;
    setStats({
      pendingCount:    pendingApprovalCountRes.count || 0,
      pendingAmount:   Number((summary as any)?.total_amount ?? 0),
      processingCount: processingRes.count || 0,
      thisMonthAmount: Number(paidRes.data ?? 0),
    });
  };

  const fetchBatches = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payment_batches')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(page * 1000, (page + 1) * 1000 - 1);

      if (statusFilter !== 'all') {
        // 'pending' is a VIRTUAL tab covering the whole pre-dispatch pipeline
        // (pending_approval + pending_second_approval + approved + funded).
        // Anything else maps 1:1 to a single DB status value — the existing
        // .eq path is preserved for those. No payment-processing paths are
        // touched by this filter change; it's purely a client-side display
        // query against the read-only payment_batches list.
        if (statusFilter === 'pending') {
          query = query.in('status', [
            'pending_approval',
            'pending_second_approval',
            'approved',
            'funded',
          ]);
        } else {
          query = query.eq('status', statusFilter);
        }
      }

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
    } catch (err: unknown) {
      // Without this catch, any exception above (a network blip, a rejected
      // RPC call) leaves loading stuck true forever — the page shows an
      // endless skeleton with no error and no way to retry.
      toast({ title: 'Error', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const reconcileNow = async () => {
    if (reconciling) return;
    setConfirmReconcile(false);
    setReconciling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = { Authorization: `Bearer ${session?.access_token}` };
      // Global reconcile sweeps EVERY stuck item across all batches —
      // was previously Paystack-only, so any stuck Flutterwave item never
      // got reconciled from this button (only the server cron or
      // BatchDetail's per-batch Reconcile would catch it). Run both;
      // a failure in one provider's call must not block the other's.
      const [psResult, fwResult] = await Promise.allSettled([
        supabase.functions.invoke('paystack-reconciliation', { body: {}, headers: authHeader }),
        supabase.functions.invoke('flutterwave-reconciliation', { body: {}, headers: authHeader }),
      ]);

      const sum = { items_checked: 0, succeeded: 0, failed: 0, unchanged: 0 };
      let anyError: string | null = null;
      for (const r of [psResult, fwResult]) {
        if (r.status !== 'fulfilled') { anyError = anyError || (r.reason as any)?.message || 'Request failed'; continue; }
        const { data, error } = r.value;
        if (error) { anyError = anyError || error.message; continue; }
        if (data?.error) { anyError = anyError || data.error; continue; }
        sum.items_checked += data?.items_checked ?? 0;
        sum.succeeded += data?.succeeded ?? 0;
        sum.failed += data?.failed ?? 0;
        sum.unchanged += data?.unchanged ?? 0;
      }

      toast({
        title: 'Reconciliation complete',
        description: `Checked ${sum.items_checked} · ${sum.succeeded} succeeded · ${sum.failed} failed · ${sum.unchanged} unchanged${anyError ? ` (one provider errored: ${anyError})` : ''}`,
      });
      fetchBatches();
      fetchStats();
    } catch (err: unknown) {
      toast({ title: 'Reconciliation failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setReconciling(false);
    }
  };


  useEffect(() => { fetchBalance(); }, [fetchBalance]);
  useEffect(() => { fetchBatches(); fetchStats(); }, [statusFilter, page]);

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchBatches);

  // Operations is scoped at the DB (RLS) to contractor non-quick-pay batches.
  // RLS uses the JWT role, so a super_admin using "View as → Operations" would
  // still get every row back from the server — the simulation wouldn't match
  // what a real Operations user sees. Mirror the same predicate client-side
  // when the effective role is operations so the preview is accurate.
  const effectiveRole = useEffectiveRole();
  const filtered = useMemo(() => {
    let rows = batches;
    if (effectiveRole === 'operations') {
      rows = rows.filter(
        (b) => b.batch_type === 'contractor' && !b.is_quick_pay,
      );
    }
    if (!debouncedSearch) return rows;
    const s = debouncedSearch.toLowerCase();
    return rows.filter((b) => b.name.toLowerCase().includes(s));
  }, [batches, debouncedSearch, effectiveRole]);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="kd-display text-2xl font-bold tracking-tight kd-text-gradient">Payment Batches</h1>
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

          {/* Flutterwave balance card — always visible alongside Paystack so
              finance can see both wallets at a glance. When Flutterwave is the
              active provider it appears full-colour with a "● LIVE" pill;
              otherwise it renders dimmed with "○ Standby" so there's no
              confusion about which rail is currently paying. */}
          {canSeeWallet && (
            <FlutterwaveBalanceCard
              balanceHidden={balanceHidden}
              toggleBalanceHidden={toggleBalanceHidden}
            />
          )}

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
          Pure Mercury / Brex / Ramp — matching the Transactions
          module the operator picked. Hairline tiles, mono counts,
          local currency glyph (₦), no ISO prefix, no dots on the
          tile (those are kept on the rows below). Time-of-day
          holographic hover. */}
      <div className="rounded-lg border border-border/70 bg-card grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-border/70 overflow-hidden">
        {[
          {
            label: 'Pending approval',
            value: stats.pendingCount,
            sub: formatNaira(stats.pendingAmount),
          },
          {
            label: 'In processing',
            value: stats.processingCount,
            sub: 'Active transfers',
            pulse: stats.processingCount > 0,
          },
          {
            label: 'Paid this month',
            value: formatNaira(stats.thisMonthAmount),
            sub: 'Settled — Paystack + Flutterwave',
          },
        ].map(({ label, value, sub, pulse }) => (
          <div key={label} className="kd-holographic relative px-4 py-3.5 kd-transition">
            <div className="relative z-[2]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                {label}
                {pulse && <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-blue-500 animate-pulse" />}
              </p>
              <p className="mt-1.5 text-[20px] font-semibold tabular-nums tracking-tight text-foreground leading-none font-mono truncate">
                {value}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/80 tabular-nums truncate">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters + list ─────────────────────────────────────── */}
      <div className="space-y-3" id="batches-list">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          {/* Tabs scroll horizontally on mobile so they don't wrap into a
              second row that pushes the table down. Snap to each pill. */}
          {/* German tabs — uppercase compressed labels, square
              underline indicator, severe letter-spacing.
              Sparkasse and Deutsche Bank use this exact pattern. */}
          <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }} className="w-full sm:w-auto">
            <div className="-mx-1 overflow-x-auto kd-mobile-snap-x sm:overflow-visible">
              <TabsList className="h-8 bg-transparent border-b border-border rounded-none inline-flex w-max sm:flex sm:w-auto sm:flex-wrap p-0 gap-0">
                {[
                  { value: 'all', label: 'All' },
                  // Virtual multi-status filter covering the entire
                  // pre-dispatch pipeline (pending_approval,
                  // pending_second_approval, approved, funded).
                  // See fetchBatches for the exact status mapping.
                  { value: 'pending', label: 'Awaiting Dispatch' },
                  { value: 'processing', label: 'Processing' },
                  { value: 'processed', label: 'Done' },
                  { value: 'partially_processed', label: 'Partial' },
                  { value: 'failed', label: 'Failed' },
                  { value: 'cancelled', label: 'Cancelled' },
                  { value: 'rejected', label: 'Rejected' },
                  { value: 'draft', label: 'Draft' },
                ].map(({ value, label }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="text-[10.5px] font-semibold uppercase tracking-[0.14em] px-3 h-8 rounded-none shrink-0 border-b-2 border-transparent text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
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
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-[12px] rounded-md font-mono"
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
          /* Continental hybrid ledger row:
               • US base — hairline rows, status rail on the left,
                 dot+text status (StatusBadge outline variant)
               • German grafts — column headers, mono nums, ISO
                 currency code, UPPERCASE compressed status,
                 right-aligned amount column with NGN prefix
               • Swiss precision — 0.14em letter-spacing on
                 column headers, exact pixel rhythm
               • Swedish warmth — Inter sans for names + body
                 (default), softer rail (2px), draft rows fade
                 instead of looking dead. */
          <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
            {/* Column header — uppercase compressed, hairline rule. */}
            <div className="hidden md:grid grid-cols-[12px_1fr_180px_110px_140px_12px] gap-3 items-center px-3 h-8 border-b border-border/70 bg-muted/30">
              <span />
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">Description</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">Recipients · Pay date</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">Status</p>
              <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90 text-right">Amount</p>
              <span />
            </div>
            <div className="divide-y divide-border/50">
            {filtered.map((batch) => {
              const typeMeta = batch.batch_type ? BATCH_TYPE_META[batch.batch_type] : null;
              const isProcessing = batch.status === 'processing' || batch.status === 'partially_processed';
              const isFailed = batch.status === 'rejected' || batch.status === 'failed';
              const isPending = batch.status === 'pending_approval';
              const isProcessed = batch.status === 'processed';
              const isDraft = batch.status === 'draft';
              const railColor = isProcessing ? 'bg-blue-600'
                : isPending ? 'bg-amber-500'
                : isFailed ? 'bg-red-600'
                : isProcessed ? 'bg-emerald-600'
                : isDraft ? 'bg-slate-300'
                : 'bg-slate-400';
              const amountColor = isFailed ? 'text-red-700'
                : isProcessed ? 'text-emerald-700'
                : 'text-foreground';
              return (
                <Link
                  key={batch.id}
                  to={`/payments/${batch.id}`}
                  className={cn(
                    'group relative md:grid md:grid-cols-[12px_1fr_180px_110px_140px_12px] gap-3 items-center flex flex-wrap px-3 md:h-11 py-2.5 md:py-0 cursor-pointer kd-transition',
                    'hover:bg-muted/30',
                    isFailed && 'bg-red-50/20 dark:bg-red-950/10',
                    isPending && 'bg-amber-50/20 dark:bg-amber-950/10',
                    isDraft && 'opacity-60',
                  )}
                >
                  {/* Left status rail — 2px wide */}
                  <span className={cn('absolute left-0 top-0 h-full w-[2px]', railColor, isProcessing && 'animate-pulse')} />
                  <span />

                  {/* Description (col 2) */}
                  <div className="min-w-0 flex items-center gap-2">
                    <p className="font-medium text-[13px] text-foreground truncate">{batch.name}</p>
                    {typeMeta && (
                      <span className={cn('hidden lg:inline-flex items-center rounded px-1.5 py-0 text-[9.5px] font-semibold uppercase tracking-[0.06em] shrink-0', typeMeta.bg, typeMeta.text)}>
                        {typeMeta.label}
                      </span>
                    )}
                  </div>

                  {/* Recipients · Pay date (col 3) */}
                  <p className="hidden md:block text-[11px] text-muted-foreground tabular-nums font-mono tracking-tight">
                    {batch.beneficiary_count} · {formatDate(batch.payment_date)}
                  </p>

                  {/* Status (col 4) — outlined badge with breathing dot */}
                  <div className="hidden md:block">
                    <StatusBadge status={batch.status} variant="outline" size="sm" />
                  </div>

                  {/* Amount (col 5) — pure Mercury: ₦ glyph, mono, right-aligned */}
                  <div className="text-right ml-auto md:ml-0 shrink-0">
                    <p className={cn('font-mono font-semibold text-[13px] tabular-nums leading-none tracking-tight', amountColor)}>
                      {formatNaira(batch.total_amount || 0)}
                    </p>
                  </div>

                  {/* Mobile-only secondary line */}
                  <div className="md:hidden basis-full mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground tabular-nums font-mono">
                    <StatusBadge status={batch.status} variant="outline" size="sm" />
                    <span className="text-muted-foreground/40">·</span>
                    <span>{batch.beneficiary_count} · {formatDate(batch.payment_date)}</span>
                  </div>

                  <ArrowRight className="hidden md:block shrink-0 h-3 w-3 text-muted-foreground/30 group-hover:text-foreground kd-transition" />
                </Link>
              );
            })}
            </div>
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
