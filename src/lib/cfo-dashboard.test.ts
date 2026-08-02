import { describe, it, expect } from 'vitest';
import { computeDepartmentCostBreakdown, computePayrollTrend, type CostableEmployee, type PayrollRunTotals } from './cfo-dashboard';

const departments = [
  { id: 'dept-eng', name: 'Engineering' },
  { id: 'dept-ops', name: 'Operations' },
];

function emp(overrides: Partial<CostableEmployee> & { id: string }): CostableEmployee {
  return {
    salary_ngn: 500_000,
    department_id: 'dept-eng',
    pension_enabled: true,
    use_salary_components: false,
    basic_ngn: null,
    housing_ngn: null,
    transport_ngn: null,
    ...overrides,
  };
}

describe('computeDepartmentCostBreakdown', () => {
  it('groups by department and sums gross salary', () => {
    const rows = computeDepartmentCostBreakdown(
      [
        emp({ id: 'a', salary_ngn: 500_000, department_id: 'dept-eng' }),
        emp({ id: 'b', salary_ngn: 300_000, department_id: 'dept-eng' }),
        emp({ id: 'c', salary_ngn: 400_000, department_id: 'dept-ops' }),
      ],
      departments,
    );
    const eng = rows.find((r) => r.department_id === 'dept-eng')!;
    const ops = rows.find((r) => r.department_id === 'dept-ops')!;
    expect(eng.headcount).toBe(2);
    expect(eng.total_gross_ngn).toBe(800_000);
    expect(ops.headcount).toBe(1);
    expect(ops.total_gross_ngn).toBe(400_000);
  });

  it('groups employees with no department under "No department" instead of dropping them', () => {
    const rows = computeDepartmentCostBreakdown(
      [emp({ id: 'a', department_id: null })],
      departments,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].department_name).toBe('No department');
    expect(rows[0].department_id).toBeNull();
  });

  it('labels an unknown department id rather than crashing', () => {
    const rows = computeDepartmentCostBreakdown(
      [emp({ id: 'a', department_id: 'dept-ghost' })],
      departments,
    );
    expect(rows[0].department_name).toBe('Unknown department');
  });

  it('computes employer pension (10%) only when pension_enabled is not explicitly false', () => {
    const rows = computeDepartmentCostBreakdown(
      [
        emp({ id: 'a', salary_ngn: 1_000_000, pension_enabled: true }),
        emp({ id: 'b', salary_ngn: 1_000_000, pension_enabled: false }),
      ],
      departments,
    );
    // employer pension = 10% of pensionable base (gross, since use_salary_components=false)
    expect(rows[0].total_employer_pension_ngn).toBe(100_000); // only employee 'a' contributes
  });

  it('uses basic+housing+transport as the pension base when salary components are configured', () => {
    const rows = computeDepartmentCostBreakdown(
      [
        emp({
          id: 'a',
          salary_ngn: 1_000_000,
          use_salary_components: true,
          basic_ngn: 400_000,
          housing_ngn: 200_000,
          transport_ngn: 100_000,
        }),
      ],
      departments,
    );
    // pension base = 400k + 200k + 100k = 700k; employer pension = 10% = 70k
    expect(rows[0].total_employer_pension_ngn).toBe(70_000);
  });

  it('includes NSITF (1% of gross) only when includeNsitf is true', () => {
    const withNsitf = computeDepartmentCostBreakdown(
      [emp({ id: 'a', salary_ngn: 1_000_000 })],
      departments,
      true,
    );
    const withoutNsitf = computeDepartmentCostBreakdown(
      [emp({ id: 'a', salary_ngn: 1_000_000 })],
      departments,
      false,
    );
    expect(withNsitf[0].total_nsitf_ngn).toBe(10_000);
    expect(withoutNsitf[0].total_nsitf_ngn).toBe(0);
  });

  it('total_ctc_ngn is gross + employer pension + nsitf', () => {
    const rows = computeDepartmentCostBreakdown(
      [emp({ id: 'a', salary_ngn: 1_000_000, pension_enabled: true })],
      departments,
      true,
    );
    // gross 1,000,000 + employer pension 100,000 + nsitf 10,000
    expect(rows[0].total_ctc_ngn).toBe(1_110_000);
  });

  it('sorts departments by total CTC descending', () => {
    const rows = computeDepartmentCostBreakdown(
      [
        emp({ id: 'a', salary_ngn: 300_000, department_id: 'dept-ops' }),
        emp({ id: 'b', salary_ngn: 900_000, department_id: 'dept-eng' }),
      ],
      departments,
    );
    expect(rows[0].department_id).toBe('dept-eng');
    expect(rows[1].department_id).toBe('dept-ops');
  });
});

describe('computePayrollTrend', () => {
  const run = (overrides: Partial<PayrollRunTotals> & { period: string }): PayrollRunTotals => ({
    total_burn_ngn: 0,
    total_employee_ngn: 0,
    employee_count: null,
    ...overrides,
  });

  it('sorts ascending by period regardless of input order', () => {
    const trend = computePayrollTrend([
      run({ period: '2026-03', total_burn_ngn: 300 }),
      run({ period: '2026-01', total_burn_ngn: 100 }),
      run({ period: '2026-02', total_burn_ngn: 200 }),
    ]);
    expect(trend.map((t) => t.period)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('first point has null delta', () => {
    const trend = computePayrollTrend([run({ period: '2026-01', total_burn_ngn: 100 })]);
    expect(trend[0].delta_ngn).toBeNull();
    expect(trend[0].delta_pct).toBeNull();
  });

  it('computes delta_ngn and delta_pct vs the previous period', () => {
    const trend = computePayrollTrend([
      run({ period: '2026-01', total_burn_ngn: 1_000_000 }),
      run({ period: '2026-02', total_burn_ngn: 1_200_000 }),
    ]);
    expect(trend[1].delta_ngn).toBe(200_000);
    expect(trend[1].delta_pct).toBeCloseTo(20, 5);
  });

  it('handles a decrease as a negative delta', () => {
    const trend = computePayrollTrend([
      run({ period: '2026-01', total_burn_ngn: 1_000_000 }),
      run({ period: '2026-02', total_burn_ngn: 800_000 }),
    ]);
    expect(trend[1].delta_ngn).toBe(-200_000);
    expect(trend[1].delta_pct).toBeCloseTo(-20, 5);
  });

  it('does not divide by zero when the previous period had zero burn', () => {
    const trend = computePayrollTrend([
      run({ period: '2026-01', total_burn_ngn: 0 }),
      run({ period: '2026-02', total_burn_ngn: 500_000 }),
    ]);
    expect(trend[1].delta_ngn).toBe(500_000);
    expect(trend[1].delta_pct).toBeNull();
  });
});
