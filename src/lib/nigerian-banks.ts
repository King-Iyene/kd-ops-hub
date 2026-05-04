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
  { code: '50211', name: 'Kuda Microfinance Bank' },
  { code: '50515', name: 'Moniepoint Microfinance Bank' },
  { code: '999992', name: 'OPay Digital Services Limited (OPay)' },
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

// Module-level bank registry — starts with static list, upgraded once dynamic
// fetch completes. getBankCode searches this, so dynamically-fetched banks are
// resolved correctly without callers needing to pass the bank code explicitly.
let _allBanks: NigerianBank[] = NIGERIAN_BANKS;

function _updateRegistry(banks: NigerianBank[]): void {
  if (banks.length > 0) _allBanks = banks;
}

export async function fetchBanks(): Promise<NigerianBank[]> {
  // Return cached list if still fresh
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const { data, ts } = JSON.parse(raw) as { data: NigerianBank[]; ts: number };
      if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
        _updateRegistry(data);
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
      _updateRegistry(banks);
      return banks;
    }
  } catch {
    // network error or edge function not deployed — use static fallback
  }

  return NIGERIAN_BANKS;
}

/** Invalidate the bank list cache — call after edge function is redeployed. */
export const clearBankCache = (): void => {
  localStorage.removeItem(CACHE_KEY);
  _allBanks = NIGERIAN_BANKS;
};

/** Look up a Paystack bank code by display name. Searches the full dynamic
 *  list once fetchBanks() has been called; falls back to the static 55-bank
 *  list before that.
 *
 *  Matching order:
 *  1. Alias map — catches short / old names employees may have saved
 *     (e.g. "OPay", "Union Bank", "UBA", "FCMB")
 *  2. Exact case-insensitive match against the full dynamic bank list
 *  3. Prefix match — stored name is an unambiguous prefix of one bank
 *     (e.g. "OPay" → "OPay Digital Services")
 */

const BANK_ALIASES: Record<string, string> = {
  // Short / common names → Paystack code
  'opay':                                    '999992',
  'opay digital services':                   '999992',
  'opay digital services limited':           '999992',
  'opay digital services limited (opay)':    '999992',
  'union bank':                              '032',
  'union bank of nigeria':                   '032',
  'first bank':                              '011',
  'first bank of nigeria':                   '011',
  'uba':                                     '033',
  'united bank for africa':                  '033',
  'united bank for africa (uba)':            '033',
  'fcmb':                                    '214',
  'first city monument bank':                '214',
  'first city monument bank (fcmb)':         '214',
  'gtb':                                     '058',
  'gtbank':                                  '058',
  'guaranty trust bank':                     '058',
  'guaranty trust bank plc':                 '058',
  'diamond bank':                            '063',
  'access bank (diamond)':                   '063',
  'moniepoint':                              '50515',
  'moniepoint mfb':                          '50515',
  'moniepoint microfinance bank':            '50515',
  'kuda':                                    '50211',
  'kuda bank':                               '50211',
  'kuda microfinance bank':                  '50211',
  'palmpay':                                 '999991',
  'palm pay':                                '999991',
  'fairmoney':                               '090311',
  'fair money':                              '090311',
  'fairmoney microfinance bank':             '090311',
  'carbon':                                  '565',
  'carbon microfinance bank':                '565',
  'vfd':                                     '566',
  'vfd microfinance bank':                   '566',
  'stanbic':                                 '221',
  'stanbic ibtc':                            '221',
  'stanbic ibtc bank':                       '221',
  'sterling':                                '232',
  'sterling bank':                           '232',
  'fidelity':                                '070',
  'fidelity bank':                           '070',
  'ecobank':                                 '050',
  'ecobank nigeria':                         '050',
  'unity bank':                              '215',
  'wema':                                    '035',
  'wema bank':                               '035',
  'keystone':                                '082',
  'keystone bank':                           '082',
  'providus':                                '101',
  'providus bank':                           '101',
  'polaris':                                 '076',
  'polaris bank':                            '076',
  'lotus':                                   '303',
  'lotus bank':                              '303',
  'taj':                                     '302',
  'taj bank':                                '302',
  'jaiz':                                    '301',
  'jaiz bank':                               '301',
  'citi':                                    '023',
  'citibank':                                '023',
  'citibank nigeria':                        '023',
  'rubies':                                  '125',
  'rubies bank':                             '125',
  'sparkle':                                 '51310',
  'sparkle microfinance bank':               '51310',
  'eyowo':                                   '50126',
  'paga':                                    '100002',
  'access bank':                             '044',
  'zenith':                                  '057',
  'zenith bank':                             '057',
  'zenith bank plc':                         '057',
  'gtco':                                    '058',
  'guaranty trust holding company':          '058',
  'mtn momo':                                '120004',
  'mtn momo psb':                            '120004',
  'airtel smartcash':                        '120003',
  'airtel smartcash psb':                    '120003',
  '9mobile':                                 '120001',
  '9mobile 9payment service bank':           '120001',
  'hope psbank':                             '120002',
  'hope payment service bank':               '120002',
  'alat':                                    '035A',
  'alat by wema':                            '035A',
};

export const getBankCode = (bankName: string): string | undefined => {
  const n = (bankName || '').trim().toLowerCase();
  if (!n) return undefined;

  // 1. Alias map — catches short names, old names, and full Paystack API names
  if (BANK_ALIASES[n]) return BANK_ALIASES[n];

  // 2. Exact match (case-insensitive) against the full dynamic list
  const exact = _allBanks.find((b) => b.name.toLowerCase() === n);
  if (exact) return exact.code;

  // 3. Stored name starts with a known bank name (query is longer than registry
  //    entry) e.g. "OPay Digital Services Limited (OPay)" contains "OPay Digital Services"
  const contained = _allBanks.filter((b) => n.includes(b.name.toLowerCase()) && b.name.length >= 4);
  if (contained.length === 1) return contained[0].code;

  // 4. Known bank name starts with query (query is a prefix of registry entry)
  //    e.g. "OPay" → "OPay Digital Services Limited (OPay)"
  const prefix = _allBanks.filter((b) => b.name.toLowerCase().startsWith(n));
  if (prefix.length === 1) return prefix[0].code;

  return undefined;
};

/** Case-insensitive fuzzy match by name prefix (static list only). */
export const findBank = (query: string): NigerianBank | undefined => {
  const q = query.trim().toLowerCase();
  return NIGERIAN_BANKS.find(
    (b) => b.name.toLowerCase() === q || b.name.toLowerCase().startsWith(q),
  );
};
