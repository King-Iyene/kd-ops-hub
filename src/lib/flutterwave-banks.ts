/**
 * Nigerian banks resolved through FLUTTERWAVE's own bank list — NOT
 * Paystack's.
 *
 * ROOT CAUSE this file fixes: QuickPay and batch-worker's Flutterwave
 * dispatch paths were resolving bank codes via lib/nigerian-banks.ts
 * (Paystack's list) and sending that code straight to Flutterwave's
 * /transfers API. Most CBN-licensed commercial banks share the same NIBSS
 * institution code across providers, but several fintech/PSB entries do
 * NOT (Flutterwave's own /banks/NG can assign a different code than
 * Paystack's /bank for the same bank, e.g. some OPay routes). That
 * mismatch caused "Account resolve failed" — Flutterwave rejects the
 * transfer because the bank_code + account_number pair doesn't resolve
 * under ITS OWN registry.
 *
 * Fix: an entirely separate cache + resolver that calls the
 * `flutterwave-transfer` edge function's `list_banks` action (Flutterwave's
 * own /banks/NG), so Flutterwave dispatches ONLY ever use Flutterwave's own
 * bank codes. Mirrors nigerian-banks.ts's shape exactly so callers can
 * switch between the two resolvers with an identical calling convention.
 */

export interface FlutterwaveBank {
  code: string;
  name: string;
}

const CACHE_KEY = 'kdops.flutterwave_banks_v1';
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2h — same rationale as Paystack's cache

let _allBanks: FlutterwaveBank[] = [];
let _warmed = false;

function _updateRegistry(banks: FlutterwaveBank[]): void {
  if (banks.length > 0) {
    _allBanks = banks;
    _warmed = true;
  }
}

/** Fetches (or returns cached) Flutterwave's own Nigerian bank list. Call
 *  this once before dispatching a Flutterwave transfer so getFlutterwaveBankCode
 *  has a populated registry to search. Safe to call repeatedly — cheap no-op
 *  once cached. */
export async function fetchFlutterwaveBanks(): Promise<FlutterwaveBank[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: FlutterwaveBank[]; ts: number };
      if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
        _updateRegistry(data);
        return data;
      }
    }
  } catch {
    // corrupted cache — fall through to a fresh fetch
  }

  try {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase.functions.invoke('flutterwave-transfer', {
      body: { action: 'list_banks' },
    });
    if (!error && Array.isArray(data?.data) && data.data.length > 0) {
      const banks: FlutterwaveBank[] = (data.data as Array<{ code: string; name: string }>)
        .map((b) => ({ code: b.code, name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: banks, ts: Date.now() }));
      _updateRegistry(banks);
      return banks;
    }
  } catch {
    // network error or edge function unreachable — caller falls back to null
  }

  return _allBanks; // whatever we had before (possibly empty)
}

export const clearFlutterwaveBankCache = (): void => {
  localStorage.removeItem(CACHE_KEY);
  _allBanks = [];
  _warmed = false;
};

/** True once fetchFlutterwaveBanks() has successfully populated the registry
 *  at least once. Callers should await fetchFlutterwaveBanks() before relying
 *  on getFlutterwaveBankCode for a dispatch-critical lookup. */
export function isFlutterwaveBankRegistryWarm(): boolean {
  return _warmed;
}

export interface FlutterwaveResolveResult {
  account_name: string;
  account_number: string;
}

/**
 * Verify a bank account via Flutterwave's own resolve_account action —
 * NEVER Paystack's. This is the missing piece that let a real Flutterwave
 * dispatch reach the API with an unverified/wrong-provider account: the
 * shared BankAccountField component previously always called Paystack's
 * resolveAccount regardless of which provider was active, so even
 * Flutterwave's own official sandbox test account failed to "resolve" —
 * we were asking Paystack about an account Paystack has never heard of.
 */
export async function resolveFlutterwaveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<FlutterwaveResolveResult> {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.functions.invoke('flutterwave-transfer', {
    body: { action: 'resolve_account', account_number: accountNumber, bank_code: bankCode },
  });
  if (error) throw new Error((error as any)?.message || 'Could not resolve account');
  const d = (data as any)?.data;
  if (!d?.account_name) throw new Error('Could not resolve account name. Check parameters or try again.');
  return { account_name: d.account_name, account_number: d.account_number };
}

/** Look up a Flutterwave bank code by display name. Same 3-step matching
 *  order as getBankCode in nigerian-banks.ts (alias → exact → prefix), but
 *  searches ONLY Flutterwave's own registry — never falls back to Paystack
 *  codes, so a Flutterwave dispatch can never accidentally use the wrong
 *  provider's bank code again. */
export function getFlutterwaveBankCode(bankName: string): string | undefined {
  const n = (bankName || '').trim().toLowerCase();
  if (!n) return undefined;

  if (!_warmed || _allBanks.length === 0) return undefined;

  // 1. Exact case-insensitive match.
  const exact = _allBanks.find((b) => b.name.toLowerCase() === n);
  if (exact) return exact.code;

  // 2. Stored name CONTAINS a registered bank name — handles verbose forms
  //    like "OPay Digital Services Limited (OPay)". Pick the LONGEST match.
  const contained = _allBanks
    .filter((b) => {
      const bn = b.name.toLowerCase();
      return bn.length >= 4 && n.includes(bn);
    })
    .sort((a, b) => b.name.length - a.name.length);
  if (contained.length > 0) return contained[0].code;

  // 3. Registered name STARTS WITH the query — only when exactly one match
  //    (else ambiguous).
  const prefix = _allBanks.filter((b) => b.name.toLowerCase().startsWith(n));
  if (prefix.length === 1) return prefix[0].code;

  return undefined;
}
