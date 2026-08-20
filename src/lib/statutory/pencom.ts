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
import { formatNairaCompact } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { PENSION_EMPLOYEE_RATE, PENSION_EMPLOYER_RATE } from '@/lib/tax';
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
    summary: `${rows.length} RSA holder${rows.length === 1 ? '' : 's'} · Total ${formatNairaCompact(totals.emp + totals.err)}`,
  };
}

export interface PenComPfaSchedule {
  pfaName: string;
  pfaCode: string;
  csvContent: string;
  employeeCount: number;
  totalAmount: number;
}

/**
 * Per-PFA PenCom schedule, generated straight from `payslips` for a
 * specific payroll run (rather than the `payroll_run_items` snapshot
 * `buildPenComPsspSchedule` uses). Each PFA a company remits to gets its
 * own CSV — most PSSP portals only accept a single-PFA upload at a time,
 * so splitting here saves finance from doing it by hand in Excel.
 */
export async function generatePenComSchedule(
  payrollRunId: string,
): Promise<PenComPfaSchedule[]> {
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('id, period')
    .eq('id', payrollRunId)
    .maybeSingle();
  if (runErr) throw new Error(runErr.message);
  if (!run) throw new Error('Payroll run not found');

  const { data: payslips, error: slipErr } = await supabase
    .from('payslips')
    .select('employee_id, employee_name, pension_ngn')
    .eq('payroll_run_id', payrollRunId);
  if (slipErr) throw new Error(slipErr.message);

  const rows = (payslips ?? []) as any[];
  const employeeIds = rows
    .map((r) => r.employee_id)
    .filter((x: string | null): x is string => !!x);

  const { data: profiles, error: profErr } = employeeIds.length
    ? await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name, pension_pin, pfa_name, pfa_code')
        .in('id', employeeIds)
    : { data: [] as any[], error: null };
  if (profErr) throw new Error(profErr.message);

  const profileById = new Map<string, any>();
  for (const p of (profiles ?? []) as any[]) profileById.set(p.id, p);

  const monthYear = shortPeriod(run.period as string);

  interface Row {
    rsaPin: string;
    surname: string;
    firstName: string;
    otherNames: string;
    employeeContribution: number;
    employerContribution: number;
  }
  const byPfa = new Map<string, { pfaCode: string; rows: Row[] }>();

  for (const slip of rows) {
    const employeeContribution = Math.round(Number(slip.pension_ngn || 0));
    if (employeeContribution <= 0) continue;
    const p = slip.employee_id ? profileById.get(slip.employee_id) : null;
    const pfaName = p?.pfa_name || 'Unassigned PFA';
    const pfaCode = p?.pfa_code || '';
    const employerContribution = Math.round(
      (employeeContribution / PENSION_EMPLOYEE_RATE) * PENSION_EMPLOYER_RATE,
    );
    const nameParts = (p?.full_name || slip.employee_name || '').trim().split(/\s+/);
    const surname = p?.last_name || nameParts[nameParts.length - 1] || '';
    const firstName = p?.first_name || nameParts[0] || '';
    const otherNames = p?.first_name || p?.last_name
      ? ''
      : nameParts.slice(1, -1).join(' ');

    if (!byPfa.has(pfaName)) byPfa.set(pfaName, { pfaCode, rows: [] });
    byPfa.get(pfaName)!.rows.push({
      rsaPin: p?.pension_pin || '',
      surname,
      firstName,
      otherNames,
      employeeContribution,
      employerContribution,
    });
  }

  const header = [
    'S/N',
    'RSA PIN',
    'Surname',
    'First Name',
    'Other Names',
    'Employee Contribution (₦)',
    'Employer Contribution (₦)',
    'Total (₦)',
    'Month/Year',
  ];

  const schedules: PenComPfaSchedule[] = [];
  for (const [pfaName, { pfaCode, rows: pfaRows }] of byPfa) {
    const body = pfaRows.map((r, i) => [
      i + 1,
      r.rsaPin,
      r.surname,
      r.firstName,
      r.otherNames,
      r.employeeContribution,
      r.employerContribution,
      r.employeeContribution + r.employerContribution,
      monthYear,
    ]);
    const totalAmount = pfaRows.reduce(
      (s, r) => s + r.employeeContribution + r.employerContribution,
      0,
    );
    body.push([
      '', '', `TOTAL (${pfaRows.length} employees)`, '', '',
      pfaRows.reduce((s, r) => s + r.employeeContribution, 0),
      pfaRows.reduce((s, r) => s + r.employerContribution, 0),
      totalAmount,
      '',
    ]);

    const headerLines = [
      `# PenCom Pension Schedule — ${pfaName}`,
      `# PFA Code: ${pfaCode || '(missing)'}`,
      `# Period: ${monthYear}`,
      `# Employees: ${pfaRows.length}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
    ];

    schedules.push({
      pfaName,
      pfaCode,
      csvContent: headerLines.join('\n') + toCsv(header, body),
      employeeCount: pfaRows.length,
      totalAmount,
    });
  }

  return schedules.sort((a, b) => a.pfaName.localeCompare(b.pfaName));
}
