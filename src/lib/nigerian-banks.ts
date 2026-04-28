/**
 * Nigerian banks supported by Paystack.
 *
 * STATIC_BANKS: Major commercial banks, neo-banks, and PSBs with
 * verified Paystack codes. Used as the immediate fallback if the
 * dynamic fetch hasn't completed yet.
 *
 * fetchBanks(): Calls the paystack-transfer edge function (list_banks
 * action) which proxies GET /bank?currency=NGN from Paystack's API.
 * Result is cached in localStorage for 24 hours. Falls back to
 * STATIC_BANKS if the fetch fails (e.g. no internet, edge function
 * not yet deployed).
 *
 * The dynamic fetch is preferred because Paystack supports 300+ banks
 * including hundreds of microfinance banks — no static list can stay
 * current as new banks are licensed.
 */

export interface NigerianBank {
  code: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Static fallback — commercial banks + major neo-banks + PSBs.
// Only banks whose Paystack codes are verified are included here.
// ---------------------------------------------------------------------------
export const NIGERIAN_BANKS: NigerianBank[] = [
  // ── Commercial Banks ─────────────────────────────────────────────────────
  { code: '044', name: 'Access Bank' },
  { code: '063', name: 'Access Bank (Diamond)' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '559', name: 'Coronation Bank' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank (FCMB)' },
  { code: '103', name: 'Globus Bank' },
  { code: '058', name: 'GTBank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '303', name: 'Lotus Bank' },
  { code: '060', name: 'Nova Merchant Bank' },
  { code: '104', name: 'Parallex Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '105', name: 'Premium Trust Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '125', name: 'Rubies Bank' },
  { code: '221', name: 'Stanbic IBTC Bank' },
  { code: '068', name: 'Standard Chartered Bank Nigeria' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'SunTrust Bank Nigeria' },
  { code: '302', name: 'TAJ Bank' },
  { code: '102', name: 'Titan Trust Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa (UBA)' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
  // ── Neo / Digital Banks ──────────────────────────────────────────────────
  { code: '035A', name: 'ALAT by WEMA' },
  { code: '565',   name: 'Carbon' },
  { code: '50126', name: 'Eyowo' },
  { code: '090311', name: 'FairMoney Microfinance Bank' },
  { code: '50211', name: 'Kuda Bank' },
  { code: '50515', name: 'Moniepoint MFB' },
  { code: '999992', name: 'OPay Digital Services' },
  { code: '999991', name: 'PalmPay' },
  { code: '51310', name: 'Sparkle Microfinance Bank' },
  { code: '566',   name: 'VFD Microfinance Bank' },
  { code: '50117', name: 'Branch International Finance Company Ltd' },
  // ── Payment Service Banks (PSBs) ─────────────────────────────────────────
  { code: '120001', name: '9mobile 9Payment Service Bank' },
  { code: '120003', name: 'Airtel Smartcash PSB' },
  { code: '120002', name: 'Hope PSBank' },
  { code: '120004', name: 'MTN MoMo PSB' },
  // ── Selected Microfinance Banks ──────────────────────────────────────────
  { code: '602',    name: 'ACCION Microfinance Bank' },
  { code: '50162',  name: 'DOT Microfinance Bank' },
  { code: '50383',  name: 'Hasal Microfinance Bank' },
  { code: '51244',  name: 'IBILE Microfinance Bank' },
  { code: '090177', name: 'LAPO Microfinance Bank' },
  { code: '100002', name: 'Paga' },
  { code: '50200',  name: 'RenMoney Microfinance Bank' },
  { code: '51113',  name: 'Safe Haven Microfinance Bank' },
  { code: '090264', name: 'Tangerine Bank' },
].sort((a, b) => a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// Dynamic fetch — returns ALL Paystack-supported banks (~300+).
// Cached in localStorage for 24 hours.
// ---------------------------------------------------------------------------
const CACHE_KEY = 'kdops_bank_list';
const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function fetchBanks(): Promise<NigerianBank[]> {
  // Return cached list if still fresh
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: NigerianBank[]; ts: number };
      if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch {
    // corrupted cache — fall through
  }

  try {
    // Route through the edge function to avoid CORS and keep the Paystack
    // secret key server-side. The list_banks action is unauthenticated.
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase.functions.invoke('paystack-transfer', {
      body: { action: 'list_banks' },
    });
    if (!error && Array.isArray(data?.data) && data.data.length > 0) {
      const banks: NigerianBank[] = (data.data as Array<{ code: string; name: string }>)
        .map((b) => ({ code: b.code, name: b.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: banks, ts: Date.now() }));
      return banks;
    }
  } catch {
    // network error or edge function not deployed — use static fallback
  }

  return NIGERIAN_BANKS;
}

/** Invalidate the bank list cache — call after edge function is redeployed. */
export const clearBankCache = (): void => localStorage.removeItem(CACHE_KEY);

/** Look up a Paystack bank code by display name (static list only). */
export const getBankCode = (bankName: string): string | undefined =>
  NIGERIAN_BANKS.find(
    (b) => b.name === bankName || b.name.toLowerCase() === bankName.toLowerCase(),
  )?.code;

/** Case-insensitive fuzzy match by name prefix (static list only). */
export const findBank = (query: string): NigerianBank | undefined => {
  const q = query.trim().toLowerCase();
  return NIGERIAN_BANKS.find(
    (b) => b.name.toLowerCase() === q || b.name.toLowerCase().startsWith(q),
  );
};
