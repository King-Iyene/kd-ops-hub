import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  ArrowUpDown,
  CreditCard,
  Receipt,
  Zap,
  X,
  Copy,
  Check,
  Printer,
  FileDown,
  Landmark,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatDateTime, formatNaira, toIsoDate } from '@/lib/format';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';

interface Transaction {
  id: string;
  created_at: string;
  txn_type: 'payment_batch' | 'quick_pay' | 'expense';
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
}

type FilterTab = 'all' | 'quick_pay' | 'payment_batch' | 'expense';

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
  expense: Receipt,
};

const TYPE_COLOR: Record<string, string> = {
  payment_batch: 'bg-primary/10 text-primary border border-primary/30',
  quick_pay: 'bg-teal-500/10 text-teal-700 border border-teal-500/30',
  expense: 'bg-warning/10 text-warning border border-warning/30',
};


const typeLabel = (t: string) => {
  if (t === 'payment_batch') return 'Batch';
  if (t === 'quick_pay') return 'Quick Pay';
  if (t === 'expense') return 'Expense';
  return t.replace(/_/g, ' ');
};

import { statusLabel } from '@/components/ui-kit/StatusBadge';

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'quick_pay', label: 'Quick Pay' },
  { value: 'payment_batch', label: 'Batches' },
  { value: 'expense', label: 'Expenses' },
];

const Transactions = () => {
  usePageTitle('Transactions');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
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
      .order('created_at', { ascending: false });
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
    const q = search.trim().toLowerCase();
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
  }, [rows, search, typeFilter, categoryFilter, statusFilter, from, to]);

  const pagination = usePagination(filtered, 25);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, r) => sum + (r.amount_ngn || 0), 0),
    [filtered],
  );

  const exportCsv = async () => {
    const header = [
      'date',
      'type',
      'description',
      'category',
      'amount_ngn',
      'status',
      'reference',
      'bank_name',
      'account_number',
      'account_name',
      'receipt_url',
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
      r.account_number || '',
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

  const handlePrint = () => {
    window.print();
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
    if (r.txn_type === 'expense') {
      navigate('/expenses');
    } else {
      navigate(`/payments/${r.id}`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={`All financial activity across KDOps — ${rows.length.toLocaleString()} transactions`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button
              variant="outline"
              onClick={exportCsv}
              disabled={filtered.length === 0}
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
        }
      />

      {/* Paystack fee note */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 print:hidden">
        <Landmark className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Paystack transfer fees are deducted directly from your Paystack wallet per transfer. Fees vary by amount and bank —{' '}
          <button
            className="underline font-medium hover:opacity-80"
            onClick={() => window.open('https://paystack.com/ng/pricing', '_blank', 'noopener')}
          >
            view current Paystack pricing
          </button>{' '}
          or check your{' '}
          <button
            className="underline font-medium hover:opacity-80"
            onClick={() => window.open('https://dashboard.paystack.com/#/transfers', '_blank', 'noopener')}
          >
            Paystack dashboard
          </button>{' '}
          for a full fee breakdown per transaction.
        </span>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3 print:hidden">
        {(['quick_pay', 'payment_batch', 'expense'] as const).map((type) => {
          const count = rows.filter((r) => r.txn_type === type).length;
          const Icon = TYPE_ICON[type];
          const label = typeLabel(type);
          return (
            <Card
              key={type}
              className={cn(
                'cursor-pointer kd-transition',
                typeFilter === type && 'ring-2 ring-primary',
              )}
              onClick={() => {
                setTypeFilter((prev) => (prev === type ? 'all' : type));
                pagination.reset();
              }}
            >
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-lg font-bold">{count.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        {/* Filter bar */}
        <div className="p-4 border-b flex items-center gap-1 flex-wrap print:hidden">
          {FILTER_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={typeFilter === tab.value ? 'secondary' : 'ghost'}
              size="sm"
              className={cn(
                'rounded-full px-4',
                typeFilter === tab.value && 'font-semibold',
              )}
              onClick={() => {
                setTypeFilter(tab.value);
                pagination.reset();
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Secondary filters */}
        <div className="p-4 border-b flex items-center gap-2 flex-wrap print:hidden">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search reference, description, bank..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pagination.reset();
              }}
            />
          </div>
          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              pagination.reset();
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              pagination.reset();
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              pagination.reset();
            }}
            className="w-[150px]"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              pagination.reset();
            }}
            className="w-[150px]"
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>

        {/* Filtered summary */}
        {hasActiveFilters && (
          <div className="px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground flex items-center gap-4">
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
              icon={ArrowUpDown}
              title="No transactions found"
              description={
                hasActiveFilters
                  ? 'Try widening your filters or date range.'
                  : 'Transactions will appear here as payments and expenses are recorded.'
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((r) => {
                    const Icon = TYPE_ICON[r.txn_type] || ArrowUpDown;
                    return (
                      <TableRow
                        key={`${r.txn_type}-${r.id}`}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleRowClick(r)}
                      >
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatDate(r.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'font-medium text-[11px]',
                              TYPE_COLOR[r.txn_type],
                            )}
                          >
                            <Icon className="h-3 w-3 mr-1" />
                            {typeLabel(r.txn_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[280px]">
                          {r.txn_type === 'payment_batch' && (
                            <div>
                              <p className="font-medium truncate">{r.batch_name || r.description}</p>
                              {r.beneficiary_count != null && (
                                <p className="text-xs text-muted-foreground">
                                  {r.beneficiary_count} recipient{r.beneficiary_count !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          )}
                          {r.txn_type === 'quick_pay' && (
                            <p className="truncate">{r.description}</p>
                          )}
                          {r.txn_type === 'expense' && (
                            <div>
                              <p className="font-medium capitalize truncate">
                                {(r.category || '').replace(/_/g, ' ')}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{r.description}</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium currency whitespace-nowrap">
                          {formatNaira(r.amount_ngn)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={r.status} />
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
                            <span className="text-xs text-muted-foreground">—</span>
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
// Copyable reference
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
