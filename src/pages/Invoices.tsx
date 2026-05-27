import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Search,
  Download,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Send,
  CheckCircle2,
  Printer,
  X,
  FileText,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import { formatDate, formatNaira, toIsoDate } from '@/lib/format';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { StatCard } from '@/components/ui-kit/StatCard';
import { TableSkeleton } from '@/components/ui-kit/TableSkeleton';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import { Pagination } from '@/components/ui-kit/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_ngn: number;
  amount_ngn: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string | null;
  client_name: string;
  client_email: string | null;
  issue_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  line_items: LineItem[];
  subtotal_ngn: number;
  vat_rate: number;
  vat_amount_ngn: number;
  total_ngn: number;
  notes: string | null;
  payment_terms: string;
  paid_date: string | null;
  created_at: string;
}

interface Client {
  id: string;
  name: string;
  email: string | null;
}

type StatusFilter = 'all' | 'draft' | 'sent' | 'overdue' | 'paid' | 'cancelled';

const BLANK_LINE: LineItem = { id: '', description: '', quantity: 1, unit_price_ngn: 0, amount_ngn: 0 };

const PAYMENT_TERMS = ['Due on receipt', 'Net 7', 'Net 14', 'Net 30', 'Net 60'];
const VAT_RATES = [0, 5, 7.5, 10];

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isOverdue(inv: Invoice): boolean {
  return inv.status === 'sent' && inv.due_date < toIsoDate(new Date());
}

function effectiveStatus(inv: Invoice): Invoice['status'] {
  return isOverdue(inv) ? 'overdue' : inv.status;
}

function newLineItem(): LineItem {
  return { ...BLANK_LINE, id: crypto.randomUUID() };
}

function recalcLine(item: LineItem): LineItem {
  return { ...item, amount_ngn: item.quantity * item.unit_price_ngn };
}

function calcTotals(items: LineItem[], vatRate: number) {
  const subtotal = items.reduce((s, it) => s + it.amount_ngn, 0);
  const vatAmount = Math.round((subtotal * vatRate) / 100 * 100) / 100;
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}

// ─── Component ────────────────────────────────────────────────────────────────

const Invoices = () => {
  usePageTitle('Invoices');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);

  // form state
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [issueDate, setIssueDate] = useState(toIsoDate(new Date()));
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [lineItems, setLineItems] = useState<LineItem[]>([newLineItem()]);
  const [vatRate, setVatRate] = useState(7.5);
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [invRes, clientRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('clients')
        .select('id, name, email')
        .is('deleted_at', null)
        .eq('status', 'active')
        .order('name')
        .limit(200),
    ]);
    setInvoices((invRes.data as Invoice[]) || []);
    if (!clientRes.error) setClients((clientRes.data as Client[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived stats ───────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const today = toIsoDate(new Date());
    let outstanding = 0, overdue = 0, paid = 0;
    for (const inv of invoices) {
      if (inv.status === 'sent' && inv.due_date >= today) outstanding += inv.total_ngn;
      if (inv.status === 'sent' && inv.due_date < today) overdue += inv.total_ngn;
      if (inv.status === 'paid') paid += inv.total_ngn;
    }
    return { total: invoices.reduce((s, i) => s + i.total_ngn, 0), outstanding, overdue, paid };
  }, [invoices]);

  // ── Filtered list ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return invoices.filter((inv) => {
      const eff = effectiveStatus(inv);
      if (statusFilter !== 'all' && eff !== statusFilter) return false;
      if (!q) return true;
      return (
        inv.invoice_number.toLowerCase().includes(q) ||
        inv.client_name.toLowerCase().includes(q) ||
        (inv.client_email || '').toLowerCase().includes(q)
      );
    });
  }, [invoices, statusFilter, debouncedSearch]);

  const pagination = usePagination(filtered, 25);

  // ── Dialog helpers ──────────────────────────────────────────────────────────

  const openCreate = () => {
    setEditing(null);
    setClientId('');
    setClientName('');
    setClientEmail('');
    setIssueDate(toIsoDate(new Date()));
    setDueDate('');
    setPaymentTerms('Net 30');
    setLineItems([newLineItem()]);
    setVatRate(7.5);
    setNotes('');
    setDialogOpen(true);
  };

  const openEdit = (inv: Invoice) => {
    setEditing(inv);
    setClientId(inv.client_id || '');
    setClientName(inv.client_name);
    setClientEmail(inv.client_email || '');
    setIssueDate(inv.issue_date);
    setDueDate(inv.due_date);
    setPaymentTerms(inv.payment_terms);
    setLineItems(inv.line_items.length ? inv.line_items : [newLineItem()]);
    setVatRate(inv.vat_rate);
    setNotes(inv.notes || '');
    setDialogOpen(true);
  };

  const handleClientSelect = (id: string) => {
    const c = clients.find((c) => c.id === id);
    if (c) {
      setClientId(c.id);
      setClientName(c.name);
      setClientEmail(c.email || '');
    }
  };

  // update a single line item field and recalculate amount
  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item, i) =>
        i === idx ? recalcLine({ ...item, [field]: value }) : item,
      ),
    );
  };

  const addLine = () => setLineItems((prev) => [...prev, newLineItem()]);
  const removeLine = (idx: number) =>
    setLineItems((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

  const { subtotal, vatAmount, total } = useMemo(
    () => calcTotals(lineItems, vatRate),
    [lineItems, vatRate],
  );

  // ── Generate invoice number ─────────────────────────────────────────────────

  const generateInvoiceNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01`);
    const num = String((count || 0) + 1).padStart(4, '0');
    return `INV-${year}-${num}`;
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!clientName.trim()) {
      toast({ title: 'Client name is required', variant: 'destructive' });
      return;
    }
    if (!dueDate) {
      toast({ title: 'Due date is required', variant: 'destructive' });
      return;
    }
    const filledLines = lineItems.filter((l) => l.description.trim());
    if (filledLines.length === 0) {
      toast({ title: 'Add at least one line item', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      client_id: clientId || null,
      client_name: clientName.trim(),
      client_email: clientEmail.trim() || null,
      issue_date: issueDate,
      due_date: dueDate,
      payment_terms: paymentTerms,
      line_items: filledLines,
      subtotal_ngn: subtotal,
      vat_rate: vatRate,
      vat_amount_ngn: vatAmount,
      total_ngn: total,
      notes: notes.trim() || null,
    };
    if (editing) {
      const { error } = await supabase.from('invoices').update(payload).eq('id', editing.id);
      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Invoice updated' });
        await logAudit('invoice_updated', `Updated invoice ${editing.invoice_number}`, profile);
        setDialogOpen(false);
        load();
      }
    } else {
      const invoice_number = await generateInvoiceNumber();
      const { error } = await supabase.from('invoices').insert({
        ...payload,
        invoice_number,
        created_by: profile?.id,
      });
      if (error) {
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: `Invoice ${invoice_number} created` });
        await logAudit('invoice_created', `Created invoice ${invoice_number} for ${clientName}`, profile);
        setDialogOpen(false);
        load();
      }
    }
    setSaving(false);
  };

  // ── Status transitions ──────────────────────────────────────────────────────

  const markSent = async (inv: Invoice) => {
    const { error } = await supabase
      .from('invoices').update({ status: 'sent' }).eq('id', inv.id);
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else {
      toast({ title: `${inv.invoice_number} marked as sent` });
      await logAudit('invoice_updated', `Marked invoice ${inv.invoice_number} as sent`, profile);
      load();
    }
  };

  const markPaid = async (inv: Invoice) => {
    const { error } = await supabase
      .from('invoices')
      .update({ status: 'paid', paid_date: toIsoDate(new Date()) })
      .eq('id', inv.id);
    if (error) toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    else {
      toast({ title: `${inv.invoice_number} marked as paid` });
      await logAudit('invoice_updated', `Marked invoice ${inv.invoice_number} as paid`, profile);
      load();
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase
      .from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', pendingDelete.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'Invoice removed' });
      await logAudit('invoice_deleted', `Deleted invoice ${pendingDelete.invoice_number}`, profile);
      load();
    }
    setPendingDelete(null);
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  const exportCsv = () => {
    const header = [
      'invoice_number', 'client', 'issue_date', 'due_date',
      'status', 'subtotal_ngn', 'vat_ngn', 'total_ngn', 'payment_terms', 'paid_date',
    ];
    const rows = filtered.map((inv) => [
      inv.invoice_number,
      inv.client_name,
      inv.issue_date,
      inv.due_date,
      effectiveStatus(inv),
      inv.subtotal_ngn,
      inv.vat_amount_ngn,
      inv.total_ngn,
      inv.payment_terms,
      inv.paid_date || '',
    ]);
    downloadCsv(`kdops-invoices-${toIsoDate(new Date())}.csv`, toCsv(header, rows));
    toast({ title: 'Invoices exported' });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Issue and track client invoices with Nigerian VAT"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> New Invoice
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 print:hidden">
        <StatCard title="Total Invoiced" value={formatNaira(stats.total)} icon={FileText} tone="primary" />
        <StatCard title="Outstanding" value={formatNaira(stats.outstanding)} tone="warning" subtitle="Sent, not yet due" />
        <StatCard title="Overdue" value={formatNaira(stats.overdue)} tone="danger" subtitle="Past due date" />
        <StatCard title="Paid" value={formatNaira(stats.paid)} tone="success" />
      </div>

      <Card>
        {/* Status tabs */}
        <div className="p-4 border-b flex items-center gap-1 flex-wrap print:hidden">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={statusFilter === tab.value ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('rounded-full px-4', statusFilter === tab.value && 'font-semibold')}
              onClick={() => { setStatusFilter(tab.value); pagination.reset(); }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Search */}
        <div className="p-3 sm:p-4 border-b flex items-center gap-2 print:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Search invoice number, client..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); pagination.reset(); }}
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              illustration="satellite"
              title="No invoices"
              description={statusFilter !== 'all' ? 'No invoices match this filter.' : 'Create your first invoice using the button above.'}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/40 hover:bg-background/60">
                    <TableHead className="text-xs">Invoice #</TableHead>
                    <TableHead className="text-xs">Client</TableHead>
                    <TableHead className="text-xs">Issued</TableHead>
                    <TableHead className="text-xs">Due</TableHead>
                    <TableHead className="text-right text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs print:hidden">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.slice.map((inv) => {
                    const eff = effectiveStatus(inv);
                    return (
                      <TableRow key={inv.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm">
                          <div>
                            <p className="font-medium">{inv.client_name}</p>
                            {inv.client_email && (
                              <p className="text-xs text-muted-foreground">{inv.client_email}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(inv.issue_date)}
                        </TableCell>
                        <TableCell className={cn(
                          'text-xs whitespace-nowrap',
                          eff === 'overdue' ? 'text-destructive font-medium' : 'text-muted-foreground',
                        )}>
                          {formatDate(inv.due_date)}
                        </TableCell>
                        <TableCell className="text-right font-semibold currency whitespace-nowrap text-sm">
                          {formatNaira(inv.total_ngn)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={eff} size="sm" />
                        </TableCell>
                        <TableCell className="print:hidden">
                          <div className="flex items-center gap-1">
                            {eff === 'draft' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Mark as sent"
                                onClick={() => markSent(inv)}
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {(eff === 'sent' || eff === 'overdue') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-success"
                                title="Mark as paid"
                                onClick={() => markPaid(inv)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {eff === 'draft' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Edit"
                                onClick={() => openEdit(inv)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              title="Delete"
                              onClick={() => setPendingDelete(inv)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

      {/* ── Create / Edit dialog ──────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.invoice_number}` : 'New Invoice'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Client */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Client</Label>
                {clients.length > 0 ? (
                  <Select value={clientId} onValueChange={handleClientSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Client name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                )}
              </div>
              {clients.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Client name (override)</Label>
                  <Input
                    placeholder="Client name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Client email</Label>
                <Input
                  type="email"
                  placeholder="billing@client.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Dates & terms */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Issue date</Label>
                <Input
                  type="date"
                  value={issueDate}
                  min="2020-01-01" max="2099-12-31"
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due date *</Label>
                <Input
                  type="date"
                  value={dueDate}
                  min={issueDate}
                  max="2099-12-31"
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment terms</Label>
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Line items</Label>
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add row
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium">Description</th>
                      <th className="text-right p-2 text-xs font-medium w-20">Qty</th>
                      <th className="text-right p-2 text-xs font-medium w-32">Unit price (₦)</th>
                      <th className="text-right p-2 text-xs font-medium w-28">Amount (₦)</th>
                      <th className="w-8 p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => (
                      <tr key={item.id} className="border-t">
                        <td className="p-1.5">
                          <Input
                            className="h-8 text-sm"
                            placeholder="Service or product description"
                            value={item.description}
                            onChange={(e) => updateLine(idx, 'description', e.target.value)}
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            className="h-8 text-sm text-right"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="p-1.5">
                          <Input
                            className="h-8 text-sm text-right"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price_ngn}
                            onChange={(e) => updateLine(idx, 'unit_price_ngn', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="p-1.5 text-right text-sm font-medium currency whitespace-nowrap">
                          {formatNaira(item.amount_ngn)}
                        </td>
                        <td className="p-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLine(idx)}
                            disabled={lineItems.length === 1}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals + VAT */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="currency">{formatNaira(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">VAT</span>
                    <Select value={String(vatRate)} onValueChange={(v) => setVatRate(Number(v))}>
                      <SelectTrigger className="h-6 w-20 text-xs px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VAT_RATES.map((r) => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="currency">{formatNaira(vatAmount)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-1.5">
                  <span>Total</span>
                  <span className="currency">{formatNaira(total)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                rows={2}
                placeholder="Payment instructions, bank details, thank-you note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? 'Save changes' : 'Create invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ───────────────────────────────────────── */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.invoice_number} ({pendingDelete?.client_name}) will be removed. This can be recovered from the database if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Print view ───────────────────────────────────────────────── */}
      <div className="hidden print:block space-y-6">
        {filtered.map((inv) => (
          <div key={inv.id} className="border p-8 rounded text-sm break-inside-avoid">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-2xl font-bold">INVOICE</p>
                <p className="text-muted-foreground">{inv.invoice_number}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Issued: {formatDate(inv.issue_date)}</p>
                <p>Due: {formatDate(inv.due_date)}</p>
                <p>Terms: {inv.payment_terms}</p>
              </div>
            </div>
            <div className="mb-6">
              <p className="font-semibold">Bill to:</p>
              <p>{inv.client_name}</p>
              {inv.client_email && <p>{inv.client_email}</p>}
            </div>
            <table className="w-full text-sm mb-4">
              <thead><tr className="border-b"><th className="text-left py-1">Description</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Unit Price</th><th className="text-right py-1">Amount</th></tr></thead>
              <tbody>
                {inv.line_items.map((li) => (
                  <tr key={li.id} className="border-b last:border-0">
                    <td className="py-1">{li.description}</td>
                    <td className="text-right py-1">{li.quantity}</td>
                    <td className="text-right py-1 currency">{formatNaira(li.unit_price_ngn)}</td>
                    <td className="text-right py-1 currency">{formatNaira(li.amount_ngn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <div className="w-48 text-sm space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span className="currency">{formatNaira(inv.subtotal_ngn)}</span></div>
                <div className="flex justify-between"><span>VAT ({inv.vat_rate}%)</span><span className="currency">{formatNaira(inv.vat_amount_ngn)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span className="currency">{formatNaira(inv.total_ngn)}</span></div>
              </div>
            </div>
            {inv.notes && <p className="mt-4 text-xs text-muted-foreground">{inv.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Invoices;

// ─── Inline status badge for invoice-specific statuses ────────────────────────

function StatusBadge({ status, size }: { status: string; size?: 'sm' }) {
  const map: Record<string, string> = {
    draft:     'bg-muted text-muted-foreground',
    sent:      'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30',
    paid:      'bg-success/10 text-success border border-success/30',
    overdue:   'bg-destructive/10 text-destructive border border-destructive/30',
    cancelled: 'bg-muted/60 text-muted-foreground line-through',
  };
  const label: Record<string, string> = {
    draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
  };
  return (
    <Badge variant="secondary" className={cn('font-medium', size === 'sm' ? 'text-[11px]' : 'text-xs', map[status] ?? 'bg-muted text-muted-foreground')}>
      {label[status] ?? status}
    </Badge>
  );
}
