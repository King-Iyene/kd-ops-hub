/**
 * Director Disbursements — super_admin-only module for two hard-separated
 * ways the director moves money out via Paystack:
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
import { useEffect, useState } from 'react';
import {
  Landmark, Loader2, CheckCircle2, XCircle, ShieldAlert, Send,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import {
  createTransferRecipient,
  initiateTransferIdempotent,
  getBankCode,
  buildNarration,
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
  type PersonalTransferRow,
} from '@/lib/personal-transfers';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { PaymentSummaryModal } from '@/components/PaymentSummaryModal';
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
}

export default function DirectorDisbursements() {
  usePageTitle('Director Disbursements');
  const { profile } = useAuthStore();
  const { toast } = useToast();

  return (
    <div className="space-y-4">
      <AuroraHero className="p-5 sm:p-6" pattern="grid">
        <PageHeader
          className="mb-0"
          title="Director Disbursements"
          description="Company disbursements (salary, drawings, loan repayments) and your own personal transfers — kept structurally separate."
          icon={Landmark}
          badge={<Badge variant="outline" className="border-primary/30 text-primary">Super admin only</Badge>}
        />
      </AuroraHero>

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
   Company Disbursement section
   ═══════════════════════════════════════════════════════════════════════ */
function CompanyDisbursementSection({ profile, toast }: { profile: any; toast: ReturnType<typeof useToast>['toast'] }) {
  const [rows, setRows] = useState<DisbursementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    // RLS already scopes this to director-only categories + super_admin —
    // the payment_category filter here is a UI-level narrowing on top
    // (this page should never show a normal contractor/vendor Quick Pay
    // even though this super_admin's role could otherwise see everything).
    const { data, error } = await supabase
      .from('payment_batches')
      .select('id, name, payment_category, total_amount, status, payment_date, created_at, payment_description')
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
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Landmark} title="No company disbursements yet" description="Send your first one above." />
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => viewDetail(r)}>
                        <TableCell>{formatDateTime(r.created_at)}</TableCell>
                        <TableCell><Badge variant="outline">{directorDisbursementCategoryLabel(r.payment_category)}</Badge></TableCell>
                        <TableCell className="max-w-[280px] truncate">{r.payment_description || '—'}</TableCell>
                        <TableCell className="text-right font-medium currency">{formatNaira(r.total_amount)}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-2 p-3">
                {rows.map((r) => (
                  <MobileCard key={r.id} onClick={() => viewDetail(r)} chevron>
                    <MobileCardHeader>
                      <MobileCardTitle>{directorDisbursementCategoryLabel(r.payment_category)}</MobileCardTitle>
                      <MobileCardMeta className="currency">{formatNaira(r.total_amount)}</MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Date">{formatDateTime(r.created_at)}</MobileCardRow>
                    <MobileCardRow label="Status"><StatusBadge status={r.status} /></MobileCardRow>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CompanyDisbursementSendDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        profile={profile}
        toast={toast}
        onSent={load}
      />
    </div>
  );
}

function CompanyDisbursementSendDialog({
  open, onOpenChange, profile, toast, onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
  onSent: () => void;
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

      const { data: batch, error: batchErr } = await supabase
        .from('payment_batches')
        .insert({
          name: `Director Disbursement — ${directorDisbursementCategoryLabel(form.category)}`,
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
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Personal Transfer section
   ═══════════════════════════════════════════════════════════════════════ */
function PersonalTransferSection({ profile, toast }: { profile: any; toast: ReturnType<typeof useToast>['toast'] }) {
  const [rows, setRows] = useState<PersonalTransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);

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

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-xl">
          Your own post-salary money. Uses Paystack as a pure transfer utility — never touches the company
          ledger, expense reports, or payables. Visible only to you.
        </p>
        <Button onClick={() => setSendOpen(true)}>
          <Send className="mr-2 h-4 w-4" /> New transfer
        </Button>
      </div>

      <Card className="rounded-xl">
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={Send} title="No personal transfers yet" description="Send your first one above." />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => logPersonalTransferDetailView(r, profile)}>
                        <TableCell>{formatDateTime(r.created_at)}</TableCell>
                        <TableCell>{r.recipient_account_name || r.recipient_name}</TableCell>
                        <TableCell className="max-w-[280px] truncate">{r.memo || '—'}</TableCell>
                        <TableCell className="text-right font-medium currency">{formatNaira(r.amount_ngn)}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="md:hidden space-y-2 p-3">
                {rows.map((r) => (
                  <MobileCard key={r.id} onClick={() => logPersonalTransferDetailView(r, profile)} chevron>
                    <MobileCardHeader>
                      <MobileCardTitle>{r.recipient_account_name || r.recipient_name}</MobileCardTitle>
                      <MobileCardMeta className="currency">{formatNaira(r.amount_ngn)}</MobileCardMeta>
                    </MobileCardHeader>
                    <MobileCardRow label="Date">{formatDateTime(r.created_at)}</MobileCardRow>
                    <MobileCardRow label="Status"><StatusBadge status={r.status} /></MobileCardRow>
                  </MobileCard>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <PersonalTransferSendDialog open={sendOpen} onOpenChange={setSendOpen} profile={profile} toast={toast} onSent={load} />
    </div>
  );
}

function PersonalTransferSendDialog({
  open, onOpenChange, profile, toast, onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: any;
  toast: ReturnType<typeof useToast>['toast'];
  onSent: () => void;
}) {
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<SendResult>(null);
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [form, setForm] = useState({ amount: '', memo: '' });
  const [showConfirm, setShowConfirm] = useState(false);

  const reset = () => { setBank(emptyBank); setForm({ amount: '', memo: '' }); setResult(null); };

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

      const bankCode = getBankCode(bank.bank_name);
      if (!bankCode) throw new Error(`Unknown bank: ${bank.bank_name}`);

      const recipient = await createTransferRecipient({
        name: bank.account_name || bank.account_number,
        account_number: bank.account_number,
        bank_code: bankCode,
      });

      const { data: inserted, error: insertErr } = await supabase.from('personal_transfers').insert({
        initiated_by: profile?.id,
        recipient_name: bank.account_name || bank.account_number,
        recipient_account_number: bank.account_number,
        recipient_bank_code: bankCode,
        recipient_bank_name: bank.bank_name,
        recipient_account_name: bank.account_name || null,
        amount_ngn: amount,
        memo: form.memo?.trim() || null,
        paystack_recipient_code: recipient.recipient_code,
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
        recipient_code: recipient.recipient_code!,
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
            <BankAccountField value={bank} onChange={setBank} provider="paystack" />
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
      />
    </>
  );
}
