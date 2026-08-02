import { describe, it, expect } from 'vitest';
import {
  computeAttritionCost,
  computeCostComparison,
  computeCompensationBands,
  type TerminationRecord,
  type CostComparisonEmployee,
  type CostComparisonContractor,
  type CompBandEmployee,
} from './talent-cost';

function termination(overrides: Partial<TerminationRecord> = {}): TerminationRecord {
  return {
    id: 't1',
    employee_id: 'e1',
    employee_name: 'Jane Doe',
    department_name: 'Engineering',
    termination_type: 'resignation',
    start_date: '2024-01-01',
    last_working_day: '2026-07-01',
    monthly_salary_ngn: 500_000,
    final_settlement_ngn: 300_000,
    ...overrides,
  };
}

describe('computeAttritionCost', () => {
  it('sums recorded settlement + estimated backfill cost', () => {
    const result = computeAttritionCost(termination(), 3);
    // backfill = 500,000 * 3 = 1,500,000; total = 1,500,000 + 300,000
    expect(result.estimated_backfill_cost_ngn).toBe(1_500_000);
    expect(result.total_cost_ngn).toBe(1_800_000);
  });

  it('respects a custom replacementCostMonths assumption', () => {
    const result = computeAttritionCost(termination({ final_settlement_ngn: 0 }), 6);
    expect(result.estimated_backfill_cost_ngn).toBe(3_000_000);
    expect(result.total_cost_ngn).toBe(3_000_000);
  });

  it('computes tenure in months from start_date to last_working_day', () => {
    const result = computeAttritionCost(termination({ start_date: '2026-01-01', last_working_day: '2026-07-01' }));
    expect(result.tenure_months).toBeGreaterThan(5.5);
    expect(result.tenure_months).toBeLessThan(6.5);
  });

  it('returns null tenure when start_date is missing', () => {
    const result = computeAttritionCost(termination({ start_date: null }));
    expect(result.tenure_months).toBeNull();
  });

  it('never produces a negative backfill cost from a negative salary input', () => {
    const result = computeAttritionCost(termination({ monthly_salary_ngn: -100_000 }));
    expect(result.estimated_backfill_cost_ngn).toBe(0);
  });
});

function emp(overrides: Partial<CostComparisonEmployee> = {}): CostComparisonEmployee {
  return { salary_ngn: 500_000, pension_enabled: true, ...overrides };
}
function contractor(id: string, monthly_cost_ngn: number): CostComparisonContractor {
  return { id, monthly_cost_ngn };
}

describe('computeCostComparison', () => {
  it('loads employee cost with employer pension (10%) + NSITF (1%)', () => {
    const result = computeCostComparison([emp({ salary_ngn: 1_000_000 })], []);
    // 1,000,000 * 1.11 = 1,110,000
    expect(result.employee_avg_monthly_cost_ngn).toBeCloseTo(1_110_000, 5);
  });

  it('excludes employer pension when pension_enabled is false', () => {
    const result = computeCostComparison([emp({ salary_ngn: 1_000_000, pension_enabled: false })], []);
    // just NSITF: 1,000,000 * 1.01
    expect(result.employee_avg_monthly_cost_ngn).toBeCloseTo(1_010_000, 5);
  });

  it('averages contractor cost from raw monthly_cost_ngn (no statutory load)', () => {
    const result = computeCostComparison([], [contractor('c1', 400_000), contractor('c2', 600_000)]);
    expect(result.contractor_avg_monthly_cost_ngn).toBe(500_000);
  });

  it('computes the employee-to-contractor cost ratio', () => {
    const result = computeCostComparison(
      [emp({ salary_ngn: 1_000_000 })], // avg 1,110,000
      [contractor('c1', 555_000)],
    );
    expect(result.employee_to_contractor_ratio).toBeCloseTo(2, 5);
  });

  it('returns null ratio when either side is empty', () => {
    const onlyEmployees = computeCostComparison([emp()], []);
    expect(onlyEmployees.employee_to_contractor_ratio).toBeNull();
    const onlyContractors = computeCostComparison([], [contractor('c1', 100_000)]);
    expect(onlyContractors.employee_to_contractor_ratio).toBeNull();
  });

  it('handles empty input on both sides without dividing by zero', () => {
    const result = computeCostComparison([], []);
    expect(result.employee_avg_monthly_cost_ngn).toBe(0);
    expect(result.contractor_avg_monthly_cost_ngn).toBe(0);
  });
});

function bandEmp(overrides: Partial<CompBandEmployee> = {}): CompBandEmployee {
  return { salary_ngn: 500_000, department_id: 'dept-eng', ...overrides };
}

const departments = [{ id: 'dept-eng', name: 'Engineering' }];

describe('computeCompensationBands', () => {
  it('computes min/median/max for an odd-length department salary list', () => {
    const bands = computeCompensationBands(
      [bandEmp({ salary_ngn: 300_000 }), bandEmp({ salary_ngn: 500_000 }), bandEmp({ salary_ngn: 900_000 })],
      departments,
    );
    expect(bands[0].min_ngn).toBe(300_000);
    expect(bands[0].median_ngn).toBe(500_000);
    expect(bands[0].max_ngn).toBe(900_000);
  });

  it('computes median as the average of the two middle values for an even-length list', () => {
    const bands = computeCompensationBands(
      [bandEmp({ salary_ngn: 200_000 }), bandEmp({ salary_ngn: 400_000 }), bandEmp({ salary_ngn: 600_000 }), bandEmp({ salary_ngn: 800_000 })],
      departments,
    );
    expect(bands[0].median_ngn).toBe(500_000);
  });

  it('excludes employees with zero or missing salary', () => {
    const bands = computeCompensationBands(
      [bandEmp({ salary_ngn: 500_000 }), bandEmp({ salary_ngn: 0 }), bandEmp({ salary_ngn: null })],
      departments,
    );
    expect(bands[0].headcount).toBe(1);
  });

  it('groups employees with no department under "No department"', () => {
    const bands = computeCompensationBands([bandEmp({ department_id: null })], departments);
    expect(bands[0].department_name).toBe('No department');
  });

  it('sorts departments by median salary descending', () => {
    const bands = computeCompensationBands(
      [
        bandEmp({ salary_ngn: 300_000, department_id: 'dept-eng' }),
        bandEmp({ salary_ngn: 900_000, department_id: 'dept-ops' }),
      ],
      [...departments, { id: 'dept-ops', name: 'Operations' }],
    );
    expect(bands[0].department_id).toBe('dept-ops');
  });
});
