import { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatNaira, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Loader2, Info, RefreshCw, AlertTriangle, Wallet } from 'lucide-react';
import { QuickPayDialog } from '@/components/QuickPay';
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { StatusBadge, statusLabel } from '@/components/ui-kit/StatusBadge';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
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
  }, [statusFilter, page]);

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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search batches..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {['draft', 'pending_approval', 'approved', 'funded', 'processing', 'processed', 'partially_processed', 'rejected'].map((k) => (
                  <SelectItem key={k} value={k}>{statusLabel(k)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No batches found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch Name</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead className="text-right">Beneficiaries</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((batch) => (
                    <TableRow key={batch.id} className="cursor-pointer" onClick={() => navigate(`/payments/${batch.id}`)}>
                      <TableCell className="font-medium">{batch.name}</TableCell>
                      <TableCell>{formatDate(batch.payment_date)}</TableCell>
                      <TableCell className="text-right">{batch.beneficiary_count}</TableCell>
                      <TableCell className="text-right currency">{formatNaira(batch.total_amount || 0)}</TableCell>
                      <TableCell>
                        <StatusBadge status={batch.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(batch.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <Button variant="outline" size="sm" disabled={filtered.length < 20} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Payments;
