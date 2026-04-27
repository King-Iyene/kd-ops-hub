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
  Plus, Search, RefreshCw, AlertTriangle, Wallet, Clock,
  TrendingUp, Zap, ArrowRight, Users, Info,
} from 'lucide-react';
import { QuickPayDialog } from '@/components/QuickPay';
import { getPaystackBalance } from '@/lib/paystack';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePermission, useFeatureAccess } from '@/hooks/usePermission';
import { APPROVER_ROLES } from '@/lib/roles';
import { StatusBadge, statusLabel } from '@/components/ui-kit/StatusBadge';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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

const LOW_BALANCE_THRESHOLD = 50_000;

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
  const [batches, setBatches] = useState<PaymentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(0);

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<string | null>(null);
  const [stats, setStats] = useState<BatchStats>({
    pendingCount: 0, pendingAmount: 0, processingCount: 0, thisMonthAmount: 0,
  });

  const [reconciling, setReconciling] = useState(false);

  const fetchBalance = useCallback(async (isRetry = false) => {
    setBalanceLoading(true);
    if (!isRetry) setBalanceError(false);
    try {
      const result = await getPaystackBalance();
      setBalance(result);
      setBalanceError(false);
      setBalanceUpdatedAt(new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }));
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
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const [pendingRes, processingRes, monthRes] = await Promise.all([
      supabase.from('payment_batches').select('total_amount').eq('status', 'pending_approval'),
      supabase.from('payment_batches').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('payment_batches').select('total_amount').eq('status', 'processed').gte('created_at', monthStart).lte('created_at', monthEnd),
    ]);

    const pendingRows = (pendingRes.data || []) as { total_amount: number }[];
    setStats({
      pendingCount: pendingRows.length,
      pendingAmount: pendingRows.reduce((s, r) => s + (r.total_amount || 0), 0),
      processingCount: processingRes.count || 0,
      thisMonthAmount: ((monthRes.data || []) as { total_amount: number }[]).reduce((s, r) => s + (r.total_amount || 0), 0),
    });
  };

  const fetchBatches = async () => {
    setLoading(true);
    let query = supabase
      .from('payment_batches')
      .select('*')
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
        const correct = anyPending ? 'processing' : anyFailed ? 'partially_processed' : 'processed';
        if (correct !== b.status) {
          updates.push(
            supabase.from('payment_batches').update({ status: correct }).eq('id', b.id),
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
    if (!confirm(
      'Reconcile pending transfers with Paystack now?\n\n' +
      'This re-checks every payment that has been stuck in "pending" for ' +
      'more than 1 hour. Use this if a payment seems stuck without ever ' +
      'reaching Paystack confirmation.'
    )) return;
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

  const { lastUpdatedLabel, refresh: manualRefresh } = useAutoRefresh(fetchBatches);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return batches;
    const s = debouncedSearch.toLowerCase();
    return batches.filter((b) => b.name.toLowerCase().includes(s));
  }, [batches, debouncedSearch]);

  const isLowBalance = balance !== null && balance.available < LOW_BALANCE_THRESHOLD;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Payment Batches</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Manage bulk payments through draft → approval → funding → processing with a full audit trail.
              </TooltipContent>
            </Tooltip>
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
          {/* Paystack Balance Card — full-width on mobile, fixed width on desktop */}
          <div className={cn(
            'rounded-xl border bg-card px-4 py-3 w-full sm:w-auto sm:min-w-[220px] shadow-[var(--shadow-sm)]',
            isLowBalance ? 'border-amber-300 bg-amber-50' : 'border-border',
          )}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Wallet className={cn('h-3.5 w-3.5', isLowBalance ? 'text-amber-600' : 'text-primary')} />
                <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isLowBalance ? 'text-amber-600' : 'text-muted-foreground')}>
                  Paystack Balance
                </span>
              </div>
              <button
                onClick={fetchBalance}
                disabled={balanceLoading}
                className="text-muted-foreground/60 hover:text-foreground kd-transition disabled:opacity-40 rounded p-0.5"
                aria-label="Refresh balance"
              >
                <RefreshCw className={cn('h-3 w-3', balanceLoading && 'animate-spin')} />
              </button>
            </div>

            {balanceLoading && balance === null ? (
              <div className="space-y-1.5">
                <div className="h-7 w-36 kd-skeleton rounded" />
                <div className="h-2.5 w-24 kd-skeleton rounded" />
              </div>
            ) : balanceError ? (
              <div>
                <p className="text-sm text-muted-foreground">Could not load balance</p>
                <button
                  onClick={() => fetchBalance()}
                  className="text-[11px] text-primary hover:underline mt-0.5"
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                <p className={cn('text-xl font-extrabold tracking-tight kd-stat-number', isLowBalance ? 'text-amber-700' : 'text-foreground')}>
                  {balance ? formatNaira(balance.available) : '—'}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full', isLowBalance ? 'bg-amber-500' : 'bg-emerald-500')} />
                  <p className="text-[11px] text-muted-foreground">Available for transfers</p>
                </div>
              </>
            )}

            {balanceUpdatedAt && (
              <p className="text-[10px] text-muted-foreground/40 mt-1.5">Updated {balanceUpdatedAt}</p>
            )}

            {isLowBalance && (
              <div className="flex items-start gap-1.5 mt-2 rounded-lg bg-amber-100 px-2.5 py-2">
                <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 leading-snug">
                  Low balance — fund before processing
                </p>
              </div>
            )}

            <div className="mt-2.5 flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] px-2"
                onClick={() => window.open('https://dashboard.paystack.com/#/balance/', '_blank')}>
                Fund Wallet
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-7 text-[11px] px-2"
                onClick={() => window.open('https://dashboard.paystack.com/#/transfers', '_blank')}>
                Transfers →
              </Button>
            </div>
          </div>

          {/* Action buttons — full-width row on mobile so taps are easy */}
          <div className="flex gap-2 w-full sm:w-auto flex-wrap">
            {canQuickPay && <QuickPayDialog />}
            {canQuickPay && (
              <Button
                variant="outline"
                onClick={reconcileNow}
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

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: 'Pending Approval',
            value: stats.pendingCount,
            sub: formatNaira(stats.pendingAmount),
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-50 border-amber-200',
            accent: 'border-l-amber-400',
          },
          {
            label: 'Processing Now',
            value: stats.processingCount,
            sub: 'Active transfers',
            icon: Zap,
            color: 'text-blue-600',
            bg: 'bg-blue-50 border-blue-200',
            accent: 'border-l-blue-400',
          },
          {
            label: 'Paid This Month',
            value: formatNaira(stats.thisMonthAmount),
            sub: 'Completed batches',
            icon: TrendingUp,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50 border-emerald-200',
            accent: 'border-l-emerald-400',
          },
        ].map(({ label, value, sub, icon: Icon, color, bg, accent }) => (
          <div key={label} className={cn('rounded-xl border border-l-4 px-4 py-3', bg, accent)}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className={cn('text-2xl font-bold mt-0.5 kd-stat-number', color)}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
              <div className={cn('rounded-full p-2.5', bg)}>
                <Icon className={cn('h-5 w-5', color)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters + list ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <TabsList className="h-8 flex-wrap gap-y-1">
              {[
                { value: 'all', label: 'All' },
                { value: 'pending_approval', label: 'Pending' },
                { value: 'processing', label: 'Processing' },
                { value: 'processed', label: 'Completed' },
                { value: 'partially_processed', label: 'Partial' },
                { value: 'rejected', label: 'Rejected' },
                { value: 'draft', label: 'Draft' },
              ].map(({ value, label }) => (
                <TabsTrigger key={value} value={value} className="text-xs px-3 h-6">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
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
          <div className="space-y-1.5">
            {filtered.map((batch) => {
              const typeMeta = batch.batch_type ? BATCH_TYPE_META[batch.batch_type] : null;
              const isProcessing = batch.status === 'processing' || batch.status === 'partially_processed';
              return (
                <div
                  key={batch.id}
                  onClick={() => navigate(`/payments/${batch.id}`)}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl border bg-card px-4 py-2.5 cursor-pointer kd-transition',
                    'hover:shadow-[var(--shadow-md)] hover:border-primary/20 hover:-translate-y-px',
                    isProcessing && 'border-l-[3px] border-l-blue-400',
                    batch.status === 'pending_approval' && 'border-l-[3px] border-l-amber-400',
                    batch.status === 'rejected' && 'border-l-[3px] border-l-red-400',
                    batch.status === 'processed' && 'border-l-[3px] border-l-emerald-400',
                    batch.status === 'draft' && 'opacity-80',
                  )}
                >
                  {/* Type chip */}
                  {typeMeta && (
                    <div className="hidden sm:flex shrink-0">
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', typeMeta.bg, typeMeta.text)}>
                        {typeMeta.label}
                      </span>
                    </div>
                  )}

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm leading-snug truncate">{batch.name}</p>
                      {typeMeta && (
                        <span className={cn('sm:hidden inline-flex items-center rounded-full px-2 py-0 text-[10px] font-medium', typeMeta.bg, typeMeta.text)}>
                          {typeMeta.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {batch.beneficiary_count} {batch.beneficiary_count === 1 ? 'beneficiary' : 'beneficiaries'}
                      </span>
                      <span>Pay date: {formatDate(batch.payment_date)}</span>
                      <span className="hidden sm:inline">Created {formatDate(batch.created_at)}</span>
                    </div>
                  </div>

                  {/* Amount + status */}
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-sm tabular-nums">{formatNaira(batch.total_amount || 0)}</p>
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      <StatusBadge status={batch.status} size="sm" />
                      {isProcessing && (
                        <span className="flex h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                      )}
                    </div>
                  </div>

                  <ArrowRight className="shrink-0 h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary kd-transition" />
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
    </div>
  );
};

export default Payments;
