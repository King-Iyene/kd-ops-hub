// Paystack client helpers.
//
// ALL secret-key operations are routed through the `paystack-transfer` Edge
// Function so the secret key NEVER touches the browser.

import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/db-errors';

export { NIGERIAN_BANKS, fetchBanks, getBankCode, clearBankCache } from '@/lib/nigerian-banks';
export type { NigerianBank as Bank } from '@/lib/nigerian-banks';

/**
 * Generate a KDOps platform reference that is passed verbatim to Paystack.
 * Format: kdops_<20 hex chars> — visually distinct in the Paystack dashboard
 * and short enough to fit Paystack's 100-character reference limit.
 * Pass the source record's UUID (batch_item.id, batch.id, etc.).
 */
export function generateKdopsRef(sourceId: string): string {
  return `kdops_${sourceId.replace(/-/g, '').slice(0, 20)}`;
}

// ---------------------------------------------------------------------------
// Fee calculation — Paystack transfer fee + Nigerian stamp duty.
//
// Paystack tier (as of 2026):
//   ₦0–5,000      → ₦10
//   ₦5,001–50,000 → ₦25
//   ₦50,001+      → ₦50
//
// Stamp duty (Nigeria Tax Act 2025, effective 18 Feb 2026):
//   Every transfer ≥ ₦10,000 incurs a ₦50 stamp duty deducted from the sender's
//   balance. Registered payroll merchants can apply for an exemption.
// ---------------------------------------------------------------------------

const STAMP_DUTY_THRESHOLD_NGN = 10_000;
const STAMP_DUTY_AMOUNT_NGN = 50;

/** Paystack flat-tier transfer fee only (no stamp duty).
 *
 *  This formula was briefly "corrected" to a 10/25/75/100 schedule after
 *  paystack_fee_ngn on real transfers showed ₦75 for a ₦15,191 transfer —
 *  that was wrong. A user-supplied Paystack dashboard screenshot showed
 *  the real breakdown: Transfer fees ₦25 + Stamp duty fee ₦50 = Total
 *  fees ₦75. Paystack's /transfer/verify `data.fee` field (what the
 *  webhook stores into paystack_fee_ngn) is the COMBINED total, not the
 *  pure transfer fee. Subtracting stampDutyFor(amount) from every stored
 *  paystack_fee_ngn value in the real dataset reproduces this exact
 *  10/25/50 schedule with zero exceptions across 23 real transfers
 *  (₦500–₦582,531) — this was correct all along. The actual bug is
 *  elsewhere: paystack_fee_ngn already includes stamp duty, so anywhere
 *  that reads it AND separately adds stampDutyFor() double-counts the
 *  duty. See credit_principal_wallet-adjacent fee-display fixes. */
export function paystackTransferFee(amountNgn: number): number {
  if (amountNgn <= 0) return 0;
  if (amountNgn <= 5_000) return 10;
  if (amountNgn <= 50_000) return 25;
  return 50;
}

/** Government stamp duty for a single transfer. Set `exempt=true` for payroll merchants. */
export function stampDutyFor(amountNgn: number, exempt = false): number {
  if (exempt) return 0;
  return amountNgn >= STAMP_DUTY_THRESHOLD_NGN ? STAMP_DUTY_AMOUNT_NGN : 0;
}

/** Total platform deduction for one transfer = Paystack fee + stamp duty. */
export function totalChargeFor(amountNgn: number, exempt = false): number {
  return paystackTransferFee(amountNgn) + stampDutyFor(amountNgn, exempt);
}

export interface BatchCostBreakdown {
  recipientCount: number;
  totalAmount: number;
  paystackFees: number;
  stampDuty: number;
  totalCharges: number;
  grandTotal: number;
}

/** Sum a batch's full cost including fees and stamp duty. */
export function batchCostBreakdown(
  amounts: number[],
  exemptStampDuty = false,
): BatchCostBreakdown {
  let totalAmount = 0;
  let paystackFees = 0;
  let stampDuty = 0;
  for (const amt of amounts) {
    const a = Number(amt) || 0;
    totalAmount += a;
    paystackFees += paystackTransferFee(a);
    stampDuty += stampDutyFor(a, exemptStampDuty);
  }
  const totalCharges = paystackFees + stampDuty;
  return {
    recipientCount: amounts.length,
    totalAmount,
    paystackFees,
    stampDuty,
    totalCharges,
    grandTotal: totalAmount + totalCharges,
  };
}

// ---------------------------------------------------------------------------
// Narration builder — what the recipient sees on their bank statement.
//
// NIP (NIBSS Instant Payment) caps narration at 100 chars but most Nigerian
// bank apps truncate the displayed narration at 12–40 chars. We aim for
// ≤ 60 chars so the message is fully readable across all banks.
//
// Format: "<Company> · <Context> · <Recipient>"
//   e.g. "KD Squares · Apr 2026 · John Doe"
//        "KD Squares · Contract · ABC Vendor"
//        "KD Squares · Fuel Reimb · Ogun Filling Station"
// ---------------------------------------------------------------------------

const COMPANY_SHORT_NAME = 'KD Squares';
const NARRATION_MAX_LEN = 60;

export type NarrationKind =
  | 'salary'
  | 'bonus'
  | 'advance'
  | 'contractor'
  | 'expense'
  | 'fuel'
  | 'quick_pay'
  | 'generic';

export interface NarrationParts {
  kind: NarrationKind;
  /** Recipient display name (employee or contractor) — required for clarity. */
  recipientName?: string;
  /** Period like "Apr 2026" for salaries/bonuses. */
  period?: string;
  /** Free-text label (e.g. expense category, fuel station, batch name). */
  label?: string;
}

const KIND_LABEL: Record<NarrationKind, string> = {
  salary: 'Salary',
  bonus: 'Bonus',
  advance: 'Advance',
  contractor: 'Contract Pmt',
  expense: 'Expense',
  fuel: 'Fuel Reimb',
  quick_pay: 'Quick Pay',
  generic: 'Payment',
};

/**
 * Build a recipient-facing narration.
 *
 * Truncates to 60 chars by:
 *   1. Trimming the recipient name first (keep first + last word)
 *   2. Then trimming the label
 *   3. Last resort: hard cut at 60 chars
 */
export function buildNarration(parts: NarrationParts): string {
  const segments: string[] = [COMPANY_SHORT_NAME];
  const middle = parts.period
    ? `${KIND_LABEL[parts.kind]} ${parts.period}`
    : parts.label
    ? `${KIND_LABEL[parts.kind]} - ${parts.label}`
    : KIND_LABEL[parts.kind];
  segments.push(middle);
  if (parts.recipientName) segments.push(shortenName(parts.recipientName));

  let out = segments.join(' · ');
  if (out.length > NARRATION_MAX_LEN) {
    // Drop the trailing recipient-name segment first, then truncate.
    const trimmed = `${segments[0]} · ${segments[1]}`;
    out = trimmed.length <= NARRATION_MAX_LEN ? trimmed : trimmed.slice(0, NARRATION_MAX_LEN);
  }
  return out;
}

/** Keep at most first + last name to save narration space. */
function shortenName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/**
 * Map a payment_batches row + batch_item to a NarrationKind so we know what
 * narration to send. Falls back to "generic" if the type is unknown.
 */
export function narrationKindForBatch(batch: any): NarrationKind {
  const t = batch?.batch_type || batch?.payment_category || '';
  if (batch?.is_quick_pay) return 'quick_pay';
  if (t === 'employee_salary' || t === 'salary') return 'salary';
  if (t === 'employee_bonus' || t === 'bonus' || batch?.bonus_type) return 'bonus';
  if (t === 'employee_advance' || t === 'advance' || batch?.advance_reason) return 'advance';
  if (t === 'fuel_reimbursement' || t === 'fuel') return 'fuel';
  if (t === 'expense' || batch?.payment_category === 'expense_reimbursement') return 'expense';
  if (t === 'contractor' || t === 'contractor_payment') return 'contractor';
  return 'generic';
}

/** Build the narration that recipients see on their bank statement. */
export function narrationForBatchItem(batch: any, item: any): string {
  return buildNarration({
    kind: narrationKindForBatch(batch),
    recipientName: item?.full_name || undefined,
    period: batch?.period || undefined,
    label: batch?.name || undefined,
  });
}

// ---------------------------------------------------------------------------
// Friendly error mapper — translates Paystack's raw error strings into
// plain-English messages with an actionable next step. Designed for users
// who are NOT engineers and need to know exactly what to do.
//
// Usage:
//   const friendly = friendlyPaystackError(item.failure_reason);
//   // → { title: 'Account not found', hint: 'The account number does not
//   //    exist at GTBank. Verify it on the recipient's bank app.' }
// ---------------------------------------------------------------------------

export interface FriendlyError {
  title: string;
  hint: string;
}

const ERROR_MAP: { match: RegExp; title: string; hint: string }[] = [
  {
    // Paystack account hasn't been activated for transfers (separate from
    // payment-collection KYC). Returned for EVERY recipient until enabled,
    // so when the whole batch fails with this, do not retry — fix the
    // account first on dashboard.paystack.co.
    match: /cannot initiate third[- ]?party payouts|third party payouts.*not.*allowed|payouts.*not.*enabled/i,
    title: 'Paystack account is "Pre-Approved" — transfers not yet unlocked',
    hint: 'Pre-Approved means Paystack lets you COLLECT payments but not SEND them. To unlock transfers: (1) dashboard.paystack.co → Settings → Compliance — submit any pending KYC docs (CAC, director NIN, proof of address, bank statement, TIN); (2) once Compliance shows "all clear" but transfers still blocked, email support@paystack.com with subject "Approve [merchant ID] for transfers" — reply within 24–48h. Do NOT retry until the dashboard badge says "Approved" instead of "Pre-Approved" — every retry will fail identically.',
  },
  {
    match: /awaiting otp authorization|awaiting otp approval|otp required/i,
    title: 'Awaiting OTP approval',
    hint: 'Paystack is holding this transfer pending merchant approval. Sign in to dashboard.paystack.co → Transfers → Pending and approve. Status will update automatically after that.',
  },
  {
    match: /reference already exists|unique reference|duplicate/i,
    title: 'Already paid',
    hint: 'Paystack already processed this payment. Click "Reconcile with Paystack" to sync the latest status.',
  },
  {
    match: /balance is not enough|insufficient funds/i,
    title: 'Wallet balance too low',
    hint: 'Top up your Paystack balance, then retry. Check Settings → Integrations for the wallet link.',
  },
  {
    match: /account number invalid|invalid account/i,
    title: 'Bank account number invalid',
    hint: 'The account number is not valid. Edit the recipient and re-enter it.',
  },
  {
    match: /beneficiary account does not exist|account does not exist|nuban not valid/i,
    title: 'Account not found at the bank',
    hint: 'The account number does not exist at the selected bank. Confirm both with the recipient.',
  },
  {
    match: /cannot resolve account|could not resolve account|unable to resolve account|account resolution failed|resolve.*timeout/i,
    title: 'Bank could not verify the account',
    hint: 'The bank did not respond to the verification check (FCMB, Polaris, and a few smaller banks are flaky on weekends). The account number itself may be correct — wait 10 minutes and click Retry. If it still fails, ask the recipient to confirm the account is active and not dormant.',
  },
  {
    match: /name mismatch|name does not match/i,
    title: 'Account name mismatch',
    hint: 'The account name on the recipient profile does not match the bank record. Update the name to match exactly what the bank has on file.',
  },
  {
    match: /transaction not permitted|account.*restricted|account is dormant|frozen/i,
    title: 'Bank rejected the transfer',
    hint: 'The recipient bank blocked this transfer (account may be dormant, restricted, or under review). Ask the recipient to contact their bank.',
  },
  {
    match: /transfer.*timeout|gateway timeout|temporarily unavailable/i,
    title: 'Bank network timeout',
    hint: 'The bank did not respond in time. Wait a few minutes and retry — most timeouts recover on the second attempt.',
  },
  {
    match: /unknown bank|no paystack bank code/i,
    title: 'Bank not recognised',
    hint: 'The recipient\'s bank is not on the supported list. Open the recipient profile and pick the correct bank from the dropdown.',
  },
  {
    match: /minimum transfer amount/i,
    title: 'Amount too small',
    hint: 'Paystack requires at least ₦1 per transfer. Increase the amount.',
  },
  {
    match: /single transfer (limit|cap|exceeds)/i,
    title: 'Amount exceeds the per-transfer cap',
    hint: 'This transfer exceeds your configured single-transfer cap. Split the payment, or ask a Super Admin to raise your cap in Settings → Transfer Authorization.',
  },
];

export function friendlyPaystackError(raw?: string | null): FriendlyError {
  const r = (raw || '').trim();
  if (!r) {
    return {
      title: 'Transfer rejected',
      hint: 'No reason was returned by Paystack. Click "Reconcile with Paystack" to fetch the latest status.',
    };
  }
  for (const entry of ERROR_MAP) {
    if (entry.match.test(r)) return { title: entry.title, hint: entry.hint };
  }
  // Fall back to the raw message — still useful for engineers in the audit
  // trail, and the title says "Transfer rejected" so the UI has something
  // friendly to display above the raw text.
  return { title: 'Transfer rejected', hint: r };
}

export interface ResolveResult {
  account_name: string;
  account_number: string;
}

// ---------------------------------------------------------------------------
// Edge Function caller — single entry point for all Paystack server calls.
// The Supabase client automatically sends the user's JWT in the Authorization
// header, and the Edge Function verifies it before touching Paystack.
// ---------------------------------------------------------------------------

async function edgeCall<T = any>(
  action: string,
  params: Record<string, unknown>,
): Promise<T> {
  let { data: { session } } = await supabase.auth.getSession();
  // Session may not be restored from localStorage yet on first page load.
  // Attempt one silent refresh before giving up.
  if (!session?.access_token) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  if (!session?.access_token) {
    throw new Error('Session expired — please refresh the page and sign in again.');
  }
  const { data, error } = await supabase.functions.invoke('paystack-transfer', {
    body: { action, ...params },
    headers: { 'Authorization': `Bearer ${session.access_token}` },
  });
  if (error) {
    let message = 'Transfer failed';
    try {
      const response = error.context;
      if (response && typeof response.text === 'function') {
        const raw = await response.text();
        if (raw) {
          const parsed = JSON.parse(raw);
          message = parsed.error || parsed.message || message;
        }
      }
    } catch {
      message = error.message || 'Transfer failed';
    }
    throw new Error(message);
  }
  if (data && !data.ok) {
    throw new Error(data.error || 'Paystack error from Edge Function');
  }
  return (data as any)?.data as T;
}

// ---------------------------------------------------------------------------
// Public API — these functions are called by the React UI.
// ---------------------------------------------------------------------------

/**
 * Strip everything except ASCII digits from an account number. Paystack's
 * resolve and recipient endpoints return the generic "Could not resolve
 * account" if a non-digit slips through (whitespace, em-dash from a copy-
 * paste, NBSP, full-width digits). Centralised here so every caller benefits.
 */
const sanitiseAccountNumber = (raw: string): string =>
  String(raw || '').replace(/\D/g, '');

export async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<ResolveResult> {
  const cleaned = sanitiseAccountNumber(accountNumber);
  const data = await edgeCall<ResolveResult>('resolve_account', {
    account_number: cleaned,
    bank_code: bankCode,
  });
  return {
    account_name: data?.account_name ?? '',
    account_number: data?.account_number ?? cleaned,
  };
}

export interface PaystackRecipient {
  recipient_code: string;
  id: number;
  type: string;
  /** Bank-verified account name from Paystack's /transferrecipient response. */
  details?: { account_name?: string; account_number?: string; bank_name?: string };
}

export async function createTransferRecipient(params: {
  name: string;
  account_number: string;
  bank_code: string;
}): Promise<PaystackRecipient> {
  return edgeCall<PaystackRecipient>('create_recipient', {
    ...params,
    account_number: sanitiseAccountNumber(params.account_number),
  });
}

export interface PaystackTransfer {
  transfer_code: string;
  reference: string;
  status: string;
  id: number;
}

export async function initiateTransfer(params: {
  recipient_code: string;
  amount_ngn: number;
  reference: string;
  reason?: string;
}): Promise<PaystackTransfer> {
  return edgeCall<PaystackTransfer>('initiate_transfer', params);
}

/**
 * Initiate a transfer with self-healing on duplicate-reference errors.
 *
 * When a transfer is retried with a reference Paystack has already seen,
 * Paystack returns the error: "Please provide a unique reference. Reference
 * already exists on a transfer". Without recovery, the platform marks the
 * item failed even though the original transfer may have succeeded.
 *
 * This wrapper:
 *   1. Tries to initiate normally.
 *   2. On duplicate-ref error, calls verify_transfer to learn the actual
 *      Paystack status and synthesises a PaystackTransfer-shaped result.
 *   3. Re-throws any other error.
 */
export async function initiateTransferIdempotent(params: {
  recipient_code: string;
  amount_ngn: number;
  reference: string;
  reason?: string;
}): Promise<PaystackTransfer & { recovered?: boolean; verified_status?: string }> {
  try {
    // The edge function may itself recover from a duplicate by calling verify
    // server-side and returning { recovered: true, verified_status }. The
    // unknown-cast preserves those fields for the caller.
    const result = (await initiateTransfer(params)) as PaystackTransfer & {
      recovered?: boolean;
      verified_status?: string;
    };
    return result;
  } catch (err: unknown) {
    const msg = errorMessage(err).toLowerCase();
    const isDuplicate =
      msg.includes('reference already exists') ||
      msg.includes('unique reference') ||
      msg.includes('duplicate');
    if (!isDuplicate) throw err;

    // Last-line recovery: the edge function failed to recover — usually means
    // the verify call also bombed. Try one more time from the browser.
    const verified = await verifyTransfer(params.reference);
    return {
      transfer_code: verified.transfer_code,
      reference: params.reference,
      status: verified.status,
      id: verified.raw?.id ?? 0,
      recovered: true,
      verified_status: verified.status,
    };
  }
}

export async function getPaystackBalance(): Promise<{ available: number; currency: string }> {
  return edgeCall('get_balance', {});
}

export async function verifyTransfer(reference: string): Promise<{
  status: string;
  transfer_code: string;
  reason?: string;
  raw: any;
}> {
  return edgeCall('verify_transfer', { reference });
}

export interface BulkTransferItem {
  reference: string;
  recipient: string;        // recipient_code
  amount: number;           // kobo
  reason?: string;
}

export interface BulkTransferResult {
  transfer_code: string;
  reference: string;
  status: string;
  id?: number;
  amount?: number;
}

/**
 * Send up to 100 transfers in a single Paystack API call.
 * Caller chunks larger payloads and spaces chunks ≥ 5 seconds apart.
 */
export async function bulkTransfer(
  transfers: BulkTransferItem[],
): Promise<BulkTransferResult[]> {
  if (transfers.length === 0) return [];
  if (transfers.length > 100) {
    throw new Error('Paystack bulk transfer accepts at most 100 items per call');
  }
  return edgeCall<BulkTransferResult[]>('bulk_transfer', { transfers });
}
