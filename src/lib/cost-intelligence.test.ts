import { describe, it, expect } from 'vitest';
import {
  computeSalaryChangeImpact,
  computeHeadcountScenario,
  computePayrollBudgetVsActual,
  type SalaryChangeRecord,
} from './cost-intelligence';
import type { CostableEmployee } from './cfo-dashboard';

function change(overrides: Partial<SalaryChangeRecord> & { old_salary_ngn: number; new_salary_ngn: number }): SalaryChangeRecord {
  return {
    id: 'c1',
    employee_id: 'e1',
    employee_name: 'Jane Doe',
    department_id: 'dept-eng',
    department_name: 'Engineering',
    effective_date: '2026-06-01',
    reason: null,
    approved_by_name: null,
    ...overrides,
  };
}

describe('computeSalaryChangeImpact', () => {
  it('computes monthly and annual delta for a raise', () => {
    const impact = computeSalaryChangeImpact(change({ old_salary_ngn: 500_000, new_salary_ngn: 600_000 }));
    expect(impact.monthly_delta_ngn).toBe(100_000);
    expect(impact.annual_delta_ngn).toBe(1_200_000);
    expect(impact.pct_change).toBeCloseTo(20, 5);
    expect(impact.direction).toBe('increase');
  });

  it('computes a negative delta for a pay cut', () => {
    const impact = computeSalaryChangeImpact(change({ old_salary_ngn: 500_000, new_salary_ngn: 400_000 }));
    expect(impact.monthly_delta_ngn).toBe(-100_000);
    expect(impact.direction).toBe('decrease');
  });

  it('marks unchanged salary with zero delta', () => {
    const impact = computeSalaryChangeImpact(change({ old_salary_ngn: 500_000, new_salary_ngn: 500_000 }));
    expect(impact.direction).toBe('unchanged');
    expect(impact.monthly_delta_ngn).toBe(0);
  });

  it('does not divide by zero when old salary was zero', () => {
    const impact = computeSalaryChangeImpact(change({ old_salary_ngn: 0, new_salary_ngn: 300_000 }));
    expect(impact.pct_change).toBeNull();
  });

  it('loads the annual delta with employer pension (10%) + NSITF (1%) by default', () => {
    const impact = computeSalaryChangeImpact(change({ old_salary_ngn: 500_000, new_salary_ngn: 600_000 }));
    // annual delta 1,200,000 * 1.11 = 1,332,000
    expect(impact.fully_loaded_annual_delta_ngn).toBeCloseTo(1_332_000, 5);
  });

  it('excludes employer pension from the load factor when pensionEnabled is false', () => {
    const impact = computeSalaryChangeImpact(
      change({ old_salary_ngn: 500_000, new_salary_ngn: 600_000 }),
      { pensionEnabled: false },
    );
    // annual delta 1,200,000 * 1.01 (nsitf only) = 1,212,000
    expect(impact.fully_loaded_annual_delta_ngn).toBeCloseTo(1_212_000, 5);
  });
});

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

const departments = [
  { id: 'dept-eng', name: 'Engineering' },
  { id: 'dept-ops', name: 'Operations' },
];

describe('computeHeadcountScenario', () => {
  it('increases headcount and CTC when hiring', () => {
    const result = computeHeadcountScenario(
      [emp({ id: 'a', salary_ngn: 500_000 })],
      departments,
      [{ type: 'hire', count: 2, avg_salary_ngn: 400_000, department_id: 'dept-eng' }],
    );
    expect(result.baseline_headcount).toBe(1);
    expect(result.scenario_headcount).toBe(3);
    expect(result.scenario_ctc_ngn).toBeGreaterThan(result.baseline_ctc_ngn);
    expect(result.delta_ctc_ngn).toBeGreaterThan(0);
  });

  it('does not mutate the input employee array', () => {
    const employees = [emp({ id: 'a', salary_ngn: 500_000 })];
    computeHeadcountScenario(employees, departments, [{ type: 'hire', count: 1, avg_salary_ngn: 300_000 }]);
    expect(employees).toHaveLength(1);
  });

  it('applies a percentage raise scoped to a department', () => {
    const result = computeHeadcountScenario(
      [
        emp({ id: 'a', salary_ngn: 500_000, department_id: 'dept-eng' }),
        emp({ id: 'b', salary_ngn: 500_000, department_id: 'dept-ops' }),
      ],
      departments,
      [{ type: 'raise', department_id: 'dept-eng', pct_increase: 10 }],
    );
    const eng = result.by_department.find((d) => d.department_id === 'dept-eng')!;
    const ops = result.by_department.find((d) => d.department_id === 'dept-ops')!;
    expect(eng.delta_ctc_ngn).toBeGreaterThan(0);
    expect(ops.delta_ctc_ngn).toBe(0);
  });

  it('applies a raise to specific employee_ids regardless of department', () => {
    const result = computeHeadcountScenario(
      [
        emp({ id: 'a', salary_ngn: 500_000 }),
        emp({ id: 'b', salary_ngn: 500_000 }),
      ],
      departments,
      [{ type: 'raise', employee_ids: ['a'], pct_increase: 50 }],
    );
    expect(result.delta_ctc_ngn).toBeGreaterThan(0);
    // only half the raise-eligible increase should apply (one of two employees)
    expect(result.scenario_ctc_ngn - result.baseline_ctc_ngn).toBeLessThan(500_000 * 0.5 * 1.11 * 2);
  });

  it('removes headcount by employee_ids', () => {
    const result = computeHeadcountScenario(
      [
        emp({ id: 'a', salary_ngn: 500_000 }),
        emp({ id: 'b', salary_ngn: 500_000 }),
      ],
      departments,
      [{ type: 'remove', employee_ids: ['a'] }],
    );
    expect(result.scenario_headcount).toBe(1);
    expect(result.delta_ctc_ngn).toBeLessThan(0);
  });

  it('removes N headcount from a department when no employee_ids given', () => {
    const result = computeHeadcountScenario(
      [
        emp({ id: 'a', salary_ngn: 500_000, department_id: 'dept-eng' }),
        emp({ id: 'b', salary_ngn: 500_000, department_id: 'dept-eng' }),
        emp({ id: 'c', salary_ngn: 500_000, department_id: 'dept-ops' }),
      ],
      departments,
      [{ type: 'remove', department_id: 'dept-eng', count: 1 }],
    );
    expect(result.scenario_headcount).toBe(2);
  });

  it('composes multiple actions in sequence', () => {
    const result = computeHeadcountScenario(
      [emp({ id: 'a', salary_ngn: 500_000, department_id: 'dept-eng' })],
      departments,
      [
        { type: 'hire', count: 1, avg_salary_ngn: 300_000, department_id: 'dept-ops' },
        { type: 'raise', department_id: 'dept-eng', pct_increase: 10 },
      ],
    );
    expect(result.scenario_headcount).toBe(2);
    expect(result.delta_ctc_ngn).toBeGreaterThan(0);
  });

  it('returns null delta_pct when baseline CTC is zero', () => {
    const result = computeHeadcountScenario([], departments, [
      { type: 'hire', count: 1, avg_salary_ngn: 300_000 },
    ]);
    expect(result.baseline_ctc_ngn).toBe(0);
    expect(result.delta_pct).toBeNull();
  });
});

describe('computePayrollBudgetVsActual', () => {
  const budgets = [
    { id: 'b1', name: 'Q1 Payroll', period_start: '2026-01-01', period_end: '2026-03-31' },
  ];

  it('sums only payroll/salary-tagged budget items as planned', () => {
    const rows = computePayrollBudgetVsActual(
      budgets,
      [
        { budget_id: 'b1', category: 'Payroll', planned_amount_ngn: 3_000_000 },
        { budget_id: 'b1', category: 'Office supplies', planned_amount_ngn: 200_000 },
      ],
      [],
    );
    expect(rows[0].planned_ngn).toBe(3_000_000);
  });

  it('excludes budgets with no payroll-tagged line item', () => {
    const rows = computePayrollBudgetVsActual(
      budgets,
      [{ budget_id: 'b1', category: 'Office supplies', planned_amount_ngn: 200_000 }],
      [],
    );
    expect(rows).toHaveLength(0);
  });

  it('sums payroll_runs totals whose period falls inside the budget window', () => {
    const rows = computePayrollBudgetVsActual(
      budgets,
      [{ budget_id: 'b1', category: 'Salaries', planned_amount_ngn: 3_000_000 }],
      [
        { period: '2026-01', total_burn_ngn: 900_000 },
        { period: '2026-02', total_burn_ngn: 950_000 },
        { period: '2026-04', total_burn_ngn: 1_000_000 }, // outside window
      ],
    );
    expect(rows[0].actual_ngn).toBe(1_850_000);
  });

  it('computes utilization_pct, null when planned is zero', () => {
    const rows = computePayrollBudgetVsActual(
      budgets,
      [{ budget_id: 'b1', category: 'Wages', planned_amount_ngn: 1_000_000 }],
      [{ period: '2026-02', total_burn_ngn: 500_000 }],
    );
    expect(rows[0].utilization_pct).toBeCloseTo(50, 5);
  });
});
