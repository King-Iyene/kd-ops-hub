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
import { friendlyPaystackError, paystackTransferFee } from '@/lib/paystack';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime, formatNaira, toIsoDate, maskAccountNumber } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  is_manually_resolved: boolean | null;
  manual_resolution_method: string | null;
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

      {/* Summary strip — pure Mercury / Brex / Ramp:
          borderless tabs in a hairline-bordered surface, click-to-filter,
          big mono count, small uppercase label. No status dots
          (those are German). Holographic hover stays — it's a
          Mercury Treasury pattern, not a German one. */}
      <div className="rounded-lg border border-border/70 bg-card grid grid-cols-3 sm:divide-x divide-border/70 overflow-hidden print:hidden">
        {([
          { type: 'all' as const, label: 'All transactions', count: rows.length },
          { type: 'transfer' as const, label: 'Transfers',  count: rows.filter((r) => r.txn_type === 'transfer').length },
          { type: 'quick_pay' as const, label: 'Quick Pay', count: rows.filter((r) => r.txn_type === 'quick_pay').length },
        ]).map(({ type, label, count }) => {
          const isActive = typeFilter === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTypeFilter(type);
                pagination.reset();
              }}
              className={cn(
                'kd-holographic relative flex flex-col items-start px-4 py-3.5 text-left kd-transition',
                isActive ? 'bg-primary/[0.04]' : 'hover:bg-muted/30',
              )}
            >
              <div className="relative z-[2]">
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                  {label}
                </span>
                <span className={cn(
                  'mt-1.5 text-[20px] font-semibold tabular-nums font-mono leading-none tracking-tight block',
                  isActive && 'text-primary',
                )}>
                  {count.toLocaleString()}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Mercury/Brex/Ramp shell: hairline border on the wrapper,
          no card chrome, sticky filter strip at the top. The whole
          page reads as one ledger surface rather than a series of
          stacked cards. */}
      <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
        {/* Single combined filter strip — search front and centre,
            secondary filters tucked next to it. Drops one full row
            vs. the previous tab + filter split. */}
        <div className="px-3 py-2.5 border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 sticky top-0 z-10 flex items-center gap-2 flex-wrap print:hidden">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-[13px] bg-transparent border-border/60"
              placeholder="Search reference, beneficiary, bank…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); pagination.reset(); }}
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); pagination.reset(); }}>
            <SelectTrigger className="w-[140px] h-8 text-[12px] bg-transparent border-border/60">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pagination.reset(); }}>
            <SelectTrigger className="w-[120px] h-8 text-[12px] bg-transparent border-border/60">
              <SelectValue placeholder="Status" />
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
            className="w-[130px] h-8 text-[12px] bg-transparent border-border/60"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); pagination.reset(); }}
            className="w-[130px] h-8 text-[12px] bg-transparent border-border/60"
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-[12px]">
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Filtered totals — slim inline strip */}
        {hasActiveFilters && (
          <div className="px-3 py-1.5 border-b border-border/50 bg-muted/20 text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="tabular-nums">
              {filtered.length.toLocaleString()} match{filtered.length !== 1 ? 'es' : ''}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono font-semibold text-foreground tabular-nums">{formatNaira(totalAmount)} total</span>
          </div>
        )}

        <div className="p-0">
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
              {/* US bank style ledger table — Mercury / Brex / Ramp.
                  • All numerics font-mono tabular-nums right-aligned
                  • Hairline divide-y, no zebra
                  • Status as small dot + label, lowercase
                  • Beneficiary cell stacks name and bank · acc on one
                    very tight line so the row stays at ~36px
                  • Sticky header with backdrop blur
                  • Header in 9px uppercase tracking-[0.12em] */}
              <div className="hidden md:block">
                <table className="w-full">
                  <thead className="sticky top-12 z-10 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
                    <tr className="border-b border-border/50">
                      <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Date</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Beneficiary</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Reference</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Fee</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Duty</th>
                      <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Amount</th>
                      <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {pagination.slice.map((r) => {
                      // Fee resolution: webhook value → paystack_raw.fee
                      // → published schedule (succeeded only). Stamp duty
                      // is ₦50 on transfers ≥ ₦10K (FIRS pass-through).
                      const amount = Number(r.amount_ngn || 0);
                      const ledgerStatus = LEDGER_STATUS[r.status] || r.status;
                      const directFee = Number(r.paystack_fee_ngn || 0);
                      const rawFeeKobo = Number((r as any).paystack_raw?.fee || 0);
                      const fee = directFee > 0
                        ? directFee
                        : rawFeeKobo > 0 ? rawFeeKobo / 100
                        : ledgerStatus === 'succeeded' ? paystackTransferFee(amount)
                        : 0;
                      const stamp = ledgerStatus === 'succeeded' ? stampDutyForAmount(amount) : 0;
                      const f = r.rejection_reason ? friendlyPaystackError(r.rejection_reason) : null;
                      const refDisplay = r.reference && r.reference.length > 18
                        ? `${r.reference.slice(0, 12)}…${r.reference.slice(-4)}`
                        : (r.reference || '—');
                      const wasCancelled = r.is_manually_resolved
                        && (r.manual_resolution_method === 'cancelled'
                            || r.manual_resolution_method === 'voided');
                      const wasPaidExternally = r.is_manually_resolved && !wasCancelled;
                      // Subtle row-tint cue. Operator can see at a
                      // glance whether a row is failed (rose hairline)
                      // or succeeded (clean white) without looking at
                      // the status column. Pending stays neutral so
                      // the eye isn't drawn to in-flight items.
                      const rowTint = wasCancelled ? ''
                        : wasPaidExternally ? 'bg-emerald-50/30 hover:bg-emerald-50/50 dark:bg-emerald-950/10'
                        : ledgerStatus === 'failed' ? 'bg-rose-50/30 hover:bg-rose-50/50 dark:bg-rose-950/10'
                        : ledgerStatus === 'succeeded' ? 'hover:bg-muted/30'
                        : 'hover:bg-muted/30';
                      return (
                        <tr
                          key={`${r.txn_type}-${r.id}`}
                          className={cn(
                            'cursor-pointer kd-transition',
                            rowTint,
                            wasCancelled && 'opacity-55 hover:bg-muted/30',
                          )}
                          onClick={() => handleRowClick(r)}
                        >
                          <td className="px-3 py-2 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                            <span className="font-mono">{formatDate(r.created_at)}</span>
                            <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                              {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[13px] max-w-[260px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium truncate">{r.account_name || r.description || '—'}</span>
                              {f && ledgerStatus === 'failed' && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label="View failure reason"
                                      onClick={(e) => e.stopPropagation()}
                                      className="shrink-0 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                                    >
                                      <Info className="h-3 w-3" />
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
                              <p className="text-[10.5px] text-muted-foreground/70 truncate font-mono tracking-tight">
                                {r.bank_name} · {r.account_number || '—'}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground tracking-tight whitespace-nowrap">
                            {refDisplay}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums whitespace-nowrap">
                            {fee > 0 ? formatNaira(fee) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[11.5px] text-muted-foreground tabular-nums whitespace-nowrap">
                            {stamp > 0 ? formatNaira(stamp) : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-[13px] tabular-nums whitespace-nowrap">
                            {formatNaira(r.amount_ngn)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {/* Status column always shows the truthful
                                Paystack outcome (Failed / Succeeded /
                                Pending / Reversed). Manual resolution
                                does not overwrite the status because no
                                money changed direction at Paystack —
                                the operator just gave up on retrying
                                or paid externally. The resolution is
                                surfaced by a tiny right-aligned marker
                                so the audit trail stays intact without
                                lying about what happened on the rail. */}
                            <div className="flex items-center gap-2">
                              <LedgerStatusDot status={ledgerStatus} />
                              {wasCancelled && (
                                <span
                                  className="text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
                                  title={`Cancelled by operator${r.rejection_reason ? ` — ${r.rejection_reason}` : ''}`}
                                >
                                  · cancelled
                                </span>
                              )}
                              {wasPaidExternally && (
                                <span
                                  className="text-[9.5px] uppercase tracking-[0.08em] text-emerald-700/80"
                                  title={`Paid via another channel${r.rejection_reason ? ` — ${r.rejection_reason}` : ''}`}
                                >
                                  · paid externally
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile transactions list */}
              <div className="md:hidden p-3 space-y-2">
                {pagination.slice.map((r) => {
                  const Icon = TYPE_ICON[r.txn_type] || ArrowUpDown;
                  const recipient = r.account_name || r.description || '—';
                  const f = r.rejection_reason ? friendlyPaystackError(r.rejection_reason) : null;
                  const wasCancelled = r.is_manually_resolved
                    && (r.manual_resolution_method === 'cancelled'
                        || r.manual_resolution_method === 'voided');
                  const wasPaidExternally = r.is_manually_resolved && !wasCancelled;
                  return (
                    <MobileCard
                      key={`${r.txn_type}-${r.id}`}
                      onClick={() => handleRowClick(r)}
                      className={cn(wasCancelled && 'opacity-60')}
                      accentClassName={
                        wasCancelled ? 'bg-slate-400'
                        : wasPaidExternally ? 'bg-emerald-500'
                        : r.txn_type === 'quick_pay' ? 'bg-blue-500'
                        : 'bg-emerald-500'
                      }
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
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={r.status} size="sm" />
                          {wasCancelled && (
                            <span className="text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                              · cancelled
                            </span>
                          )}
                          {wasPaidExternally && (
                            <span className="text-[9.5px] uppercase tracking-[0.08em] text-emerald-700/80">
                              · paid externally
                            </span>
                          )}
                        </div>
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
        </div>
      </div>
    </div>
  );
};

export default Transactions;

// ---------------------------------------------------------------------------
// Ledger status dot — Mercury / Brex / Ramp style.
//   • Coloured 6px dot
//   • Sentence-case label (succeeded / pending / failed / refunded)
//   • text-[11px] muted-foreground for the label so the dot does the work
// ---------------------------------------------------------------------------

function LedgerStatusDot({ status }: { status: string }) {
  const config: Record<string, { label: string; dot: string; text: string }> = {
    succeeded: { label: 'Succeeded', dot: 'bg-emerald-500',  text: 'text-emerald-700' },
    pending:   { label: 'Pending',   dot: 'bg-amber-500',    text: 'text-amber-700' },
    failed:    { label: 'Failed',    dot: 'bg-red-500',      text: 'text-red-700' },
    reversed:  { label: 'Refunded',  dot: 'bg-slate-400',    text: 'text-slate-600' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11.5px] font-medium', c.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', c.dot)} />
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
