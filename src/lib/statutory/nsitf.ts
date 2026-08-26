/**
 * NSITF Employee Compensation Scheme — 1% of total monthly payroll,
 * employer-borne only. One line per employee, plus totals.
 */

import { toCsv } from '@/lib/csv';
import { formatNairaCompact } from '@/lib/format';
import { NSITF_RATE } from '@/lib/tax';
import {
  StatutoryRunData,
  StatutoryExportFile,
  shortPeriod,
} from './index';

export function buildNsitfSchedule(
  data: StatutoryRunData,
): StatutoryExportFile {
  const rows = data.items;
  const header = [
    'S/N',
    'Staff Number',
    'Employee Name',
    'Employee TIN',
    'NIN',
    'Gross Monthly (₦)',
    'ECS 1% Contribution (₦)',
  ];

  const body = rows.map((li, i) => [
    i + 1,
    li.staff_number ?? '',
    li.employee_name,
    li.tin ?? '',
    li.nin ?? '',
    li.gross_monthly_ngn,
    Math.round(li.gross_monthly_ngn * NSITF_RATE),
  ]);

  const totalGross = rows.reduce((s, li) => s + li.gross_monthly_ngn, 0);
  const totalEcs = Math.round(totalGross * NSITF_RATE);
  body.push([
    '',
    '',
    `TOTAL (${rows.length} employees)`,
    '',
    '',
    totalGross,
    totalEcs,
  ]);

  const employerLines = [
    `# NSITF ECS Monthly Schedule`,
    `# Employer: ${data.employer.company_name}`,
    `# NSITF Employer Code: ${data.employer.nsitf_employer_code ?? '(missing — set in Settings)'}`,
    `# Period: ${data.period}`,
    `# Employees: ${rows.length}`,
    `# Employer-borne total (1%): ${formatNairaCompact(totalEcs)}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
  ];

  const csv = employerLines.join('\n') + toCsv(header, body);

  return {
    kind: 'nsitf',
    filename: `NSITF-ECS-${shortPeriod(data.period)}.csv`,
    csv,
    summary: `${rows.length} employee${rows.length === 1 ? '' : 's'} · ECS ${formatNairaCompact(totalEcs)}`,
  };
}
