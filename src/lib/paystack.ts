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
