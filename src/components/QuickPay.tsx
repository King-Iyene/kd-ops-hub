import { useState } from 'react';
import { Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { logAudit } from '@/lib/audit';
import {
  createTransferRecipient,
  initiateTransfer,
  getBankCode,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { BankAccountField, type BankAccountValue } from '@/components/BankAccountField';

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

  const reset = () => {
    setBank(emptyBank);
    setForm({ amount: '', description: '' });
    setResult(null);
  };

  const handlePay = async () => {
    if (!bank.verified) {
      toast({ title: 'Verify bank account first', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

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

      const ref = `qp_${(batch as any).id.replace(/-/g, '').slice(0, 20)}`;

      // 3. Insert the batch item.
      await supabase.from('batch_items').insert({
        batch_id: (batch as any).id,
        full_name: bank.account_name || bank.account_number,
        bank_name: bank.bank_name,
        account_number: bank.account_number,
        amount_ngn: amount,
        reference: form.description || 'Quick Pay',
        status: 'pending',
        paystack_recipient_code: recipient.recipient_code,
        paystack_reference: ref,
      });

      // 4. Initiate transfer via Edge Function.
      const transfer = await initiateTransfer({
        recipient_code: recipient.recipient_code,
        amount_ngn: amount,
        reference: ref,
        reason: form.description || 'KDOps Quick Pay',
      });

      // 5. Update batch_item with transfer code.
      await supabase
        .from('batch_items')
        .update({
          paystack_transfer_code: transfer.transfer_code,
        })
        .eq('paystack_reference', ref);

      // 6. Update batch status.
      await supabase
        .from('payment_batches')
        .update({ status: 'processing' })
        .eq('id', (batch as any).id);

      await logAudit(
        'paystack_transfer_initiated',
        `Quick Pay: ${formatNaira(amount)} to ${bank.account_name || bank.account_number} (${bank.bank_name}) ref ${ref}`,
        profile,
      );

      setResult({ ok: true, ref: transfer.reference || ref });
      toast({ title: 'Quick Pay sent', description: `Ref: ${transfer.reference || ref}` });
    } catch (err: any) {
      setResult({ ok: false, reason: err?.message || 'Transfer failed' });
      toast({
        title: 'Quick Pay failed',
        description: err?.message,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Zap className="mr-2 h-4 w-4" /> Quick Pay
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-accent" /> Quick Pay
          </DialogTitle>
          <DialogDescription>
            Send a one-off payment without creating a batch. Verifies the account,
            creates a recipient, and initiates the transfer via Paystack immediately.
          </DialogDescription>
        </DialogHeader>

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
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <BankAccountField value={bank} onChange={setBank} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Amount (₦)</Label>
                  <Input
                    type="number"
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePay}
                disabled={processing || !bank.verified || !form.amount}
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Zap className="mr-2 h-4 w-4" /> Pay now
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
