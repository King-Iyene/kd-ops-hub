// src/lib/payments/item-facade.ts
//
// Provider-abstraction layer for batch_items and payment_batches. Every
// place in the UI that needs "which reference?", "which fee?", "which
// verify function?" for a payment item should call these helpers instead
// of touching paystack_* or flutterwave_* columns directly.
//
// Contract: existing Paystack items (provider IS NULL or provider = 'paystack')
// return exactly what the direct-column access used to return, so this facade
// is a drop-in replacement. New Flutterwave items (provider = 'flutterwave')
// route to the flutterwave-* edge functions and flutterwave_* columns.
//
// No side effects, no imports of React or DB clients here — pure helpers that
// operate on the item objects the UI already has in memory. verifyItem and
// retryItem DO import supabase to call edge functions, but only when called.

import { supabase } from '@/lib/supabase';
import {
  paystackTransferFee,
  stampDutyFor,
  friendlyPaystackError,
  totalChargeFor as paystackTotalChargeFor,
} from '@/lib/paystack';

// ─────────────────────────────────────────────────────────────────────────
// Provider = 'paystack' | 'flutterwave'. Items created before this facade
// existed have provider IS NULL, which we treat as 'paystack' throughout.
// ─────────────────────────────────────────────────────────────────────────
export type Provider = 'paystack' | 'flutterwave';

export function providerOf(item: any): Provider {
  const p = item?.provider;
  return p === 'flutterwave' ? 'flutterwave' : 'paystack';
}

export function providerLabel(p: Provider | string | null | undefined): string {
  const norm = p === 'flutterwave' ? 'flutterwave' : 'paystack';
  return norm === 'flutterwave' ? 'Flutterwave' : 'Paystack';
}

/** Short 2-letter pill code used on batch cards / item rows for compact display. */
export function providerShort(p: Provider | string | null | undefined): 'PS' | 'FW' {
  return (p === 'flutterwave' ? 'FW' : 'PS');
}

// ─────────────────────────────────────────────────────────────────────────
// Reference — the string the provider uses to identify this transfer.
// paystack_reference or flutterwave_reference, whichever this item has.
// ─────────────────────────────────────────────────────────────────────────
export function itemReference(item: any): string | null {
  return providerOf(item) === 'flutterwave'
    ? (item?.flutterwave_reference ?? null)
    : (item?.paystack_reference ?? null);
}

/** Provider-specific transfer ID (Flutterwave) or transfer code (Paystack). */
export function itemProviderTransferId(item: any): string | null {
  return providerOf(item) === 'flutterwave'
    ? (item?.flutterwave_transfer_id ?? null)
    : (item?.paystack_transfer_code ?? null);
}

// ─────────────────────────────────────────────────────────────────────────
// Fee — real provider fee if we have it, else fallback to tier estimate.
// Priority (mirrors the existing Paystack fee resolution logic):
//   1. Provider fee column (populated by webhook / reconcile).
//   2. Raw payload's fee field.
//   3. Tier estimate for succeeded items (else 0 for pending/failed).
// ─────────────────────────────────────────────────────────────────────────
export function itemFeeNgn(item: any): number {
  const provider = providerOf(item);
  const isSucceeded = String(item?.status || '').toLowerCase() === 'succeeded';

  if (provider === 'flutterwave') {
    const direct = Number(item?.flutterwave_fee_ngn || 0);
    if (direct > 0) return direct;
    // Flutterwave raw payload uses `fee` in NGN (not kobo like Paystack).
    const rawFee = Number(item?.flutterwave_raw?.fee || 0);
    if (rawFee > 0) return rawFee;
    // Fee schedule mirrors Paystack's tier so we can reuse the calculation.
    return isSucceeded ? paystackTransferFee(Number(item?.amount_ngn || 0)) : 0;
  }

  // Paystack (default).
  const direct = Number(item?.paystack_fee_ngn || 0);
  if (direct > 0) return direct;
  const rawFeeKobo = Number(item?.paystack_raw?.fee || 0);
  if (rawFeeKobo > 0) return rawFeeKobo / 100;
  return isSucceeded ? paystackTransferFee(Number(item?.amount_ngn || 0)) : 0;
}

/** Fee source: 'actual' when it came from provider webhook data; 'estimate' when tier-based. */
export function itemFeeSource(item: any): 'actual' | 'estimate' {
  const provider = providerOf(item);
  if (provider === 'flutterwave') {
    if (Number(item?.flutterwave_fee_ngn || 0) > 0) return 'actual';
    if (Number(item?.flutterwave_raw?.fee || 0) > 0) return 'actual';
    return 'estimate';
  }
  if (Number(item?.paystack_fee_ngn || 0) > 0) return 'actual';
  if (Number(item?.paystack_raw?.fee || 0) > 0) return 'actual';
  return 'estimate';
}

/**
 * Total charge (transfer fee + stamp duty) for a given amount, provider-agnostic.
 * Currently returns the same value regardless of provider because Paystack and
 * Flutterwave use identical tier pricing in Nigeria. If a future provider had
 * different fees, we'd fork this function on the second argument.
 */
export function totalChargeForProvider(
  amountNgn: number,
  _provider: Provider,
  exempt = false,
): number {
  return paystackTotalChargeFor(amountNgn, exempt);
}

/** Just the transfer fee (no stamp duty), provider-aware. */
export function transferFeeForProvider(amountNgn: number, _provider: Provider): number {
  return paystackTransferFee(amountNgn);
}

/** Just the stamp duty, provider-agnostic (it's a government charge, not a provider fee). */
export { stampDutyFor };

// ─────────────────────────────────────────────────────────────────────────
// Raw provider payload — used by ReceiptModal and reconciliation UI when
// they need to peek at the untranslated response (fee breakdown, etc).
// ─────────────────────────────────────────────────────────────────────────
export function itemRawPayload(item: any): any {
  return providerOf(item) === 'flutterwave'
    ? (item?.flutterwave_raw ?? null)
    : (item?.paystack_raw ?? null);
}

// ─────────────────────────────────────────────────────────────────────────
// Error mapping — turns a raw provider error string into a friendly UI hint.
// Both providers get the same treatment for now (their errors are usually
// bank-side and share vocabulary); can fork later if needed.
// ─────────────────────────────────────────────────────────────────────────
export function friendlyProviderError(item: any, msg?: string | null) {
  // The current friendlyPaystackError handles the bank-side errors that
  // Flutterwave also surfaces (invalid account, unresolved, etc.). Safe to
  // reuse; when Flutterwave-specific error strings appear we'll extend.
  return friendlyPaystackError(msg ?? item?.failure_reason);
}

// ─────────────────────────────────────────────────────────────────────────
// Edge function routing — verify + retry.
// Callers pass an item; we route to the correct provider's function.
// The response shape is normalised so the caller doesn't have to fork.
// ─────────────────────────────────────────────────────────────────────────

export interface VerifyResult {
  ok: boolean;
  status: string | null;      // 'succeeded' | 'failed' | 'reversed' | 'pending' | null
  reason: string | null;
  fee_ngn: number | null;
  transfer_code_or_id: string | null;
  raw: any;
  error?: string;
}

/** Verify a batch item's current status via its provider. */
export async function verifyItem(item: any): Promise<VerifyResult> {
  const provider = providerOf(item);
  const reference = itemReference(item);
  if (!reference) {
    return {
      ok: false,
      status: null,
      reason: 'Item has no provider reference — nothing to verify yet.',
      fee_ngn: null,
      transfer_code_or_id: null,
      raw: null,
      error: 'no_reference',
    };
  }
  const fn = provider === 'flutterwave' ? 'flutterwave-transfer' : 'paystack-transfer';
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { action: 'verify_transfer', reference },
  });
  if (error) {
    return {
      ok: false,
      status: null,
      reason: null,
      fee_ngn: null,
      transfer_code_or_id: null,
      raw: null,
      error: (error as any)?.message || 'verify failed',
    };
  }
  const d = (data as any)?.data ?? {};
  const norm = normaliseStatus(provider, d?.status);
  return {
    ok: true,
    status: norm,
    reason: d?.reason ?? null,
    fee_ngn:
      d?.fee_ngn != null && Number.isFinite(Number(d.fee_ngn))
        ? Number(d.fee_ngn)
        : null,
    transfer_code_or_id:
      provider === 'flutterwave'
        ? (d?.transfer_id ?? null)
        : (d?.transfer_code ?? null),
    raw: d?.raw ?? d,
  };
}

/**
 * Normalise provider-native status strings to our four canonical values.
 * Paystack: 'success' | 'failed' | 'reversed' | 'pending' | 'otp' | 'abandoned'
 * Flutterwave: already normalised by flutterwave-transfer's mapFlutterwaveStatus.
 */
function normaliseStatus(provider: Provider, raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase();
  if (provider === 'paystack') {
    if (s === 'success') return 'succeeded';
    if (s === 'abandoned' || s === 'failed') return 'failed';
    if (s === 'reversed') return 'reversed';
    if (s === 'otp_blocked') return 'otp_blocked';
    if (s === 'otp' || s === 'pending' || s === 'processing' || s === 'received' || s === 'queued') return 'pending';
    return s;
  }
  // flutterwave: transfer function already normalised to our canonical values.
  return s;
}

// ─────────────────────────────────────────────────────────────────────────
// Balance — used by Payments dashboard cards.
// ─────────────────────────────────────────────────────────────────────────
export async function getProviderBalance(
  provider: Provider,
): Promise<{ available: number | null; currency: 'NGN'; error?: string }> {
  const fn = provider === 'flutterwave' ? 'flutterwave-transfer' : 'paystack-transfer';
  const { data, error } = await supabase.functions.invoke(fn, {
    body: { action: 'get_balance' },
  });
  if (error) {
    return { available: null, currency: 'NGN', error: (error as any)?.message || 'balance failed' };
  }
  const d = (data as any)?.data ?? {};
  return {
    available: d?.available != null ? Number(d.available) : null,
    currency: 'NGN',
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Reference generator — mirror of generateKdopsRef but provider-aware.
// Prefix differs so the two providers' refs are never confusable in dashboards.
// ─────────────────────────────────────────────────────────────────────────
export function generateProviderRef(sourceId: string, provider: Provider): string {
  const compact = sourceId.replace(/-/g, '').slice(0, 20);
  return provider === 'flutterwave' ? `kdopsfw_${compact}` : `kdops_${compact}`;
}
