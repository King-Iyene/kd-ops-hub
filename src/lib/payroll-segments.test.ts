import { describe, it, expect } from 'vitest';
import { matchesSegment, filterEmployeesForSegment, isSegmentFilterEmpty } from './payroll-segments';

const alice = { id: 'alice', employee_category: 'administrative', department_id: 'dept-ops', employment_type: 'full_time' };
const bob = { id: 'bob', employee_category: 'executive', department_id: 'dept-exec', employment_type: 'full_time' };
const carol = { id: 'carol', employee_category: 'domestic', department_id: null, employment_type: 'part_time' };
const dave = { id: 'dave', employee_category: null, department_id: 'dept-ops', employment_type: 'full_time' };

describe('matchesSegment', () => {
  it('matches everyone when rules are null or empty', () => {
    expect(matchesSegment(alice, null)).toBe(true);
    expect(matchesSegment(alice, {})).toBe(true);
  });

  it('excludes by employee_category', () => {
    const rules = { exclude_employee_categories: ['executive'] };
    expect(matchesSegment(alice, rules)).toBe(true);
    expect(matchesSegment(bob, rules)).toBe(false);
  });

  it('includes only listed employee_categories', () => {
    const rules = { include_employee_categories: ['administrative'] };
    expect(matchesSegment(alice, rules)).toBe(true);
    expect(matchesSegment(bob, rules)).toBe(false);
    // Uncategorized employees don't match an include-list filter.
    expect(matchesSegment(dave, rules)).toBe(false);
  });

  it('does not exclude uncategorized employees from an exclude-list filter', () => {
    const rules = { exclude_employee_categories: ['executive'] };
    expect(matchesSegment(dave, rules)).toBe(true);
  });

  it('excludes by department_id', () => {
    const rules = { exclude_department_ids: ['dept-exec'] };
    expect(matchesSegment(alice, rules)).toBe(true);
    expect(matchesSegment(bob, rules)).toBe(false);
  });

  it('excludes by employment_type', () => {
    const rules = { exclude_employment_types: ['part_time'] };
    expect(matchesSegment(carol, rules)).toBe(false);
    expect(matchesSegment(alice, rules)).toBe(true);
  });

  it('excludes specific employee ids as a manual override', () => {
    const rules = { exclude_employee_ids: ['alice'] };
    expect(matchesSegment(alice, rules)).toBe(false);
    expect(matchesSegment(bob, rules)).toBe(true);
  });

  it('combines dimensions with AND semantics', () => {
    const rules = { exclude_employee_categories: ['executive'], exclude_department_ids: ['dept-ops'] };
    expect(matchesSegment(alice, rules)).toBe(false); // excluded via department
    expect(matchesSegment(bob, rules)).toBe(false);   // excluded via category
    expect(matchesSegment(carol, rules)).toBe(true);  // neither excluded dimension applies
  });
});

describe('filterEmployeesForSegment', () => {
  it('returns the full list unchanged for an empty filter', () => {
    const list = [alice, bob, carol, dave];
    expect(filterEmployeesForSegment(list, {})).toEqual(list);
    expect(filterEmployeesForSegment(list, null)).toEqual(list);
  });

  it('filters down to matching employees', () => {
    const list = [alice, bob, carol, dave];
    const result = filterEmployeesForSegment(list, { exclude_employee_categories: ['executive', 'domestic'] });
    expect(result.map((e) => e.id)).toEqual(['alice', 'dave']);
  });
});

describe('isSegmentFilterEmpty', () => {
  it('treats null, undefined, and {} as empty', () => {
    expect(isSegmentFilterEmpty(null)).toBe(true);
    expect(isSegmentFilterEmpty(undefined)).toBe(true);
    expect(isSegmentFilterEmpty({})).toBe(true);
  });

  it('treats rules with only empty arrays as empty', () => {
    expect(isSegmentFilterEmpty({ exclude_employee_categories: [] })).toBe(true);
  });

  it('treats rules with at least one populated dimension as non-empty', () => {
    expect(isSegmentFilterEmpty({ exclude_employee_categories: ['executive'] })).toBe(false);
  });
});
