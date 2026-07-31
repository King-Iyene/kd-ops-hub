/**
 * PenCom PSSP schedule — per-employee pension breakdown.
 *
 * PSSP (Pension Sub-Sector Service Provider) schedules are uploaded to
 * each PFA. The schedule lists one row per RSA holder with employee 8%
 * and employer 10% contributions. Because a company usually has staff
 * spread across several PFAs, the file naturally sorts by `pfa_name` so
 * finance can split it per PFA before upload.
 */

import { toCsv } from '@/lib/csv';
import {
  StatutoryRunData,
  StatutoryExportFile,
  shortPeriod,
} from './index';

export function buildPenComPsspSchedule(
  data: StatutoryRunData,
): StatutoryExportFile {
  // Only employees who actually had a pension contribution this period.
  const rows = data.items
    .filter((li) => li.pension_employee_monthly_ngn > 0)
    .sort((a, b) => (a.pfa_name || 'Z').localeCompare(b.pfa_name || 'Z'));

  const header = [
    'S/N',
    'PFA',
    'PFA Code',
    'RSA PIN',
    'Staff Number',
    'Surname',
    'First Name',
    'Employee TIN',
    'NIN',
    'Pensionable Base (Monthly ₦)',
    'Employee 8% (₦)',
    'Employer 10% (₦)',
    'Total Contribution (₦)',
  ];

  const body = rows.map((li, i) => {
    // Base = employee contribution / 0.08. Reverse-computed so the row
    // reflects the same base used in the deduction.
    const pensionable = li.pension_employee_monthly_ngn > 0
      ? Math.round(li.pension_employee_monthly_ngn / 0.08)
      : 0;
    return [
      i + 1,
      li.pfa_name ?? '(unset — link a pension_pfa benefit)',
      li.pfa_code ?? '',
      li.rsa_pin ?? '',
      li.staff_number ?? '',
      li.last_name ?? '',
      li.first_name ?? li.employee_name,
      li.tin ?? '',
      li.nin ?? '',
      pensionable,
      li.pension_employee_monthly_ngn,
      li.pension_employer_monthly_ngn,
      li.pension_employee_monthly_ngn + li.pension_employer_monthly_ngn,
    ];
  });

  const totals = rows.reduce(
    (acc, li) => ({
      emp: acc.emp + li.pension_employee_monthly_ngn,
      err: acc.err + li.pension_employer_monthly_ngn,
    }),
    { emp: 0, err: 0 },
  );

  body.push([
    '',
    '',
    '',
    '',
    '',
    '',
    `TOTAL (${rows.length} RSA holders)`,
    '',
    '',
    '',
    totals.emp,
    totals.err,
    totals.emp + totals.err,
  ]);

  const employerLines = [
    `# PenCom PSSP Schedule`,
    `# Employer: ${data.employer.company_name}`,
    `# Employer Code: ${data.employer.pencom_employer_code ?? '(missing — set in Settings)'}`,
    `# TIN: ${data.employer.employer_tin ?? '(missing)'}`,
    `# Period: ${data.period}`,
    `# RSA holders: ${rows.length}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  const csv = employerLines.join('\n') + toCsv(header, body);

  return {
    kind: 'pension_pssp',
    filename: `PenCom-PSSP-${shortPeriod(data.period)}.csv`,
    csv,
    summary: `${rows.length} RSA holder${rows.length === 1 ? '' : 's'} · Total ₦${(totals.emp + totals.err).toLocaleString('en-NG')}`,
  };
}
