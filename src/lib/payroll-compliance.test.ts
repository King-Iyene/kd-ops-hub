import { describe, it, expect } from 'vitest';
import {
  buildComplianceChecks,
  hasComplianceWarnings,
  type ComplianceEmployee,
} from '@/lib/payroll-compliance';

const emp = (over: Partial<ComplianceEmployee> = {}): ComplianceEmployee => ({
  name: 'Ada Okoro',
  gross: 500_000,
  tax_id: '1234567890123',
  pension_enabled: true,
  pension_pin: 'PEN123456789',
  nhf_enabled: false,
  nhis_enabled: false,
  ...over,
});

const find = (checks: ReturnType<typeof buildComplianceChecks>, key: string) => {
  const c = checks.find((x) => x.key === key);
  if (!c) throw new Error(`expected a "${key}" check`);
  return c;
};

describe('buildComplianceChecks — PAYE', () => {
  it('passes when everyone has a Tax ID', () => {
    const c = find(buildComplianceChecks([emp(), emp({ name: 'Bo' })]), 'paye');
    expect(c.status).toBe('ok');
    expect(c.names).toEqual([]);
  });

  it('warns and names employees with no Tax ID', () => {
    const c = find(
      buildComplianceChecks([emp(), emp({ name: 'Bo', tax_id: null, tin: null })]),
      'paye',
    );
    expect(c.status).toBe('warn');
    expect(c.names).toEqual(['Bo']);
  });

  it('accepts a legacy TIN in place of the newer Tax ID', () => {
    // NRS replaced TIN with a 13-digit Tax ID in 2026; older records still
    // carry the value in `tin`, and those employees are not a problem.
    const c = find(buildComplianceChecks([emp({ tax_id: null, tin: '0987654321' })]), 'paye');
    expect(c.status).toBe('ok');
  });

  it('reports PAYE as off when the run excludes it', () => {
    const c = find(buildComplianceChecks([emp()], { include_paye: false }), 'paye');
    expect(c.status).toBe('off');
  });
});

describe('buildComplianceChecks — Pension', () => {
  it('passes when contributors all have a PenCom PIN', () => {
    const c = find(buildComplianceChecks([emp(), emp({ name: 'Bo' })]), 'pension');
    expect(c.status).toBe('ok');
    expect(c.summary).toContain('8%');
    expect(c.summary).toContain('10%');
  });

  it('warns when a contributor has no PIN, because it cannot be remitted', () => {
    const c = find(buildComplianceChecks([emp({ pension_pin: null })]), 'pension');
    expect(c.status).toBe('warn');
    expect(c.names).toEqual(['Ada Okoro']);
  });

  it('ignores a missing PIN for someone exempt from pension', () => {
    const c = find(
      buildComplianceChecks([emp({ pension_enabled: false, pension_pin: null })]),
      'pension',
    );
    expect(c.status).toBe('ok');
    expect(c.names).toEqual([]);
    expect(c.summary).toContain('exempt');
  });

  it('treats a null pension_enabled as opted in', () => {
    // Payroll deducts unless explicitly disabled, so the check must agree —
    // otherwise it would report "not contributing" for someone being deducted.
    const c = find(buildComplianceChecks([emp({ pension_enabled: null })]), 'pension');
    expect(c.summary).toContain('1 contributing');
  });
});

describe('buildComplianceChecks — NHF', () => {
  it('does NOT warn when nobody is enrolled', () => {
    // NHF is voluntary for private-sector employees since the Business
    // Facilitation Act 2022. Warning here would push HR to "fix" something
    // lawful and teach them to ignore this panel.
    const c = find(buildComplianceChecks([emp(), emp({ name: 'Bo' })]), 'nhf');
    expect(c.status).toBe('info');
    expect(c.summary).toContain('voluntary');
  });

  it('passes when enrolled employees have an NHF number', () => {
    const c = find(
      buildComplianceChecks([emp({ nhf_enabled: true, nhf_number: 'NHF001' })]),
      'nhf',
    );
    expect(c.status).toBe('ok');
  });

  it('warns when someone opted in but has nowhere to remit', () => {
    const c = find(
      buildComplianceChecks([emp({ nhf_enabled: true, nhf_number: null })]),
      'nhf',
    );
    expect(c.status).toBe('warn');
    expect(c.names).toEqual(['Ada Okoro']);
  });
});

describe('buildComplianceChecks — NHIS', () => {
  it('is omitted entirely when nobody is enrolled', () => {
    const checks = buildComplianceChecks([emp()]);
    expect(checks.find((c) => c.key === 'nhis')).toBeUndefined();
  });

  it('warns when an enrolled employee has no NHIS number', () => {
    const c = find(
      buildComplianceChecks([emp({ nhis_enabled: true, nhis_number: null })]),
      'nhis',
    );
    expect(c.status).toBe('warn');
  });
});

describe('buildComplianceChecks — scope and edge cases', () => {
  it('ignores employees with zero gross pay', () => {
    // Nothing is deducted from ₦0, so a missing PIN there is not this run's
    // problem and should not raise a warning the approver cannot act on.
    const checks = buildComplianceChecks([emp({ gross: 0, pension_pin: null, tax_id: null })]);
    expect(find(checks, 'pension').status).toBe('ok');
    expect(find(checks, 'paye').status).toBe('ok');
  });

  it('handles an empty roster without inventing warnings', () => {
    const checks = buildComplianceChecks([]);
    expect(hasComplianceWarnings(checks)).toBe(false);
    expect(checks.find((c) => c.key === 'employer_levies')).toBeUndefined();
  });

  it('always reports employer-only levies when someone is being paid', () => {
    const c = find(buildComplianceChecks([emp()]), 'employer_levies');
    expect(c.status).toBe('info');
    expect(c.summary).toContain('not deducted');
  });

  it('flags the run as needing attention only when something is a warning', () => {
    expect(hasComplianceWarnings(buildComplianceChecks([emp()]))).toBe(false);
    expect(hasComplianceWarnings(buildComplianceChecks([emp({ pension_pin: null })]))).toBe(true);
  });

  it('uses singular wording for one employee', () => {
    const c = find(buildComplianceChecks([emp({ tax_id: null, tin: null })]), 'paye');
    expect(c.summary).toContain('1 has no Tax ID');
  });

  it('uses plural wording for several', () => {
    const c = find(
      buildComplianceChecks([
        emp({ name: 'A', tax_id: null, tin: null }),
        emp({ name: 'B', tax_id: null, tin: null }),
      ]),
      'paye',
    );
    expect(c.summary).toContain('2 have no Tax ID');
  });
});
