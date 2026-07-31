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
    'Rent Relief (Annual ₦)',
    'Chargeable Income (Annual ₦)',
    'Tax Due (Annual ₦)',
    'PAYE This Month (₦)',
  ];

  const body = rows.map((li, i) => {
    const grossAnnual = li.gross_monthly_ngn * 12;
    const pensionAnnual = li.pension_employee_monthly_ngn * 12;
    const nhfAnnual = li.nhf_monthly_ngn * 12;
    const nhisAnnual = li.nhis_monthly_ngn * 12;
    // Rent relief not captured on payroll_run_items today — leave blank
    // (finance can fill in per-employee before uploading if applicable).
    const rentAnnual = '';
    const chargeableAnnual = Math.max(
      0,
      grossAnnual - pensionAnnual - nhfAnnual - nhisAnnual,
    );
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
      rentAnnual,
      chargeableAnnual,
      taxAnnual,
      li.paye_monthly_ngn,
    ];
  });

  // Totals footer — helps finance reconcile before upload.
  const totals = rows.reduce(
    (acc, li) => ({
      gross: acc.gross + li.gross_monthly_ngn,
      pension: acc.pension + li.pension_employee_monthly_ngn,
      nhf: acc.nhf + li.nhf_monthly_ngn,
      nhis: acc.nhis + li.nhis_monthly_ngn,
      paye: acc.paye + li.paye_monthly_ngn,
    }),
    { gross: 0, pension: 0, nhf: 0, nhis: 0, paye: 0 },
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
    summary: `${rows.length} Lagos employee${rows.length === 1 ? '' : 's'} · Total PAYE ₦${totals.paye.toLocaleString('en-NG')}`,
  };
}
