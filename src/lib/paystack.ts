// Paystack bank resolve helper.
//
// Note: Paystack's /bank/resolve endpoint requires a secret key. In production,
// this call should live behind a serverless function. For this internal tool we
// call it directly from the browser using the sandbox secret key from env, and
// gracefully fall back when the call is blocked by CORS / network.

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

/**
 * Resolve a Nigerian bank account via Paystack.
 * Returns the account holder name on success.
 */
export async function resolveAccount(
  accountNumber: string,
  bankCode: string
): Promise<ResolveResult> {
  const secret = import.meta.env.VITE_PAYSTACK_SECRET_KEY as string | undefined;
  if (!secret) {
    throw new Error('Paystack secret key not configured');
  }

  const url = `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(
    accountNumber
  )}&bank_code=${encodeURIComponent(bankCode)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok || body?.status === false) {
    const msg =
      body?.message ||
      `Unable to verify account (HTTP ${res.status}). Check the account number and bank.`;
    throw new Error(msg);
  }

  return {
    account_name: body?.data?.account_name ?? '',
    account_number: body?.data?.account_number ?? accountNumber,
  };
}

// -----------------------------------------------------------------------------
// Bulk transfers
//
// Production deployments should route these calls through a Supabase Edge
// Function so the secret key never touches the browser. For the sandbox /
// test-mode flow below we read VITE_PAYSTACK_SECRET_KEY from `.env` — the
// same pattern used by resolveAccount().
// -----------------------------------------------------------------------------

const paystackSecret = () => {
  const secret = import.meta.env.VITE_PAYSTACK_SECRET_KEY as string | undefined;
  if (!secret) throw new Error('Paystack secret key not configured');
  return secret;
};

const paystack = async <T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paystackSecret()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status === false) {
    throw new Error(body?.message || `Paystack error (HTTP ${res.status})`);
  }
  return body as T;
};

export interface PaystackRecipient {
  recipient_code: string;
  id: number;
  type: string;
}

/** Create a one-off transfer recipient for an account. */
export async function createTransferRecipient(params: {
  name: string;
  account_number: string;
  bank_code: string;
}): Promise<PaystackRecipient> {
  const body = await paystack<{ data: PaystackRecipient }>('/transferrecipient', {
    method: 'POST',
    body: JSON.stringify({
      type: 'nuban',
      name: params.name,
      account_number: params.account_number,
      bank_code: params.bank_code,
      currency: 'NGN',
    }),
  });
  return body.data;
}

export interface PaystackTransfer {
  transfer_code: string;
  reference: string;
  status: string;
  id: number;
}

/** Initiate a transfer to a recipient_code. amount is in the minor unit (kobo). */
export async function initiateTransfer(params: {
  recipient_code: string;
  amount_ngn: number;
  reference: string;
  reason?: string;
}): Promise<PaystackTransfer> {
  const body = await paystack<{ data: PaystackTransfer }>('/transfer', {
    method: 'POST',
    body: JSON.stringify({
      source: 'balance',
      reason: params.reason || 'KDOps disbursement',
      amount: Math.round(params.amount_ngn * 100),
      recipient: params.recipient_code,
      reference: params.reference,
    }),
  });
  return body.data;
}

/**
 * Fetch the current status of a transfer by its reference.
 * Returns status: success | pending | failed | reversed | otp | abandoned.
 */
export async function verifyTransfer(reference: string): Promise<{
  status: string;
  transfer_code: string;
  reason?: string;
  raw: any;
}> {
  const body = await paystack<{ data: any }>(
    `/transfer/verify/${encodeURIComponent(reference)}`,
  );
  return {
    status: body.data?.status,
    transfer_code: body.data?.transfer_code,
    reason: body.data?.failures?.[0]?.reason || body.data?.reason,
    raw: body.data,
  };
}
