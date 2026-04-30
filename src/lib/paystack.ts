// Paystack client helpers.
//
// ALL secret-key operations are routed through the `paystack-transfer` Edge
// Function so the secret key NEVER touches the browser.

import { supabase } from '@/lib/supabase';

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

/** Paystack flat-tier transfer fee only (no stamp duty). */
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

export async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<ResolveResult> {
  const data = await edgeCall<ResolveResult>('resolve_account', {
    account_number: accountNumber,
    bank_code: bankCode,
  });
  return {
    account_name: data?.account_name ?? '',
    account_number: data?.account_number ?? accountNumber,
  };
}

export interface PaystackRecipient {
  recipient_code: string;
  id: number;
  type: string;
}

export async function createTransferRecipient(params: {
  name: string;
  account_number: string;
  bank_code: string;
}): Promise<PaystackRecipient> {
  return edgeCall<PaystackRecipient>('create_recipient', params);
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
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
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
