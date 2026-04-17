/**
 * Complete list of Nigerian banks supported by Paystack / NIP.
 * Used across: contractor form, payment batches, Quick Pay, employee
 * profiles, public /join form, BankAccountField.
 *
 * Source: CBN licensed banks + Paystack supported banks list, April 2026.
 */

export interface NigerianBank {
  code: string;
  name: string;
}

export const NIGERIAN_BANKS: NigerianBank[] = [
  { code: '044', name: 'Access Bank' },
  { code: '014', name: 'Citibank Nigeria' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank (FCMB)' },
  { code: '301', name: 'Globus Bank' },
  { code: '058', name: 'GTBank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '50211', name: 'Kuda Bank' },
  { code: '303', name: 'Lotus Bank' },
  { code: '50515', name: 'Moniepoint' },
  { code: '999992', name: 'OPay' },
  { code: '999991', name: 'PalmPay' },
  { code: '305', name: 'Parallex Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '311', name: 'Premium Trust Bank' },
  { code: '101', name: 'Providus Bank' },
  { code: '125', name: 'Rubies Bank' },
  { code: '221', name: 'Stanbic IBTC' },
  { code: '232', name: 'Sterling Bank' },
  { code: '100', name: 'SunTrust Bank' },
  { code: '302', name: 'Taj Bank' },
  { code: '102', name: 'Titan Trust Bank' },
  { code: '033', name: 'United Bank for Africa (UBA)' },
  { code: '032', name: 'Union Bank' },
  { code: '215', name: 'Unity Bank' },
  { code: '566', name: 'VFD Microfinance Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' },
  { code: '565', name: 'Carbon' },
  { code: '50126', name: 'Eyowo' },
];

/** Look up a Paystack bank code by display name. */
export const getBankCode = (bankName: string): string | undefined =>
  NIGERIAN_BANKS.find(
    (b) => b.name === bankName || b.name.toLowerCase() === bankName.toLowerCase(),
  )?.code;

/** Case-insensitive fuzzy match by name prefix. */
export const findBank = (query: string): NigerianBank | undefined => {
  const q = query.trim().toLowerCase();
  return NIGERIAN_BANKS.find(
    (b) =>
      b.name.toLowerCase() === q ||
      b.name.toLowerCase().startsWith(q),
  );
};
