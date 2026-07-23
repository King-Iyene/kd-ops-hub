/**
 * Pre-flight payment summary modal.
 *
 * Shown before any batch is dispatched (BatchDetail.handleProcess, QuickPay,
 * Expenses, Fleet auto-pay, etc.) so the operator sees:
 *   - Total amount that will be paid out
 *   - Paystack transfer fees + ₦50 stamp duty (≥ ₦10,000 transfers)
 *   - Grand total deducted from the Paystack balance
 *   - Whether the current Paystack balance covers the run
 *   - A live preview of what each recipient will see on their bank statement
 *   - The fields that will appear on each receipt (so non-tech users know
 *     exactly what's being recorded)
 *
 * The modal is fully self-contained: pass an array of items and a kind, and
 * it does its own balance fetch and fee math. Callers receive an onConfirm
 * callback when the operator agrees to proceed.
 */

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Info, Receipt, BanknoteIcon, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatNaira } from '@/lib/format';
import {
  batchCostBreakdown,
  buildNarration,
  getPaystackBalance,
  type NarrationKind,
} from '@/lib/paystack';

export interface PaymentSummaryItem {
  /** Recipient display name shown in the preview list. */
  full_name: string;
  /** Amount in NGN. */
  amount_ngn: number;
  /** Optional bank name shown under the recipient (for confirmation clarity). */
  bank_name?: string;
  /** Optional account number shown under the recipient. */
  account_number?: string;
}

export interface PaymentSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Items to be paid. Provide at least name + amount; the modal will compute
   * fees/stamp duty internally. Items already succeeded should be filtered
   * out by the caller.
   */
  items: PaymentSummaryItem[];
  /**
   * What kind of payment — controls the narration preview shown to the user
   * (e.g. salary, bonus, contractor, expense, fuel).
   */
  narrationKind: NarrationKind;
  /** Period like "Apr 2026" — appears in the narration for recurring runs. */
  period?: string;
  /** Free-text label (batch name, expense category, fuel station). */
  label?: string;
  /** Optional title override; defaults to "Confirm payment". */
  title?: string;
  /**
   * Called when the operator confirms. Receives the (possibly edited) narration
   * text so callers can use it as the Paystack transfer `reason`. Returning a
   * promise keeps the modal open and the button disabled until it resolves.
   */
  onConfirm: (narration: string) => void | Promise<void>;
  /** Stamp-duty exempt (registered payroll merchants only). Default false. */
  exempt?: boolean;
}

/** Balance threshold below which we warn the operator regardless of the run. */
const LOW_BALANCE_HEADROOM = 5_000;

export function PaymentSummaryModal({
  open,
  onOpenChange,
  items,
  narrationKind,
  period,
  label,
  title = 'Confirm payment',
  onConfirm,
  exempt = false,
}: PaymentSummaryModalProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [customNarration, setCustomNarration] = useState('');

  useEffect(() => {
    if (!open) return;
    setBalanceLoading(true);
    setBalanceError(null);
    getPaystackBalance()
      .then((b) => setBalance(b.available))
      .catch((e) => setBalanceError(e?.message || 'Could not check balance'))
      .finally(() => setBalanceLoading(false));
  }, [open]);

  const cost = batchCostBreakdown(
    items.map((i) => Number(i.amount_ngn) || 0),
    exempt,
  );
  const balanceAfter = balance != null ? balance - cost.grandTotal : null;
  const balanceShort = balanceAfter != null && balanceAfter < 0;
  const balanceTight = balanceAfter != null && balanceAfter >= 0 && balanceAfter < LOW_BALANCE_HEADROOM;

  const sampleRecipient = items[0]?.full_name || 'John Doe';
  const sampleNarration = buildNarration({
    kind: narrationKind,
    recipientName: sampleRecipient,
    period,
    label,
  });

  // Initialise the editable narration exactly once per modal open. Only
  // depends on `open` — leaving sampleNarration out is intentional: if it
  // recomputes mid-editing (e.g. an items refetch changes the reference but
  // not the value, or the first item's name resolves after a data hydration)
  // we must NOT clobber whatever the operator has typed. This is what
  // silently made the "What recipients will see" edit box behave like a
  // read-only default in the wild.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) setCustomNarration(sampleNarration);
  }, [open]);

  const narrationLen = customNarration.length;
  const narrationOverLimit = narrationLen > 60;
  const narrationNearLimit = narrationLen >= 50 && !narrationOverLimit;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(customNarration.trim() || sampleNarration);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BanknoteIcon className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Review the totals and what your recipients will see before
            sending money.
          </DialogDescription>
        </DialogHeader>

        {/* Cost breakdown */}
        <div className="space-y-1 rounded-lg border bg-muted/30 p-4 text-sm">
          <Row label={`Recipients (${cost.recipientCount})`} value={formatNaira(cost.totalAmount)} />
          <Row
            label={`Paystack transfer fees`}
            value={formatNaira(cost.paystackFees)}
            muted
          />
          {cost.stampDuty > 0 && (
            <Row
              label={
                <span className="flex items-center gap-1">
                  Stamp duty (₦50 × transfers ≥ ₦10,000)
                  <InfoTip text="Government levy under the Nigeria Tax Act 2025. Deducted by Paystack from your balance." />
                </span>
              }
              value={formatNaira(cost.stampDuty)}
              muted
            />
          )}
          <Separator className="my-2" />
          <Row
            label={<span className="font-semibold">Total deducted from balance</span>}
            value={<span className="font-semibold">{formatNaira(cost.grandTotal)}</span>}
          />
        </div>

        {/* Balance check */}
        <div className="rounded-lg border p-4 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Paystack balance</span>
            <span>
              {balanceLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : balance != null ? (
                formatNaira(balance)
              ) : (
                '—'
              )}
            </span>
          </div>
          {balance != null && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Balance after this payment</span>
              <span className={balanceShort ? 'text-destructive font-semibold' : balanceTight ? 'text-warning font-semibold' : ''}>
                {formatNaira(balanceAfter ?? 0)}
              </span>
            </div>
          )}
          {balanceError && (
            <p className="text-xs text-muted-foreground">
              Couldn't fetch balance — proceed at your own risk: {balanceError}
            </p>
          )}
          {balanceShort && (
            <Alert variant="destructive" className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Insufficient balance</AlertTitle>
              <AlertDescription>
                Top up your Paystack wallet by at least{' '}
                <strong>{formatNaira(Math.abs(balanceAfter ?? 0))}</strong>{' '}
                before processing, otherwise some transfers will fail.
              </AlertDescription>
            </Alert>
          )}
          {!balanceShort && balanceTight && (
            <Alert className="mt-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Balance will be low after this run. Consider topping up.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Narration — editable */}
        <div className="rounded-lg border p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Pencil className="h-4 w-4 text-primary" />
            What recipients will see on their bank statement
          </div>
          <div className="relative">
            <Input
              value={customNarration}
              onChange={(e) => setCustomNarration(e.target.value)}
              maxLength={100}
              className={`font-mono text-xs pr-14 ${narrationOverLimit ? 'border-destructive focus-visible:ring-destructive' : ''}`}
              placeholder={sampleNarration}
            />
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums pointer-events-none ${
                narrationOverLimit
                  ? 'text-destructive font-semibold'
                  : narrationNearLimit
                  ? 'text-yellow-600'
                  : 'text-muted-foreground'
              }`}
            >
              {narrationLen}/60
            </span>
          </div>
          {narrationOverLimit && (
            <p className="text-xs text-destructive">
              Over 60 characters — some bank apps may truncate the text. Shorten it if you can.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Edit to customise. The same text is sent to every recipient in this
            batch (≤ 60 chars for full readability). Paystack appends "KD
            Squares" automatically as the sender — you don't need to repeat it
            in the narration.
          </p>
        </div>

        {/* Receipt fields */}
        <div className="rounded-lg border p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Receipt className="h-4 w-4 text-primary" />
            What appears on the receipt
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              'Recipient name',
              'Bank',
              'Account number (masked)',
              'Amount',
              'Paystack reference',
              'Transfer fee',
              cost.stampDuty > 0 ? 'Stamp duty' : null,
              'Status',
              'Transaction date',
              'Batch name',
              'Generated by',
            ].filter(Boolean).map((f) => (
              <Badge key={String(f)} variant="secondary" className="text-[11px] font-normal">
                {f}
              </Badge>
            ))}
          </div>
        </div>

        {/* Recipient preview */}
        {items.length > 0 && items.length <= 8 && (
          <ScrollArea className="max-h-40 rounded-lg border p-3 text-xs">
            <div className="space-y-1">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="truncate block">{it.full_name}</span>
                    {(it.bank_name || it.account_number) && (
                      <span className="block text-[10px] text-muted-foreground font-mono tracking-tight truncate">
                        {[it.bank_name, it.account_number].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  <span className="font-mono shrink-0">{formatNaira(it.amount_ngn)}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || balanceShort || items.length === 0}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {submitting ? 'Processing…' : `Send ${formatNaira(cost.totalAmount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1 ${muted ? 'text-muted-foreground' : ''}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center text-muted-foreground/70 cursor-help"
      title={text}
    >
      <Info className="h-3 w-3 ml-0.5" />
    </span>
  );
}
