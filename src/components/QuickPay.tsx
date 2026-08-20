import { useEffect, useState } from 'react';
import { Zap, Loader2, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import {
  createTransferRecipient,
  initiateTransferIdempotent,
  generateKdopsRef,
  getBankCode,
  buildNarration,
} from '@/lib/paystack';
import { fetchFlutterwaveBanks, getFlutterwaveBankCode } from '@/lib/flutterwave-banks';
import { formatNaira } from '@/lib/format';
import {
  isQuickPayEnabled,
  isCoApprovalRequired,
  previewCapCheck,
  startBatchProcessing,
} from '@/lib/transfer-safety';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { useToast } from '@/hooks/use-toast';
import { friendlyDbError, errorMessage } from '@/lib/db-errors';
import {
  PAYMENT_CATEGORIES,
  paymentCategoryGroupLabel,
  paymentCategoryDef,
  defaultCategoryFor,
  type PaymentCategoryDef,
} from '@/lib/payment-categories';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';
import { PaymentSummaryModal } from '@/components/PaymentSummaryModal';

const emptyBank: BankAccountValue = {
  bank_name: '',
  account_number: '',
  account_name: '',
  verified: false,
};

type ResultState = null | { ok: true; ref: string } | { ok: false; reason: string };

export function QuickPayDialog() {
  const { profile } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ResultState>(null);
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [form, setForm] = useState({
    amount: '',
    description: '',
    /** Required at Quick Pay time so every one-off feeds Reports cleanly.
     *  Empty string means "not chosen yet" → disables Pay until set.
     *  Smart-defaulted (see below) when the bank lookup matched a known
     *  contractor or employee. */
    category: '',
  });
  const [showConfirm, setShowConfirm] = useState(false);
  const [quickPayEnabled, setQuickPayEnabled] = useState<boolean | null>(null);
  const [coThreshold, setCoThreshold] = useState<number | null>(null);
  // Fetched as soon as the dialog opens (not just at dispatch time) so
  // BankAccountField verifies the account against the CORRECT provider's
  // registry from the very first keystroke — previously the bank-verify
  // step always used Paystack regardless of which provider was active,
  // so a Flutterwave dispatch could carry an account only ever checked
  // against Paystack's registry.
  const [activeProvider, setActiveProvider] = useState<'paystack' | 'flutterwave'>('paystack');
  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('active_payment_provider')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      setActiveProvider((data as any)?.active_payment_provider === 'flutterwave' ? 'flutterwave' : 'paystack');
    })();
  }, [open]);

  // Quick Pay master switch + caller's effective co-approval threshold are
  // fetched once on mount. The threshold is the amount above which a single
  // Quick Pay routes through the pending_approval flow instead of executing
  // the transfer immediately. NULL threshold means "no co-approval ever".
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const enabled = await isQuickPayEnabled();
      if (cancelled) return;
      setQuickPayEnabled(enabled);
      if (profile?.id) {
        // Re-use the cap-check RPC for the threshold lookup — it doesn't
        // expose the threshold directly, but we have effective_co_approval_threshold
        // server-side via the new RPC. Lacking a dedicated wrapper, fall
        // back to a tiny inline RPC: read transfer_limits.co_approval_threshold_ngn
        // for the user (override) or their role default. Failure is silent —
        // the worst case is "we don't show the co-approval notice", and the
        // server still enforces the threshold on the actual call.
        try {
          const { data } = await supabase
            .from('transfer_limits')
            .select('co_approval_threshold_ngn, role, user_id')
            .or(`user_id.eq.${profile.id},and(user_id.is.null,role.eq.${profile.role})`)
            .order('user_id', { nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (!cancelled) {
            const threshold = (data as any)?.co_approval_threshold_ngn ?? null;
            setCoThreshold(threshold === null ? null : Number(threshold));
          }
        } catch { /* keep null — UI degrades gracefully */ }
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.id, profile?.role]);

  const reset = () => {
    setBank(emptyBank);
    setForm({ amount: '', description: '', category: '' });
    setResult(null);
  };

  // Smart-default the category when the bank verification matches a known
  // contractor or employee, so the operator can click through without picking
  // the obvious category every time. Only fires when no category is already
  // picked — never overrides a manual choice.
  useEffect(() => {
    if (!bank.verified || !bank.account_number) return;
    if (form.category) return; // respect operator's manual choice
    const cleaned = String(bank.account_number).replace(/\D/g, '');
    if (!cleaned) return;
    let cancelled = false;
    void (async () => {
      const [{ data: cMatch }, { data: eMatch }] = await Promise.all([
        supabase.from('contractors').select('id')
          .eq('account_number', cleaned).is('deleted_at', null).maybeSingle(),
        supabase.from('profiles').select('id')
          .eq('bank_account_number', cleaned).maybeSingle(),
      ]);
      if (cancelled) return;
      const suggested = defaultCategoryFor({
        hasContractor: !!(cMatch as any)?.id,
        hasEmployee:   !!(eMatch as any)?.id,
      });
      if (suggested) setForm((f) => f.category ? f : { ...f, category: suggested });
    })();
    return () => { cancelled = true; };
  }, [bank.verified, bank.account_number, form.category]);

  const amountNum = parseFloat(form.amount) || 0;
  const willRequireCoApproval = isCoApprovalRequired(coThreshold, amountNum);

  /** Operator clicked "Send" — open the pre-flight confirmation modal. */
  const handlePay = () => {
    if (!bank.verified) {
      toast({ title: 'Verify bank account first', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!form.category) {
      toast({
        title: 'Pick a category',
        description: 'Every Quick Pay needs a category so it shows up correctly in Transactions and Reports.',
        variant: 'destructive',
      });
      return;
    }
    setShowConfirm(true);
  };

  const executePay = async (customNarration?: string) => {
    setShowConfirm(false);
    const amount = parseFloat(form.amount);
    setProcessing(true);
    try {
      // Server-enforced cap preview. The edge fn re-checks this, but failing
      // fast in the UI means the user doesn't see a generic Paystack error
      // when the real reason is "your daily cap is blown".
      if (profile?.id) {
        const cap = await previewCapCheck(profile.id, amount);
        if (cap && !cap.allowed) {
          throw new Error(cap.reason || 'Transfer cap exceeded');
        }
      }

      // ABOVE THRESHOLD: do not auto-fund. Create a pending_approval batch
      // and stop — the operator (or an approver) finalises the payment from
      // BatchDetail. This is the single-source-of-truth way to enforce
      // co-approval for high-value Quick Pays without forking the flow.
      if (isCoApprovalRequired(coThreshold, amount)) {
        // Stamp provider even on the approval-routed path so the receipt +
        // BatchDetail know which rail will pay when the approver processes.
        // Read active_payment_provider at creation time. It is IMMUTABLE
        // after this — if an operator flips the toggle before the approval
        // completes, this batch still uses the provider it was born under
        // (avoids the "I approved a Paystack batch, why did money go via
        // Flutterwave?" foot-gun).
        const { data: settingsRow } = await supabase
          .from('company_settings')
          .select('active_payment_provider')
          .eq('id', '00000000-0000-0000-0000-000000000001')
          .maybeSingle();
        const providerAtCreation: 'paystack' | 'flutterwave' =
          (settingsRow as any)?.active_payment_provider === 'flutterwave' ? 'flutterwave' : 'paystack';

        const { data: batch, error: batchErr } = await supabase
          .from('payment_batches')
          .insert({
            name: `Quick Pay — ${bank.account_name || bank.account_number}`,
            payment_date: new Date().toISOString().slice(0, 10),
            total_amount: amount,
            beneficiary_count: 1,
            status: 'pending_approval',
            is_quick_pay: true,
            created_by: profile?.id,
            payment_description: customNarration?.trim() || form.description?.trim() || null,
            payment_category: form.category || null,
            provider: providerAtCreation,
          })
          .select('id')
          .single();
        if (batchErr) throw batchErr;
        const batchId = (batch as any).id;
        const { error: itemErr } = await supabase.from('batch_items').insert({
          batch_id: batchId,
          full_name: bank.account_name || bank.account_number,
          bank_name: bank.bank_name,
          account_number: bank.account_number,
          amount_ngn: amount,
          reference: 'Quick Pay',
          status: 'pending',
          provider: providerAtCreation,
        });
        if (itemErr) throw itemErr;

        await logAudit(
          'quick_pay_routed_for_approval',
          `Quick Pay batched for approval: ${formatNaira(amount)} to ${bank.account_name || bank.account_number} (${bank.bank_name}) — exceeds co-approval threshold`,
          profile,
        );
        toast({
          title: 'Quick Pay routed for approval',
          description: `Amount ${formatNaira(amount)} exceeds your co-approval threshold of ${formatNaira(coThreshold ?? 0)}. An approver must review.`,
        });
        setOpen(false);
        reset();
        navigate(`/payments/${batchId}`);
        return;
      }

      // BELOW THRESHOLD: legacy path — create a fully approved batch and
      // dispatch immediately. Profile.id is recorded as both creator and
      // first approver because, for sub-threshold quick pays, we treat the
      // operator's act of clicking "Pay now" as the approval. Self-approval
      // is technically blocked by the no-self-approval CHECK constraint —
      // we set approved_by=NULL here because the dispatch path doesn't need
      // it, and trying to set approved_by=profile.id would violate the CHECK.

      // Provider-aware routing: read active_payment_provider from settings
      // and stamp it on the batch + batch_item so the receipt, transactions
      // view, and reconciliation all know which rail moved the money.
      // Dispatch itself branches below on this value.
      const { data: settingsRow } = await supabase
        .from('company_settings')
        .select('active_payment_provider')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      const activeProvider: 'paystack' | 'flutterwave' =
        (settingsRow as any)?.active_payment_provider === 'flutterwave' ? 'flutterwave' : 'paystack';

      const { data: batch, error: batchErr } = await supabase
        .from('payment_batches')
        .insert({
          name: `Quick Pay — ${bank.account_name || bank.account_number}`,
          payment_date: new Date().toISOString().slice(0, 10),
          total_amount: amount,
          beneficiary_count: 1,
          status: 'funded',
          is_quick_pay: true,
          created_by: profile?.id,
          payment_category: form.category || null,
          payment_description: customNarration?.trim() || form.description?.trim() || null,
          provider: activeProvider,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      // ROOT CAUSE FIX: bank codes are provider-specific. Most CBN commercial
      // banks share the same NIBSS code across providers, but Flutterwave's
      // own registry can differ for some fintech/PSB entries (this is what
      // caused live "Account resolve failed" rejections when we reused
      // Paystack's code for a Flutterwave dispatch). Resolve through EACH
      // provider's own bank list — never cross-use.
      let bankCode: string | undefined;
      if (activeProvider === 'flutterwave') {
        await fetchFlutterwaveBanks();
        bankCode = getFlutterwaveBankCode(bank.bank_name);
        if (!bankCode) throw new Error(`Unknown bank on Flutterwave: ${bank.bank_name}`);
      } else {
        bankCode = getBankCode(bank.bank_name);
        if (!bankCode) throw new Error(`Unknown bank: ${bank.bank_name}`);
      }

      // Recipient creation is Paystack-specific (Paystack requires a
      // pre-created recipient_code for transfers). Flutterwave's /transfers
      // endpoint takes bank_code + account_number directly — no separate
      // recipient step. So only create a recipient on the Paystack path.
      const recipient = activeProvider === 'paystack'
        ? await createTransferRecipient({
            name: bank.account_name || bank.account_number,
            account_number: bank.account_number,
            bank_code: bankCode,
          })
        : ({ recipient_code: null } as { recipient_code: string | null });

      const recipientName = bank.account_name || bank.account_number;

      // Link the payment to a known contractor (or employee) when the bank
      // account matches an existing record, so the payment shows up in their
      // profile's Payments tab. Without this, Quick Pay to a saved contractor
      // looked like an orphan transfer with no payment history on the partner.
      // Account-number match (cleaned of whitespace) is a strong key — same
      // partner can have multiple banks, but a given account belongs to one.
      let contractorId: string | null = null;
      let employeeId:   string | null = null;
      const cleanedAccount = String(bank.account_number || '').replace(/\D/g, '');
      if (cleanedAccount) {
        const [{ data: cMatch }, { data: eMatch }] = await Promise.all([
          supabase.from('contractors').select('id')
            .eq('account_number', cleanedAccount).is('deleted_at', null).maybeSingle(),
          supabase.from('profiles').select('id')
            .eq('bank_account_number', cleanedAccount).maybeSingle(),
        ]);
        contractorId = (cMatch as any)?.id ?? null;
        employeeId   = (eMatch as any)?.id ?? null;
      }

      // Insert the batch item BEFORE generating a deterministic ref from its
      // id. The `reference` column holds the operator-supplied label (defaults
      // to "Quick Pay"); the provider-specific reference (paystack_reference
      // or flutterwave_reference) is the machine-readable idempotency key
      // that flows to the provider.
      const { data: insertedItem, error: itemErr } = await supabase.from('batch_items').insert({
        batch_id: (batch as any).id,
        full_name: recipientName,
        bank_name: bank.bank_name,
        account_number: bank.account_number,
        amount_ngn: amount,
        reference: 'Quick Pay',
        status: 'pending',
        paystack_recipient_code: recipient.recipient_code, // NULL on Flutterwave path
        contractor_id: contractorId,
        employee_id:   employeeId,
        provider: activeProvider,
      }).select('id').single();
      if (itemErr || !insertedItem) {
        throw new Error(`Could not create payment record: ${itemErr?.message || 'no item id'}`);
      }

      // Deterministic reference — prefix differs so the two providers can
      // never confuse each other in dashboards or webhook lookups.
      const compactId = String(insertedItem.id).replace(/-/g, '').slice(0, 20);
      const ref = activeProvider === 'flutterwave' ? `kdopsfw_${compactId}` : `kdops_${compactId}`;
      const { error: refWriteErr } = await supabase.from('batch_items')
        .update(
          activeProvider === 'flutterwave'
            ? { flutterwave_reference: ref }
            : { paystack_reference: ref },
        )
        .eq('id', insertedItem.id);
      if (refWriteErr) {
        // Fail closed, not open: if this reference never lands in the DB,
        // batch-worker's "undispatched" scan (paystack_reference IS NULL)
        // could later treat this same item as never-dispatched and send a
        // SECOND transfer under a different reference — dispatching money
        // under an untracked reference is worse than not dispatching it.
        throw new Error(`Could not record idempotency reference for this payment: ${refWriteErr.message}`);
      }

      // Use the operator's custom narration from the pre-flight modal (editable
      // there), then fall back to the description field, then auto-build.
      const narration = customNarration?.trim()
        || (form.description?.trim() ? form.description.trim().slice(0, 60) : '')
        || buildNarration({ kind: 'quick_pay', recipientName });

      // ── Provider-branched dispatch ────────────────────────────────────
      // Both branches produce the same downstream outcome — batch_item is
      // updated to succeeded/failed/pending with the provider's fee + ref.
      // The Paystack branch is BYTE-IDENTICAL to the pre-Flutterwave code
      // path so existing payroll behaviour cannot change.
      let itemStatus: 'pending' | 'succeeded' | 'failed' | 'reversed' = 'pending';
      let updatePayload: Record<string, unknown> = {};

      if (activeProvider === 'flutterwave') {
        // Route to flutterwave-transfer edge function.
        const { data: fwRes, error: fwErr } = await supabase.functions.invoke('flutterwave-transfer', {
          body: {
            action: 'initiate_transfer',
            reference: ref,
            bank_code: bankCode,
            account_number: bank.account_number,
            amount_ngn: amount,
            reason: narration,
          },
        });
        if (fwErr) throw new Error((fwErr as any)?.message || 'Flutterwave transfer failed');
        const fwData = (fwRes as any)?.data;
        if (!fwData || (fwRes as any)?.ok === false) {
          throw new Error((fwRes as any)?.error || 'Flutterwave transfer rejected');
        }
        const fwStatus = String(fwData.status || '').toLowerCase();
        itemStatus =
          fwStatus === 'succeeded' ? 'succeeded'
          : fwStatus === 'failed' || fwStatus === 'reversed' ? (fwStatus as 'failed' | 'reversed')
          : 'pending';
        updatePayload = {
          status: itemStatus,
          flutterwave_transfer_id: fwData.transfer_id || null,
          flutterwave_fee_ngn: Number(fwData.fee_ngn || 0) || 0,
          flutterwave_raw: fwData.raw ?? null,
          narration,
          processed_at: itemStatus === 'succeeded' ? new Date().toISOString() : null,
          failure_reason: itemStatus === 'failed' ? 'Recovered: Flutterwave rejected the transfer' : null,
        };
      } else {
        // Paystack path — unchanged from pre-Flutterwave behaviour.
        const transfer = await initiateTransferIdempotent({
          recipient_code: recipient.recipient_code!,
          amount_ngn: amount,
          reference: ref,
          reason: narration,
        });
        const recoveredStatus = transfer.recovered
          ? (transfer.verified_status || transfer.status || '').toLowerCase()
          : null;
        itemStatus =
          recoveredStatus === 'success' ? 'succeeded'
          : recoveredStatus === 'failed' || recoveredStatus === 'reversed' ? (recoveredStatus as 'failed' | 'reversed')
          : 'pending';
        updatePayload = {
          status: itemStatus,
          paystack_transfer_code: transfer.transfer_code,
          narration,
          processed_at: itemStatus === 'succeeded' ? new Date().toISOString() : null,
          failure_reason: itemStatus === 'failed' ? 'Recovered: Paystack rejected the transfer' : null,
        };
      }

      const { error: updateErr } = await supabase
        .from('batch_items')
        .update(updatePayload)
        .eq('id', insertedItem.id);
      if (updateErr) {
        console.warn('[KDOps] could not stamp transfer_code on batch_item:', updateErr.message);
      }

      // 6. Flip batch funded → processing via the SECURITY DEFINER RPC. The
      // direct status UPDATE used to live here; the new trigger would reject
      // it from the authenticated role, and the RPC enforces caller role +
      // status whitelist server-side.
      try {
        await startBatchProcessing((batch as any).id);
      } catch (claimErr: unknown) {
        console.warn('[KDOps] start_batch_processing failed:', errorMessage(claimErr));
      }

      await logAudit(
        'paystack_transfer_initiated',
        `Quick Pay: ${formatNaira(amount)} to ${bank.account_name || bank.account_number} (${bank.bank_name}) ref ${ref}`,
        profile,
      );

      // Use `ref` (our deterministic kdops_/kdopsfw_ reference) rather than
      // any provider-specific transfer variable — both branches populate `ref`
      // identically, and referencing `transfer` here would leak out of the
      // Paystack-only else block from the dispatch refactor above.
      setResult({ ok: true, ref });
      toast({ title: 'Quick Pay sent', description: `Ref: ${ref}` });
    } catch (err: unknown) {
      const friendly = friendlyDbError(err);
      setResult({ ok: false, reason: friendly });
      toast({
        title: 'Quick Pay failed',
        description: friendly,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      {/* Trigger lives outside the dialog so the parent's flex/grid layout
          controls placement. */}
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Zap className="mr-2 h-4 w-4" /> Quick Pay
      </Button>

      <ResponsiveDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-accent" /> Quick Pay
          </span>
        }
        description="Send a one-off payment without creating a batch. Verifies the account and initiates the transfer via your currently active provider (Paystack or Flutterwave)."
        footer={
          result ? (
            <Button
              variant="outline"
              className="kd-mobile-tap"
              onClick={() => { reset(); setOpen(false); }}
            >
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" className="kd-mobile-tap" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePay}
                disabled={processing || !bank.verified || !form.amount || quickPayEnabled === false}
                className="kd-mobile-tap"
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Zap className="mr-2 h-4 w-4" />
                {willRequireCoApproval ? 'Submit for Approval' : 'Pay now'}
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="space-y-4 py-4 text-center">
            {result.ok ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                <p className="text-lg font-semibold">Transfer initiated</p>
                <Badge variant="secondary" className="bg-success/10 text-success">
                  Ref: {result.ref}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  {activeProvider === 'flutterwave' ? 'Flutterwave' : 'Paystack'} will settle this within minutes. Check the Payments
                  page for the final status.
                </p>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 text-destructive mx-auto" />
                <p className="text-lg font-semibold">Transfer failed</p>
                <p className="text-sm text-muted-foreground">{result.reason}</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {quickPayEnabled === false && (
              <Alert className="border-amber-500/40 bg-amber-500/5">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">
                  Quick Pay is disabled.{' '}
                  <button
                    onClick={() => { setOpen(false); navigate('/settings'); }}
                    className="underline font-medium"
                  >
                    Enable in Settings → Transfer Authorization.
                  </button>
                </AlertDescription>
              </Alert>
            )}
            <BankAccountField value={bank} onChange={setBank} provider={activeProvider} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (₦)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder="e.g. Freelancer payout"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qp-category" className="flex items-center gap-1.5">
                Category
                <span className="text-destructive" aria-hidden>*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger id="qp-category" className={form.category ? '' : 'text-muted-foreground'}>
                  {(() => {
                    const def = paymentCategoryDef(form.category);
                    if (!def) {
                      return <SelectValue placeholder="Pick what this payment is for…" />;
                    }
                    const Icon = def.icon;
                    return (
                      <span className="flex items-center gap-2 truncate">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate text-sm">{def.label}</span>
                      </span>
                    );
                  })()}
                </SelectTrigger>
                <SelectContent className="max-h-[55vh]">
                  {(['frequent', 'compensation', 'other'] as const).map((g, gi) => {
                    const items = PAYMENT_CATEGORIES.filter((c) => c.group === g);
                    if (items.length === 0) return null;
                    return (
                      <SelectGroup key={g}>
                        <SelectLabel className={`text-[10px] uppercase tracking-wider text-muted-foreground/60 px-2 ${gi === 0 ? 'pt-1.5 pb-1' : 'pt-2 pb-1 border-t border-border/40 mt-1'}`}>
                          {paymentCategoryGroupLabel[g]}
                        </SelectLabel>
                        {items.map((opt: PaymentCategoryDef) => {
                          const Icon = opt.icon;
                          return (
                            <SelectItem key={opt.key} value={opt.key} className="py-1.5">
                              <span className="flex items-center gap-2 min-w-0">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <span className="truncate text-sm">{opt.label}</span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
              {(() => {
                const def = paymentCategoryDef(form.category);
                if (!def) {
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      Required — what this payment is for. Feeds Transactions and Reports so Quick Pays roll up cleanly.
                    </p>
                  );
                }
                return (
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {def.hint}
                  </p>
                );
              })()}
            </div>
            {bank.verified && form.amount && (
              <p className="text-sm text-muted-foreground">
                Sending <span className="font-semibold currency">{formatNaira(parseFloat(form.amount) || 0)}</span> to{' '}
                <span className="font-semibold">{bank.account_name}</span> ·{' '}
                {bank.bank_name} · {bank.account_number}
              </p>
            )}
            {willRequireCoApproval && (
              <Alert className="border-amber-500/40 bg-amber-500/5">
                <ShieldAlert className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm">
                  This amount exceeds your co-approval threshold ({formatNaira(coThreshold ?? 0)}). The payment will be created as a pending batch — an approver must review before funds move.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </ResponsiveDialog>

      <PaymentSummaryModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        items={[{
          full_name: bank.account_name || bank.account_number || 'recipient',
          amount_ngn: parseFloat(form.amount) || 0,
          bank_name: bank.bank_name || undefined,
          account_number: bank.account_number || undefined,
        }]}
        narrationKind="quick_pay"
        label={form.description || undefined}
        title="Confirm Quick Pay"
        onConfirm={(narration) => executePay(narration)}
      />
    </>
  );
}
