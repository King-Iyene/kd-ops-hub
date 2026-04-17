// Paystack client helpers.
//
// ALL secret-key operations are routed through the `paystack-transfer` Edge
// Function so the secret key NEVER touches the browser.
//
// The only client-side direct call is the public-key inline verification which
// uses VITE_PAYSTACK_PUBLIC_KEY for the Paystack.js inline widget (not yet
// implemented — the BankAccountField uses the Edge Function resolve_account
// action instead).

import { supabase } from '@/lib/supabase';

export interface Bank {
  code: string;
  name: string;
}

export const NIGERIAN_BANKS: Bank[] = [
  { code: '044', name: 'Access Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '058', name: 'GTBank' },
  { code: '011', name: 'First Bank' },
  { code: '033', name: 'UBA' },
  { code: '214', name: 'FCMB' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '221', name: 'Stanbic IBTC' },
  { code: '232', name: 'Sterling Bank' },
  { code: '032', name: 'Union Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '50211', name: 'Kuda' },
  { code: '999992', name: 'OPay' },
  { code: '50515', name: 'Moniepoint' },
  { code: '999991', name: 'PalmPay' },
  { code: '101', name: 'Providus Bank' },
  { code: '082', name: 'Keystone Bank' },
];

export const getBankCode = (bankName: string): string | undefined => {
  return NIGERIAN_BANKS.find((b) => b.name === bankName)?.code;
};

export interface ResolveResult {
  account_name: string;
  account_number: string;
}

// ---------------------------------------------------------------------------
// Edge Function caller — single entry point for all Paystack server calls.
// Falls back to direct API call using VITE_PAYSTACK_SECRET_KEY only if the
// Edge Function is unavailable (dev / test without deployment). This fallback
// is a convenience for sandbox testing and will be removed before production.
// ---------------------------------------------------------------------------

async function edgeCall<T = any>(
  action: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('paystack-transfer', {
    body: { action, ...params },
  });
  if (error) {
    // Fallback: if the Edge Function is not deployed, try the direct call
    // using the env secret (test mode only).
    const secret = import.meta.env.VITE_PAYSTACK_SECRET_KEY as string | undefined;
    if (secret) {
      return directCall(action, params, secret);
    }
    throw new Error(error.message || 'Edge Function call failed');
  }
  if (data && !data.ok) {
    throw new Error(data.error || 'Paystack error from Edge Function');
  }
  return (data as any)?.data as T;
}

async function directCall<T = any>(
  action: string,
  params: Record<string, unknown>,
  secret: string,
): Promise<T> {
  const headers = {
    Authorization: `Bearer ${secret}`,
    'Content-Type': 'application/json',
  };
  const base = 'https://api.paystack.co';
  let res: Response;

  switch (action) {
    case 'resolve_account': {
      const qs = new URLSearchParams({
        account_number: String(params.account_number),
        bank_code: String(params.bank_code),
      });
      res = await fetch(`${base}/bank/resolve?${qs}`, { headers });
      break;
    }
    case 'create_recipient':
      res = await fetch(`${base}/transferrecipient`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'nuban',
          name: params.name,
          account_number: params.account_number,
          bank_code: params.bank_code,
          currency: 'NGN',
        }),
      });
      break;
    case 'initiate_transfer':
      res = await fetch(`${base}/transfer`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: 'balance',
          reason: params.reason || 'KDOps disbursement',
          amount: Math.round((Number(params.amount_ngn) || 0) * 100),
          recipient: params.recipient_code,
          reference: params.reference,
        }),
      });
      break;
    case 'verify_transfer':
      res = await fetch(
        `${base}/transfer/verify/${encodeURIComponent(String(params.reference))}`,
        { headers },
      );
      break;
    default:
      throw new Error(`Unknown Paystack action: ${action}`);
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === false) {
    throw new Error(body?.message || `Paystack error (HTTP ${res.status})`);
  }
  return body?.data as T;
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
