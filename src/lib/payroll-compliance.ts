/**
 * Pre-approval compliance summary for a payroll run.
 *
 * Answers the question an HR person actually has before approving: "is this
 * run going to be correct, and is there anything I should fix first?" — as a
 * short list of statements rather than a wall of employee names.
 *
 * Every rule below cites the regulation it comes from. Sources are recorded
 * in docs/payroll-standards-reference.md (Part B), current as of the Nigeria
 * Tax Act 2025 regime effective 1 January 2026.
 *
 * A deliberate judgement call, worth stating because it inverts what you
 * might expect: an employee who is NOT contributing to NHF is reported as
 * information, never as a warning. The Business Facilitation Act 2022
 * amended the NHF Act so that contribution is VOLUNTARY for private-sector
 * employees (it remains mandatory only for public-sector staff and the
 * self-employed). Flagging opted-out employees as a problem would nag HR
 * into "fixing" something that is both lawful and the employee's own choice,
 * and would quietly train them to ignore this panel. The same logic applies
 * to NHIS. What IS a warning is an employee who opted IN but has no scheme
 * number, because their money will be deducted with nowhere to remit it.
 */

export type ComplianceStatus = 'ok' | 'warn' | 'info' | 'off';

export interface ComplianceCheck {
  key: string;
  /** Short label, e.g. "Pension". */
  label: string;
  status: ComplianceStatus;
  /** One line a non-specialist can act on. */
  summary: string;
  /** Employees this concerns, for an expandable list. Empty when not useful. */
  names: string[];
}

export interface ComplianceEmployee {
  name: string;
  /** Gross pay for the period; 0 means nothing to deduct from. */
  gross: number;
  tax_id?: string | null;
  tin?: string | null;
  pension_enabled?: boolean | null;
  pension_pin?: string | null;
  nhf_enabled?: boolean | null;
  nhf_number?: string | null;
  nhis_enabled?: boolean | null;
  nhis_number?: string | null;
}

export interface ComplianceRunOptions {
  include_paye?: boolean;
  include_pension?: boolean;
  include_nhf?: boolean;
  include_nhis?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/**
 * Pension is opt-out per employee (pension_enabled), defaulting to ON —
 * matching how payroll treats it, and correct for KD Squares: the Pension
 * Reform Act 2014 makes participation mandatory for employers with 15+
 * employees.
 */
const pensionOn = (e: ComplianceEmployee) => e.pension_enabled !== false;
/** NHF and NHIS are opt-IN per employee, defaulting to OFF. */
const nhfOn = (e: ComplianceEmployee) => e.nhf_enabled === true;
const nhisOn = (e: ComplianceEmployee) => e.nhis_enabled === true;

export function buildComplianceChecks(
  employees: readonly ComplianceEmployee[],
  options: ComplianceRunOptions = {},
): ComplianceCheck[] {
  const checks: ComplianceCheck[] = [];
  const payable = employees.filter((e) => e.gross > 0);
  const total = payable.length;

  // ── PAYE ────────────────────────────────────────────────────────────────
  // Nigeria Tax Act 2025, effective 1 Jan 2026. Deducted at source and
  // remitted to the state IRS (Rivers State for KD Squares) by the 10th of
  // the following month, referencing the employer/employee Tax ID.
  if (options.include_paye === false) {
    checks.push({
      key: 'paye',
      label: 'PAYE tax',
      status: 'off',
      summary: 'Turned off for this run — no income tax will be deducted.',
      names: [],
    });
  } else {
    // NRS replaced the old TIN framework with a 13-digit Tax ID from Jan
    // 2026; either column may hold it depending on when the record was set up.
    const noTaxId = payable.filter((e) => !e.tax_id && !e.tin).map((e) => e.name);
    checks.push({
      key: 'paye',
      label: 'PAYE tax',
      status: noTaxId.length > 0 ? 'warn' : 'ok',
      summary: noTaxId.length > 0
        ? `Calculated for all ${total}, but ${noTaxId.length} ${plural(noTaxId.length, 'has', 'have')} no Tax ID on file — needed on the remittance schedule, not for the deduction itself.`
        : `Calculated for all ${total} ${plural(total, 'employee')} using the 2026 tax bands.`,
      names: noTaxId,
    });
  }

  // ── Pension ─────────────────────────────────────────────────────────────
  // Pension Reform Act 2014: 8% employee + 10% employer of pensionable
  // emoluments (basic + housing + transport). Mandatory at 15+ employees.
  if (options.include_pension === false) {
    checks.push({
      key: 'pension',
      label: 'Pension',
      status: 'off',
      summary: 'Turned off for this run — no pension will be deducted or matched.',
      names: [],
    });
  } else {
    const contributing = payable.filter(pensionOn);
    const noPin = contributing.filter((e) => !e.pension_pin).map((e) => e.name);
    const exempt = payable.length - contributing.length;
    checks.push({
      key: 'pension',
      label: 'Pension',
      status: noPin.length > 0 ? 'warn' : 'ok',
      summary: noPin.length > 0
        ? `${contributing.length} contributing at 8% employee + 10% employer, but ${noPin.length} ${plural(noPin.length, 'is', 'are')} missing a PenCom PIN — their contribution cannot be remitted to a PFA.`
        : `${contributing.length} contributing at 8% employee + 10% employer${exempt > 0 ? `, ${exempt} exempt` : ''}. All have a PenCom PIN.`,
      names: noPin,
    });
  }

  // ── NHF ─────────────────────────────────────────────────────────────────
  // Voluntary for private-sector employees since the Business Facilitation
  // Act 2022 amended the NHF Act. Opting out is lawful, so it is never a
  // warning — see the note at the top of this file.
  if (options.include_nhf === false) {
    checks.push({
      key: 'nhf',
      label: 'NHF',
      status: 'off',
      summary: 'Turned off for this run.',
      names: [],
    });
  } else {
    const contributing = payable.filter(nhfOn);
    const noNumber = contributing.filter((e) => !e.nhf_number).map((e) => e.name);
    checks.push({
      key: 'nhf',
      label: 'NHF',
      status: noNumber.length > 0 ? 'warn' : contributing.length === 0 ? 'info' : 'ok',
      summary: noNumber.length > 0
        ? `${contributing.length} contributing 2.5% of basic, but ${noNumber.length} ${plural(noNumber.length, 'has', 'have')} no NHF number to remit against.`
        : contributing.length === 0
          ? 'Nobody is enrolled. NHF has been voluntary for private-sector staff since 2022, so this is expected unless someone opts in.'
          : `${contributing.length} ${plural(contributing.length, 'employee')} contributing 2.5% of basic salary, all with an NHF number.`,
      names: noNumber,
    });
  }

  // ── NHIS ────────────────────────────────────────────────────────────────
  // NHIA Act 2022 s.26: 5% employee + 10% employer of basic, where enrolled.
  const nhisContributing = payable.filter(nhisOn);
  if (options.include_nhis !== false && nhisContributing.length > 0) {
    const noNumber = nhisContributing.filter((e) => !e.nhis_number).map((e) => e.name);
    checks.push({
      key: 'nhis',
      label: 'NHIS',
      status: noNumber.length > 0 ? 'warn' : 'ok',
      summary: noNumber.length > 0
        ? `${nhisContributing.length} enrolled, but ${noNumber.length} ${plural(noNumber.length, 'has', 'have')} no NHIS number on file.`
        : `${nhisContributing.length} enrolled at 5% employee + 10% employer of basic.`,
      names: noNumber,
    });
  }

  // ── Employer-only levies ────────────────────────────────────────────────
  // NSITF: 1% of total gross monthly payroll (Employees' Compensation Act
  // 2010, employers with 5+ staff). ITF: 1% of annual payroll, due 1 April
  // (ITF Act as amended 2011, 5+ staff or turnover from N50m). Neither is
  // deducted from anyone's pay, so there is nothing per-employee to get
  // wrong — this line exists so HR can see they are accounted for.
  if (total > 0) {
    checks.push({
      key: 'employer_levies',
      label: 'NSITF & ITF',
      status: 'info',
      summary: 'Employer-paid, not deducted from anyone. NSITF is 1% of gross monthly payroll; ITF is 1% of annual payroll, due 1 April.',
      names: [],
    });
  }

  return checks;
}

/** True when anything in the list needs a human to look at it. */
export function hasComplianceWarnings(checks: readonly ComplianceCheck[]): boolean {
  return checks.some((c) => c.status === 'warn');
}
