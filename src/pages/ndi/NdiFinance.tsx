import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Wallet, Plus, Trash2, History, Download, Send,
  Loader2, CheckCircle2, XCircle, ShieldAlert, RefreshCw,
  Users as UsersIcon, FileText, Printer, Search, Filter,
  Clock, ArrowUpRight, ArrowDownLeft, Edit2, MoreHorizontal,
  Calendar, TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Eye, Copy, ChevronDown,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/authStore';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useCompanies } from '@/queries';
import { formatNaira, formatDateTime } from '@/lib/format';
import {
  fetchNdiAccount, createNdiAccount, deleteNdiAccount,
  fetchNdiBalance, fetchNdiLedger, insertNdiLedgerEntry, exportNdiLedgerCsv, reconcileNdiDva, fetchPaystackBalance,
  fetchNdiBeneficiaries, createNdiBeneficiary, updateNdiBeneficiary, deactivateNdiBeneficiary,
  fetchAllNdiTransfers, exportNdiTransfersCsv,
  generateNdiGrantReport,
  executeNdiTransfer, verifyNdiTransferStatus,
  paystackTransferFee, totalChargeFor, friendlyPaystackError,
  NDI_CATEGORIES, ndiCategoryLabel,
  type NdiDedicatedAccount, type NdiLedgerRow, type NdiBeneficiary, type NdiTransfer,
  type NdiGrantReportData,
} from '@/lib/ndi-finance';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { getBankCode, createTransferRecipient } from '@/lib/paystack';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'An unexpected error occurred.';
}

// ── Main Page ───────────────────────────────────────────────────

export default function NdiFinance() {
  usePageTitle('NDI Finance');
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const { data: companies = [] } = useCompanies();
  const ndi = useMemo(() => companies.find((c) => c.short_code === 'NDI'), [companies]);

  if (!ndi) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Building2 className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground ml-3">NDI company not found.</p>
      </div>
    );
  }

  const accentColor = ndi.color || '#E84D1A';

  return (
    <div className="space-y-5">
      {/* ── Corporate header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}18` }}>
            <Building2 className="h-5 w-5" style={{ color: accentColor }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              NDI Finance
              <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wider" style={{ borderColor: accentColor, color: accentColor }}>Corporate</Badge>
            </h1>
            <p className="text-xs text-muted-foreground">Niger Delta Innovate — Dedicated corporate account</p>
          </div>
        </div>
      </div>

      {/* ── Balance + Account card ──────────────────────────────── */}
      <WalletPanel companyId={ndi.id} accentColor={accentColor} profile={profile} toast={toast} />

      {/* ── Tabs ────────────────────────────────────────────────── */}
      <Tabs defaultValue="transfers" className="space-y-4">
        <TabsList className="h-9 bg-muted/50 p-0.5">
          <TabsTrigger value="transfers" className="text-xs">Transfers</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
          <TabsTrigger value="beneficiaries" className="text-xs">Beneficiaries</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs">Ledger</TabsTrigger>
          <TabsTrigger value="grant-report" className="text-xs">Grant Report</TabsTrigger>
        </TabsList>
        <TabsContent value="transfers">
          <TransfersSection companyId={ndi.id} accentColor={accentColor} profile={profile} toast={toast} />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsTab companyId={ndi.id} accentColor={accentColor} toast={toast} />
        </TabsContent>
        <TabsContent value="beneficiaries">
          <BeneficiariesSection companyId={ndi.id} profile={profile} toast={toast} />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerTab companyId={ndi.id} profile={profile} toast={toast} />
        </TabsContent>
        <TabsContent value="grant-report">
          <GrantReportTab companyId={ndi.id} accentColor={accentColor} toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Wallet Panel ─────────────────────────────────────────────────

function WalletPanel({ companyId, accentColor, profile, toast }: {
  companyId: string; accentColor: string; profile: any; toast: any;
}) {
  const [account, setAccount] = useState<NdiDedicatedAccount | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [ledger, setLedger] = useState<NdiLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [paystackBal, setPaystackBal] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acct, bal] = await Promise.all([
        fetchNdiAccount(companyId),
        fetchNdiBalance(companyId),
      ]);
      setAccount(acct);
      setBalance(bal);
    } catch (err) {
      toast({ title: 'Could not load NDI wallet', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const toggleHistory = async () => {
    if (!showHistory && ledger.length === 0) {
      setLedgerLoading(true);
      try {
        setLedger(await fetchNdiLedger(companyId, 20));
      } catch { /* ignore */ }
      setLedgerLoading(false);
    }
    setShowHistory((p) => !p);
  };

  const remove = async () => {
    if (!account) return;
    try {
      await deleteNdiAccount(account.id);
      toast({ title: 'NDI dedicated account removed' });
      void load();
    } catch (err) {
      toast({ title: 'Could not remove', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setConfirmRemove(false);
    }
  };

  if (loading) return <Card><CardContent className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <>
      {!account ? (
        <Card className="rounded-xl border-dashed">
          <CardContent className="p-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              No dedicated account linked. Set up a virtual bank account to receive funds.
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)} style={{ backgroundColor: accentColor }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Link Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── Balance card (2/3 width) ──────────────────────────── */}
          <Card className="lg:col-span-2 rounded-xl overflow-hidden">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Available Balance</p>
                  <p className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: accentColor }}>
                    {formatNaira(balance ?? 0)}
                  </p>
                  {paystackBal !== null && (
                    <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      Paystack: {formatNaira(paystackBal)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void load()} title="Refresh balance">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={syncing} title="Sync with Paystack" onClick={async () => {
                    setSyncing(true);
                    try {
                      const res = await reconcileNdiDva(companyId);
                      setPaystackBal(res.paystack_balance_ngn);
                      if (res.newly_inserted > 0) {
                        toast({ title: `Synced ${res.newly_inserted} missed deposit(s)` });
                        void load();
                        setLedger([]);
                        setShowHistory(false);
                      } else {
                        toast({ title: 'Balance is up to date' });
                      }
                    } catch (err) {
                      toast({ title: 'Sync failed', description: errorMessage(err), variant: 'destructive' });
                    } finally {
                      setSyncing(false);
                    }
                  }}>
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Quick actions row */}
              <div className="flex items-center gap-2 flex-wrap border-t pt-4">
                <Button variant="outline" size="sm" className="text-xs" onClick={toggleHistory}>
                  <History className="mr-1 h-3 w-3" /> {showHistory ? 'Hide' : 'Activity'}
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={async () => {
                  try {
                    const csv = await exportNdiLedgerCsv(companyId);
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ndi-statement-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    toast({ title: 'Export failed', description: errorMessage(err), variant: 'destructive' });
                  }
                }}>
                  <Download className="mr-1 h-3 w-3" /> Statement
                </Button>
              </div>

              {/* Activity feed (funding history) */}
              {showHistory && (
                <div className="border-t mt-4 pt-3 space-y-1">
                  {ledgerLoading ? (
                    <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : ledger.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">No activity yet</p>
                  ) : (
                    ledger.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-xs py-1.5 group">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            r.direction === 'credit' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {r.direction === 'credit' ? '↓' : '↑'}
                          </div>
                          <span className="text-muted-foreground truncate">{r.description || ndiCategoryLabel(r.category)}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-muted-foreground text-[10px]">
                            {new Date(r.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className={`font-medium tabular-nums ${r.direction === 'credit' ? 'text-emerald-500' : 'text-red-400'}`}>
                            {r.direction === 'credit' ? '+' : '−'}{formatNaira(r.amount_ngn)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Account info card (1/3 width) ────────────────────── */}
          <Card className="rounded-xl">
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Receiving Account</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Bank</p>
                    <p className="text-sm font-medium">{account.bank_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Account Number</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-mono font-medium tracking-wide">{account.account_number}</p>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                        navigator.clipboard.writeText(account.account_number);
                        toast({ title: 'Copied to clipboard' });
                      }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {account.account_name && (
                    <div>
                      <p className="text-[10px] text-muted-foreground">Account Name</p>
                      <p className="text-sm font-medium">{account.account_name}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-muted-foreground">Customer Code</p>
                    <p className="text-xs font-mono text-muted-foreground">{account.paystack_customer_code}</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive w-full justify-start" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="mr-1.5 h-3 w-3" /> Remove account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <LinkAccountDialog open={addOpen} onOpenChange={setAddOpen} companyId={companyId} profile={profile} toast={toast} onLinked={load} />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove NDI dedicated account?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes the local record — it does NOT close the real bank account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Link Account Dialog ──────────────────────────────────────────

function LinkAccountDialog({ open, onOpenChange, companyId, profile, toast, onLinked }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; profile: any; toast: any; onLinked: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerCode: '', accountNumber: '', bankName: '', accountName: '' });

  const save = async () => {
    if (!form.customerCode.trim() || !form.accountNumber.trim() || !form.bankName.trim()) {
      toast({ title: 'Customer code, account number, and bank name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createNdiAccount({
        companyId,
        paystackCustomerCode: form.customerCode.trim(),
        accountNumber: form.accountNumber.trim(),
        bankName: form.bankName.trim(),
        accountName: form.accountName.trim() || null,
        createdBy: profile?.id ?? '',
      });
      toast({ title: 'NDI dedicated account linked' });
      onOpenChange(false);
      setForm({ customerCode: '', accountNumber: '', bankName: '', accountName: '' });
      onLinked();
    } catch (err) {
      toast({ title: 'Failed to link account', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link NDI Dedicated Account</DialogTitle>
          <DialogDescription>Enter the Paystack DVA details for NDI's dedicated bank account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Paystack Customer Code</Label>
            <Input value={form.customerCode} onChange={(e) => setForm({ ...form, customerCode: e.target.value })} placeholder="CUS_xxxxx" />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="1234567890" />
          </div>
          <div>
            <Label>Bank Name</Label>
            <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Wema Bank" />
          </div>
          <div>
            <Label>Account Name (optional)</Label>
            <Input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Niger Delta Innovate" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Link Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Transfers Section (main feature) ────────────────────────────

function TransfersSection({ companyId, accentColor, profile, toast }: {
  companyId: string; accentColor: string; profile: any; toast: any;
}) {
  const [transfers, setTransfers] = useState<NdiTransfer[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<NdiBeneficiary[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [receiptRow, setReceiptRow] = useState<NdiTransfer | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, b, bal] = await Promise.all([
        fetchAllNdiTransfers(companyId),
        fetchNdiBeneficiaries(companyId),
        fetchNdiBalance(companyId),
      ]);
      setTransfers(t);
      setBeneficiaries(b);
      setBalance(bal);
    } catch (err) {
      toast({ title: 'Could not load transfers', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const bMap = useMemo(() => new Map(beneficiaries.map((b) => [b.id, b])), [beneficiaries]);

  const filteredTransfers = useMemo(() => {
    let rows = transfers;
    if (statusFilter !== 'all') rows = rows.filter((r) => r.status === statusFilter);
    if (dateRange !== 'all') {
      const now = Date.now();
      const ms: Record<string, number> = { '7d': 7 * 86400000, '30d': 30 * 86400000, '90d': 90 * 86400000 };
      if (ms[dateRange]) rows = rows.filter((r) => now - new Date(r.created_at).getTime() < ms[dateRange]);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => {
        const bName = r.beneficiary_id ? bMap.get(r.beneficiary_id)?.name ?? '' : '';
        return (
          bName.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q) ||
          (r.narration ?? '').toLowerCase().includes(q) ||
          (r.paystack_reference ?? '').toLowerCase().includes(q) ||
          ndiCategoryLabel(r.category).toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [transfers, statusFilter, dateRange, search, bMap]);

  const visibleTransfers = filteredTransfers.slice(0, visibleCount);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = transfers.filter((t) => new Date(t.created_at) >= monthStart);
    const sentThisMonth = thisMonth.filter((t) => t.status === 'success').reduce((s, t) => s + Number(t.amount_ngn), 0);
    const pending = transfers.filter((t) => t.status === 'pending' || t.status === 'processing');
    const pendingAmount = pending.reduce((s, t) => s + Number(t.amount_ngn), 0);
    const failed = thisMonth.filter((t) => t.status === 'failed').length;
    return { sentThisMonth, pendingCount: pending.length, pendingAmount, failedThisMonth: failed };
  }, [transfers]);

  const handleExportCsv = () => {
    const csv = exportNdiTransfersCsv(filteredTransfers, beneficiaries);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ndi-transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const verifyStatus = async (row: NdiTransfer) => {
    if (!row.paystack_reference) {
      toast({ title: 'No Paystack reference to verify', variant: 'destructive' });
      return;
    }
    setVerifyingId(row.id);
    try {
      const newStatus = await verifyNdiTransferStatus(row.id, row.paystack_reference);
      toast({ title: `Status updated: ${newStatus}` });
      void load();
    } catch (err) {
      toast({ title: 'Verification failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setVerifyingId(null);
    }
  };

  // Recent contacts — unique recipients from last transfers
  const recentContacts = useMemo(() => {
    const seen = new Set<string>();
    const contacts: { id: string; name: string; bankName: string; accountNumber: string }[] = [];
    for (const t of transfers) {
      if (!t.beneficiary_id || seen.has(t.beneficiary_id)) continue;
      const b = bMap.get(t.beneficiary_id);
      if (!b) continue;
      seen.add(t.beneficiary_id);
      contacts.push({ id: b.id, name: b.name, bankName: b.bank_name, accountNumber: b.account_number });
      if (contacts.length >= 6) break;
    }
    return contacts;
  }, [transfers, bMap]);

  // Monthly cash flow analytics
  const cashFlow = useMemo(() => {
    const months = new Map<string, { credits: number; debits: number; count: number }>();
    for (const t of transfers) {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = months.get(key) ?? { credits: 0, debits: 0, count: 0 };
      if (t.status === 'success') entry.debits += Number(t.amount_ngn);
      entry.count++;
      months.set(key, entry);
    }
    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({ month, ...v }));
  }, [transfers]);

  // Category breakdown for current month
  const categorySpend = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = transfers.filter((t) => new Date(t.created_at) >= monthStart && t.status === 'success');
    const catMap = new Map<string, number>();
    for (const t of thisMonth) {
      catMap.set(t.category, (catMap.get(t.category) ?? 0) + Number(t.amount_ngn));
    }
    return Array.from(catMap.entries())
      .map(([cat, amount]) => ({ category: cat, label: ndiCategoryLabel(cat), amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transfers]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {/* Summary stat cards — minimal Mercury-style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Available</p>
            <p className={`text-lg font-bold tabular-nums ${balance >= 0 ? '' : 'text-red-500'}`}>{formatNaira(balance)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Sent this month</p>
            <p className="text-lg font-bold tabular-nums">{formatNaira(stats.sentThisMonth)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Pending</p>
            <p className="text-lg font-bold tabular-nums text-amber-500">{stats.pendingCount} <span className="text-xs font-normal text-muted-foreground">· {formatNaira(stats.pendingAmount)}</span></p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">This month</p>
            <p className="text-lg font-bold tabular-nums">{transfers.filter((t) => new Date(t.created_at) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length} <span className="text-xs font-normal text-muted-foreground">transfers</span></p>
            {stats.failedThisMonth > 0 && <p className="text-[10px] text-red-400 mt-0.5">{stats.failedThisMonth} failed</p>}
          </CardContent>
        </Card>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setSendOpen(true)} style={{ backgroundColor: accentColor }}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Send Money
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)}>
            <UsersIcon className="mr-1.5 h-3.5 w-3.5" /> Batch Send
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExportCsv} disabled={filteredTransfers.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Recent contacts strip */}
      {recentContacts.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-xs text-muted-foreground shrink-0">Recent:</span>
          {recentContacts.map((c) => (
            <button
              key={c.id}
              onClick={() => setSendOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 hover:bg-muted text-xs font-medium shrink-0 transition-colors"
            >
              <span className="h-5 w-5 rounded-full flex items-center justify-center text-2xs font-semibold text-white shrink-0" style={{ backgroundColor: accentColor }}>
                {c.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate max-w-[100px]">{c.name}</span>
              <Send className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* Category spend breakdown (this month) */}
      {categorySpend.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Spend by category this month</h4>
            <div className="space-y-2">
              {categorySpend.map((cat) => {
                const maxAmount = Math.max(...categorySpend.map((c) => c.amount), 1);
                const pct = (cat.amount / maxAmount) * 100;
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-muted-foreground tabular-nums">{formatNaira(cat.amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly cash flow (if enough data) */}
      {cashFlow.length >= 2 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Monthly outflow trend</h4>
            <div className="flex items-end gap-2 h-24">
              {cashFlow.map((m) => {
                const maxDebit = Math.max(...cashFlow.map((c) => c.debits), 1);
                const h = Math.max((m.debits / maxDebit) * 100, 4);
                const monthLabel = new Date(`${m.month}-01`).toLocaleDateString('en-NG', { month: 'short' });
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-2xs text-muted-foreground tabular-nums">{formatNaira(m.debits)}</span>
                    <div className="w-full rounded-t" style={{ height: `${h}%`, backgroundColor: accentColor, opacity: 0.8 }} />
                    <span className="text-2xs text-muted-foreground">{monthLabel}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search recipient, category, reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setVisibleCount(50); }}
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setVisibleCount(50); }}>
          <SelectTrigger className="w-[130px] h-8 text-sm">
            <Filter className="mr-1.5 h-3 w-3" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v) => { setDateRange(v); setVisibleCount(50); }}>
          <SelectTrigger className="w-[110px] h-8 text-sm">
            <Calendar className="mr-1.5 h-3 w-3" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transfer list — date-grouped */}
      {filteredTransfers.length === 0 ? (
        <EmptyState icon={Send} title="No transfers" description={search || statusFilter !== 'all' ? 'No transfers match your filters.' : 'Send your first NDI transfer to see it here.'} compact />
      ) : (() => {
        const grouped = new Map<string, typeof visibleTransfers>();
        for (const t of visibleTransfers) {
          const d = new Date(t.created_at);
          const today = new Date();
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
          let label: string;
          if (d.toDateString() === today.toDateString()) label = 'Today';
          else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
          else label = d.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
          const arr = grouped.get(label) ?? [];
          arr.push(t);
          grouped.set(label, arr);
        }
        return (
          <div className="space-y-1">
            {Array.from(grouped.entries()).map(([dateLabel, rows]) => (
              <div key={dateLabel}>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 py-2">{dateLabel}</p>
                <Card className="rounded-xl overflow-hidden">
                  <CardContent className="p-0">
                    <div className="divide-y divide-border/50">
                      {rows.map((t) => {
                        const b = t.beneficiary_id ? bMap.get(t.beneficiary_id) : null;
                        const name = b?.name ?? t.description ?? 'Transfer';
                        const initial = name.charAt(0).toUpperCase();
                        const statusColors: Record<string, string> = {
                          success: 'bg-emerald-500/10 text-emerald-500',
                          pending: 'bg-amber-500/10 text-amber-500',
                          processing: 'bg-blue-500/10 text-blue-500',
                          failed: 'bg-red-500/10 text-red-400',
                          reversed: 'bg-gray-500/10 text-gray-400',
                        };
                        return (
                          <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setReceiptRow(t)}>
                            <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                              {initial}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{name}</p>
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColors[t.status] ?? 'bg-muted text-muted-foreground'}`}>
                                  {t.status}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {ndiCategoryLabel(t.category)}
                                <span className="mx-1.5 opacity-30">·</span>
                                {new Date(t.created_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              <span className="text-sm font-medium tabular-nums text-red-400">−{formatNaira(t.amount_ngn)}</span>
                              {(t.status === 'pending' || t.status === 'processing') && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Check status" onClick={(e) => { e.stopPropagation(); verifyStatus(t); }} disabled={verifyingId === t.id}>
                                  {verifyingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
            {filteredTransfers.length > visibleCount && (
              <div className="text-center pt-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setVisibleCount((c) => c + 50)}>
                  Show more ({filteredTransfers.length - visibleCount} remaining) <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground text-center pt-1">
              {Math.min(visibleCount, filteredTransfers.length)} of {filteredTransfers.length} transfers
              {filteredTransfers.length !== transfers.length && ` (${transfers.length} total)`}
            </p>
          </div>
        );
      })()}

      {/* Dialogs */}
      <SendTransferDialog open={sendOpen} onOpenChange={setSendOpen} companyId={companyId} beneficiaries={beneficiaries} profile={profile} toast={toast} onSent={load} />
      <BatchSendDialog open={batchOpen} onOpenChange={setBatchOpen} companyId={companyId} beneficiaries={beneficiaries} balance={balance} profile={profile} toast={toast} onSent={load} />
      <TransferReceiptDialog row={receiptRow} beneficiaries={beneficiaries} onClose={() => setReceiptRow(null)} />
    </div>
  );
}


function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    success: { variant: 'default', label: 'Success' },
    pending: { variant: 'secondary', label: 'Pending' },
    processing: { variant: 'secondary', label: 'Processing' },
    failed: { variant: 'destructive', label: 'Failed' },
    reversed: { variant: 'outline', label: 'Reversed' },
  };
  const m = map[status] ?? { variant: 'secondary' as const, label: status };
  return <Badge variant={m.variant} className="text-2xs">{m.label}</Badge>;
}

// ── Send Transfer Dialog ────────────────────────────────────────

function SendTransferDialog({ open, onOpenChange, companyId, beneficiaries, profile, toast, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; beneficiaries: NdiBeneficiary[]; profile: any; toast: any; onSent: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [bank, setBank] = useState<BankAccountValue>({ bank_name: '', account_number: '', account_name: '', verified: false });
  const [form, setForm] = useState({ amount: '', category: '', description: '', narration: '' });
  const [result, setResult] = useState<{ ok: boolean; message: string; reference?: string; status?: string } | null>(null);

  const reset = () => {
    setBank({ bank_name: '', account_number: '', account_name: '', verified: false });
    setForm({ amount: '', category: '', description: '', narration: '' });
    setResult(null);
  };

  const amt = parseFloat(form.amount) || 0;
  const fee = amt > 0 ? paystackTransferFee(amt) : 0;
  const totalCharge = amt > 0 ? totalChargeFor(amt) : 0;

  const send = async () => {
    if (!bank.verified) { toast({ title: 'Verify the bank account first', variant: 'destructive' }); return; }
    if (!amt || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    if (!form.category) { toast({ title: 'Select a category', variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const bankCode = getBankCode(bank.bank_name);
      if (!bankCode) { toast({ title: 'Could not resolve bank code — try a different bank name', variant: 'destructive' }); setSaving(false); return; }

      // Create Paystack transfer recipient
      const recipient = await createTransferRecipient({
        name: bank.account_name,
        account_number: bank.account_number,
        bank_code: bankCode,
      });

      // Also save as beneficiary for future reference
      let beneficiaryId: string | undefined;
      const existing = beneficiaries.find((b) => b.account_number === bank.account_number && b.bank_code === bankCode);
      if (existing) {
        beneficiaryId = existing.id;
      } else {
        try {
          const newBen = await createNdiBeneficiary({
            companyId,
            name: bank.account_name,
            bankName: bank.bank_name,
            accountNumber: bank.account_number,
            bankCode: bankCode,
            paystackRecipientCode: recipient.recipient_code,
            createdBy: profile?.id ?? '',
          });
          beneficiaryId = newBen.id;
        } catch { /* non-critical — transfer can proceed without saving beneficiary */ }
      }

      const { paystackRef, status } = await executeNdiTransfer({
        companyId,
        beneficiaryId: beneficiaryId ?? companyId,
        recipientCode: recipient.recipient_code,
        amountNgn: amt,
        category: form.category,
        description: form.description.trim() || undefined,
        narration: form.narration.trim() || undefined,
        createdBy: profile?.id ?? '',
      });

      setResult({
        ok: true,
        message: status === 'success' ? 'Transfer completed successfully!' : 'Transfer initiated — status will update automatically.',
        reference: paystackRef,
        status,
      });
      onSent();
    } catch (err) {
      const friendly = friendlyPaystackError(errorMessage(err));
      setResult({ ok: false, message: friendly.userMessage || errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send NDI Transfer</DialogTitle>
          <DialogDescription>Select a bank, enter the account number, and we'll verify it via Paystack before sending.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="py-6 text-center space-y-3">
            {result.ok ? <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" /> : <XCircle className="h-12 w-12 text-red-500 mx-auto" />}
            <p className="text-sm font-medium">{result.message}</p>
            {result.reference && (
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{result.reference}</Badge>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { void navigator.clipboard.writeText(result.reference!); toast({ title: 'Copied' }); }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <BankAccountField value={bank} onChange={setBank} provider="paystack" disabled={saving} />
              <div>
                <Label>Amount (NGN)</Label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                {amt > 0 && (
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div className="flex justify-between"><span>Transfer fee</span><span>{formatNaira(fee)}</span></div>
                    <div className="flex justify-between font-medium"><span>Total charge</span><span>{formatNaira(totalCharge)}</span></div>
                  </div>
                )}
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    {NDI_CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this payment for?" />
              </div>
              <div>
                <Label>Narration (optional)</Label>
                <Input value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} placeholder="Shows on recipient's bank statement" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
              <Button onClick={send} disabled={saving || !bank.verified}>
                {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Send Transfer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Batch Send Dialog ───────────────────────────────────────────

function BatchSendDialog({ open, onOpenChange, companyId, beneficiaries, balance, profile, toast, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; beneficiaries: NdiBeneficiary[]; balance: number; profile: any; toast: any; onSent: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [sameAmount, setSameAmount] = useState('');
  const [category, setCategory] = useState('');
  const [batchLabel, setBatchLabel] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const reset = () => {
    setSelected(new Set());
    setAmounts({});
    setSameAmount('');
    setCategory('');
    setBatchLabel('');
    setProgress({ done: 0, total: 0 });
  };

  const toggleBeneficiary = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const getAmount = (id: string) => {
    if (sameAmount) return parseFloat(sameAmount) || 0;
    return parseFloat(amounts[id] ?? '') || 0;
  };

  const grandTotal = Array.from(selected).reduce((s, id) => s + getAmount(id), 0);
  const insufficient = grandTotal > balance;

  const sendBatch = async () => {
    if (selected.size === 0) { toast({ title: 'Select at least one beneficiary', variant: 'destructive' }); return; }
    if (!category) { toast({ title: 'Select a category', variant: 'destructive' }); return; }
    if (grandTotal <= 0) { toast({ title: 'Enter amounts for selected beneficiaries', variant: 'destructive' }); return; }

    setSending(true);
    const ids = Array.from(selected);
    setProgress({ done: 0, total: ids.length });

    let successCount = 0;
    for (let i = 0; i < ids.length; i++) {
      const bId = ids[i];
      const amt = getAmount(bId);
      if (amt <= 0) continue;
      try {
        const t = await createNdiTransfer({
          companyId,
          beneficiaryId: bId,
          amountNgn: amt,
          category,
          description: batchLabel || `Batch: ${beneficiaries.find((b) => b.id === bId)?.name ?? bId}`,
          createdBy: profile?.id ?? '',
        });
        const ref = `ndi_batch_${t.id.slice(0, 8)}_${Date.now()}`;
        await updateNdiTransferReference(t.id, ref);
        successCount++;
      } catch {
        // individual failures don't stop the batch
      }
      setProgress({ done: i + 1, total: ids.length });
    }

    toast({ title: `Batch complete: ${successCount}/${ids.length} transfers created` });
    onSent();
    reset();
    setSending(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch Send — NDI</DialogTitle>
          <DialogDescription>Select beneficiaries and set amounts. Each transfer is recorded individually.</DialogDescription>
        </DialogHeader>

        {beneficiaries.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No beneficiaries" description="Add beneficiaries first before sending a batch." compact />
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Category (applies to all)</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                <SelectContent>
                  {NDI_CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Same amount for all (optional)</Label>
              <Input type="number" min="0" step="0.01" value={sameAmount} onChange={(e) => setSameAmount(e.target.value)} placeholder="Leave empty for individual amounts" />
            </div>

            <div>
              <Label>Batch label (optional)</Label>
              <Input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="e.g. September stipends" />
            </div>

            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Beneficiaries</p>
              {beneficiaries.map((b) => (
                <label key={b.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 cursor-pointer">
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleBeneficiary(b.id)} className="rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.name}</p>
                    <p className="text-xs text-muted-foreground">{b.bank_name} · {b.account_number}</p>
                  </div>
                  {selected.has(b.id) && !sameAmount && (
                    <Input
                      type="number" min="0" step="0.01"
                      className="w-28 h-7 text-sm"
                      placeholder="Amount"
                      value={amounts[b.id] ?? ''}
                      onChange={(e) => setAmounts({ ...amounts, [b.id]: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </label>
              ))}
            </div>

            {/* Totals */}
            <div className="rounded-lg border border-border/60 p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Selected</span>
                <span className="font-medium">{selected.size} beneficiar{selected.size === 1 ? 'y' : 'ies'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Grand total</span>
                <span className="font-bold tabular-nums">{formatNaira(grandTotal)}</span>
              </div>
              {insufficient && (
                <div className="flex items-center gap-2 text-xs text-red-500 mt-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Insufficient balance ({formatNaira(balance)} available)
                </div>
              )}
            </div>

            {sending && (
              <div className="space-y-1">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>
                <p className="text-xs text-center text-muted-foreground">{progress.done}/{progress.total} processed</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} disabled={sending}>Cancel</Button>
          <Button onClick={sendBatch} disabled={sending || selected.size === 0 || !category}>
            {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Send Batch ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Transfer Receipt Dialog ─────────────────────────────────────

function TransferReceiptDialog({ row, beneficiaries, onClose }: {
  row: NdiTransfer | null; beneficiaries: NdiBeneficiary[]; onClose: () => void;
}) {
  if (!row) return null;
  const b = row.beneficiary_id ? beneficiaries.find((x) => x.id === row.beneficiary_id) : null;

  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer Receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-center py-3">
            <StatusBadge status={row.status} />
            <p className="text-2xl font-bold mt-2 tabular-nums">{formatNaira(row.amount_ngn)}</p>
          </div>
          <ReceiptRow label="Recipient" value={b?.name ?? 'Manual transfer'} />
          {b && <ReceiptRow label="Account" value={`${b.bank_name} · ${b.account_number}`} />}
          <ReceiptRow label="Category" value={ndiCategoryLabel(row.category)} />
          {row.description && <ReceiptRow label="Description" value={row.description} />}
          {row.narration && <ReceiptRow label="Narration" value={row.narration} />}
          <ReceiptRow label="Date" value={formatDateTime(row.created_at)} />
          {row.completed_at && <ReceiptRow label="Completed" value={formatDateTime(row.completed_at)} />}
          {row.paystack_reference && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Reference</span>
              <div className="flex items-center gap-1">
                <span className="font-mono text-xs">{row.paystack_reference}</span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => void navigator.clipboard.writeText(row.paystack_reference!)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          <div className="pt-2 border-t text-xs text-muted-foreground text-center">
            Niger Delta Innovate · NDI Finance Module
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

// ── Beneficiaries Section ───────────────────────────────────────

function BeneficiariesSection({ companyId, profile, toast }: { companyId: string; profile: any; toast: any }) {
  const [rows, setRows] = useState<NdiBeneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchNdiBeneficiaries(companyId));
    } catch (err) {
      toast({ title: 'Could not load beneficiaries', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((b) =>
      b.name.toLowerCase().includes(q) ||
      b.bank_name.toLowerCase().includes(q) ||
      b.account_number.includes(q)
    );
  }, [rows, search]);

  const startEdit = (b: NdiBeneficiary) => { setEditingId(b.id); setEditName(b.name); };
  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await updateNdiBeneficiary(editingId, { name: editName.trim() });
      toast({ title: 'Beneficiary updated' });
      setEditingId(null);
      void load();
    } catch (err) {
      toast({ title: 'Update failed', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const remove = async (id: string) => {
    try {
      await deactivateNdiBeneficiary(id);
      toast({ title: 'Beneficiary removed' });
      void load();
    } catch (err) {
      toast({ title: 'Could not remove', description: errorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search beneficiaries…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Beneficiary
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No beneficiaries" description="Add people or organizations NDI sends money to." compact />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    {editingId === b.id ? (
                      <div className="flex items-center gap-2">
                        <Input className="h-7 text-sm" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit(); if (e.key === 'Escape') setEditingId(null); }} autoFocus />
                        <Button size="sm" className="h-7" onClick={() => void saveEdit()}>Save</Button>
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.bank_name} · {b.account_number}</p>
                        <p className="text-xs text-muted-foreground">Added {formatDateTime(b.created_at)}</p>
                      </>
                    )}
                  </div>
                  {editingId !== b.id && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit name" onClick={() => startEdit(b)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title="Remove" onClick={() => remove(b.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">{rows.length} beneficiar{rows.length === 1 ? 'y' : 'ies'} registered</p>

      <AddBeneficiaryDialog open={addOpen} onOpenChange={setAddOpen} companyId={companyId} profile={profile} toast={toast} onAdded={load} />
    </div>
  );
}

function AddBeneficiaryDialog({ open, onOpenChange, companyId, profile, toast, onAdded }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; profile: any; toast: any; onAdded: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [bank, setBank] = useState<BankAccountValue>({ bank_name: '', account_number: '', account_name: '', verified: false });
  const [customName, setCustomName] = useState('');

  const reset = () => {
    setBank({ bank_name: '', account_number: '', account_name: '', verified: false });
    setCustomName('');
  };

  const save = async () => {
    if (!bank.verified) {
      toast({ title: 'Verify the bank account first', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const bankCode = getBankCode(bank.bank_name);
      let recipientCode: string | undefined;
      if (bankCode) {
        try {
          const recipient = await createTransferRecipient({
            name: bank.account_name,
            account_number: bank.account_number,
            bank_code: bankCode,
          });
          recipientCode = recipient.recipient_code;
        } catch { /* non-critical — beneficiary can exist without recipient code */ }
      }
      await createNdiBeneficiary({
        companyId,
        name: customName.trim() || bank.account_name,
        bankName: bank.bank_name,
        accountNumber: bank.account_number,
        bankCode: bankCode ?? undefined,
        paystackRecipientCode: recipientCode,
        createdBy: profile?.id ?? '',
      });
      toast({ title: 'Beneficiary added' });
      onOpenChange(false);
      reset();
      onAdded();
    } catch (err) {
      toast({ title: 'Failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Beneficiary</DialogTitle>
          <DialogDescription>Select a bank, enter the account number, and we'll verify it via Paystack.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <BankAccountField value={bank} onChange={setBank} provider="paystack" disabled={saving} />
          {bank.verified && (
            <div>
              <Label>Display name (optional)</Label>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={bank.account_name || 'Leave blank to use verified name'} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={save} disabled={saving || !bank.verified}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add Beneficiary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Ledger Tab ───────────────────────────────────────────────────

function LedgerTab({ companyId, profile, toast }: {
  companyId: string; profile: any; toast: any;
}) {
  const [rows, setRows] = useState<NdiLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchNdiLedger(companyId, 10000));
    } catch (err) {
      toast({ title: 'Could not load ledger', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    let r = rows;
    if (directionFilter !== 'all') r = r.filter((x) => x.direction === directionFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((x) =>
        (x.description ?? '').toLowerCase().includes(q) ||
        ndiCategoryLabel(x.category).toLowerCase().includes(q) ||
        (x.reference ?? '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [rows, directionFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 h-8 text-sm" placeholder="Search ledger…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-[110px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="credit">Credits</SelectItem>
              <SelectItem value="debit">Debits</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Record Entry
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={History} title="No ledger entries" description="Record credits and debits to build NDI's financial history." compact />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {filtered.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${r.direction === 'credit' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {r.direction === 'credit' ? <ArrowDownLeft className="h-3.5 w-3.5 text-green-500" /> : <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.description || ndiCategoryLabel(r.category)}</p>
                      <p className="text-xs text-muted-foreground">
                        {ndiCategoryLabel(r.category)} · {formatDateTime(r.created_at)}
                        {r.reference ? ` · ${r.reference}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`font-medium shrink-0 tabular-nums ${r.direction === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                    {r.direction === 'credit' ? '+' : '−'}{formatNaira(r.amount_ngn)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {filtered.length} of {rows.length} entries · Entries are immutable
      </p>

      <RecordEntryDialog open={addOpen} onOpenChange={setAddOpen} companyId={companyId} profile={profile} toast={toast} onSaved={load} />
    </div>
  );
}

// ── Record Entry Dialog ──────────────────────────────────────────

function RecordEntryDialog({ open, onOpenChange, companyId, profile, toast, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; profile: any; toast: any; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ direction: 'credit' as 'credit' | 'debit', amount: '', category: '', description: '', reference: '' });

  const save = async () => {
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    if (!form.category) { toast({ title: 'Select a category', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await insertNdiLedgerEntry({
        companyId,
        direction: form.direction,
        amountNgn: amt,
        category: form.category,
        description: form.description.trim() || undefined,
        reference: form.reference.trim() || undefined,
        createdBy: profile?.id ?? '',
      });
      toast({ title: `${form.direction === 'credit' ? 'Credit' : 'Debit'} recorded` });
      onOpenChange(false);
      setForm({ direction: 'credit', amount: '', category: '', description: '', reference: '' });
      onSaved();
    } catch (err) {
      toast({ title: 'Failed to record', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Ledger Entry</DialogTitle>
          <DialogDescription>Entries are immutable — corrections are new entries, never edits.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Direction</Label>
            <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as 'credit' | 'debit' })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">Credit (money in)</SelectItem>
                <SelectItem value="debit">Debit (money out)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (NGN)</Label>
            <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
              <SelectContent>
                {NDI_CATEGORIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this entry for?" />
          </div>
          <div>
            <Label>Reference (optional)</Label>
            <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice #, transfer ref, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Record Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Analytics Tab ──────────────────────────────────────────────

function AnalyticsTab({ companyId, accentColor, toast }: { companyId: string; accentColor: string; toast: any }) {
  const [transfers, setTransfers] = useState<NdiTransfer[]>([]);
  const [ledger, setLedger] = useState<NdiLedgerRow[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<NdiBeneficiary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, l, b] = await Promise.all([
        fetchAllNdiTransfers(companyId),
        fetchNdiLedger(companyId, 10000),
        fetchNdiBeneficiaries(companyId),
      ]);
      setTransfers(t);
      setLedger(l);
      setBeneficiaries(b);
    } catch (err) {
      toast({ title: 'Could not load analytics', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const bMap = useMemo(() => new Map(beneficiaries.map((b) => [b.id, b])), [beneficiaries]);

  // Monthly cash flow (credits vs debits from ledger)
  const monthlyCashFlow = useMemo(() => {
    const months = new Map<string, { credits: number; debits: number }>();
    for (const r of ledger) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = months.get(key) ?? { credits: 0, debits: 0 };
      if (r.direction === 'credit') entry.credits += Number(r.amount_ngn);
      else entry.debits += Number(r.amount_ngn);
      months.set(key, entry);
    }
    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({
        month,
        label: new Date(`${month}-01`).toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }),
        ...v,
        net: v.credits - v.debits,
      }));
  }, [ledger]);

  // Category breakdown (all time from transfers)
  const categoryBreakdown = useMemo(() => {
    const catMap = new Map<string, { amount: number; count: number }>();
    for (const t of transfers) {
      if (t.status !== 'success') continue;
      const entry = catMap.get(t.category) ?? { amount: 0, count: 0 };
      entry.amount += Number(t.amount_ngn);
      entry.count++;
      catMap.set(t.category, entry);
    }
    const total = Array.from(catMap.values()).reduce((s, v) => s + v.amount, 0) || 1;
    return Array.from(catMap.entries())
      .map(([cat, v]) => ({ category: cat, label: ndiCategoryLabel(cat), amount: v.amount, count: v.count, pct: (v.amount / total) * 100 }))
      .sort((a, b) => b.amount - a.amount);
  }, [transfers]);

  // Top recipients
  const topRecipients = useMemo(() => {
    const rMap = new Map<string, { name: string; bankName: string; total: number; count: number }>();
    for (const t of transfers) {
      if (!t.beneficiary_id || t.status !== 'success') continue;
      const b = bMap.get(t.beneficiary_id);
      if (!b) continue;
      const entry = rMap.get(t.beneficiary_id) ?? { name: b.name, bankName: b.bank_name, total: 0, count: 0 };
      entry.total += Number(t.amount_ngn);
      entry.count++;
      rMap.set(t.beneficiary_id, entry);
    }
    return Array.from(rMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [transfers, bMap]);

  // Week-over-week comparison
  const weekComparison = useMemo(() => {
    const now = Date.now();
    const thisWeek = transfers.filter((t) => now - new Date(t.created_at).getTime() < 7 * 86400000 && t.status === 'success');
    const lastWeek = transfers.filter((t) => {
      const age = now - new Date(t.created_at).getTime();
      return age >= 7 * 86400000 && age < 14 * 86400000 && t.status === 'success';
    });
    const thisWeekTotal = thisWeek.reduce((s, t) => s + Number(t.amount_ngn), 0);
    const lastWeekTotal = lastWeek.reduce((s, t) => s + Number(t.amount_ngn), 0);
    const change = lastWeekTotal > 0 ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100 : 0;
    return { thisWeekTotal, lastWeekTotal, thisWeekCount: thisWeek.length, lastWeekCount: lastWeek.length, change };
  }, [transfers]);

  // Overall stats
  const overallStats = useMemo(() => {
    const totalCredits = ledger.filter((r) => r.direction === 'credit').reduce((s, r) => s + Number(r.amount_ngn), 0);
    const totalDebits = ledger.filter((r) => r.direction === 'debit').reduce((s, r) => s + Number(r.amount_ngn), 0);
    const successTransfers = transfers.filter((t) => t.status === 'success');
    const avgTransfer = successTransfers.length > 0 ? successTransfers.reduce((s, t) => s + Number(t.amount_ngn), 0) / successTransfers.length : 0;
    const successRate = transfers.length > 0 ? (successTransfers.length / transfers.length) * 100 : 0;
    return { totalCredits, totalDebits, balance: totalCredits - totalDebits, avgTransfer, successRate, totalTransfers: transfers.length };
  }, [transfers, ledger]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Financial Analytics</h3>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Overview metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total inflow</p>
            <p className="text-lg font-bold tabular-nums text-green-600">{formatNaira(overallStats.totalCredits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total outflow</p>
            <p className="text-lg font-bold tabular-nums text-red-500">{formatNaira(overallStats.totalDebits)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Avg transfer size</p>
            <p className="text-lg font-bold tabular-nums">{formatNaira(overallStats.avgTransfer)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Success rate</p>
            <p className="text-lg font-bold tabular-nums">{overallStats.successRate.toFixed(0)}%</p>
            <p className="text-2xs text-muted-foreground">{overallStats.totalTransfers} total transfers</p>
          </CardContent>
        </Card>
      </div>

      {/* Week-over-week */}
      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Week over week</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">This week</p>
              <p className="text-xl font-bold tabular-nums">{formatNaira(weekComparison.thisWeekTotal)}</p>
              <p className="text-xs text-muted-foreground">{weekComparison.thisWeekCount} transfers</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last week</p>
              <p className="text-xl font-bold tabular-nums text-muted-foreground">{formatNaira(weekComparison.lastWeekTotal)}</p>
              <p className="text-xs text-muted-foreground">{weekComparison.lastWeekCount} transfers</p>
            </div>
          </div>
          {weekComparison.lastWeekTotal > 0 && (
            <div className="mt-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                {weekComparison.change > 0 ? (
                  <TrendingUp className="h-4 w-4 text-red-400" />
                ) : weekComparison.change < 0 ? (
                  <TrendingDown className="h-4 w-4 text-green-500" />
                ) : null}
                <span className={`text-sm font-medium ${weekComparison.change > 0 ? 'text-red-400' : weekComparison.change < 0 ? 'text-green-500' : ''}`}>
                  {weekComparison.change > 0 ? '+' : ''}{weekComparison.change.toFixed(1)}% vs last week
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly cash flow chart */}
      {monthlyCashFlow.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Monthly cash flow</h4>
            <div className="space-y-3">
              {monthlyCashFlow.map((m) => {
                const maxVal = Math.max(...monthlyCashFlow.flatMap((x) => [x.credits, x.debits]), 1);
                return (
                  <div key={m.month} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium w-16">{m.label}</span>
                      <div className="flex gap-3">
                        <span className="text-green-500 tabular-nums">+{formatNaira(m.credits)}</span>
                        <span className="text-red-400 tabular-nums">−{formatNaira(m.debits)}</span>
                        <span className={`font-medium tabular-nums ${m.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {m.net >= 0 ? '+' : ''}{formatNaira(m.net)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 h-2">
                      <div className="rounded-full bg-green-500/70" style={{ width: `${(m.credits / maxVal) * 100}%` }} />
                      <div className="rounded-full bg-red-400/70" style={{ width: `${(m.debits / maxVal) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-2 border-t text-2xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500/70" /> Inflow</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400/70" /> Outflow</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category breakdown */}
        {categoryBreakdown.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Spend by category (all time)</h4>
              <div className="space-y-2.5">
                {categoryBreakdown.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.label}</span>
                      <div className="text-right">
                        <span className="text-muted-foreground tabular-nums">{formatNaira(cat.amount)}</span>
                        <span className="text-2xs text-muted-foreground ml-1.5">({cat.pct.toFixed(0)}%)</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${cat.pct}%`, backgroundColor: accentColor, opacity: 0.8 }} />
                    </div>
                    <p className="text-2xs text-muted-foreground">{cat.count} transaction{cat.count === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top recipients */}
        {topRecipients.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Top recipients</h4>
              <div className="space-y-3">
                {topRecipients.map((r, i) => (
                  <div key={r.name} className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0" style={{ backgroundColor: accentColor, opacity: 1 - i * 0.12 }}>
                      {r.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <p className="text-2xs text-muted-foreground">{r.bankName} · {r.count} transfers</p>
                    </div>
                    <span className="text-sm font-medium tabular-nums shrink-0">{formatNaira(r.total)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {transfers.length === 0 && ledger.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No financial data yet"
          description="Send transfers and record ledger entries to see analytics here."
          compact
        />
      )}
    </div>
  );
}

// ── Grant Report Tab ────────────────────────────────────────────

function GrantReportTab({ companyId, accentColor, toast }: { companyId: string; accentColor: string; toast: any }) {
  const [report, setReport] = useState<NdiGrantReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await generateNdiGrantReport(companyId));
    } catch (err) {
      toast({ title: 'Could not generate report', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!report) return <EmptyState icon={FileText} title="Report unavailable" description="Could not generate the grant report." compact />;

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex items-center justify-between print:hidden">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" /> Grant-Ready Financial Report
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="hidden print:block text-center mb-4">
        <h1 className="text-lg font-bold">Niger Delta Innovate — Financial Report</h1>
        <p className="text-xs text-muted-foreground">Generated {new Date(report.generatedAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCardSimple label="Total Credits" value={formatNaira(report.totalCredits)} color="text-green-600" />
        <SummaryCardSimple label="Total Debits" value={formatNaira(report.totalDebits)} color="text-red-500" />
        <SummaryCardSimple label="Net Balance" value={formatNaira(report.balance)} color={report.balance >= 0 ? 'text-green-600' : 'text-red-500'} />
        <SummaryCardSimple label="Transactions" value={String(report.transactionCount)} />
      </div>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Dedicated Account</h4>
          {report.account ? (
            <div className="text-sm space-y-1">
              <p><span className="text-muted-foreground">Bank:</span> {report.account.bank_name}</p>
              <p><span className="text-muted-foreground">Account:</span> {report.account.account_number}</p>
              {report.account.account_name && <p><span className="text-muted-foreground">Name:</span> {report.account.account_name}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No dedicated account linked yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">Spend by Category</h4>
          {report.categoryBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {report.categoryBreakdown.map((cat) => {
                const maxDebit = Math.max(...report.categoryBreakdown.map((c) => c.debits), 1);
                const pct = (cat.debits / maxDebit) * 100;
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.label}</span>
                      <span className="text-muted-foreground tabular-nums">{formatNaira(cat.debits)} spent · {cat.count} txns</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: accentColor }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Disbursement Summary</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><p className="text-muted-foreground">Total transfers</p><p className="font-medium">{report.transfersSummary.total}</p></div>
            <div><p className="text-muted-foreground">Successful</p><p className="font-medium text-green-600">{report.transfersSummary.successful}</p></div>
            <div><p className="text-muted-foreground">Pending</p><p className="font-medium text-amber-500">{report.transfersSummary.pending}</p></div>
            <div><p className="text-muted-foreground">Amount disbursed</p><p className="font-medium">{formatNaira(report.transfersSummary.totalAmount)}</p></div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-green-200 dark:border-green-900">
        <CardContent className="p-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-green-600 mb-2 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Entity Isolation Certification
          </h4>
          <ul className="text-sm space-y-1.5">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>All financial data sourced exclusively from <code className="text-xs bg-muted px-1 rounded">ndi_wallet_ledger</code>, <code className="text-xs bg-muted px-1 rounded">ndi_transfers</code>, and <code className="text-xs bg-muted px-1 rounded">ndi_beneficiaries</code>.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>No data shared with or sourced from KD Squares Principal Disbursements (<code className="text-xs bg-muted px-1 rounded">principal_wallet_ledger</code>).</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>Ledger entries are immutable — no UPDATE or DELETE operations permitted by database policy.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>Row-level security enforces company-scoped access; only admin and super_admin roles may view or insert.</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center print:text-left">
        {report.beneficiaryCount} registered beneficiar{report.beneficiaryCount === 1 ? 'y' : 'ies'} · Report generated {new Date(report.generatedAt).toLocaleString('en-NG')}
      </div>
    </div>
  );
}

function SummaryCardSimple({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${color ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
