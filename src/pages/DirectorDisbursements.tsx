/**
 * Principal Disbursements (internal module name: Director Disbursements) —
 * super_admin-only module for two hard-separated ways the director moves
 * money out via Paystack:
 *
 *   Company Disbursement — director salary / drawings / loan repayments.
 *     Reuses payment_batches/batch_items verbatim (see src/lib/
 *     director-disbursements.ts + migration 20260811184147). Feeds the
 *     existing Transactions/Reports/expense reporting for whoever can see
 *     these rows (super_admin only, enforced by RLS).
 *
 *   Personal Transfer — the director's own post-salary money. Writes to
 *     the wholly separate personal_transfers table (src/lib/
 *     personal-transfers.ts) which has no foreign key into any company
 *     ledger table — it cannot appear in expense/payables/P&L reporting
 *     because nothing there references it.
 *
 * Both flows dispatch immediately (no co-approval routing): there is no
 * one else who can see these rows to approve them, so the director's own
 * "Send" click is the approval. The existing per-user transfer cap check
 * (previewCapCheck / check_transfer_caps) still applies to both — that's
 * a velocity/anomaly safety net, not an approval workflow, and there's no
 * reason to bypass it here.
 *
 * Every list load and detail-view logs an audit_logs entry (see
 * fetchPersonalTransfers/logPersonalTransferDetailView and the equivalent
 * inline calls below for Company Disbursement) — "log every view of past
 * records, not just every send."
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Landmark, Loader2, CheckCircle2, XCircle, ShieldAlert, Send, Users, Layers, Trash2, Plus, RefreshCw,
  Receipt, Repeat, Pause, Play, AlertTriangle, Building2, History, Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import {
  createTransferRecipient,
  totalChargeFor,
  batchCostBreakdown,
  initiateTransferIdempotent,
  verifyTransfer,
  getBankCode,
  buildNarration,
  bulkTransfer,
  type BulkTransferItem,
} from '@/lib/paystack';
import { previewCapCheck, startBatchProcessing } from '@/lib/transfer-safety';
import { formatNaira, formatDateTime } from '@/lib/format';
import {
  DIRECTOR_DISBURSEMENT_CATEGORIES,
  directorDisbursementCategoryDef,
  directorDisbursementCategoryLabel,
  type DirectorDisbursementCategoryDef,
} from '@/lib/director-disbursements';
import {
  fetchPersonalTransfers,
  logPersonalTransferDetailView,
  fetchPersonalTransferBeneficiaries,
  createPersonalTransferBeneficiary,
  deletePersonalTransferBeneficiary,
  type PersonalTransferRow,
  type PersonalTransferBeneficiaryRow,
} from '@/lib/personal-transfers';
import {
  fetchDvaAccount,
  createDvaAccount,
  deleteDvaAccount,
  fetchWalletBalance,
  fetchWalletBalanceOrNull,
  fetchWalletLedger,
  checkWalletCanCover,
  type PrincipalWalletDva,
  type PrincipalWalletLedgerRow,
} from '@/lib/principal-wallet';
import { PageHeader } from '@/components/ui-kit/PageHeader';
import { AuroraHero } from '@/components/AuroraHero';
import { EmptyState } from '@/components/ui-kit/EmptyState';
import { StatusBadge } from '@/components/ui-kit/StatusBadge';
import {
  MobileCard, MobileCardHeader, MobileCardTitle, MobileCardMeta, MobileCardRow,
} from '@/components/ui-kit/MobileCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { PaymentSummaryModal } from '@/components/PaymentSummaryModal';
import { ReceiptModal } from '@/components/ReceiptModal';
import { PersonalTransferReceiptModal } from '@/components/PersonalTransferReceiptModal';
import { receiptTheme } from '@/lib/receipt-theme';
import { useToast } from '@/hooks/use-toast';
import { friendlyDbError } from '@/lib/db-errors';
import { usePageTitle } from '@/hooks/usePageTitle';

const emptyBank: BankAccountValue = { bank_name: '', account_number: '', account_name: '', verified: false };

type SendResult = null | { ok: true; ref: string } | { ok: false; reason: string };

/* ═══════════════════════════════════════════════════════════════════════
   Company Disbursement — list row shape read straight off payment_batches
   joined to its single batch_item (these are always single-recipient: the
   director themselves).
   ═══════════════════════════════════════════════════════════════════════ */
interface DisbursementRow {
  id: string;
  name: string;
  payment_category: string | null;
  total_amount: number;
  status: string;
  payment_date: string;
  created_at: string;
  payment_description: string | null;
  batch_items: any[] | null;
}

export default function DirectorDisbursements() {
  usePageTitle('Principal Disbursements');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <AuroraHero
        className="principal-hero-pattern p-5 sm:p-6"
        pattern="nest"
        patternColor="var(--principal-accent)"
      >
        <img
          src="/icon-192.png"
          alt=""
          aria-hidden
          className="pointer-events-none select-none absolute -right-6 -bottom-8 h-32 w-32 opacity-[0.06] dark:opacity-[0.08] rotate-[-8deg]"
        />
        <PageHeader
          className="mb-0"
          title="Principal Disbursements"
          description="Company disbursements (salary, drawings, loan repayments) and your own personal transfers — kept structurally separate."
          icon={Landmark}
          badge={<Badge variant="outline" className="border-primary/30 text-primary">Super admin only</Badge>}
        />
      </AuroraHero>

      <PrincipalWalletPanel profile={profile} toast={toast} />

      <Tabs defaultValue="company" className="space-y-4">
        <TabsList>
          <TabsTrigger value="company">Company Disbursement</TabsTrigger>
          <TabsTrigger value="personal">Personal Transfer</TabsTrigger>
        </TabsList>
        <TabsContent value="company">
          <CompanyDisbursementSection profile={profile} toast={toast} />
        </TabsContent>
        <TabsContent value="personal">
          <PersonalTransferSection profile={profile} toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Principal Disbursements wallet — the real Paystack Dedicated Virtual
   Account (see src/lib/principal-wallet.ts) that now funds every send in
   this module, shared above both tabs since it's one account backing
   both Company Disbursement and Personal Transfer.
   ═══════════════════════════════════════════════════════════════════════ */
function PrincipalWalletPanel({ profile, toast }: { profile: any; toast: ReturnType<typeof useToast>['toast'] }) {
  const [dva, setDva] = useState<PrincipalWalletDva | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<PrincipalWalletLedgerRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [account, bal] = await Promise.all([fetchDvaAccount(), fetchWalletBalance()]);
      setDva(account);
      setBalance(bal);
    } catch (err: any) {
      toast({ title: 'Could not load wallet', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggleHistory = async () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history.length === 0) {
      setHistoryLoading(true);
      try {
        setHistory(await fetchWalletLedger(50));
      } catch (err: any) {
        toast({ title: 'Could not load funding history', description: err?.message, variant: 'destructive' });
      } finally {
        setHistoryLoading(false);
      }
    }
  };

  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const remove = async () => {
    if (!dva) return;
    try {
      await deleteDvaAccount(dva.id);
      toast({ title: 'Dedicated account removed', description: 'Sends will no longer be checked against a wallet balance.' });
      load();
    } catch (err: any) {
      toast({ title: 'Could not remove account', description: friendlyDbError(err), variant: 'destructive' });
    } finally {
      setConfirmRemoveOpen(false);
    }
  };

  const sourceLabel = (s: string) => (
    s === 'dva_funding' ? 'Dedicated account funding'
    : s === 'company_disbursement' ? 'Company Disbursement sent'
    : s === 'personal_transfer' ? 'Personal Transfer sent'
    : 'Reversal refund'
  );

  if (loading) return null;

  return (
    <Card className="rounded-xl">
      <CardContent className="p-4 space-y-3">
        {!dva ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="h-4 w-4" />
              No dedicated account linked — sends use the company Paystack balance directly, unchecked against a wallet.
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
                  <Building2 className="h-3.5 w-3.5" /> Dedicated account
                </div>
                <p className="text-sm font-medium mt-0.5">{dva.bank_name} · {dva.account_number}</p>
                <p className="text-xs text-muted-foreground">{dva.account_name} · {dva.paystack_customer_code}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Wallet balance</p>
                <p className="text-2xl font-bold currency">{formatNaira(balance ?? 0)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleHistory}>
                <History className="mr-1.5 h-3.5 w-3.5" /> {historyOpen ? 'Hide' : 'Funding'} history
              </Button>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemoveOpen(true)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove account
              </Button>
            </div>
            {historyOpen && (
              <div className="rounded-lg border border-border/60 divide-y">
                {historyLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
                ) : history.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No wallet activity yet.</div>
                ) : (
                  history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{sourceLabel(h.source)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(h.created_at)}{h.reference ? ` · ${h.reference}` : ''}</p>
                      </div>
                      <span className={`font-medium currency shrink-0 ${h.direction === 'credit' ? 'text-success' : 'text-destructive'}`}>
                        {h.direction === 'credit' ? '+' : '−'}{formatNaira(h.amount_ngn)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      <LinkDvaDialog open={addOpen} onOpenChange={setAddOpen} profile={profile} toast={toast} onLinked={load} />

      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove dedicated account?</AlertDialogTitle>
            <AlertDialogDescription>
              This only removes KDOps's local record of {dva?.bank_name} {dva?.account_number} — it does NOT touch or close the
              real Paystack account. Sends will stop being checked against a wallet balance until you link it again. The
              current wallet balance ({formatNaira(balance ?? 0)}) is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LinkDvaDialog({
  open, onOpenChange, profile, toast, onLinked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
  onLinked: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerCode: '', accountNumber: '', bankName: '', accountName: '' });

  const reset = () => setForm({ customerCode: '', accountNumber: '', bankName: '', accountName: '' });

  const save = async () => {
    if (!form.customerCode.trim() || !form.accountNumber.trim() || !form.bankName.trim()) {
      toast({ title: 'Customer code, account number, and bank name are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createDvaAccount({
        paystackCustomerCode: form.customerCode.trim(),
        accountNumber: form.accountNumber.trim(),
        bankName: form.bankName.trim(),
        accountName: form.accountName.trim() || null,
        createdBy: profile?.id,
      });
      toast({ title: 'Dedicated account linked' });
      reset();
      onOpenChange(false);
      onLinked();
    } catch (err: any) {
      toast({ title: 'Could not link account', description: friendlyDbError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}
      size="lg"
      title={<span className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> Link dedicated account</span>}
      description="Paste in the Dedicated Virtual Account details from your Paystack dashboard — create the account there first, this just tells KDOps which incoming funds to track."
      footer={(
        <>
          <Button variant="outline" className="kd-mobile-tap" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="kd-mobile-tap">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Link account
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Paystack customer code</Label>
          <Input value={form.customerCode} onChange={(e) => setForm({ ...form, customerCode: e.target.value })} placeholder="CUS_xxxxxxxxxxxxxxx" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Account number</Label>
            <Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder="0000000000" />
          </div>
          <div className="space-y-1">
            <Label>Bank name</Label>
            <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. Wema Bank" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Account name (optional)</Label>
          <Input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="As shown on Paystack" />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Company Disbursement section
   ═══════════════════════════════════════════════════════════════════════ */
function CompanyDisbursementSection({ profile, toast }: { profile: any; toast: ReturnType<typeof useToast>['toast'] }) {
  const [rows, setRows] = useState<DisbursementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [receiptRow, setReceiptRow] = useState<DisbursementRow | null>(null);
  const [recurRow, setRecurRow] = useState<DisbursementRow | null>(null);
  const [companyName, setCompanyName] = useState('KD Squares Ltd');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dva, setDva] = useState<PrincipalWalletDva | null>(null);

  useEffect(() => {
    supabase.from('company_settings').select('company_name, logo_url')
      .eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle()
      .then(({ data: cs }) => {
        if (cs) {
          setCompanyName((cs as any).company_name || 'KD Squares Ltd');
          setLogoUrl((cs as any).logo_url || null);
        }
      }, () => { /* receipt falls back to defaults */ });
    fetchDvaAccount().then(setDva).catch(() => setDva(null));
  }, []);

  const load = async () => {
    setLoading(true);
    // RLS already scopes this to director-only categories + super_admin —
    // the payment_category filter here is a UI-level narrowing on top
    // (this page should never show a normal contractor/vendor Quick Pay
    // even though this super_admin's role could otherwise see everything).
    const { data, error } = await supabase
      .from('payment_batches')
      .select('id, name, payment_category, total_amount, status, payment_date, created_at, payment_description, batch_items(*)')
      .in('payment_category', ['director_salary', 'director_drawings', 'director_loan_repayment'])
      .order('created_at', { ascending: false });
    if (!error) {
      setRows((data ?? []) as DisbursementRow[]);
      await logAudit(
        'director_disbursement_list_viewed',
        `Viewed Company Disbursements list (${data?.length ?? 0} records)`,
        profile,
      );
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const viewDetail = async (row: DisbursementRow) => {
    await logAudit(
      'director_disbursement_viewed',
      `Viewed Company Disbursement detail: ${row.name} — ${formatNaira(row.total_amount)}`,
      profile,
    );
  };

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.payment_description || '').toLowerCase().includes(q)
        || directorDisbursementCategoryLabel(r.payment_category).toLowerCase().includes(q)
        || (r.name || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Requires a category on every entry. Feeds the company ledger and existing expense/payables reporting.
          Immutable once sent — corrections are new entries, never edits.
        </p>
        <Button onClick={() => setSendOpen(true)}>
          <Send className="mr-2 h-4 w-4" /> New disbursement
        </Button>
      </div>

      <Card className="rounded-xl">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">History</CardTitle>
          {rows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search description, category…"
                  className="h-8 w-full sm:w-56 pl-8 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Landmark} title="No company disbursements yet" description="Send your first one above." />
          ) : filteredRows.length === 0 ? (
            <EmptyState icon={Search} title="No matches" description="Try a different search term or status." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap">Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => viewDetail(r)}>
                        <TableCell>{formatDateTime(r.created_at)}</TableCell>
                        <TableCell><Badge variant="outline">{directorDisbursementCategoryLabel(r.payment_category)}</Badge></TableCell>
                        <TableCell className="max-w-[280px] truncate">{r.payment_description || '—'}</TableCell>
                        <TableCell className="text-right font-medium currency">{formatNaira(r.total_amount)}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            {r.batch_items && r.batch_items.length > 0 && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7" title="Receipt"
                                onClick={(e) => { e.stopPropagation(); setReceiptRow(r); }}
                              >
                                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            {r.status !== 'draft' && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7" title="Make recurring monthly"
                                onClick={(e) => { e.stopPropagation(); setRecurRow(r); }}
                              >
                                <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-2 p-3">
                {filteredRows.map((r) => (
                  <MobileCard key={r.id} onClick={() => viewDetail(r)} chevron>
                    <MobileCardHeader>
                      <MobileCardTitle>{directorDisbursementCategoryLabel(r.payment_category)}</MobileCardTitle>
                      <MobileCardMeta className="currency">{formatNaira(r.total_amount)}</MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Date">{formatDateTime(r.created_at)}</MobileCardRow>
                    <MobileCardRow label="Status">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.batch_items && r.batch_items.length > 0 && (
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6" title="Receipt"
                            onClick={(e) => { e.stopPropagation(); setReceiptRow(r); }}
                          >
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        {r.status !== 'draft' && (
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6" title="Make recurring monthly"
                            onClick={(e) => { e.stopPropagation(); setRecurRow(r); }}
                          >
                            <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </MobileCardRow>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <RecurringSchedulesCard profile={profile} toast={toast} />

      <CompanyDisbursementSendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        profile={profile}
        toast={toast}
        onSent={load}
        dva={dva}
      />

      <ReceiptModal
        open={!!receiptRow}
        onClose={() => setReceiptRow(null)}
        item={receiptRow?.batch_items?.[0] ?? null}
        batch={receiptRow}
        companyName={companyName}
        logoUrl={logoUrl}
        brand={receiptTheme.principalBrand}
        brandDark={receiptTheme.principalBrandDark}
        neutralBackdrop
      />

      <MakeRecurringDialog
        row={recurRow}
        onOpenChange={(v) => { if (!v) setRecurRow(null); }}
        profile={profile}
        toast={toast}
      />
    </div>
  );
}

function CompanyDisbursementSendDialog({
  open, onOpenChange, profile, toast, onSent, dva,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
  onSent: () => void;
  dva: PrincipalWalletDva | null;
}) {
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<SendResult>(null);
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [form, setForm] = useState({ amount: '', description: '', category: '' });
  const [showConfirm, setShowConfirm] = useState(false);

  const reset = () => { setBank(emptyBank); setForm({ amount: '', description: '', category: '' }); setResult(null); };

  const handleSend = () => {
    if (!bank.verified) { toast({ title: 'Verify bank account first', variant: 'destructive' }); return; }
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    if (!form.category) { toast({ title: 'Pick a category', description: 'Salary, drawings, or loan repayment — required for every company disbursement.', variant: 'destructive' }); return; }
    setShowConfirm(true);
  };

  const executeSend = async (customNarration?: string) => {
    setShowConfirm(false);
    const amount = parseFloat(form.amount);
    setProcessing(true);
    try {
      if (profile?.id) {
        const cap = await previewCapCheck(profile.id, amount);
        if (cap && !cap.allowed) throw new Error(cap.reason || 'Transfer cap exceeded');
      }
      const walletCheck = await checkWalletCanCover(amount + totalChargeFor(amount));
      if (!walletCheck.ok) throw new Error(walletCheck.reason);

      const { data: batch, error: batchErr } = await supabase
        .from('payment_batches')
        .insert({
          name: `Principal Disbursement — ${directorDisbursementCategoryLabel(form.category)}`,
          payment_date: new Date().toISOString().slice(0, 10),
          total_amount: amount,
          beneficiary_count: 1,
          status: 'funded',
          is_quick_pay: true,
          batch_type: 'mixed',
          created_by: profile?.id,
          payment_category: form.category,
          payment_description: customNarration?.trim() || form.description?.trim() || null,
          provider: 'paystack',
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      const bankCode = getBankCode(bank.bank_name);
      if (!bankCode) throw new Error(`Unknown bank: ${bank.bank_name}`);

      const recipient = await createTransferRecipient({
        name: bank.account_name || bank.account_number,
        account_number: bank.account_number,
        bank_code: bankCode,
      });

      const { data: insertedItem, error: itemErr } = await supabase.from('batch_items').insert({
        batch_id: (batch as any).id,
        full_name: bank.account_name || bank.account_number,
        bank_name: bank.bank_name,
        account_number: bank.account_number,
        amount_ngn: amount,
        reference: directorDisbursementCategoryLabel(form.category),
        status: 'pending',
        paystack_recipient_code: recipient.recipient_code,
        provider: 'paystack',
      }).select('id').single();
      if (itemErr || !insertedItem) throw new Error(`Could not create payment record: ${itemErr?.message || 'no item id'}`);

      const compactId = String(insertedItem.id).replace(/-/g, '').slice(0, 20);
      const ref = `kdops_${compactId}`;
      const { error: refWriteErr } = await supabase.from('batch_items')
        .update({ paystack_reference: ref }).eq('id', insertedItem.id);
      if (refWriteErr) throw new Error(`Could not record idempotency reference: ${refWriteErr.message}`);

      const narration = customNarration?.trim()
        || (form.description?.trim() ? form.description.trim().slice(0, 60) : '')
        || buildNarration({ kind: 'generic', label: directorDisbursementCategoryLabel(form.category) });

      const transfer = await initiateTransferIdempotent({
        recipient_code: recipient.recipient_code!,
        amount_ngn: amount,
        reference: ref,
        reason: narration,
      });
      const recoveredStatus = transfer.recovered ? (transfer.verified_status || transfer.status || '').toLowerCase() : null;
      const itemStatus =
        recoveredStatus === 'success' ? 'succeeded'
        : recoveredStatus === 'failed' || recoveredStatus === 'reversed' ? recoveredStatus
        : 'pending';

      await supabase.from('batch_items').update({
        status: itemStatus,
        paystack_transfer_code: transfer.transfer_code,
        narration,
        processed_at: itemStatus === 'succeeded' ? new Date().toISOString() : null,
        failure_reason: itemStatus === 'failed' ? 'Recovered: Paystack rejected the transfer' : null,
      }).eq('id', insertedItem.id);

      try { await startBatchProcessing((batch as any).id); } catch { /* worker/cron reconciles */ }

      await logAudit(
        'director_disbursement_sent',
        `Company Disbursement (${directorDisbursementCategoryLabel(form.category)}): ${formatNaira(amount)} to ${bank.account_name || bank.account_number} ref ${ref}`,
        profile,
      );

      setResult({ ok: true, ref });
      toast({ title: 'Disbursement sent', description: `Ref: ${ref}` });
      onSent();
    } catch (err: any) {
      const friendly = friendlyDbError(err);
      setResult({ ok: false, reason: friendly });
      toast({ title: 'Disbursement failed', description: friendly, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}
        size="lg"
        title={<span className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" /> New Company Disbursement</span>}
        description="Director salary, drawings, or loan repayment. Feeds the company ledger — immutable once sent."
        footer={result ? (
          <Button variant="outline" className="kd-mobile-tap" onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
        ) : (
          <>
            <Button variant="outline" className="kd-mobile-tap" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={processing || !bank.verified || !form.amount} className="kd-mobile-tap">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
          </>
        )}
      >
        {result ? (
          <div className="space-y-4 py-4 text-center">
            {result.ok && (
              <>
                <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                <p className="text-lg font-semibold">Disbursement sent</p>
                <Badge variant="secondary" className="bg-success/10 text-success">Ref: {result.ref}</Badge>
              </>
            )}
            {result.ok === false && (
              <>
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
                <p className="text-lg font-semibold">Disbursement failed</p>
                <p className="text-sm text-muted-foreground">{result.reason}</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <BankAccountField value={bank} onChange={setBank} provider="paystack" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Note (optional)</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. August salary" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">Category <span className="text-destructive" aria-hidden>*</span></Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className={form.category ? '' : 'text-muted-foreground'}>
                  {(() => {
                    const def = directorDisbursementCategoryDef(form.category);
                    if (!def) return <SelectValue placeholder="Salary, drawings, or loan repayment…" />;
                    const Icon = def.icon;
                    return <span className="flex items-center gap-2 truncate"><Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate text-sm">{def.label}</span></span>;
                  })()}
                </SelectTrigger>
                <SelectContent>
                  {DIRECTOR_DISBURSEMENT_CATEGORIES.map((opt: DirectorDisbursementCategoryDef) => {
                    const Icon = opt.icon;
                    return (
                      <SelectItem key={opt.key} value={opt.key} className="py-1.5">
                        <span className="flex items-center gap-2 min-w-0"><Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate text-sm">{opt.label}</span></span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {directorDisbursementCategoryDef(form.category)?.hint ?? 'Required — feeds the company ledger and expense/payables reporting.'}
              </p>
            </div>
            {bank.verified && form.amount && (
              <p className="text-sm text-muted-foreground">
                Sending <span className="font-semibold currency">{formatNaira(parseFloat(form.amount) || 0)}</span> to{' '}
                <span className="font-semibold">{bank.account_name}</span> · {bank.bank_name} · {bank.account_number}
              </p>
            )}
          </div>
        )}
      </ResponsiveDialog>

      <PaymentSummaryModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        items={[{ full_name: bank.account_name || bank.account_number || 'recipient', amount_ngn: parseFloat(form.amount) || 0, bank_name: bank.bank_name || undefined, account_number: bank.account_number || undefined }]}
        narrationKind="generic"
        label={form.description || directorDisbursementCategoryLabel(form.category)}
        title="Confirm Company Disbursement"
        onConfirm={(narration) => executeSend(narration)}
        fetchWalletBalance={fetchWalletBalanceOrNull}
        walletBalanceLabel="Principal Disbursements wallet"
        hideProviderBalance
        walletBankName={dva?.bank_name}
        walletAccountNumber={dva?.account_number}
        walletAccountName={dva?.account_name || undefined}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Recurring schedules — reuses the app-wide recurring_schedules table +
   kdops_recurring_payments cron (see 20260429080000_recurring_scheduler_cron.sql)
   that payroll/vendor batches already use. That cron ONLY ever clones a
   source batch into a new payment_batches row with status
   'pending_approval' — it never dispatches a transfer itself — so a
   monthly Company Disbursement schedule still requires the director's own
   review + Send/Approve, exactly like every other recurring batch in this
   app. A RESTRICTIVE RLS policy (see migration alongside this change)
   keeps schedules pointed at a director-only source batch invisible to
   anyone but super_admin, matching payment_batches/batch_items themselves.
   ═══════════════════════════════════════════════════════════════════════ */
function MakeRecurringDialog({
  row, onOpenChange, profile, toast,
}: {
  row: DisbursementRow | null;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const [day, setDay] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) setDay(new Date(row.payment_date || row.created_at).getDate() || 1);
  }, [row]);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try {
      const today = new Date();
      const nextMonth = today.getDate() >= day ? today.getMonth() + 1 : today.getMonth();
      const nextDate = new Date(today.getFullYear(), nextMonth, day);
      const { error } = await supabase.from('recurring_schedules').insert({
        source_batch_id: row.id,
        frequency: 'monthly',
        day_of_month: day,
        next_run_date: nextDate.toISOString().slice(0, 10),
        created_by: profile?.id,
      });
      if (error) throw error;
      await logAudit(
        'batch_scheduled',
        `Company Disbursement "${row.name}" set to recur monthly (day ${day}) — new drafts require approval`,
        profile,
      );
      toast({
        title: 'Recurring schedule created',
        description: `Next draft: ${nextDate.toLocaleDateString('en-GB')} — you'll review and approve it before anything sends.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Could not create schedule', description: friendlyDbError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={!!row}
      onOpenChange={onOpenChange}
      title={<span className="flex items-center gap-2"><Repeat className="h-5 w-5 text-primary" /> Make recurring — monthly</span>}
      description={row ? `Repeat "${row.name}" (${formatNaira(row.total_amount)}) every month.` : ''}
      footer={(
        <>
          <Button variant="outline" className="kd-mobile-tap" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="kd-mobile-tap">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create schedule
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <Alert className="border-primary/30 bg-primary/5">
          <ShieldAlert className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Nothing sends automatically. Each month KDOps creates a draft here for you to review — you still click Send.
          </AlertDescription>
        </Alert>
        <div className="space-y-1">
          <Label>Day of month</Label>
          <Input type="number" min={1} max={31} value={day} onChange={(e) => setDay(Number(e.target.value) || 1)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function RecurringSchedulesCard({ profile, toast }: { profile: any; toast: ReturnType<typeof useToast>['toast'] }) {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: batches } = await supabase
      .from('payment_batches')
      .select('id, name, payment_category, total_amount')
      .in('payment_category', ['director_salary', 'director_drawings', 'director_loan_repayment']);
    const batchIds = (batches ?? []).map((b: any) => b.id);
    if (batchIds.length === 0) { setSchedules([]); setLoading(false); return; }
    const byId = new Map((batches ?? []).map((b: any) => [b.id, b]));
    const { data: sched, error } = await supabase
      .from('recurring_schedules')
      .select('id, frequency, day_of_month, next_run_date, status, source_batch_id')
      .in('source_batch_id', batchIds)
      .order('next_run_date', { ascending: true });
    if (!error) {
      setSchedules((sched ?? []).map((s: any) => ({ ...s, batch: byId.get(s.source_batch_id) })));
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const togglePause = async (s: any) => {
    const next = s.status === 'paused' ? 'active' : 'paused';
    const { error } = await supabase.from('recurring_schedules').update({ status: next }).eq('id', s.id);
    if (error) { toast({ title: 'Could not update schedule', description: friendlyDbError(error), variant: 'destructive' }); return; }
    await logAudit('batch_scheduled', `Recurring schedule for "${s.batch?.name}" ${next === 'paused' ? 'paused' : 'resumed'}`, profile);
    load();
  };

  const remove = async (s: any) => {
    const { error } = await supabase.from('recurring_schedules').delete().eq('id', s.id);
    if (error) { toast({ title: 'Could not delete schedule', description: friendlyDbError(error), variant: 'destructive' }); return; }
    await logAudit('batch_scheduled', `Recurring schedule for "${s.batch?.name}" deleted`, profile);
    load();
  };

  if (loading || schedules.length === 0) return null;

  return (
    <Card className="rounded-xl">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Repeat className="h-4 w-4" /> Recurring schedules</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {schedules.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{s.batch?.name ?? 'Batch removed'}</p>
              <p className="text-xs text-muted-foreground">
                Monthly, day {s.day_of_month} · Next: {s.next_run_date ? formatDateTime(s.next_run_date) : '—'} · {formatNaira(s.batch?.total_amount ?? 0)}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge variant={s.status === 'active' ? 'secondary' : 'outline'} className="text-[10px]">{s.status}</Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" title={s.status === 'paused' ? 'Resume' : 'Pause'} onClick={() => togglePause(s)}>
                {s.status === 'paused' ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => remove(s)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Personal Transfer section
   ═══════════════════════════════════════════════════════════════════════ */
function PersonalTransferSection({ profile, toast }: { profile: any; toast: ReturnType<typeof useToast>['toast'] }) {
  const [rows, setRows] = useState<PersonalTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [beneficiariesOpen, setBeneficiariesOpen] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState<PersonalTransferBeneficiaryRow[]>([]);
  const [receiptRow, setReceiptRow] = useState<PersonalTransferRow | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [companyName, setCompanyName] = useState('KD Squares Ltd');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [dva, setDva] = useState<PrincipalWalletDva | null>(null);

  useEffect(() => {
    supabase.from('company_settings').select('company_name, logo_url')
      .eq('id', '00000000-0000-0000-0000-000000000001').maybeSingle()
      .then(({ data: cs }) => {
        if (cs) {
          setCompanyName((cs as any).company_name || 'KD Squares Ltd');
          setLogoUrl((cs as any).logo_url || null);
        }
      }, () => { /* receipt falls back to defaults */ });
    fetchDvaAccount().then(setDva).catch(() => setDva(null));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPersonalTransfers(profile);
      setRows(data);
    } catch (err: any) {
      toast({ title: 'Could not load personal transfers', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadBeneficiaries = async () => {
    try {
      setBeneficiaries(await fetchPersonalTransferBeneficiaries());
    } catch (err: any) {
      toast({ title: 'Could not load beneficiaries', description: err?.message, variant: 'destructive' });
    }
  };

  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Manual reconciliation — the webhook path normally resolves a pending
  // transfer automatically, but this is a safety net for any case it
  // doesn't (missed delivery, transient error). Calls Paystack directly
  // via verify_transfer, so it reflects real status even if no webhook
  // ever arrives.
  const verifyStatus = async (row: PersonalTransferRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.paystack_reference) return;
    setVerifyingId(row.id);
    try {
      const verified = await verifyTransfer(row.paystack_reference);
      const st = verified.status.toLowerCase();
      const status = st === 'success' ? 'succeeded' : st === 'failed' || st === 'reversed' ? st : 'pending';
      if (status !== 'pending') {
        await supabase.from('personal_transfers').update({
          status,
          processed_at: status === 'succeeded' ? new Date().toISOString() : null,
          failure_reason: status === 'failed' ? (verified.reason || 'Paystack rejected the transfer') : null,
        }).eq('id', row.id);
        toast({ title: `Transfer ${status}`, description: row.recipient_name });
        load();
      } else {
        toast({ title: 'Still pending', description: 'Paystack has not resolved this transfer yet.' });
      }
    } catch (err: any) {
      toast({ title: 'Could not check status', description: err?.message, variant: 'destructive' });
    } finally {
      setVerifyingId(null);
    }
  };

  useEffect(() => {
    void load();
    void loadBeneficiaries();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.recipient_account_name || '').toLowerCase().includes(q)
        || (r.recipient_name || '').toLowerCase().includes(q)
        || (r.memo || '').toLowerCase().includes(q)
        || (r.batch_label || '').toLowerCase().includes(q)
        || (r.paystack_reference || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">
          Your own post-salary money. Uses Paystack as a pure transfer utility — never touches the company
          ledger, expense reports, or payables. Visible only to you.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setBeneficiariesOpen(true)}>
            <Users className="mr-2 h-4 w-4" /> Beneficiaries
          </Button>
          <Button variant="outline" onClick={() => setBatchOpen(true)}>
            <Layers className="mr-2 h-4 w-4" /> New batch
          </Button>
          <Button onClick={() => setSendOpen(true)}>
            <Send className="mr-2 h-4 w-4" /> New transfer
          </Button>
        </div>
      </div>

      <Card className="rounded-xl">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">History</CardTitle>
          {rows.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recipient, memo, batch…"
                  className="h-8 w-full sm:w-56 pl-8 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-[140px] text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Send} title="No personal transfers yet" description="Send your first one above." />
          ) : filteredRows.length === 0 ? (
            <EmptyState icon={Search} title="No matches" description="Try a different search or status." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Memo / Batch</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap">Receipt</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => logPersonalTransferDetailView(r, profile)}>
                        <TableCell>{formatDateTime(r.created_at)}</TableCell>
                        <TableCell>{r.recipient_account_name || r.recipient_name}</TableCell>
                        <TableCell className="max-w-[280px] truncate">
                          {r.batch_label && <Badge variant="outline" className="mr-1.5 text-[10px]">{r.batch_label}</Badge>}
                          {r.memo || (r.batch_label ? '' : '—')}
                        </TableCell>
                        <TableCell className="text-right font-medium currency">{formatNaira(r.amount_ngn)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <StatusBadge status={r.status} />
                            {r.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title="Check status with Paystack"
                                disabled={verifyingId === r.id}
                                onClick={(e) => verifyStatus(r, e)}
                              >
                                {verifyingId === r.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.status !== 'pending' && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7" title="Receipt"
                              onClick={(e) => { e.stopPropagation(); setReceiptRow(r); }}
                            >
                              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-2 p-3">
                {filteredRows.map((r) => (
                  <MobileCard key={r.id} onClick={() => logPersonalTransferDetailView(r, profile)} chevron>
                    <MobileCardHeader>
                      <MobileCardTitle>{r.recipient_account_name || r.recipient_name}</MobileCardTitle>
                      <MobileCardMeta className="currency">{formatNaira(r.amount_ngn)}</MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Date">{formatDateTime(r.created_at)}</MobileCardRow>
                    {r.batch_label && <MobileCardRow label="Batch">{r.batch_label}</MobileCardRow>}
                    <MobileCardRow label="Status">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            title="Check status with Paystack"
                            disabled={verifyingId === r.id}
                            onClick={(e) => verifyStatus(r, e)}
                          >
                            {verifyingId === r.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />}
                          </Button>
                        )}
                        {r.status !== 'pending' && (
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6" title="Receipt"
                            onClick={(e) => { e.stopPropagation(); setReceiptRow(r); }}
                          >
                            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </MobileCardRow>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <PersonalTransferSendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        profile={profile}
        toast={toast}
        onSent={load}
        beneficiaries={beneficiaries}
        dva={dva}
      />
      <PersonalTransferBatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        profile={profile}
        toast={toast}
        onSent={load}
        beneficiaries={beneficiaries}
        history={rows}
        dva={dva}
      />
      <PersonalTransferBeneficiariesDialog
        open={beneficiariesOpen}
        onOpenChange={setBeneficiariesOpen}
        profile={profile}
        toast={toast}
        beneficiaries={beneficiaries}
        onChanged={loadBeneficiaries}
      />

      <PersonalTransferReceiptModal
        open={!!receiptRow}
        onClose={() => setReceiptRow(null)}
        row={receiptRow}
        companyName={companyName}
        logoUrl={logoUrl}
        brand={receiptTheme.principalBrand}
        brandDark={receiptTheme.principalBrandDark}
        neutralBackdrop
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Beneficiaries manager — saved recipients, reused across single sends
   and batches. Caches paystack_recipient_code per Paystack's own
   documented guidance (create once, reuse from your own database).
   ═══════════════════════════════════════════════════════════════════════ */
function PersonalTransferBeneficiariesDialog({
  open, onOpenChange, profile, toast, beneficiaries, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
  beneficiaries: PersonalTransferBeneficiaryRow[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [label, setLabel] = useState('');

  const reset = () => { setAdding(false); setBank(emptyBank); setLabel(''); };

  const save = async () => {
    if (!bank.verified) { toast({ title: 'Verify bank account first', variant: 'destructive' }); return; }
    if (!label.trim()) { toast({ title: 'Give this beneficiary a name', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const bankCode = getBankCode(bank.bank_name);
      if (!bankCode) throw new Error(`Unknown bank: ${bank.bank_name}`);
      const recipient = await createTransferRecipient({
        name: bank.account_name || bank.account_number,
        account_number: bank.account_number,
        bank_code: bankCode,
      });
      await createPersonalTransferBeneficiary({
        ownerId: profile?.id,
        label: label.trim(),
        accountNumber: bank.account_number,
        bankCode,
        bankName: bank.bank_name,
        accountName: bank.account_name,
        paystackRecipientCode: recipient.recipient_code,
      });
      toast({ title: 'Beneficiary saved' });
      reset();
      onChanged();
    } catch (err: any) {
      toast({ title: 'Could not save beneficiary', description: friendlyDbError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: PersonalTransferBeneficiaryRow) => {
    try {
      await deletePersonalTransferBeneficiary(b.id);
      toast({ title: `${b.label} removed` });
      onChanged();
    } catch (err: any) {
      toast({ title: 'Could not remove beneficiary', description: friendlyDbError(err), variant: 'destructive' });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}
      size="lg"
      title={<span className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Beneficiaries</span>}
      description="Saved recipients for Personal Transfer — private to you, reused for single and batch sends."
      footer={<Button variant="outline" className="kd-mobile-tap" onClick={() => onOpenChange(false)}>Close</Button>}
    >
      <div className="space-y-3">
        {beneficiaries.length === 0 && !adding && (
          <EmptyState icon={Users} title="No saved beneficiaries yet" description="Add one below to reuse it in future transfers." />
        )}
        {beneficiaries.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{b.label}</p>
              <p className="text-xs text-muted-foreground truncate">{b.account_name || b.account_number} · {b.bank_name} · {b.account_number}</p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(b)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {adding ? (
          <div className="space-y-3 rounded-lg border border-dashed border-primary/40 p-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Mum" />
            </div>
            <BankAccountField value={bank} onChange={setBank} provider="paystack" />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving || !bank.verified || !label.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add beneficiary
          </Button>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function PersonalTransferSendDialog({
  open, onOpenChange, profile, toast, onSent, beneficiaries, dva,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
  onSent: () => void;
  beneficiaries: PersonalTransferBeneficiaryRow[];
  dva: PrincipalWalletDva | null;
}) {
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<SendResult>(null);
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [form, setForm] = useState({ amount: '', memo: '' });
  const [showConfirm, setShowConfirm] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState<string>('');

  const reset = () => { setBank(emptyBank); setForm({ amount: '', memo: '' }); setResult(null); setBeneficiaryId(''); };

  const pickBeneficiary = (id: string) => {
    setBeneficiaryId(id);
    const b = beneficiaries.find((x) => x.id === id);
    if (b) {
      setBank({
        bank_name: b.bank_name || '',
        account_number: b.account_number,
        account_name: b.account_name || b.label,
        verified: true,
      });
    }
  };

  const handleSend = () => {
    if (!bank.verified) { toast({ title: 'Verify bank account first', variant: 'destructive' }); return; }
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    setShowConfirm(true);
  };

  const executeSend = async (customNarration?: string) => {
    setShowConfirm(false);
    const amount = parseFloat(form.amount);
    setProcessing(true);
    try {
      if (profile?.id) {
        const cap = await previewCapCheck(profile.id, amount);
        if (cap && !cap.allowed) throw new Error(cap.reason || 'Transfer cap exceeded');
      }
      const walletCheck = await checkWalletCanCover(amount + totalChargeFor(amount));
      if (!walletCheck.ok) throw new Error(walletCheck.reason);

      const bankCode = getBankCode(bank.bank_name);
      if (!bankCode) throw new Error(`Unknown bank: ${bank.bank_name}`);

      // Reuse the saved beneficiary's cached recipient_code when picked from
      // the list (Paystack's own guidance: create once, reuse from your own
      // database) — only creates a fresh Paystack recipient for a one-off,
      // unsaved account.
      const selectedBeneficiary = beneficiaries.find((b) => b.id === beneficiaryId);
      const recipientCode = selectedBeneficiary?.paystack_recipient_code
        || (await createTransferRecipient({
          name: bank.account_name || bank.account_number,
          account_number: bank.account_number,
          bank_code: bankCode,
        })).recipient_code;

      const { data: inserted, error: insertErr } = await supabase.from('personal_transfers').insert({
        initiated_by: profile?.id,
        recipient_name: bank.account_name || bank.account_number,
        recipient_account_number: bank.account_number,
        recipient_bank_code: bankCode,
        recipient_bank_name: bank.bank_name,
        recipient_account_name: bank.account_name || null,
        amount_ngn: amount,
        memo: form.memo?.trim() || null,
        paystack_recipient_code: recipientCode,
        beneficiary_id: beneficiaryId || null,
        status: 'pending',
      }).select('id').single();
      if (insertErr || !inserted) throw new Error(`Could not create transfer record: ${insertErr?.message || 'no id'}`);

      const compactId = String(inserted.id).replace(/-/g, '').slice(0, 20);
      const ref = `kdopspt_${compactId}`;
      const { error: refWriteErr } = await supabase.from('personal_transfers').update({ paystack_reference: ref }).eq('id', inserted.id);
      if (refWriteErr) throw new Error(`Could not record idempotency reference: ${refWriteErr.message}`);

      const narration = customNarration?.trim()
        || (form.memo?.trim() ? form.memo.trim().slice(0, 60) : '')
        || buildNarration({ kind: 'generic', label: 'Personal transfer' });

      const transfer = await initiateTransferIdempotent({
        recipient_code: recipientCode!,
        amount_ngn: amount,
        reference: ref,
        reason: narration,
      });
      const recoveredStatus = transfer.recovered ? (transfer.verified_status || transfer.status || '').toLowerCase() : null;
      const status =
        recoveredStatus === 'success' ? 'succeeded'
        : recoveredStatus === 'failed' || recoveredStatus === 'reversed' ? recoveredStatus
        : 'pending';

      await supabase.from('personal_transfers').update({
        status,
        paystack_transfer_code: transfer.transfer_code,
        processed_at: status === 'succeeded' ? new Date().toISOString() : null,
        failure_reason: status === 'failed' ? 'Recovered: Paystack rejected the transfer' : null,
      }).eq('id', inserted.id);

      await logAudit(
        'personal_transfer_sent',
        `Personal Transfer: ${formatNaira(amount)} to ${bank.account_name || bank.account_number} ref ${ref}`,
        profile,
      );

      setResult({ ok: true, ref });
      toast({ title: 'Transfer sent', description: `Ref: ${ref}` });
      onSent();
    } catch (err: any) {
      const friendly = friendlyDbError(err);
      setResult({ ok: false, reason: friendly });
      toast({ title: 'Transfer failed', description: friendly, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}
        size="lg"
        title={<span className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" /> New Personal Transfer</span>}
        description="Your own money. Never touches the company ledger, expense reports, or payables — visible only to you."
        footer={result ? (
          <Button variant="outline" className="kd-mobile-tap" onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
        ) : (
          <>
            <Button variant="outline" className="kd-mobile-tap" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={processing || !bank.verified || !form.amount} className="kd-mobile-tap">
              {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
          </>
        )}
      >
        {result ? (
          <div className="space-y-4 py-4 text-center">
            {result.ok && (
              <>
                <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                <p className="text-lg font-semibold">Transfer sent</p>
                <Badge variant="secondary" className="bg-success/10 text-success">Ref: {result.ref}</Badge>
              </>
            )}
            {result.ok === false && (
              <>
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
                <p className="text-lg font-semibold">Transfer failed</p>
                <p className="text-sm text-muted-foreground">{result.reason}</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Alert className="border-primary/30 bg-primary/5">
              <ShieldAlert className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                This is a pure Paystack transfer utility. It will not appear in Transactions, Reports, or any
                expense/payables view — only here.
              </AlertDescription>
            </Alert>
            {beneficiaries.length > 0 && (
              <div className="space-y-1">
                <Label>Saved beneficiary (optional)</Label>
                <Select value={beneficiaryId} onValueChange={pickBeneficiary}>
                  <SelectTrigger><SelectValue placeholder="Pick a saved beneficiary, or enter a new account below…" /></SelectTrigger>
                  <SelectContent>
                    {beneficiaries.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.label} — {b.bank_name} · {b.account_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <BankAccountField value={bank} onChange={(v) => { setBank(v); setBeneficiaryId(''); }} provider="paystack" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label>Memo (private, optional)</Label>
                <Input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="e.g. Parent allowance" />
              </div>
            </div>
            {bank.verified && form.amount && (
              <p className="text-sm text-muted-foreground">
                Sending <span className="font-semibold currency">{formatNaira(parseFloat(form.amount) || 0)}</span> to{' '}
                <span className="font-semibold">{bank.account_name}</span> · {bank.bank_name} · {bank.account_number}
              </p>
            )}
          </div>
        )}
      </ResponsiveDialog>

      <PaymentSummaryModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        items={[{ full_name: bank.account_name || bank.account_number || 'recipient', amount_ngn: parseFloat(form.amount) || 0, bank_name: bank.bank_name || undefined, account_number: bank.account_number || undefined }]}
        narrationKind="generic"
        label={form.memo || 'Personal transfer'}
        title="Confirm Personal Transfer"
        onConfirm={(narration) => executeSend(narration)}
        fetchWalletBalance={fetchWalletBalanceOrNull}
        walletBalanceLabel="Principal Disbursements wallet"
        hideProviderBalance
        walletBankName={dva?.bank_name}
        walletAccountNumber={dva?.account_number}
        walletAccountName={dva?.account_name || undefined}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Batch send — pick multiple saved beneficiaries, one amount each, one
   Paystack /transfer/bulk call (chunked at 100/call, ≥5s between chunks —
   the same discipline batch-worker uses for company payroll). Scoped to
   saved beneficiaries only (not ad-hoc accounts) to keep this dialog to a
   single, safe shape — add a new one-off account as a beneficiary first
   if it needs to be part of a batch.
   ═══════════════════════════════════════════════════════════════════════ */
const BULK_CHUNK_SIZE = 100;
const BULK_INTER_CHUNK_MS = 5_000;

/** Soft-warning risk flags for a batch — never blocks Send, matches the
 *  "soft warnings only" philosophy already used by batch_velocity_flags.sql
 *  for payroll. personal_transfers has no equivalent risk coverage today
 *  (confirmed: nothing references personal_transfers in that migration or
 *  payment_anomaly_detection.sql), so this fills that gap for batches
 *  specifically, computed client-side from data already on hand — no new
 *  DB surface needed for a purely advisory check. */
interface RiskFlag { key: string; text: string; detail: string }

function computeBatchRiskFlags(
  selected: PersonalTransferBeneficiaryRow[],
  amounts: Record<string, string>,
  history: PersonalTransferRow[],
): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const now = Date.now();

  const byAccount = new Map<string, string[]>();
  selected.forEach((b) => {
    const key = `${b.bank_code}:${b.account_number}`;
    byAccount.set(key, [...(byAccount.get(key) ?? []), b.label]);
  });
  byAccount.forEach((labels, key) => {
    if (labels.length > 1) {
      flags.push({ key: `dup:${key}`, text: 'Duplicate account in this batch', detail: `${labels.join(', ')} share the same bank account.` });
    }
  });

  const succeededAmounts = history.filter((h) => h.status === 'succeeded').map((h) => h.amount_ngn);
  const overallAvg = succeededAmounts.length > 0 ? succeededAmounts.reduce((a, c) => a + c, 0) / succeededAmounts.length : null;

  selected.forEach((b) => {
    const amount = parseFloat(amounts[b.id]) || 0;
    if (amount <= 0) return;

    const createdMs = new Date(b.created_at).getTime();
    if (Number.isFinite(createdMs) && now - createdMs < 48 * 60 * 60 * 1000) {
      flags.push({ key: `new:${b.id}`, text: `${b.label} is a new beneficiary`, detail: 'Added within the last 48 hours.' });
    }

    const own = history.filter((h) => h.beneficiary_id === b.id && h.status === 'succeeded').map((h) => h.amount_ngn);
    const baseline = own.length > 0 ? own.reduce((a, c) => a + c, 0) / own.length : overallAvg;
    if (baseline && amount > baseline * 3) {
      flags.push({ key: `high:${b.id}`, text: `${b.label}: unusually high amount`, detail: `${formatNaira(amount)} vs a typical ${formatNaira(baseline)}.` });
    }
  });

  return flags;
}

function PersonalTransferBatchDialog({
  open, onOpenChange, profile, toast, onSent, beneficiaries, history, dva,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
  onSent: () => void;
  beneficiaries: PersonalTransferBeneficiaryRow[];
  history: PersonalTransferRow[];
  dva: PrincipalWalletDva | null;
}) {
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<null | { ok: true; count: number } | { ok: false; reason: string }>(null);
  const [batchLabel, setBatchLabel] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sameAmount, setSameAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const reset = () => { setBatchLabel(''); setAmounts({}); setSelected(new Set()); setResult(null); setProgress(''); setSameAmount(''); };

  const applySameAmount = () => {
    if (!sameAmount || !(parseFloat(sameAmount) > 0)) return;
    setAmounts((a) => {
      const next = { ...a };
      selected.forEach((id) => { next[id] = sameAmount; });
      return next;
    });
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedBeneficiaries = beneficiaries.filter((b) => selected.has(b.id));
  const totalAmount = selectedBeneficiaries.reduce((sum, b) => sum + (parseFloat(amounts[b.id]) || 0), 0);
  const allAmountsValid = selectedBeneficiaries.length > 0
    && selectedBeneficiaries.every((b) => Number.isFinite(parseFloat(amounts[b.id])) && parseFloat(amounts[b.id]) > 0);

  const batchCost = batchCostBreakdown(selectedBeneficiaries.map((b) => parseFloat(amounts[b.id]) || 0));

  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!open) { setWalletBalance(null); return; }
    void fetchWalletBalanceOrNull().then(setWalletBalance).catch(() => setWalletBalance(null));
  }, [open]);
  const walletInsufficient = walletBalance != null && batchCost.grandTotal > walletBalance;

  const riskFlags = useMemo(
    () => computeBatchRiskFlags(selectedBeneficiaries, amounts, history),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, amounts, history],
  );

  const executeBatch = async (customNarration?: string) => {
    setShowConfirm(false);
    setProcessing(true);
    setResult(null);
    try {
      if (profile?.id) {
        const cap = await previewCapCheck(profile.id, totalAmount);
        if (cap && !cap.allowed) throw new Error(cap.reason || 'Transfer cap exceeded');
      }
      const walletCheck = await checkWalletCanCover(batchCost.grandTotal);
      if (!walletCheck.ok) throw new Error(walletCheck.reason);

      const label = batchLabel.trim() || null;

      // Insert one pending row per recipient first — same discipline as the
      // single-send path: the DB row exists before any Paystack call, so a
      // dropped connection mid-batch still leaves a traceable pending record
      // rather than a payment nobody can find.
      const rowsToInsert = selectedBeneficiaries.map((b) => ({
        initiated_by: profile?.id,
        recipient_name: b.account_name || b.label,
        recipient_account_number: b.account_number,
        recipient_bank_code: b.bank_code,
        recipient_bank_name: b.bank_name,
        recipient_account_name: b.account_name,
        amount_ngn: parseFloat(amounts[b.id]),
        beneficiary_id: b.id,
        batch_label: label,
        paystack_recipient_code: b.paystack_recipient_code,
        status: 'pending' as const,
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from('personal_transfers')
        .insert(rowsToInsert)
        .select('id, amount_ngn, paystack_recipient_code');
      if (insertErr || !inserted) throw new Error(`Could not create batch records: ${insertErr?.message || 'no rows'}`);

      // Pre-write deterministic references before dispatch (idempotency —
      // same pattern as every other send path in this app).
      const withRefs = inserted.map((row: any) => ({
        ...row,
        reference: `kdopspt_${String(row.id).replace(/-/g, '').slice(0, 20)}`,
      }));
      await Promise.all(withRefs.map((row: any) =>
        supabase.from('personal_transfers').update({ paystack_reference: row.reference }).eq('id', row.id),
      ));

      const narration = customNarration?.trim() || (label
        ? buildNarration({ kind: 'generic', label: label.slice(0, 40) })
        : buildNarration({ kind: 'generic', label: 'Personal transfer' }));

      // Chunk at 100/call, ≥5s between chunks — Paystack's documented bulk
      // transfer limits, same constants batch-worker uses for payroll.
      let succeededCount = 0;
      for (let i = 0; i < withRefs.length; i += BULK_CHUNK_SIZE) {
        const chunk = withRefs.slice(i, i + BULK_CHUNK_SIZE);
        if (i > 0) {
          setProgress(`Waiting to stay under Paystack's rate limit… (${i}/${withRefs.length} sent)`);
          await new Promise((r) => setTimeout(r, BULK_INTER_CHUNK_MS));
        }
        setProgress(`Sending ${Math.min(i + chunk.length, withRefs.length)}/${withRefs.length}…`);

        const items: BulkTransferItem[] = chunk.map((row: any) => ({
          reference: row.reference,
          recipient: row.paystack_recipient_code,
          amount: Math.round(row.amount_ngn * 100), // bulkTransfer takes kobo
          reason: narration,
        }));
        const results = await bulkTransfer(items);
        const byRef = new Map(results.map((r) => [r.reference, r]));

        await Promise.all(chunk.map(async (row: any) => {
          const r = byRef.get(row.reference);
          const st = String(r?.status || '').toLowerCase();
          const status = st === 'success' ? 'succeeded' : st === 'failed' || st === 'reversed' ? st : 'pending';
          if (status === 'succeeded') succeededCount += 1;
          await supabase.from('personal_transfers').update({
            status,
            paystack_transfer_code: r?.transfer_code || null,
            processed_at: status === 'succeeded' ? new Date().toISOString() : null,
            failure_reason: status === 'failed' ? 'Paystack rejected the transfer' : null,
          }).eq('id', row.id);
        }));
      }

      await logAudit(
        'personal_transfer_sent',
        `Personal Transfer batch${label ? ` "${label}"` : ''}: ${withRefs.length} recipients, ${formatNaira(totalAmount)} total (${succeededCount} succeeded)`,
        profile,
      );

      setResult({ ok: true, count: withRefs.length });
      toast({ title: 'Batch sent', description: `${withRefs.length} transfers dispatched` });
      onSent();
    } catch (err: any) {
      const friendly = friendlyDbError(err);
      setResult({ ok: false, reason: friendly });
      toast({ title: 'Batch failed', description: friendly, variant: 'destructive' });
    } finally {
      setProcessing(false);
      setProgress('');
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}
      size="lg"
      title={<span className="flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> New Batch</span>}
      description="Send to several saved beneficiaries in one go. Add a new one-off account as a beneficiary first if it needs to be included."
      footer={result ? (
        <Button variant="outline" className="kd-mobile-tap" onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
      ) : (
        <>
          <Button variant="outline" className="kd-mobile-tap" onClick={() => onOpenChange(false)} disabled={processing}>Cancel</Button>
          <Button onClick={() => setShowConfirm(true)} disabled={processing || !allAmountsValid || walletInsufficient} className="kd-mobile-tap">
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Layers className="mr-2 h-4 w-4" /> Review &amp; send {selectedBeneficiaries.length > 0 && `(${selectedBeneficiaries.length})`}
          </Button>
        </>
      )}
    >
      {result ? (
        <div className="space-y-4 py-4 text-center">
          {result.ok && (
            <>
              <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
              <p className="text-lg font-semibold">Batch sent</p>
              <p className="text-sm text-muted-foreground">{result.count} transfers dispatched</p>
            </>
          )}
          {result.ok === false && (
            <>
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <p className="text-lg font-semibold">Batch failed</p>
              <p className="text-sm text-muted-foreground">{result.reason}</p>
            </>
          )}
        </div>
      ) : processing ? (
        <div className="py-10 text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">{progress || 'Sending…'}</p>
        </div>
      ) : beneficiaries.length === 0 ? (
        <EmptyState icon={Users} title="No saved beneficiaries" description="Add beneficiaries first — batches are built from your saved list." />
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Batch label (optional)</Label>
            <Input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="e.g. August family transfers" />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2">
              <Label className="text-xs text-muted-foreground shrink-0">Same amount for all {selected.size} selected</Label>
              <Input
                type="number" min="0" className="h-8 text-sm"
                placeholder="₦0.00"
                value={sameAmount}
                onChange={(e) => setSameAmount(e.target.value)}
              />
              <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={applySameAmount} disabled={!(parseFloat(sameAmount) > 0)}>
                Apply
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {beneficiaries.map((b) => {
              const isSelected = selected.has(b.id);
              return (
                <div key={b.id} className={`rounded-lg border px-3 py-2.5 kd-transition ${isSelected ? 'border-primary/40 bg-primary/5' : 'border-border/60'}`}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(b.id)} className="h-4 w-4 accent-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{b.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.bank_name} · {b.account_number}</p>
                    </div>
                    {isSelected && (
                      <Input
                        type="number"
                        min="0"
                        className="w-32 h-8 text-sm"
                        placeholder="Amount (₦)"
                        value={amounts[b.id] || ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setAmounts((a) => ({ ...a, [b.id]: e.target.value }))}
                      />
                    )}
                  </label>
                </div>
              );
            })}
          </div>
          {selectedBeneficiaries.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedBeneficiaries.length} recipient{selectedBeneficiaries.length !== 1 ? 's' : ''} ·{' '}
              total <span className="font-semibold currency">{formatNaira(totalAmount)}</span>
              {batchCost.totalCharges > 0 && (
                <> + <span className="currency">{formatNaira(batchCost.totalCharges)}</span> fees = <span className="font-semibold currency">{formatNaira(batchCost.grandTotal)}</span></>
              )}
            </p>
          )}
          {walletInsufficient && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Insufficient Principal Disbursements wallet balance</AlertTitle>
              <AlertDescription>
                This batch (₦{batchCost.grandTotal.toLocaleString('en-NG', { minimumFractionDigits: 2 })} including fees) is{' '}
                ₦{(batchCost.grandTotal - (walletBalance ?? 0)).toLocaleString('en-NG', { minimumFractionDigits: 2 })}{' '}
                more than the wallet balance (₦{(walletBalance ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}) — fund the dedicated account before sending.
              </AlertDescription>
            </Alert>
          )}
          {riskFlags.length > 0 && (
            <Alert className="border-amber-500/40 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-sm space-y-1">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  {riskFlags.length} thing{riskFlags.length !== 1 ? 's' : ''} worth a look — nothing here blocks sending
                </p>
                <ul className="space-y-0.5">
                  {riskFlags.map((f) => (
                    <li key={f.key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{f.text}</span> — {f.detail}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <PaymentSummaryModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        items={selectedBeneficiaries.map((b) => ({
          full_name: b.account_name || b.label,
          amount_ngn: parseFloat(amounts[b.id]) || 0,
          bank_name: b.bank_name || undefined,
          account_number: b.account_number || undefined,
        }))}
        narrationKind="generic"
        label={batchLabel || 'Personal transfer'}
        title="Confirm Personal Transfer Batch"
        onConfirm={(narration) => executeBatch(narration)}
        fetchWalletBalance={fetchWalletBalanceOrNull}
        walletBalanceLabel="Principal Disbursements wallet"
        hideProviderBalance
        walletBankName={dva?.bank_name}
        walletAccountNumber={dva?.account_number}
        walletAccountName={dva?.account_name || undefined}
      />
    </ResponsiveDialog>
  );
}
