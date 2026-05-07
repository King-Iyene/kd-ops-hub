import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Search,
  Download,
  ArrowUpDown,
  CreditCard,
  Zap,
  Receipt,
  X,
  Copy,
  Check,
  Printer,
  FileDown,
  Info,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { friendlyPaystackError } from '@/lib/paystack';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime, formatNaira, toIsoDate, maskAccountNumber } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import {
  MobileCard,
  MobileCardHeader,
  MobileCardTitle,
  MobileCardMeta,
  MobileCardRow,
} from '@/components/ui-kit/MobileCard';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { statusLabel } from '@/components/ui-kit/StatusBadge';

interface Transaction {
  id: string;
  created_at: string;
  txn_type: 'transfer' | 'quick_pay';
  description: string;
  category: string;
  amount_ngn: number;
  paystack_fee_ngn: number | null;
  status: string;
  reference: string;
  created_by: string | null;
  batch_name: string | null;
  beneficiary_count: number | null;
  succeeded_count: number | null;
  failed_count: number | null;
  payment_date: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  notes: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  receipt_url: string | null;
  parent_batch_id: string | null;
}

// Item-level ledger types — every row is an actual money movement.
//   transfer  = a regular batch_item dispatched to Paystack
//   quick_pay = a quick_pay batch's single item
type FilterTab = 'all' | 'quick_pay' | 'transfer';

// Only the four real outcomes a transfer can have. No more
// draft / approved / funded / partial — those are batch-lifecycle states
// and live on the Payments module, not in the transaction ledger.
const STATUS_OPTIONS = [
  { value: 'succeeded', label: 'Successful' },
  { value: 'pending',   label: 'Pending' },
  { value: 'failed',    label: 'Failed' },
  { value: 'reversed',  label: 'Refunded' },
] as const;

// Map a raw item status onto one of the four ledger outcomes for filtering.
const LEDGER_STATUS: Record<string, string> = {
  succeeded: 'succeeded',
  processed: 'succeeded',
  pending:   'pending',
  processing:'pending',
  retry:     'pending',
  failed:    'failed',
  rejected:  'failed',
  reversed:  'reversed',
  refunded:  'reversed',
};

const TYPE_ICON: Record<string, typeof CreditCard> = {
  transfer: CreditCard,
  quick_pay: Zap,
};

const TYPE_COLOR: Record<string, string> = {
  transfer: 'bg-primary/10 text-primary border border-primary/30',
  quick_pay: 'bg-teal-500/10 text-teal-700 border border-teal-500/30',
};

const typeLabel = (t: string) => {
  if (t === 'transfer') return 'Transfer';
  if (t === 'quick_pay') return 'Quick Pay';
  return t.replace(/_/g, ' ');
};

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'transfer', label: 'Transfers' },
  { value: 'quick_pay', label: 'Quick Pay' },
];

// Stamp duty: ₦50 on every transfer ≥ ₦10,000 (Nigeria Tax Act 2025).
// Pass-through to FIRS — Paystack collects this on every successful
// transfer at this band. Deterministic, so we surface it client-side.
const stampDutyForAmount = (n: number) => (n >= 10_000 ? 50 : 0);

const Transactions = () => {
  usePageTitle('Transactions');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [typeFilter, setTypeFilter] = useState<FilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) {
      console.error('[transactions] view error:', error.message);
      setRows([]);
    } else {
      setRows((data as Transaction[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.category) s.add(r.category);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const fromMs = from ? new Date(from).getTime() : -Infinity;
    const toMs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.txn_type !== typeFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (statusFilter !== 'all') {
        // Map raw item status onto its ledger outcome before comparing —
        // 'processing' filters under 'pending', 'rejected' under 'failed', etc.
        if (LEDGER_STATUS[r.status] !== statusFilter) return false;
      }
      const t = r.created_at ? new Date(r.created_at).getTime() : 0;
      if (t < fromMs || t > toMs) return false;
      if (!q) return true;
      return (
        (r.reference || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q) ||
        typeLabel(r.txn_type).toLowerCase().includes(q) ||
        (r.bank_name || '').toLowerCase().includes(q) ||
        (r.account_name || '').toLowerCase().includes(q) ||
        (r.batch_name || '').toLowerCase().includes(q)
      );
    });
  }, [rows, debouncedSearch, typeFilter, categoryFilter, statusFilter, from, to]);

  const pagination = usePagination(filtered, 25);

  // Lazy-backfill paystack_fee_ngn for any succeeded transfer on the
  // current page that's missing one. Same flow as the receipt's
  // backfill — calls verify_transfer, persists the fee back to
  // batch_items. Limited to the visible 25 rows so we don't fan out
  // hundreds of requests on first load. Fires once per row id; the
  // ref-set guards against re-firing across re-renders.
  const backfilledRefs = useRef<Set<string>>(new Set());
  useEffect(() => {
    const candidates = pagination.slice.filter((r) => {
      const ledger = LEDGER_STATUS[r.status] || r.status;
      // Only call verify_transfer with a real Paystack-shaped reference.
      // The transactions_view falls back to the item UUID when no ref is
      // recorded — a UUID would 404 and waste the round-trip.
      const ref = r.reference || '';
      const looksLikePsRef = /^(kdops_|TRF_)/i.test(ref);
      return ledger === 'succeeded'
        && (!r.paystack_fee_ngn || Number(r.paystack_fee_ngn) === 0)
        && looksLikePsRef
        && !backfilledRefs.current.has(r.id);
    });
    if (candidates.length === 0) return;
    candidates.forEach((r) => backfilledRefs.current.add(r.id));
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      // Sequential to avoid hammering Paystack — these are diagnostic
      // backfills, not on the critical path. Each call ~250ms.
      for (const r of candidates) {
        if (cancelled) break;
        try {
          const { data, error } = await supabase.functions.invoke('paystack-transfer', {
            body: { action: 'verify_transfer', reference: r.reference },
            headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
          });
          if (error) continue;
          const d: any = data;
          const feeNgn = Number(d?.fee_ngn || 0)
            || (Number(d?.raw?.fee || 0) > 0 ? Number(d.raw.fee) / 100 : 0);
          if (feeNgn > 0) {
            await supabase.from('batch_items').update({ paystack_fee_ngn: feeNgn }).eq('id', r.id);
            if (!cancelled) {
              setRows((prev) => prev.map((row) =>
                row.id === r.id ? { ...row, paystack_fee_ngn: feeNgn } : row,
              ));
            }
          }
        } catch { /* silent */ }
      }
    })();
    return () => { cancelled = true; };
  }, [pagination.slice]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.amount_ngn || 0), 0),
    [filtered],
  );

  const exportCsv = async () => {
    const header = [
      'date', 'type', 'description', 'category', 'amount_ngn',
      'status', 'reference', 'bank_name', 'account_number', 'account_name', 'receipt_url',
    ];
    const data = filtered.map((r) => [
      r.created_at || '',
      typeLabel(r.txn_type),
      r.description,
      (r.category || '').replace(/_/g, ' '),
      r.amount_ngn,
      statusLabel(r.status),
      r.reference,
      r.bank_name || '',
      maskAccountNumber(r.account_number) || '',
      r.account_name || '',
      r.receipt_url || '',
    ]);
    downloadCsv(
      `kdops-transactions-${toIsoDate(new Date())}.csv`,
      toCsv(header, data),
    );
    await logAudit(
      'report_exported',
      `Transactions exported (${filtered.length} rows, ${formatNaira(totalAmount)})`,
      profile,
    );
    toast({ title: 'Transactions exported' });
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setStatusFilter('all');
    setFrom('');
    setTo('');
    pagination.reset();
  };

  const hasActiveFilters =
    search || typeFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all' || from || to;

  const handleRowClick = (r: Transaction) => {
    navigate(`/payments/${r.parent_batch_id || r.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={`All financial activity across KDOps — ${rows.length.toLocaleString()} transactions`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Summary strip — single column on phones, 2 cols on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 print:hidden">
        {(['quick_pay', 'transfer'] as const).map((type) => {
          const count = rows.filter((r) => r.txn_type === type).length;
          const Icon = TYPE_ICON[type] || ArrowUpDown;
          return (
            <div
              key={type}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setTypeFilter((prev) => (prev === type ? 'all' : type));
                  pagination.reset();
                }
              }}
              className={cn(
                'rounded-xl border bg-card px-4 py-3 cursor-pointer kd-transition shadow-[var(--shadow-sm)]',
                typeFilter === type
                  ? 'border-primary/40 bg-primary/5 ring-2 ring-primary/20'
                  : 'hover:border-primary/20 hover:shadow-[var(--shadow-md)]',
              )}
              onClick={() => {
                setTypeFilter((prev) => (prev === type ? 'all' : type));
                pagination.reset();
              }}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn('rounded-lg p-2', TYPE_COLOR[type])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-none">{count.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{typeLabel(type)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Card>
        {/* Filter tabs */}
        <div className="p-4 border-b flex items-center gap-1 flex-wrap print:hidden">
          {FILTER_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={typeFilter === tab.value ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('rounded-full px-4', typeFilter === tab.value && 'font-semibold')}
              onClick={() => {
                setTypeFilter(tab.value);
                pagination.reset();
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Secondary filters — search full-width on mobile, others reflow */}
        <div className="p-3 sm:p-4 border-b flex items-center gap-2 flex-wrap print:hidden">
          <div className="relative w-full sm:flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-10 sm:h-9"
              placeholder="Search reference, description, bank..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); pagination.reset(); }}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); pagination.reset(); }}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[180px] h-10 sm:h-9">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pagination.reset(); }}>
            <SelectTrigger className="flex-1 sm:flex-initial sm:w-[160px] h-10 sm:h-9">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); pagination.reset(); }}
            className="flex-1 sm:flex-initial sm:w-[150px] h-10 sm:h-9"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); pagination.reset(); }}
            className="flex-1 sm:flex-initial sm:w-[150px] h-10 sm:h-9"
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 sm:h-9">
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Filtered totals */}
        {hasActiveFilters && (
          <div className="px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
            <span>
              {filtered.length.toLocaleString()} transaction{filtered.length !== 1 ? 's' : ''} matched
            </span>
            <span className="font-medium">{formatNaira(totalAmount)} total</span>
          </div>
        )}

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={10} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="satellite"
              title="No transactions found"
              description={
                hasActiveFilters
                  ? 'Try widening your filters or date range.'
                  : 'Transactions will appear here as payment batches and transfers are recorded.'
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 hover:bg-background/60">
                    <TableHead className="text-right text-xs">Amount</TableHead>
                    <TableHead className="text-right text-xs">Transfer fee</TableHead>
                    <TableHead className="text-right text-xs">Stamp Duty</TableHead>
                    <TableHead className="text-xs">Beneficiary</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Channel</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((r) => {
                    // Transfer fee comes straight from Paystack — captured by
                    // the reconciliation edge function (`fee_charged` in kobo)
                    // and stored as paystack_fee_ngn. We do NOT calculate
                    // locally any more: Paystack's fee already includes VAT
                    // per FIRS rules, so a derived "fee × 7.5%" line was
                    // double-counting. Stamp duty (₦50 on transfers ≥ ₦10K)
                    // is a deterministic FIRS pass-through that Paystack
                    // collects on every successful transfer, so we still
                    // surface that as its own column.
                    const amount = Number(r.amount_ngn || 0);
                    const ledgerStatus = LEDGER_STATUS[r.status] || r.status;
                    const fee = Number(r.paystack_fee_ngn || 0);
                    const stamp = ledgerStatus === 'succeeded' ? stampDutyForAmount(amount) : 0;
                    const f = r.rejection_reason ? friendlyPaystackError(r.rejection_reason) : null;
                    return (
                      <TableRow
                        key={`${r.txn_type}-${r.id}`}
                        className="cursor-pointer hover:bg-muted/40 kd-transition"
                        onClick={() => handleRowClick(r)}
                      >
                        <TableCell className="text-right font-semibold currency whitespace-nowrap text-sm">
                          {formatNaira(r.amount_ngn)}
                        </TableCell>
                        <TableCell className="text-right currency text-xs text-muted-foreground whitespace-nowrap">
                          {fee > 0 ? formatNaira(fee) : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell className="text-right currency text-xs text-muted-foreground whitespace-nowrap">
                          {stamp > 0 ? formatNaira(stamp) : <span className="text-muted-foreground/40">—</span>}
                        </TableCell>
                        <TableCell className="text-sm max-w-[220px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium truncate uppercase tracking-tight">{r.account_name || r.description}</span>
                            {f && ledgerStatus === 'failed' && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="View failure reason"
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent side="right" className="w-72 text-xs" onClick={(e) => e.stopPropagation()}>
                                  <p className="font-semibold mb-1 text-destructive">{f.title}</p>
                                  <p className="text-muted-foreground mb-2">{f.hint}</p>
                                  {f.hint !== r.rejection_reason && (
                                    <p className="font-mono text-[10px] text-muted-foreground/80 bg-muted/50 rounded px-1.5 py-1 break-all">
                                      <span className="opacity-60">Paystack: </span>{r.rejection_reason}
                                    </p>
                                  )}
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          {r.bank_name && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {r.bank_name} · <span className="font-mono">{r.account_number || '—'}</span>
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(r.created_at)}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 border border-blue-200/80">WEB</span>
                        </TableCell>
                        <TableCell>
                          <LedgerStatusBadge status={ledgerStatus} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>

              {/* Mobile transactions list */}
              <div className="md:hidden p-3 space-y-2">
                {pagination.slice.map((r) => {
                  const Icon = TYPE_ICON[r.txn_type] || ArrowUpDown;
                  const recipient = r.account_name || r.description || '—';
                  const f = r.rejection_reason ? friendlyPaystackError(r.rejection_reason) : null;
                  return (
                    <MobileCard
                      key={`${r.txn_type}-${r.id}`}
                      onClick={() => handleRowClick(r)}
                      accentClassName={r.txn_type === 'quick_pay' ? 'bg-blue-500' : r.txn_type === 'charge' ? 'bg-amber-500' : 'bg-emerald-500'}
                    >
                      <MobileCardHeader>
                        <div className="min-w-0 flex-1">
                          <Badge variant="secondary" className={cn('font-medium text-[10px] mb-1 h-4 px-1.5', TYPE_COLOR[r.txn_type])}>
                            <Icon className="h-2.5 w-2.5 mr-1" />
                            {typeLabel(r.txn_type)}
                          </Badge>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MobileCardTitle className="text-sm capitalize truncate">{recipient}</MobileCardTitle>
                            {f && r.status === 'failed' && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="View failure reason"
                                    onClick={(e) => e.stopPropagation()}
                                    className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent side="bottom" className="w-72 text-xs" onClick={(e) => e.stopPropagation()}>
                                  <p className="font-semibold mb-1 text-destructive">{f.title}</p>
                                  <p className="text-muted-foreground mb-2">{f.hint}</p>
                                  {f.hint !== r.rejection_reason && (
                                    <p className="font-mono text-[10px] text-muted-foreground/80 bg-muted/50 rounded px-1.5 py-1 break-all">
                                      <span className="opacity-60">Paystack: </span>{r.rejection_reason}
                                    </p>
                                  )}
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          {r.bank_name && (
                            <p className="text-[11px] text-muted-foreground">
                              {r.bank_name} · <span className="font-mono">{r.account_number || '—'}</span>
                            </p>
                          )}
                          {r.batch_name && r.txn_type !== 'quick_pay' && (
                            <p className="text-[11px] text-muted-foreground/80">from {r.batch_name}</p>
                          )}
                        </div>
                        <MobileCardMeta className={cn('currency text-base', r.txn_type === 'charge' && 'text-warning')}>
                          {formatNaira(r.amount_ngn)}
                        </MobileCardMeta>
                      </MobileCardHeader>

                      <div className="flex items-center justify-between gap-2 text-xs">
                        <StatusBadge status={r.status} size="sm" />
                        <span className="text-muted-foreground">{formatDate(r.created_at)}</span>
                      </div>

                      {r.reference && (
                        <MobileCardRow label="Reference">
                          <CopyableRef value={r.reference} />
                        </MobileCardRow>
                      )}
                    </MobileCard>
                  );
                })}
              </div>

              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={pagination.pageSize}
                onPrev={pagination.prev}
                onNext={pagination.next}
                hasPrev={pagination.hasPrev}
                hasNext={pagination.hasNext}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Transactions;

// ---------------------------------------------------------------------------
// Ledger status badge — Paystack-dashboard style: SUCCESSFUL / PENDING /
// FAILED / REFUNDED. Uppercase pill with high-contrast colour.
// ---------------------------------------------------------------------------

function LedgerStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string; ring: string }> = {
    succeeded: { label: 'SUCCESSFUL', bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-1 ring-inset ring-emerald-300/60' },
    pending:   { label: 'PENDING',    bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-1 ring-inset ring-amber-300/60' },
    failed:    { label: 'FAILED',     bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-1 ring-inset ring-red-300/60' },
    reversed:  { label: 'REFUNDED',   bg: 'bg-slate-100',  text: 'text-slate-600',   ring: 'ring-1 ring-inset ring-slate-300/60' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', c.bg, c.text, c.ring)}>
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Copyable reference chip
// ---------------------------------------------------------------------------

function CopyableRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const display = value && value.length > 12 ? `${value.slice(0, 8)}...` : (value || '—');

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 text-muted-foreground font-mono text-xs hover:text-foreground transition-colors max-w-[140px]"
      title={`Click to copy: ${value}`}
    >
      <span className="truncate">{display}</span>
      {copied ? (
        <Check className="h-3 w-3 text-success shrink-0" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-50" />
      )}
    </button>
  );
}
