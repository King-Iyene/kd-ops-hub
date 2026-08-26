/**
 * FIRS TaxPro Max — Monthly PAYE Schedule (federal, non-Lagos states).
 *
 * PAYE is a state tax; each State IRS has its own portal. In practice
 * KDOps clients outside Lagos remit through the State IRS eTax portal
 * (which mostly mirrors FIRS TaxPro Max column layout for uploads).
 *
 * This exporter produces the general federal/state PAYE schedule for
 * every employee whose `state_of_residence` is NOT Lagos, grouped by
 * state so finance can slice and file per SIRS.
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

export function buildFirsPayeSchedule(
  data: StatutoryRunData,
): StatutoryExportFile {
  const defaultState = data.employer.state_of_business ?? null;
  const rows = data.items.filter((li) => {
    const state = li.state_of_residence ?? defaultState;
    return !isLagos(state);
  });

  const header = [
    'S/N',
    'State of Residence',
    'Staff Number',
    'Employee Name',
    'Employee TIN',
    'NIN',
    'RSA PIN',
    'Gross Monthly (₦)',
    'Pension Monthly (₦)',
    'NHF Monthly (₦)',
    'NHIS Monthly (₦)',
    'AVC Monthly (₦)',
    'Rent Relief Monthly (₦)',
    'Life Assurance Monthly (₦)',
    'Total Relief (₦)',
    'Chargeable Monthly (₦)',
    'PAYE Monthly (₦)',
  ];

  const body = rows.map((li, i) => {
    const state = li.state_of_residence ?? defaultState ?? '(unset)';
    const totalRelief = li.pension_employee_monthly_ngn
      + li.nhf_monthly_ngn + li.nhis_monthly_ngn
      + li.avc_monthly_ngn + li.rent_relief_monthly_ngn
      + li.life_assurance_monthly_ngn;
    const chargeableMonthly = Math.max(0, li.gross_monthly_ngn - totalRelief);
    return [
      i + 1,
      state,
      li.staff_number ?? '',
      li.employee_name,
      li.tin ?? '',
      li.nin ?? '',
      li.rsa_pin ?? '',
      li.gross_monthly_ngn,
      li.pension_employee_monthly_ngn,
      li.nhf_monthly_ngn,
      li.nhis_monthly_ngn,
      li.avc_monthly_ngn,
      li.rent_relief_monthly_ngn,
      li.life_assurance_monthly_ngn,
      totalRelief,
      chargeableMonthly,
      li.paye_monthly_ngn,
    ];
  });

  const totalPaye = rows.reduce((s, li) => s + li.paye_monthly_ngn, 0);

  body.push([
    '',
    '',
    '',
    `TOTAL (${rows.length} employees)`,
    '',
    '',
    '',
    rows.reduce((s, li) => s + li.gross_monthly_ngn, 0),
    rows.reduce((s, li) => s + li.pension_employee_monthly_ngn, 0),
    rows.reduce((s, li) => s + li.nhf_monthly_ngn, 0),
    rows.reduce((s, li) => s + li.nhis_monthly_ngn, 0),
    rows.reduce((s, li) => s + li.avc_monthly_ngn, 0),
    rows.reduce((s, li) => s + li.rent_relief_monthly_ngn, 0),
    rows.reduce((s, li) => s + li.life_assurance_monthly_ngn, 0),
    '',
    '',
    totalPaye,
  ]);

  const employerLines = [
    `# FIRS/SIRS PAYE Schedule (non-Lagos)`,
    `# Employer: ${data.employer.company_name}`,
    `# TIN: ${data.employer.employer_tin ?? '(missing — set in Settings)'}`,
    `# Period: ${data.period}`,
    `# Employees: ${rows.length}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  const csv = employerLines.join('\n') + toCsv(header, body);

  return {
    kind: 'paye_firs',
    filename: `FIRS-PAYE-${shortPeriod(data.period)}.csv`,
    csv,
    summary: `${rows.length} non-Lagos employee${rows.length === 1 ? '' : 's'} · PAYE ${formatNairaCompact(totalPaye)}`,
  };
}
