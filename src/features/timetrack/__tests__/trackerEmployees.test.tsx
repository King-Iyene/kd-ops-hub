import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const dir = vi.hoisted(() => ({
  people: [
    { id: 'a', full_name: 'Ada', role: 'employee', job_title: 'Analyst', department_id: 'd1', status: 'active' },
    { id: 'f1', full_name: 'Field One', role: 'field_staff', job_title: null, department_id: 'd1', status: 'active' },
    { id: 'f2', full_name: 'Field Two', role: 'employee', job_title: 'Field Agent', department_id: 'd2', status: 'active' },
  ],
  company: 'all',
}));

vi.mock('@/queries/useEmployees', () => ({
  useActiveEmployees: () => ({ data: dir.people }),
  useEmployeeDirectory: () => ({ data: dir.people }),
}));
vi.mock('../lib/company', () => ({ useCompany: () => [dir.company, vi.fn()] }));

import { useActiveEmployees, useCompanyEmployeeIds, useFieldTeamIds } from '../lib/trackerEmployees';

describe('Track never shows the field team', () => {
  beforeEach(() => { dir.company = 'all'; });

  it('leaves them out of the people lists', () => {
    const { result } = renderHook(() => useActiveEmployees());
    expect(result.current.data.map((e) => e.id)).toEqual(['a']);
  });
  it('leaves them out of the ids for all companies', () => {
    const { result } = renderHook(() => useCompanyEmployeeIds());
    expect([...(result.current ?? [])]).toEqual(['a']);
  });
  it('leaves them out inside a chosen company too', () => {
    dir.company = 'd1';
    const { result } = renderHook(() => useCompanyEmployeeIds());
    expect([...(result.current ?? [])]).toEqual(['a']);
  });
  it('lists the field team ids so data pages can drop them', () => {
    const { result } = renderHook(() => useFieldTeamIds());
    expect([...result.current].sort()).toEqual(['f1', 'f2']);
  });
  it('filters nothing when there is no field team', () => {
    const saved = dir.people.splice(1);
    const { result } = renderHook(() => useCompanyEmployeeIds());
    expect(result.current).toBeNull();
    dir.people.push(...saved);
  });
});
