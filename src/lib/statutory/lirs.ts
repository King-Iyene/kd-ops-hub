/**
 * LIRS eTax Monthly PAYE Schedule (Lagos State).
 *
 * Format models the LIRS eTax "Schedule 1 — Monthly PAYE Return" columns.
 * Amounts are ANNUALISED (monthly × 12) except the final "PAYE This Month"
 * column, which is the amount the employer is remitting for `period`.
 *
 * Only employees whose `state_of_residence` is Lagos (or fallback:
 * employer's default when unset) are included — the FIRS exporter handles
 * the rest.
 */

import { toCsv } from '@/lib/csv';
import { formatNairaCompact } from '@/lib/format';
import {
  StatutoryRunData,
  StatutoryExportFile,
  shortPeriod,
} from './index';

const isLagos = (s: string | null | undefined): boolean =>
  !!s && /^\s*lagos\s*$/i.test(s);

export function buildLirsPayeSchedule(
  data: StatutoryRunData,
): StatutoryExportFile {
  const defaultState = data.employer.state_of_business ?? null;
  const rows = data.items.filter((li) =>
    isLagos(li.state_of_residence) ||
    (li.state_of_residence == null && isLagos(defaultState)),
  );

  const header = [
    'S/N',
    'Staff Number',
    'Employee Name',
    'Employee TIN',
    'NIN',
    'RSA PIN',
    'Gross Emolument (Monthly ₦)',
    'Gross Emolument (Annual ₦)',
    'Pension Contribution (Annual ₦)',
    'NHF Contribution (Annual ₦)',
    'NHIS Contribution (Annual ₦)',
    'AVC (Annual ₦)',
    'Rent Relief (Annual ₦)',
    'Life Assurance (Annual ₦)',
    'Total Relief (Annual ₦)',
    'Chargeable Income (Annual ₦)',
    'Tax Due (Annual ₦)',
    'PAYE This Month (₦)',
  ];

  const body = rows.map((li, i) => {
    const grossAnnual = li.gross_monthly_ngn * 12;
    const pensionAnnual = li.pension_employee_monthly_ngn * 12;
    const nhfAnnual = li.nhf_monthly_ngn * 12;
    const nhisAnnual = li.nhis_monthly_ngn * 12;
    const avcAnnual = li.avc_monthly_ngn * 12;
    const rentAnnual = li.rent_relief_monthly_ngn * 12;
    const lifeAnnual = li.life_assurance_monthly_ngn * 12;
    const totalRelief = pensionAnnual + nhfAnnual + nhisAnnual + avcAnnual + rentAnnual + lifeAnnual;
    const chargeableAnnual = Math.max(0, grossAnnual - totalRelief);
    const taxAnnual = li.paye_monthly_ngn * 12;
    return [
      i + 1,
      li.staff_number ?? '',
      li.employee_name,
      li.tin ?? '',
      li.nin ?? '',
      li.rsa_pin ?? '',
      li.gross_monthly_ngn,
      grossAnnual,
      pensionAnnual,
      nhfAnnual,
      nhisAnnual,
      avcAnnual,
      rentAnnual,
      lifeAnnual,
      totalRelief,
      chargeableAnnual,
      taxAnnual,
      li.paye_monthly_ngn,
    ];
  });

  const totals = rows.reduce(
    (acc, li) => ({
      gross: acc.gross + li.gross_monthly_ngn,
      pension: acc.pension + li.pension_employee_monthly_ngn,
      nhf: acc.nhf + li.nhf_monthly_ngn,
      nhis: acc.nhis + li.nhis_monthly_ngn,
      avc: acc.avc + li.avc_monthly_ngn,
      rent: acc.rent + li.rent_relief_monthly_ngn,
      life: acc.life + li.life_assurance_monthly_ngn,
      paye: acc.paye + li.paye_monthly_ngn,
    }),
    { gross: 0, pension: 0, nhf: 0, nhis: 0, avc: 0, rent: 0, life: 0, paye: 0 },
  );
  body.push([
    '',
    '',
    `TOTAL (${rows.length} employees)`,
    '',
    '',
    '',
    totals.gross,
    totals.gross * 12,
    totals.pension * 12,
    totals.nhf * 12,
    totals.nhis * 12,
    totals.avc * 12,
    totals.rent * 12,
    totals.life * 12,
    '',
    '',
    totals.paye * 12,
    totals.paye,
  ]);

  // Employer header prepended as commented rows so LIRS eTax upload still
  // parses the header row. Finance staff can strip these lines if needed.
  const employerLines = [
    `# LIRS eTax — Monthly PAYE Return`,
    `# Employer: ${data.employer.company_name}`,
    `# TIN: ${data.employer.employer_tin ?? '(missing — set in Settings)'}`,
    `# Period: ${data.period}`,
    `# Employees (Lagos): ${rows.length} of ${data.items.length}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  const csv = employerLines.join('\n') + toCsv(header, body);

  return {
    kind: 'paye_lirs',
    filename: `LIRS-PAYE-${shortPeriod(data.period)}.csv`,
    csv,
    summary: `${rows.length} Lagos employee${rows.length === 1 ? '' : 's'} · Total PAYE ${formatNairaCompact(totals.paye)}`,
  };
}
