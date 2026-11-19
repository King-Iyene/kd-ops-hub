import { describe, expect, it } from 'vitest';
import { expectedReporters, isFieldAgent, isKdSquares } from '../table/reporters';

const companies = [{ id: 'kd', name: 'KD Squares Ltd' }, { id: 'ndi', name: 'NDI' }];
const groups = [
  { id: 'g-dir', company_id: 'kd' }, { id: 'g-admin', company_id: 'kd' }, { id: 'g-non', company_id: 'kd' },
  { id: 'g-ndi', company_id: 'ndi' }, { id: 'g-orphan', company_id: null },
];
const P = (id: string, extra: object = {}) => ({ id, full_name: id, pay_group_id: 'g-admin', role: 'operations', job_title: null, ...extra });

describe('who reports', () => {
  it('matches the KD Squares company by name', () => {
    expect(isKdSquares('KD Squares Ltd')).toBe(true);
    expect(isKdSquares('kd squares')).toBe(true);
    expect(isKdSquares('KDSquares Limited')).toBe(true);
    expect(isKdSquares('NDI')).toBe(false);
    expect(isKdSquares(null)).toBe(false);
  });
  it('knows a Field Agent by role or job title', () => {
    expect(isFieldAgent({ role: 'field_staff' })).toBe(true);
    expect(isFieldAgent({ role: 'operations', job_title: 'Field Agent' })).toBe(true);
    expect(isFieldAgent({ role: 'operations', job_title: 'Senior field agents lead' })).toBe(true);
    expect(isFieldAgent({ role: 'operations', job_title: 'Operations Manager' })).toBe(false);
    expect(isFieldAgent({ role: 'admin', job_title: null })).toBe(false);
  });
  it('keeps KD Squares people in any of its pay groups', () => {
    const out = expectedReporters([P('a', { pay_group_id: 'g-dir' }), P('b'), P('c', { pay_group_id: 'g-non' })], groups, companies);
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
  it('leaves out other companies, people without a pay group, and unknown groups', () => {
    const out = expectedReporters([P('ndi', { pay_group_id: 'g-ndi' }), P('none', { pay_group_id: null }), P('orphan', { pay_group_id: 'g-orphan' }), P('ghost', { pay_group_id: 'g-x' }), P('ok')], groups, companies);
    expect(out.map((p) => p.id)).toEqual(['ok']);
  });
  it('leaves out Field Agents even in a KD Squares pay group', () => {
    const out = expectedReporters([P('f1', { role: 'field_staff' }), P('f2', { job_title: 'Field Agent' }), P('ok')], groups, companies);
    expect(out.map((p) => p.id)).toEqual(['ok']);
  });
  it('is empty when there is no KD Squares company', () => {
    expect(expectedReporters([P('a')], groups, [{ id: 'ndi', name: 'NDI' }])).toEqual([]);
  });
  it('keeps extra fields and order', () => {
    const out = expectedReporters([{ ...P('b'), extra: 1 }, P('a')], groups, companies);
    expect(out.map((p) => p.id)).toEqual(['b', 'a']);
    expect((out[0] as { extra?: number }).extra).toBe(1);
  });
});
