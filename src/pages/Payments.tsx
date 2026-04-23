import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, RefreshCw, AlertTriangle, Wallet, Clock, TrendingUp, Zap, ArrowRight, Users, Info } from 'lucide-react';
import { QuickPayDialog } from '@/components/QuickPay';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
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

const Payments = () => {
  usePageTitle('Payments');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [batches, setBatches] = useState<PaymentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(0);

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<string | null>(null);
  const [stats, setStats] = useState<BatchStats>({ pendingCount: 0, pendingAmount: 0, processingCount: 0, thisMonthAmount: 0 });

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('paystack-transfer', {
        body: { action: 'get_balance' },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || 'Failed to fetch balance');
      setBalance(data.data as BalanceData);
      setBalanceUpdatedAt(
        new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
      );
    } catch {
      // silently fail — balance is informational, not blocking
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    fetchBatches();
    fetchStats();
  }, [statusFilter, page]);

  const fetchStats = async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const [pendingRes, processingRes, monthRes] = await Promise.all([
      supabase
        .from('payment_batches')
        .select('total_amount')
        .eq('status', 'pending_approval'),
      supabase
        .from('payment_batches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'processing'),
      supabase
        .from('payment_batches')
        .select('total_amount')
        .eq('status', 'processed')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),
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
      .range(page * 20, (page + 1) * 20 - 1);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    const fetched = (data as PaymentBatch[]) || [];

    // Sync stale batch statuses: if a batch is processing/partially_processed
    // but all its items have settled, update the parent status.
    const stale = fetched.filter(
      (b) => b.status === 'processing' || b.status === 'partially_processed',
    );
    for (const b of stale) {
      const { data: items } = await supabase
        .from('batch_items')
        .select('status')
        .eq('batch_id', b.id);
      if (!items || items.length === 0) continue;
      const anyPending = items.some((r: any) => r.status === 'pending' || r.status === 'retry');
      const anyFailed = items.some((r: any) => r.status === 'failed');
      const correct = anyPending ? 'processing' : anyFailed ? 'partially_processed' : 'processed';
      if (correct !== b.status) {
        await supabase.from('payment_batches').update({ status: correct }).eq('id', b.id);
        b.status = correct;
      }
    }

    setBatches(fetched);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search) return batches;
    const s = search.toLowerCase();
    return batches.filter((b) => b.name.toLowerCase().includes(s));
  }, [batches, search]);

  const isLowBalance = balance !== null && balance.available < LOW_BALANCE_THRESHOLD;

  const batchTypeMeta: Record<string, { label: string; className: string }> = {
    contractor:      { label: 'Contractor',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    employee_salary: { label: 'Salary Run',    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    advance:         { label: 'Advance',       className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    prize:           { label: 'Bonus/Prize',   className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Payment Batches</h1>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Create and manage bulk payment batches to partners and contractors. Batches flow through draft → approval → funding → processing with a full audit trail.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="text-muted-foreground text-sm">Manage partner and contractor payments</p>
        </div>

        <div className="flex items-start gap-3 flex-wrap justify-end">
          {/* Paystack Balance Card */}
          <div
            className={cn(
              'rounded-lg border bg-card px-4 py-3 text-sm min-w-[240px] shadow-sm',
              isLowBalance && 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
            )}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Wallet className={cn('h-4 w-4', isLowBalance ? 'text-amber-600' : 'text-primary')} />
                <span className={cn('font-semibold text-xs uppercase tracking-wide', isLowBalance ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                  Paystack Balance
                </span>
              </div>
              <button
                onClick={fetchBalance}
                disabled={balanceLoading}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                aria-label="Refresh balance"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', balanceLoading && 'animate-spin')} />
              </button>
            </div>

            {balanceLoading && balance === null ? (
              <div className="space-y-2 py-0.5">
                <div className="h-8 w-40 bg-muted animate-pulse rounded" />
                <div className="h-3 w-28 bg-muted animate-pulse rounded" />
              </div>
            ) : (
              <>
                <p className={cn('text-2xl font-extrabold tracking-tight', isLowBalance ? 'text-amber-700 dark:text-amber-400' : 'text-foreground')}>
                  {balance ? formatNaira(balance.available) : '—'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {!isLowBalance && balance && (
                    <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                  )}
                  <p className="text-xs text-muted-foreground">Available for transfers</p>
                </div>
              </>
            )}

            {balanceUpdatedAt && (
              <p className="text-[11px] text-muted-foreground/50 mt-1">Last refreshed: {balanceUpdatedAt}</p>
            )}

            {isLowBalance && (
              <div className="flex items-start gap-1.5 mt-2 rounded-md bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">
                  Low balance — fund your Paystack account before processing payments
                </p>
              </div>
            )}

            <div className="mt-2.5 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => window.open('https://dashboard.paystack.com/#/balance/', '_blank')}
              >
                Fund Paystack Wallet
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => window.open('https://dashboard.paystack.com/#/transfers', '_blank')}
              >
                View Transactions &rarr;
              </Button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <QuickPayDialog />
            <Button onClick={() => navigate('/payments/new')}>
              <Plus className="mr-2 h-4 w-4" /> New Batch
            </Button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pending Approval</p>
                <p className="text-2xl font-bold mt-0.5">{stats.pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatNaira(stats.pendingAmount)}</p>
              </div>
              <div className="rounded-full bg-amber-100 dark:bg-amber-900/30 p-2.5">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Processing Now</p>
                <p className="text-2xl font-bold mt-0.5">{stats.processingCount}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active transfers</p>
              </div>
              <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2.5">
                <Zap className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Paid This Month</p>
                <p className="text-2xl font-bold mt-0.5">{formatNaira(stats.thisMonthAmount)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Completed batches</p>
              </div>
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-2.5">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status tabs + search */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <TabsList className="h-9 flex-wrap gap-y-1">
              <TabsTrigger value="all" className="text-xs px-3 py-1.5">All</TabsTrigger>
              <TabsTrigger value="pending_approval" className="text-xs px-3 py-1.5">Pending Approval</TabsTrigger>
              <TabsTrigger value="processing" className="text-xs px-3 py-1.5">Processing</TabsTrigger>
              <TabsTrigger value="processed" className="text-xs px-3 py-1.5">Completed</TabsTrigger>
              <TabsTrigger value="partially_processed" className="text-xs px-3 py-1.5">Partial</TabsTrigger>
              <TabsTrigger value="rejected" className="text-xs px-3 py-1.5">Rejected</TabsTrigger>
              <TabsTrigger value="draft" className="text-xs px-3 py-1.5">Draft</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search batches…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={statusFilter === 'all' ? 'No payment batches yet' : `No ${statusLabel(statusFilter)?.toLowerCase() || statusFilter} batches`}
            description="Create a batch to pay contractors in bulk or use Quick Pay for one-off transfers."
            action={
              <Button onClick={() => navigate('/payments/new')}>
                <Plus className="mr-2 h-4 w-4" /> Create Batch
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((batch) => {
              const typeMeta = batch.batch_type ? batchTypeMeta[batch.batch_type] : null;
              const isProcessing = batch.status === 'processing' || batch.status === 'partially_processed';
              return (
                <div
                  key={batch.id}
                  onClick={() => navigate(`/payments/${batch.id}`)}
                  className={cn(
                    'group relative flex items-center gap-4 rounded-xl border bg-card px-5 py-4 cursor-pointer transition-all duration-150',
                    'hover:shadow-md hover:border-primary/30 hover:-translate-y-px',
                    isProcessing && 'border-l-4 border-l-blue-400',
                    batch.status === 'pending_approval' && 'border-l-4 border-l-amber-400',
                    batch.status === 'rejected' && 'border-l-4 border-l-destructive',
                    batch.status === 'processed' && 'border-l-4 border-l-emerald-400',
                  )}
                >
                  {/* Type badge column */}
                  <div className="shrink-0 hidden sm:flex flex-col items-center gap-1 w-[88px]">
                    {typeMeta ? (
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none', typeMeta.className)}>
                        {typeMeta.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm leading-snug truncate">{batch.name}</p>
                      {typeMeta && (
                        <span className={cn('sm:hidden inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', typeMeta.className)}>
                          {typeMeta.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
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
                    <p className="font-bold text-base tabular-nums">{formatNaira(batch.total_amount || 0)}</p>
                    <div className="mt-1 flex items-center justify-end gap-1.5">
                      <StatusBadge status={batch.status} />
                      {isProcessing && (
                        <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
                      )}
                    </div>
                  </div>

                  <ArrowRight className="shrink-0 h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" size="sm" disabled={filtered.length < 20} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
};

export default Payments;
