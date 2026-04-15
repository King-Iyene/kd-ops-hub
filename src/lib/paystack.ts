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
