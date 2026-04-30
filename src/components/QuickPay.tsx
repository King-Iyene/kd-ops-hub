import { useState } from 'react';
import { Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import {
  createTransferRecipient,
  initiateTransferIdempotent,
  generateKdopsRef,
  getBankCode,
  buildNarration,
  NIGERIAN_BANKS,
} from '@/lib/paystack';
import { formatNaira } from '@/lib/format';
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
import { ResponsiveDialog } from '@/components/ui-kit/ResponsiveDialog';
import { useToast } from '@/hooks/use-toast';
import { friendlyDbError } from '@/lib/db-errors';
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

  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ResultState>(null);
  const [bank, setBank] = useState<BankAccountValue>(emptyBank);
  const [form, setForm] = useState({
    amount: '',
    description: '',
  });
  const [showConfirm, setShowConfirm] = useState(false);

  const reset = () => {
    setBank(emptyBank);
    setForm({ amount: '', description: '' });
    setResult(null);
  };

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
    setShowConfirm(true);
  };

  const executePay = async () => {
    setShowConfirm(false);
    const amount = parseFloat(form.amount);
    setProcessing(true);
    try {
      // 1. Create a single-item batch with auto-approval.
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
          approved_by: profile?.id,
        })
        .select()
        .single();
      if (batchErr) throw batchErr;

      const bankCode = getBankCode(bank.bank_name);
      if (!bankCode) throw new Error(`Unknown bank: ${bank.bank_name}`);

      // 2. Create recipient via Edge Function.
      const recipient = await createTransferRecipient({
        name: bank.account_name || bank.account_number,
        account_number: bank.account_number,
        bank_code: bankCode,
      });

      const recipientName = bank.account_name || bank.account_number;
      // Insert the batch item BEFORE generating a deterministic ref from its
      // id. The `reference` column holds the operator-supplied label (defaults
      // to "Quick Pay"); `paystack_reference` is the machine-readable
      // idempotency key that flows to Paystack.
      const { data: insertedItem, error: itemErr } = await supabase.from('batch_items').insert({
        batch_id: (batch as any).id,
        full_name: recipientName,
        bank_name: bank.bank_name,
        account_number: bank.account_number,
        amount_ngn: amount,
        reference: 'Quick Pay',
        status: 'pending',
        paystack_recipient_code: recipient.recipient_code,
      }).select('id').single();
      if (itemErr || !insertedItem) {
        throw new Error(`Could not create payment record: ${itemErr?.message || 'no item id'}`);
      }
      const ref = generateKdopsRef(insertedItem.id);
      await supabase.from('batch_items').update({ paystack_reference: ref }).eq('id', insertedItem.id);

      // Build a clean recipient-facing narration. If the operator typed a
      // description, prefer it but always prefix with the company short name.
      const narration = form.description?.trim()
        ? form.description.trim().slice(0, 60)
        : buildNarration({ kind: 'quick_pay', recipientName });

      const transfer = await initiateTransferIdempotent({
        recipient_code: recipient.recipient_code,
        amount_ngn: amount,
        reference: ref,
        reason: narration,
      });

      // Map recovered duplicate-ref into the right batch_item status.
      const recoveredStatus = transfer.recovered
        ? (transfer.verified_status || transfer.status || '').toLowerCase()
        : null;
      const itemStatus =
        recoveredStatus === 'success' ? 'succeeded'
        : recoveredStatus === 'failed' || recoveredStatus === 'reversed' ? recoveredStatus
        : 'pending';

      const { error: updateErr } = await supabase
        .from('batch_items')
        .update({
          status: itemStatus,
          paystack_transfer_code: transfer.transfer_code,
          processed_at: itemStatus === 'succeeded' ? new Date().toISOString() : null,
          failure_reason: itemStatus === 'failed' ? 'Recovered: Paystack rejected the transfer' : null,
        })
        .eq('id', insertedItem.id);
      if (updateErr) {
        console.warn('[KDOps] could not stamp transfer_code on batch_item:', updateErr.message);
      }

      // 6. Update batch status.
      const { error: batchUpdErr } = await supabase
        .from('payment_batches')
        .update({ status: 'processing' })
        .eq('id', (batch as any).id);
      if (batchUpdErr) {
        console.warn('[KDOps] could not update batch status:', batchUpdErr.message);
      }

      await logAudit(
        'paystack_transfer_initiated',
        `Quick Pay: ${formatNaira(amount)} to ${bank.account_name || bank.account_number} (${bank.bank_name}) ref ${ref}`,
        profile,
      );

      setResult({ ok: true, ref: transfer.reference || ref });
      toast({ title: 'Quick Pay sent', description: `Ref: ${transfer.reference || ref}` });
    } catch (err: any) {
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
        description="Send a one-off payment without creating a batch. Verifies the account, creates a recipient, and initiates the transfer via Paystack immediately."
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
                disabled={processing || !bank.verified || !form.amount}
                className="kd-mobile-tap"
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Zap className="mr-2 h-4 w-4" /> Pay now
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
                  Paystack will settle this within minutes. Check the Payments
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
            <BankAccountField value={bank} onChange={setBank} />
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
            {bank.verified && form.amount && (
              <p className="text-sm text-muted-foreground">
                Sending <span className="font-semibold currency">{formatNaira(parseFloat(form.amount) || 0)}</span> to{' '}
                <span className="font-semibold">{bank.account_name}</span> ·{' '}
                {bank.bank_name} · {bank.account_number}
              </p>
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
        }]}
        narrationKind="quick_pay"
        label={form.description || undefined}
        title="Confirm Quick Pay"
        onConfirm={executePay}
      />
    </>
  );
}
