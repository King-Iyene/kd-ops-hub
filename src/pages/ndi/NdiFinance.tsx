import { useEffect, useMemo, useState } from 'react';
import {
  Building2, Wallet, Plus, Trash2, History, Download, Send,
  Loader2, CheckCircle2, XCircle, ShieldAlert, RefreshCw,
  Users as UsersIcon,
} from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/authStore';
import { AuroraHero } from '@/components/AuroraHero';
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
  fetchNdiBalance, fetchNdiLedger, insertNdiLedgerEntry, exportNdiLedgerCsv,
  fetchNdiBeneficiaries, createNdiBeneficiary, deactivateNdiBeneficiary,
  fetchNdiTransfers,
  NDI_CATEGORIES, ndiCategoryLabel,
  type NdiDedicatedAccount, type NdiLedgerRow, type NdiBeneficiary, type NdiTransfer,
} from '@/lib/ndi-finance';
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
    <div className="space-y-4">
      <AuroraHero className="p-5 sm:p-6" pattern="nest" patternColor={accentColor}>
        <PageHeader
          className="mb-0"
          title="NDI Finance"
          description="Dedicated account, wallet ledger, disbursements, and financial reporting — fully isolated from KD Squares."
          icon={Wallet}
          badge={<Badge variant="outline" style={{ borderColor: accentColor, color: accentColor }}>NDI</Badge>}
        />
      </AuroraHero>

      <WalletPanel companyId={ndi.id} accentColor={accentColor} profile={profile} toast={toast} />

      <Tabs defaultValue="ledger" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="beneficiaries">Beneficiaries</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger">
          <LedgerTab companyId={ndi.id} profile={profile} toast={toast} />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab companyId={ndi.id} toast={toast} />
        </TabsContent>
        <TabsContent value="beneficiaries">
          <BeneficiariesTab companyId={ndi.id} profile={profile} toast={toast} />
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

  const load = async () => {
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
  };

  useEffect(() => { void load(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <Card className="rounded-xl overflow-hidden">
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }} />
        <CardContent className="p-4 space-y-3">
          {!account ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Building2 className="h-4 w-4" />
                No dedicated account linked for NDI.
              </div>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Link dedicated account
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentColor }} aria-hidden />
                    NDI Dedicated Account
                  </div>
                  <p className="text-sm font-medium mt-0.5">{account.bank_name} · {account.account_number}</p>
                  {account.account_name && <p className="text-xs text-muted-foreground">{account.account_name}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Wallet balance</p>
                  <p className="text-2xl font-bold" style={{ color: accentColor }}>{formatNaira(balance ?? 0)}</p>
                </div>
              </div>

              <AuditReadiness hasAccount={!!account} hasTransactions={(balance ?? 0) !== 0} accentColor={accentColor} />

              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => void load()}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const csv = await exportNdiLedgerCsv(companyId);
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `ndi-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    toast({ title: 'Export failed', description: errorMessage(err), variant: 'destructive' });
                  }
                }}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove account
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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

// ── Audit Readiness ──────────────────────────────────────────────

function AuditReadiness({ hasAccount, hasTransactions, accentColor }: {
  hasAccount: boolean; hasTransactions: boolean; accentColor: string;
}) {
  const checks = [
    { label: 'Dedicated account', ok: hasAccount },
    { label: 'Transaction history', ok: hasTransactions },
    { label: 'Entity isolation', ok: true },
    { label: 'Immutable ledger', ok: true },
  ];
  const score = checks.filter((c) => c.ok).length;
  const pct = Math.round((score / checks.length) * 100);

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5" /> Grant readiness
        </span>
        <span className="text-xs font-bold" style={{ color: pct === 100 ? '#22c55e' : accentColor }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#22c55e' : accentColor }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {checks.map((c) => (
          <span key={c.label} className="flex items-center gap-1 text-2xs">
            {c.ok ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
            <span className={c.ok ? '' : 'text-muted-foreground'}>{c.label}</span>
          </span>
        ))}
      </div>
    </div>
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
          <DialogDescription>Enter the Paystack DVA details for NDI's dedicated Wema Bank account.</DialogDescription>
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

// ── Ledger Tab ───────────────────────────────────────────────────

function LedgerTab({ companyId, profile, toast }: {
  companyId: string; profile: any; toast: any;
}) {
  const [rows, setRows] = useState<NdiLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchNdiLedger(companyId));
    } catch (err) {
      toast({ title: 'Could not load ledger', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History className="h-4 w-4" /> Immutable Ledger
          </h3>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Record Entry
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={History} title="No ledger entries" description="Record credits and debits to build NDI's financial history." compact />
        ) : (
          <div className="rounded-lg border border-border/60 divide-y">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{r.description || ndiCategoryLabel(r.category)}</p>
                  <p className="text-xs text-muted-foreground">
                    {ndiCategoryLabel(r.category)} · {formatDateTime(r.created_at)}
                    {r.reference ? ` · ${r.reference}` : ''}
                  </p>
                </div>
                <span className={`font-medium shrink-0 ${r.direction === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                  {r.direction === 'credit' ? '+' : '−'}{formatNaira(r.amount_ngn)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <RecordEntryDialog open={addOpen} onOpenChange={setAddOpen} companyId={companyId} profile={profile} toast={toast} onSaved={load} />
    </Card>
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

// ── Transfers Tab ────────────────────────────────────────────────

function TransfersTab({ companyId, toast }: { companyId: string; toast: any }) {
  const [rows, setRows] = useState<NdiTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        setRows(await fetchNdiTransfers(companyId));
      } catch (err) {
        toast({ title: 'Could not load transfers', description: errorMessage(err), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (rows.length === 0) {
    return <EmptyState icon={Send} title="No transfers yet" description="NDI transfers will appear here once disbursements are made." compact />;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="rounded-lg border border-border/60 divide-y">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{r.description || ndiCategoryLabel(r.category)}</p>
                <p className="text-xs text-muted-foreground">
                  {ndiCategoryLabel(r.category)} · {formatDateTime(r.created_at)}
                  {r.paystack_reference ? ` · ${r.paystack_reference}` : ''}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium text-red-500">−{formatNaira(r.amount_ngn)}</p>
                <Badge variant={r.status === 'success' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'} className="text-2xs">
                  {r.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Beneficiaries Tab ────────────────────────────────────────────

function BeneficiariesTab({ companyId, profile, toast }: { companyId: string; profile: any; toast: any }) {
  const [rows, setRows] = useState<NdiBeneficiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchNdiBeneficiaries(companyId));
    } catch (err) {
      toast({ title: 'Could not load beneficiaries', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> Beneficiaries
          </h3>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Beneficiary
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={UsersIcon} title="No beneficiaries" description="Add people or organizations NDI sends money to." compact />
        ) : (
          <div className="rounded-lg border border-border/60 divide-y">
            {rows.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.bank_name} · {b.account_number}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                  try {
                    await deactivateNdiBeneficiary(b.id);
                    toast({ title: 'Beneficiary removed' });
                    void load();
                  } catch (err) {
                    toast({ title: 'Could not remove', description: errorMessage(err), variant: 'destructive' });
                  }
                }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddBeneficiaryDialog open={addOpen} onOpenChange={setAddOpen} companyId={companyId} profile={profile} toast={toast} onAdded={load} />
    </Card>
  );
}

function AddBeneficiaryDialog({ open, onOpenChange, companyId, profile, toast, onAdded }: {
  open: boolean; onOpenChange: (v: boolean) => void; companyId: string; profile: any; toast: any; onAdded: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', bankName: '', accountNumber: '' });

  const save = async () => {
    if (!form.name.trim() || !form.bankName.trim() || !form.accountNumber.trim()) {
      toast({ title: 'All fields are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createNdiBeneficiary({
        companyId,
        name: form.name.trim(),
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim(),
        createdBy: profile?.id ?? '',
      });
      toast({ title: 'Beneficiary added' });
      onOpenChange(false);
      setForm({ name: '', bankName: '', accountNumber: '' });
      onAdded();
    } catch (err) {
      toast({ title: 'Failed', description: errorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Beneficiary</DialogTitle>
          <DialogDescription>A person or organization NDI sends disbursements to.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Beneficiary name" /></div>
          <div><Label>Bank Name</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="Bank name" /></div>
          <div><Label>Account Number</Label><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="1234567890" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
