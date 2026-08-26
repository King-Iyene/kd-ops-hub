/**
 * ITF Annual Contribution Schedule — 1% of annual payroll.
 *
 * ITF applies to firms with ≥ 5 staff or ≥ ₦50M turnover. Filed
 * annually (by 1 April of the following year) so this exporter takes a
 * single-month snapshot and annualises (× 12) for the return template.
 * For a final year-end filing, finance should re-run per month and
 * consolidate — a proper multi-month aggregator ships in a follow-up.
 */

import { toCsv } from '@/lib/csv';
import { formatNairaCompact } from '@/lib/format';
import { ITF_RATE } from '@/lib/tax';
import {
  StatutoryRunData,
  StatutoryExportFile,
  shortPeriod,
} from './index';

export function buildItfAnnualSchedule(
  data: StatutoryRunData,
): StatutoryExportFile {
  const rows = data.items;
  const header = [
    'S/N',
    'Staff Number',
    'Surname',
    'First Name',
    'Employee TIN',
    'NIN',
    'Annualised Emolument (₦)',
    'ITF 1% Contribution (₦)',
  ];

  const body = rows.map((li, i) => {
    const annualGross = li.gross_monthly_ngn * 12;
    return [
      i + 1,
      li.staff_number ?? '',
      li.last_name ?? '',
      li.first_name ?? li.employee_name,
      li.tin ?? '',
      li.nin ?? '',
      annualGross,
      Math.round(annualGross * ITF_RATE),
    ];
  });

  const totalAnnual = rows.reduce((s, li) => s + li.gross_monthly_ngn * 12, 0);
  const totalItf = Math.round(totalAnnual * ITF_RATE);
  body.push([
    '',
    '',
    '',
    `TOTAL (${rows.length} employees)`,
    '',
    '',
    totalAnnual,
    totalItf,
  ]);

  const employerLines = [
    `# ITF Annual Return (single-period snapshot)`,
    `# Employer: ${data.employer.company_name}`,
    `# ITF Employer Code: ${data.employer.itf_employer_code ?? '(missing — set in Settings)'}`,
    `# Snapshot period: ${data.period}`,
    `# Employees: ${rows.length}`,
    `# 1% of annualised: ${formatNairaCompact(totalItf)}`,
    `# For a full-year return, consolidate 12 monthly snapshots.`,
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  const csv = employerLines.join('\n') + toCsv(header, body);

  return {
    kind: 'itf',
    filename: `ITF-Annual-${shortPeriod(data.period)}.csv`,
    csv,
    summary: `${rows.length} employee${rows.length === 1 ? '' : 's'} · ITF (annualised) ${formatNairaCompact(totalItf)}`,
  };
}
