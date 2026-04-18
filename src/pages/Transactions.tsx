import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Download,
  ArrowUpDown,
  CreditCard,
  Receipt,
  Zap,
  ArrowRightLeft,
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
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  created_at: string;
  txn_type: 'payment_batch' | 'quick_pay' | 'transfer' | 'expense';
  description: string;
  category: string;
  amount_ngn: number;
  status: string;
  reference: string;
  created_by: string | null;
  contractor_id: string | null;
  employee_id: string | null;
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

const TXN_TYPES = [
  { value: 'payment_batch', label: 'Payment Batch' },
  { value: 'quick_pay', label: 'Quick Pay' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'expense', label: 'Expense' },
] as const;

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
  transfer: ArrowRightLeft,
  expense: Receipt,
};

const TYPE_COLOR: Record<string, string> = {
  payment_batch: 'bg-primary/10 text-primary border border-primary/30',
  quick_pay: 'bg-accent/15 text-accent-foreground border border-accent/40',
  transfer: 'bg-info/10 text-info border border-info/30',
  expense: 'bg-warning/10 text-warning border border-warning/30',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  pending: 'bg-warning/10 text-warning',
  pending_approval: 'bg-warning/10 text-warning',
  pending_second_approval: 'bg-orange-100 text-orange-700',
  approved: 'bg-success/10 text-success',
  funded: 'bg-info/10 text-info',
  processing: 'bg-info/10 text-info',
  processed: 'bg-success/10 text-success',
  partially_processed: 'bg-accent/15 text-accent-foreground',
  rejected: 'bg-destructive/10 text-destructive',
  failed: 'bg-destructive/10 text-destructive',
  reversed: 'bg-destructive/10 text-destructive',
};

const typeLabel = (t: string) =>
  TXN_TYPES.find((x) => x.value === t)?.label || t.replace(/_/g, ' ');

const statusLabel = (s: string) => s.replace(/_/g, ' ');

const Transactions = () => {
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<Transaction | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [batchRes, itemsRes, expenseRes] = await Promise.all([
      supabase
        .from('payment_batches')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('batch_items')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    const txns: Transaction[] = [];

    for (const pb of (batchRes.data || []) as any[]) {
      txns.push({
        id: pb.id,
        created_at: pb.created_at,
        txn_type: pb.is_quick_pay ? 'quick_pay' : 'payment_batch',
        description: pb.payment_description || pb.name || 'Payment batch',
        category: pb.payment_category || 'contractor_payment',
        amount_ngn: pb.total_amount || 0,
        status: pb.status,
        reference: pb.id,
        created_by: pb.created_by,
        contractor_id: null,
        employee_id: null,
        batch_name: pb.name,
        beneficiary_count: pb.beneficiary_count,
        payment_date: pb.payment_date,
        approved_by: pb.approved_by,
        rejection_reason: pb.rejection_reason,
        notes: pb.notes,
        bank_name: null,
        account_number: null,
        account_name: null,
        receipt_url: null,
      });
    }

    for (const bi of (itemsRes.data || []) as any[]) {
      txns.push({
        id: bi.id,
        created_at: bi.created_at,
        txn_type: 'transfer',
        description: bi.full_name || 'Transfer',
        category: 'contractor_payment',
        amount_ngn: bi.amount_ngn || 0,
        status:
          bi.status === 'succeeded'
            ? 'processed'
            : bi.status === 'failed'
            ? 'failed'
            : bi.status === 'retry'
            ? 'processing'
            : 'pending',
        reference: bi.paystack_reference || bi.reference || bi.id,
        created_by: null,
        contractor_id: bi.contractor_id,
        employee_id: null,
        batch_name: null,
        beneficiary_count: null,
        payment_date: null,
        approved_by: null,
        rejection_reason: bi.failure_reason,
        notes: null,
        bank_name: bi.bank_name || null,
        account_number: bi.account_number || null,
        account_name: bi.full_name || null,
        receipt_url: null,
      });
    }

    for (const e of (expenseRes.data || []) as any[]) {
      txns.push({
        id: e.id,
        created_at: e.created_at,
        txn_type: 'expense',
        description: e.description || e.category,
        category: e.category,
        amount_ngn: e.amount_ngn || 0,
        status: e.status,
        reference: e.id,
        created_by: e.submitted_by,
        contractor_id: null,
        employee_id: e.submitted_by,
        batch_name: null,
        beneficiary_count: null,
        payment_date: e.date,
        approved_by: null,
        rejection_reason: e.rejection_reason,
        notes: e.admin_note,
        bank_name: null,
        account_number: null,
        account_name: null,
        receipt_url: e.receipt_url || null,
      });
    }

    txns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setRows(txns);
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
        r.reference.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        typeLabel(r.txn_type).toLowerCase().includes(q) ||
        (r.bank_name || '').toLowerCase().includes(q) ||
        (r.account_name || '').toLowerCase().includes(q)
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
      r.category.replace(/_/g, ' '),
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

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:hidden">
        {TXN_TYPES.map((t) => {
          const count = rows.filter((r) => r.txn_type === t.value).length;
          const Icon = TYPE_ICON[t.value];
          return (
            <Card
              key={t.value}
              className={cn(
                'cursor-pointer kd-transition',
                typeFilter === t.value && 'ring-2 ring-primary',
              )}
              onClick={() => {
                setTypeFilter((prev) => (prev === t.value ? 'all' : t.value));
                pagination.reset();
              }}
            >
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-lg font-bold">{count.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
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
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              pagination.reset();
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TXN_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <TableSkeleton rows={10} cols={8} />
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
                    <TableHead>Category</TableHead>
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
                        className="kd-transition cursor-pointer"
                        onClick={() => setSelected(r)}
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
                        <TableCell className="text-sm max-w-[260px] truncate">
                          {r.description}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm capitalize">
                          {r.category.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="text-right font-medium currency whitespace-nowrap">
                          {formatNaira(r.amount_ngn)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              'capitalize text-[11px]',
                              STATUS_COLOR[r.status] || 'bg-muted text-muted-foreground',
                            )}
                          >
                            {statusLabel(r.status)}
                          </Badge>
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

      {/* Transaction detail dialog */}
      <TransactionDetail txn={selected} onClose={() => setSelected(null)} />
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

  const display = value.length > 12 ? `${value.slice(0, 8)}...` : value;

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

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

function TransactionDetail({
  txn,
  onClose,
}: {
  txn: Transaction | null;
  onClose: () => void;
}) {
  const [refCopied, setRefCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  if (!txn) return null;

  const copyRef = () => {
    navigator.clipboard.writeText(txn.reference);
    setRefCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRefCopied(false), 1500);
  };

  const Icon = TYPE_ICON[txn.txn_type] || ArrowUpDown;

  const hasBankDetails = txn.bank_name || txn.account_number;

  const fields: { label: string; value: string | null }[] = [
    { label: 'Date', value: formatDateTime(txn.created_at) },
    { label: 'Type', value: typeLabel(txn.txn_type) },
    { label: 'Description', value: txn.description },
    { label: 'Category', value: txn.category.replace(/_/g, ' ') },
    { label: 'Amount', value: formatNaira(txn.amount_ngn) },
    { label: 'Status', value: statusLabel(txn.status) },
    ...(txn.batch_name ? [{ label: 'Batch name', value: txn.batch_name }] : []),
    ...(txn.beneficiary_count
      ? [{ label: 'Beneficiaries', value: String(txn.beneficiary_count) }]
      : []),
    ...(txn.payment_date
      ? [{ label: 'Payment date', value: formatDate(txn.payment_date) }]
      : []),
    ...(txn.rejection_reason
      ? [{ label: 'Rejection / failure reason', value: txn.rejection_reason }]
      : []),
    ...(txn.notes ? [{ label: 'Notes', value: txn.notes }] : []),
  ];

  return (
    <Dialog open={!!txn} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            Transaction details
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 mb-2">
          <Badge
            variant="secondary"
            className={cn('font-medium', TYPE_COLOR[txn.txn_type])}
          >
            {typeLabel(txn.txn_type)}
          </Badge>
          <Badge
            variant="secondary"
            className={cn(
              'capitalize',
              STATUS_COLOR[txn.status] || 'bg-muted text-muted-foreground',
            )}
          >
            {statusLabel(txn.status)}
          </Badge>
          <span className="ml-auto text-lg font-bold">
            {formatNaira(txn.amount_ngn)}
          </span>
        </div>
        <Separator />

        <div className="space-y-3 pt-2">
          {fields.map((f) => (
            <div key={f.label} className="grid grid-cols-3 gap-2">
              <span className="text-sm text-muted-foreground">{f.label}</span>
              <span className="text-sm col-span-2 break-all">{f.value || '—'}</span>
            </div>
          ))}

          {/* Reference — copyable */}
          <div className="grid grid-cols-3 gap-2">
            <span className="text-sm text-muted-foreground">Reference</span>
            <span className="text-sm col-span-2 break-all flex items-center gap-2">
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                {txn.reference}
              </code>
              <button
                type="button"
                onClick={copyRef}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Copy reference"
              >
                {refCopied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </span>
          </div>
        </div>

        {/* Recipient bank details */}
        {hasBankDetails && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Landmark className="h-4 w-4 text-muted-foreground" />
                Recipient bank details
              </div>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                {txn.account_name && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-xs text-muted-foreground">Account name</span>
                    <span className="text-sm col-span-2 font-medium">{txn.account_name}</span>
                  </div>
                )}
                {txn.bank_name && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-xs text-muted-foreground">Bank</span>
                    <span className="text-sm col-span-2">{txn.bank_name}</span>
                  </div>
                )}
                {txn.account_number && (
                  <div className="grid grid-cols-3 gap-2">
                    <span className="text-xs text-muted-foreground">Account number</span>
                    <span className="text-sm col-span-2 font-mono">{txn.account_number}</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Receipt */}
        {txn.receipt_url && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Receipt</span>
              <a
                href={txn.receipt_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5"
              >
                <Button size="sm" variant="outline">
                  <FileDown className="mr-1.5 h-3.5 w-3.5" /> Download receipt
                </Button>
              </a>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
