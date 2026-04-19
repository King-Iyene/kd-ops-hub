// Paystack client helpers.
//
// ALL secret-key operations are routed through the `paystack-transfer` Edge
// Function so the secret key NEVER touches the browser.

import { supabase } from '@/lib/supabase';

export { NIGERIAN_BANKS, getBankCode } from '@/lib/nigerian-banks';
export type { NigerianBank as Bank } from '@/lib/nigerian-banks';

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
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('paystack-transfer', {
    body: { action, ...params },
    headers: { 'Authorization': `Bearer ${session?.access_token}` },
  });
  if (error) {
    let detail = error.message || 'Edge Function call failed';
    // supabase.functions.invoke returns a generic "non-2xx" message.
    // The real Paystack error is in the response body (JSON { error: "..." }).
    try {
      if (error.context?.response) {
        const body = await error.context.response.json();
        console.error('[paystack edgeCall] raw error body:', body);
        if (body?.error) detail = body.error;
      } else if (data && typeof data === 'object' && data.error) {
        detail = data.error;
      }
    } catch {
      // response already consumed or not JSON — keep original message
    }
    throw new Error(detail);
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

export async function verifyTransfer(reference: string): Promise<{
  status: string;
  transfer_code: string;
  reason?: string;
  raw: any;
}> {
  return edgeCall('verify_transfer', { reference });
}
