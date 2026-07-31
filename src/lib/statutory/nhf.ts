/**
 * FMBN NHF Remittance Schedule — 2.5% of basic salary, employee-borne.
 *
 * Only employees with `nhf_enabled=true` should appear. Payroll already
 * omits them from `payroll_run_items.nhf_ngn` when disabled, so we
 * filter on `nhf_monthly_ngn > 0`.
 */

import { toCsv } from '@/lib/csv';
import {
  StatutoryRunData,
  StatutoryExportFile,
  shortPeriod,
} from './index';

export function buildNhfSchedule(
  data: StatutoryRunData,
): StatutoryExportFile {
  const rows = data.items.filter((li) => li.nhf_monthly_ngn > 0);

  const header = [
    'S/N',
    'NHF Number',
    'Staff Number',
    'Surname',
    'First Name',
    'NIN',
    'Employee TIN',
    'Basic Salary (Monthly ₦)',
    'NHF Contribution 2.5% (₦)',
  ];

  const body = rows.map((li, i) => {
    // NHF base is basic salary (NHF Act s.4). If payroll only stored gross
    // we approximate basic by reverse-computing from the deduction.
    const basic = Math.round(li.nhf_monthly_ngn / 0.025);
    return [
      i + 1,
      li.nhf_number ?? '(missing)',
      li.staff_number ?? '',
      li.last_name ?? '',
      li.first_name ?? li.employee_name,
      li.nin ?? '',
      li.tin ?? '',
      basic,
      li.nhf_monthly_ngn,
    ];
  });

  const total = rows.reduce((s, li) => s + li.nhf_monthly_ngn, 0);
  body.push(['', '', '', '', `TOTAL (${rows.length} employees)`, '', '', '', total]);

  const employerLines = [
    `# FMBN NHF Schedule`,
    `# Employer: ${data.employer.company_name}`,
    `# NHF Employer Code: ${data.employer.nhf_employer_code ?? '(missing — set in Settings)'}`,
    `# Period: ${data.period}`,
    `# Contributors: ${rows.length}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  const csv = employerLines.join('\n') + toCsv(header, body);

  return {
    kind: 'nhf',
    filename: `FMBN-NHF-${shortPeriod(data.period)}.csv`,
    csv,
    summary: `${rows.length} contributor${rows.length === 1 ? '' : 's'} · ₦${total.toLocaleString('en-NG')}`,
  };
}
