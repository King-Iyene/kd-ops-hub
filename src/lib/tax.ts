/**
 * Nigerian Personal Income Tax Act — progressive annual PIT bands.
 * Income is annualised, bands applied, result divided by 12 for monthly PAYE.
 *
 * Annual band structure (Finance Act / PITA schedule):
 *   First  ₦300,000  →  7%
 *   Next   ₦300,000  → 11%
 *   Next   ₦500,000  → 15%
 *   Next   ₦500,000  → 19%
 *   Next ₦1,600,000  → 21%
 *   Above ₦3,200,000 → 24%
 */
const PAYE_BANDS: ReadonlyArray<{ limit: number; rate: number }> = [
  { limit: 300_000,   rate: 0.07 },
  { limit: 300_000,   rate: 0.11 },
  { limit: 500_000,   rate: 0.15 },
  { limit: 500_000,   rate: 0.19 },
  { limit: 1_600_000, rate: 0.21 },
  { limit: Infinity,  rate: 0.24 },
];

/**
 * Calculate monthly PAYE for a given monthly gross salary (NGN).
 * Annualises the salary, applies progressive annual PIT bands, returns 1/12.
 *
 * @param monthlySalaryNgn - Monthly gross salary in Naira. Negative values → ₦0.
 * @returns Monthly PAYE deduction in Naira (rounded to nearest Naira).
 */
export function calculatePAYE(monthlySalaryNgn: number): number {
  if (monthlySalaryNgn <= 0) return 0;

  const annual = monthlySalaryNgn * 12;
  let remaining = annual;
  let annualTax = 0;

  for (const { limit, rate } of PAYE_BANDS) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, limit);
    annualTax += taxable * rate;
    remaining -= taxable;
  }

  return Math.round(annualTax / 12);
}

/** Effective PAYE rate as a percentage string, useful for UI display. */
export function effectivePAYERate(grossMonthly: number): string {
  if (grossMonthly <= 0) return '0.00%';
  return ((calculatePAYE(grossMonthly) / grossMonthly) * 100).toFixed(2) + '%';
}
