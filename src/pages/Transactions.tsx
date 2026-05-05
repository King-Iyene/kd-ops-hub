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
} from 'lucide-react';
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
  SelectItem,
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
  txn_type: 'payment_batch' | 'quick_pay' | 'charge';
  description: string;
  category: string;
  amount_ngn: number;
  status: string;
  reference: string;
  created_by: string | null;
  batch_name: string | null;
  beneficiary_count: number | null;
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

type FilterTab = 'all' | 'quick_pay' | 'payment_batch' | 'charge';

const STATUS_OPTIONS = [
  'draft',
  'pending',
  'pending_approval',
  'approved',
  'funded',
  'processing',
  'processed',
  'partially_processed',
  'rejected',
  'failed',
  'reversed',
] as const;

const TYPE_ICON: Record<string, typeof CreditCard> = {
  payment_batch: CreditCard,
  quick_pay: Zap,
  charge: Receipt,
};

const TYPE_COLOR: Record<string, string> = {
  payment_batch: 'bg-primary/10 text-primary border border-primary/30',
  quick_pay: 'bg-teal-500/10 text-teal-700 border border-teal-500/30',
  charge: 'bg-warning/10 text-warning border border-warning/30',
};

const typeLabel = (t: string) => {
  if (t === 'payment_batch') return 'Batch';
  if (t === 'quick_pay') return 'Quick Pay';
  if (t === 'charge') return 'Fee';
  return t.replace(/_/g, ' ');
};

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'quick_pay', label: 'Quick Pay' },
  { value: 'payment_batch', label: 'Batches' },
  { value: 'charge', label: 'Fees' },
];

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
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
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
        {(['quick_pay', 'payment_batch'] as const).map((type) => {
          const count = rows.filter((r) => r.txn_type === type).length;
          const Icon = TYPE_ICON[type];
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
                <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
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
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-right text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Receipt</TableHead>
                    <TableHead className="text-xs">Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((r) => {
                    const Icon = TYPE_ICON[r.txn_type] || ArrowUpDown;
                    return (
                      <TableRow
                        key={`${r.txn_type}-${r.id}`}
                        className="cursor-pointer hover:bg-muted/40 kd-transition"
                        onClick={() => handleRowClick(r)}
                      >
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatDateTime(r.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn('font-medium text-[11px]', TYPE_COLOR[r.txn_type])}
                          >
                            <Icon className="h-3 w-3 mr-1" />
                            {typeLabel(r.txn_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[240px]">
                          {r.txn_type === 'payment_batch' ? (
                            <div>
                              <p className="font-medium truncate">{r.batch_name || r.description}</p>
                              {r.beneficiary_count != null && (
                                <p className="text-xs text-muted-foreground">
                                  {r.beneficiary_count} recipient{r.beneficiary_count !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="truncate">{r.description}</p>
                          )}
                        </TableCell>
                        <TableCell className={cn('text-right font-semibold currency whitespace-nowrap text-sm', r.txn_type === 'charge' && 'text-warning')}>
                          {formatNaira(r.amount_ngn)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} size="sm" />
                        </TableCell>
                        <TableCell>
                          {r.receipt_url ? (
                            <a
                              href={r.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <FileDown className="h-3.5 w-3.5" /> View
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <CopyableRef value={r.reference} />
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
                  const description =
                    r.txn_type === 'payment_batch' ? (r.batch_name || r.description)
                    : r.description;
                  return (
                    <MobileCard
                      key={`${r.txn_type}-${r.id}`}
                      onClick={() => handleRowClick(r)}
                      accentClassName={r.txn_type === 'quick_pay' ? 'bg-blue-500' : 'bg-emerald-500'}
                    >
                      <MobileCardHeader>
                        <div className="min-w-0 flex-1">
                          <Badge variant="secondary" className={cn('font-medium text-[10px] mb-1 h-4 px-1.5', TYPE_COLOR[r.txn_type])}>
                            <Icon className="h-2.5 w-2.5 mr-1" />
                            {typeLabel(r.txn_type)}
                          </Badge>
                          <MobileCardTitle className="text-sm capitalize">{description || '—'}</MobileCardTitle>
                          {r.txn_type === 'payment_batch' && r.beneficiary_count != null && (
                            <p className="text-[11px] text-muted-foreground">
                              {r.beneficiary_count} recipient{r.beneficiary_count !== 1 ? 's' : ''}
                            </p>
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

                      {r.receipt_url && (
                        <a
                          href={r.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-primary"
                        >
                          <FileDown className="h-3 w-3" /> View receipt
                        </a>
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
